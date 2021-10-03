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

export function generateGeometry(positions: number[]) {
  const geometry = new THREE.BufferGeometry()
  const normals = new Float32Array(positions.length)
  for (let i = 0; i < positions.length; i += 9) {
    const x1 = positions[i + 3] - positions[i]
    const y1 = positions[i + 4] - positions[i + 1]
    const z1 = positions[i + 5] - positions[i + 2]
    const x2 = positions[i + 6] - positions[i]
    const y2 = positions[i + 7] - positions[i + 1]
    const z2 = positions[i + 8] - positions[i + 2]
    const nx = y1 * z2 - y2 * z1
    const ny = z1 * x2 - z2 * x1
    const nz = x1 * y2 - x2 * y1
    const nr = Math.hypot(nx, ny, nz)
    normals[i] = normals[i + 3] = normals[i + 6] = nx / nr
    normals[i + 1] = normals[i + 4] = normals[i + 7] = ny / nr
    normals[i + 2] = normals[i + 5] = normals[i + 8] = nz / nr
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  return geometry
}

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
    dom.onpointerdown = e => {
      pointer = { id: e.pointerId, x: e.pageX, y: e.pageY }
    }
    dom.onpointermove = e => {
      if (pointer?.id !== e.pointerId) return
      const dx = (e.pageX - pointer.x) / dom.offsetWidth * 4
      const dy = (e.pageY - pointer.y) / dom.offsetWidth * 4
      pointer.x = e.pageX
      pointer.y = e.pageY
      this.xyTheta -= dx
      this.zTheta = Math.min(Math.max(-Math.PI / 2, this.zTheta + dy), Math.PI / 2)
      this.needsRender = true
    }
    dom.onpointerup = e => {
      pointer = null
    }

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
