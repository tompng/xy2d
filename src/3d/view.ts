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
void main() {
  float brightness = 0.5 + dot(vNormal, vec3(1, 2, 3)) / 8.0 * (2.0 * float(gl_FrontFacing) - 1.0);
  gl_FragColor = vec4(vec3(brightness), 1);
}
`

const material = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  side: THREE.DoubleSide
})

export function generateMesh(geometry: THREE.BufferGeometry) {
  return new THREE.Mesh(geometry, material)
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
  needsRender = true
  rendered = { pixelRatio: 0, width: 0, height: 0, radius: defaultRadius }
  width = 0
  height = 0
  renderRadius = defaultRadius
  zoomRadius = defaultRadius
  onZoomChange?: (zoom: number) => void
  constructor() {
    this.bind()
    const animate = () => {
      this.render()
      requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }
  setSize(width: number, height: number) {
    this.width = width
    this.height = height
    this.render()
  }
  bind() {
    const { domElement: dom } = this.renderer
    let pointers: { id: number; x: number; y: number }[] = []
    let timer: NodeJS.Timer | null = null
    const lazyChangeZoom = (radius: number) => {
      this.zoomRadius = clamp(radius, zoomMinRadius, zoomMaxRadius)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        this.triggerZoom()
      }, 100)
    }
    dom.addEventListener('touchstart', e => e.preventDefault())
    dom.addEventListener('pointerdown', e => {
      e.preventDefault()
      pointers.push({ id: e.pointerId, x: e.pageX, y: e.pageY })
      if (pointers.length >= 3) pointers.shift()
      if (document.activeElement !== document.body) (document.activeElement as { blur?: () => void } | null)?.blur?.()
    })
    document.addEventListener('pointermove', e => {
      e.preventDefault()
      const pointer = pointers.find(p => p.id === e.pointerId)
      if (!pointer) return
      const dx = (e.pageX - pointer.x) / dom.offsetWidth * 4
      const dy = (e.pageY - pointer.y) / dom.offsetWidth * 4
      const center = { x: 0, y: 0 }
      if (pointers.length === 1) {
        this.xyTheta -= dx
        this.zTheta = Math.min(Math.max(-Math.PI / 2, this.zTheta + dy), Math.PI / 2)
        this.needsRender = true
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
    function touchend(e: PointerEvent) {
      pointers = pointers.filter(p => p.id !== e.pointerId)
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
  render() {
    const { renderer, scene, xyTheta, zTheta, width, height, zoomRadius, rendered } = this
    if (rendered.width !== width || rendered.height !== height || rendered.pixelRatio !== devicePixelRatio || rendered.radius !== zoomRadius) {
      renderer.setPixelRatio(devicePixelRatio)
      renderer.setSize(width, height)
      rendered.width = width
      rendered.height = height
      rendered.pixelRatio = devicePixelRatio
      rendered.radius = zoomRadius
      this.needsRender = true
    }
    if (!this.needsRender) return
    this.needsRender = false
    const distance = 3 * zoomRadius
    const fov = 50
    const verticalFOV = width > height ? fov : Math.atan(Math.tan(fov * Math.PI / 180 / 2) * height / width) * 360 / Math.PI
    const camera = new THREE.PerspectiveCamera(verticalFOV, width / height, distance / 2, distance * 2)
    const sz = Math.sin(zTheta)
    const cz = Math.cos(zTheta)
    camera.position.set(
      distance * cz * Math.cos(xyTheta),
      distance * cz * Math.sin(xyTheta),
      distance * sz
    )
    camera.up.set(0, 0, 1)
    camera.lookAt(0, 0, 0)
    renderer.render(scene, camera)
  }
}
