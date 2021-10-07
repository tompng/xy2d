import { ASTNode, astTo3DFunction, astTo3DRangeFunction } from '../ast'
import { parse } from '../parser'
import { View, generateMesh } from './view'
import type { BufferGeometry } from 'three'
import type { WorkerInput, WorkerOutput } from './worker'
import * as THREE from 'three'

let worker: Worker | null = null
function calc(exp: string, radius: number) {
  statusDOM.textContent = ''
  worker?.terminate()
  worker = new Worker('./dist/worker3d.js')
  const [ast] = parse(exp)
  const frange = astTo3DRangeFunction(ast, { pos: false, neg: false })
  const fvalue = astTo3DFunction(ast)
  statusDOM.textContent = '...'
  const inputData: WorkerInput = { frange: frange.toString(), fvalue: fvalue.toString(), radius }
  worker.postMessage(inputData)
  worker.addEventListener('message', e => {
    const { positions, normals, resolution, complete } = e.data as WorkerOutput
    console.log(resolution, complete, positions.length)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    statusDOM.innerHTML = `${resolution}&times;${resolution}&times;${resolution} ${complete ? 'complete' : '...'}`
    setGeometry(geometry)
  })
}
// max(x^4+y^4+z^4,abs(x)+abs(y)+abs(z)-1)=0.5

const view = new View()
view.setSize(800, 600)
view.onZoomChange = update
document.body.appendChild(view.renderer.domElement)

const errorDOM = document.querySelector<HTMLDivElement>('#error')!
const statusDOM = document.querySelector<HTMLDivElement>('#status')!
const input = document.querySelector<HTMLInputElement>('#mathinput')!
function update() {
  const exp = input.value
  errorDOM.textContent = ''
  try {
    calc(exp, view.zoomRadius)
  } catch (e) {
    errorDOM.textContent = String(e)
  }
}
input.onchange = update
input.oninput = () => { errorDOM.textContent = '' }
update()

let geometry: BufferGeometry | null = null
function setGeometry(g: BufferGeometry) {
  geometry?.dispose()
  geometry = g
  const mesh = generateMesh(geometry)
  view.scene.clear()
  view.scene.add(mesh)
  view.needsRender = true
  view.render()
}
