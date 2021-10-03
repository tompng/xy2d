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


export class View {
  renderer = new THREE.WebGLRenderer()
  camera = new THREE.Camera()
  scene = new THREE.Scene()
  xyTheta = 0
  zTheta = 0
  needsRender = true
  rendered = { pixelRatio: 0, width: 0, height: 0 }
  width = 0
  height = 0
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
    let pointer: { id: number; x: number; y: number } | null = null
    dom.addEventListener('touchstart', e => e.preventDefault())
    dom.addEventListener('pointerdown', e => {
      e.preventDefault()
      pointer = { id: e.pointerId, x: e.pageX, y: e.pageY }
    })
    document.addEventListener('pointermove', e => {
      if (pointer?.id !== e.pointerId) return
      e.preventDefault()
      const dx = (e.pageX - pointer.x) / dom.offsetWidth * 4
      const dy = (e.pageY - pointer.y) / dom.offsetWidth * 4
      pointer.x = e.pageX
      pointer.y = e.pageY
      this.xyTheta -= dx
      this.zTheta = Math.min(Math.max(-Math.PI / 2, this.zTheta + dy), Math.PI / 2)
      this.needsRender = true
    })
    document.addEventListener('pointerup', e => {
      pointer = null
    })
  }
  render() {
    const { camera, renderer, scene, xyTheta, zTheta, width, height, rendered } = this
    if (rendered.width !== width || rendered.height !== height || rendered.pixelRatio !== devicePixelRatio) {
      renderer.setPixelRatio(devicePixelRatio)
      renderer.setSize(width, height)
      this.camera = new THREE.PerspectiveCamera(50, width / height, 0.2, 10)
      rendered.width = width
      rendered.height = height
      rendered.pixelRatio = devicePixelRatio
      this.needsRender = true
    }
    if (!this.needsRender) return
    this.needsRender = false
    const distance = 3.5
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
