import * as THREE from 'three'

const vertexShader = `
varying vec3 vNormal;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1);
  vNormal = normalMatrix * normal;
}
`

const fragmentShader = `
varying vec3 vNormal;
uniform vec3 color;
uniform float alpha;
void main() {
  float brightness = 0.5 + dot(vNormal, vec3(1, 2, 3)) / 8.0 * (2.0 * float(gl_FrontFacing) - 1.0);
  gl_FragColor = vec4(color * brightness, alpha);
}
`

export type RenderingOption = {
  color: string
  alpha: number
}

export type DisposableGeometryData = {
  geometry: THREE.BufferGeometry
  dirRanges?: { x: number; y: number; z: number; start: number; count: number }[]
  dispose: () => void
}
export class SurfaceObject {
  uniforms = { color: { value: new THREE.Color('white') }, alpha: { value: 1 } }
  material: THREE.ShaderMaterial
  mesh: THREE.Mesh
  transparent: boolean
  constructor(public data: DisposableGeometryData, public renderingOption: RenderingOption) {
    this.update(renderingOption)
    this.transparent = !!data.dirRanges
    const otherOption = this.transparent ? {
      // TODO: use `transparent: true` if gl_FrontFacing works
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor
    } : {}
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
      ...otherOption
    })
    this.material = material
    this.mesh = new THREE.Mesh(data.geometry, material)
    if (this.transparent) this.mesh.renderOrder = 1
  }
  switchMesh(x: number, y: number, z: number) {
    const { dirRanges } = this.data
    if (!dirRanges) return
    let minDiff: number | undefined
    let minItem: (typeof dirRanges[0]) | undefined
    for (const item of dirRanges) {
      const diff = (item.x - x) ** 2 + (item.y - y) ** 2 + (item.z - z) ** 2
      if (minDiff == null || diff < minDiff) {
        minDiff = diff
        minItem = item
      }
    }
    if (!minItem) return
    this.data.geometry.setDrawRange(minItem.start, minItem.count)
  }
  update(option: RenderingOption) {
    this.renderingOption = option
    this.uniforms.color.value = new THREE.Color(option.color)
    if (this.transparent) this.uniforms.alpha.value = option.alpha
  }
  dispose() {
    this.material.dispose()
    this.data.dispose()
  }
}

const zoomMaxRadius = 256
const zoomMinRadius = 1 / 64
function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}
const defaultRadius = 1
export class View {
  renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio <= 1 })
  scene = new THREE.Scene()
  xyTheta = 0
  zTheta = 0
  cameraDistance = 1
  rotation: { theta: number; time: number; speed: number; paused: boolean } | null = null
  onCameraChange?: (xy: number, z: number) => void
  needsRender = true
  rendered = { pixelRatio: 0, width: 0, height: 0, radius: defaultRadius }
  width = 0
  height = 0
  renderRadius = defaultRadius
  zoomRadius = defaultRadius
  onZoomChange?: (zoom: number) => void
  axisObjects: THREE.Object3D[] = []
  constructor() {
    this.bind()
    const animate = () => {
      this.render()
      requestAnimationFrame(animate)
    }
    this.axisObjects.push(boundingCubeLineSegments(), axisLineSegments())
    for (const obj of this.axisObjects) this.scene.add(obj)
    requestAnimationFrame(animate)
  }
  setSize(width: number, height: number) {
    this.width = width
    this.height = height
    this.render()
  }
  bind() {
    const { domElement: dom } = this.renderer
    let pointers: { id: number; x: number; y: number, xyth: number, zth: number }[] = []
    let timer: number | null = null
    const lazyChangeZoom = (radius: number) => {
      this.zoomRadius = clamp(radius, zoomMinRadius, zoomMaxRadius)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        this.triggerZoom()
      }, 100) as unknown as number
    }
    dom.addEventListener('touchstart', e => e.preventDefault())
    dom.addEventListener('pointerdown', e => {
      e.preventDefault()
      pointers.push({ id: e.pointerId, x: e.pageX, y: e.pageY, xyth: this.xyTheta, zth: this.zTheta })
      if (this.rotation) this.rotation.paused = true
      if (pointers.length >= 3) pointers.shift()
      if (document.activeElement !== document.body) (document.activeElement as { blur?: () => void } | null)?.blur?.()
    })
    document.addEventListener('pointermove', e => {
      const pointer = pointers.find(p => p.id === e.pointerId)
      if (!pointer) return
      e.preventDefault()
      const dx = (e.pageX - pointer.x) / dom.offsetWidth * 4
      const dy = (e.pageY - pointer.y) / dom.offsetWidth * 4
      const center = { x: 0, y: 0 }
      if (pointers.length === 1) {
        pointer.xyth -= dx
        pointer.zth = Math.min(Math.max(-Math.PI / 2, pointer.zth + dy), Math.PI / 2)
        this.needsRender = true
        pointer.xyth
        this.onCameraChange?.(pointer.xyth, pointer.zth)
      } else {
        for (const { x, y } of pointers) {
          center.x += x / pointers.length
          center.y += y / pointers.length
        }
        const lx = center.x - pointer.x
        const ly = center.y - pointer.y
        const lr = Math.hypot(lx, ly)
        const dot = (lx * dx + ly * dy) / lr
        lazyChangeZoom(this.zoomRadius * Math.exp(dot))
      }
      pointer.x = e.pageX
      pointer.y = e.pageY
    })
    const touchend = (e: PointerEvent) => {
      pointers = []
      if (this.rotation) {
        this.rotation.paused = false
        this.rotation.theta = this.xyTheta
        this.rotation.time = performance.now()
      }
    }
    document.addEventListener('pointercancel', touchend)
    document.addEventListener('pointerup', touchend)
    dom.addEventListener('wheel', e => {
      e.preventDefault()
      lazyChangeZoom(this.zoomRadius * Math.exp(e.deltaY / 100))
    })
    document.body.addEventListener('keydown', e => {
      if (e.target !== document.body) return
      if (e.key === '-') this.changeZoom(this.zoomRadius * 1.5)
      if (e.key === '+') this.changeZoom(this.zoomRadius / 1.5)
      if (e.key === '=' || e.key === '0') this.changeZoom(defaultRadius)
    })
  }
  changeZoom(zoom: number) {
    this.zoomRadius = clamp(zoom, zoomMinRadius, zoomMaxRadius)
    this.triggerZoom()
  }
  triggerZoom() {
    if (this.renderRadius === this.zoomRadius) return
    this.renderRadius = this.zoomRadius
    this.onZoomChange?.(this.renderRadius)
  }
  onUpdate?: (dx: number, dy: number, dz: number) => void
  render() {
    const { renderer, scene, xyTheta, zTheta, width, height, zoomRadius, rendered } = this
    this.onUpdate?.(Math.cos(xyTheta) * Math.cos(zTheta), Math.sin(xyTheta) * Math.cos(zTheta), Math.sin(zTheta))
    if (rendered.width !== width || rendered.height !== height || rendered.pixelRatio !== devicePixelRatio || rendered.radius !== zoomRadius) {
      renderer.setPixelRatio(devicePixelRatio)
      renderer.setSize(width, height)
      rendered.width = width
      rendered.height = height
      rendered.pixelRatio = devicePixelRatio
      rendered.radius = zoomRadius
      this.needsRender = true
    }
    if (!this.needsRender && !this.rotation) return
    let xyTheta2 = this.xyTheta
    if (this.rotation && !this.rotation.paused) {
      const { theta, time, speed } = this.rotation
      xyTheta2 = theta + speed * (performance.now() - time) / 1000
      this.onCameraChange?.(xyTheta2, this.zTheta)
    }
    this.needsRender = false
    for (const obj of this.axisObjects) {
      obj.scale.set(this.zoomRadius, this.zoomRadius, this.zoomRadius)
    }
    const distance = 3 * zoomRadius * this.cameraDistance
    const fov = 50
    const verticalFOV = width > height ? fov : Math.atan(Math.tan(fov * Math.PI / 180 / 2) * height / width) * 360 / Math.PI
    const camera = new THREE.PerspectiveCamera(verticalFOV, width / height, distance / 64, distance * 2)
    const sz = Math.sin(zTheta)
    const cz = Math.cos(zTheta)
    camera.position.set(
      distance * cz * Math.cos(xyTheta2),
      distance * cz * Math.sin(xyTheta2),
      distance * sz
    )
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }
}

function boundingCubeLineSegments() {
  const positions: number[] = []
  function p(idx: number) {
    return [2 * (idx & 1) - 1, 2 * ((idx >> 1) & 1) - 1, 2 * ((idx >> 2) & 1) - 1]
  }
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const ij = i ^ j
      if (ij === 1 || ij === 2 || ij === 4) positions.push(...p(i), ...p(j))
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 'gray' })
  )
}

function axisLineSegments() {
  const l = 1.25
  const arrowL = 1 / 20
  const positions: number[] = [
    -l, 0, 0,
    l, 0, 0,
    0, -l, 0,
    0, l, 0,
    0, 0, -l,
    0, 0, l,

    l, 0, 0,
    l - arrowL, -arrowL, 0,
    l - arrowL, arrowL, 0,
    l, 0, 0,

    0, l, 0,
    0, l - arrowL, -arrowL,
    0, l - arrowL, arrowL,
    0, l, 0,

    0, 0, l,
    -arrowL, 0, l - arrowL,
    arrowL, 0, l - arrowL,
    0, 0, l,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color: 'gray' })
  )
}
