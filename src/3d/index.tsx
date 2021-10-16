import React from 'react'
import { render as renderDOM } from 'react-dom'
import { astTo3DFunction, astTo3DRangeFunction } from '../core/ast'
import { parse } from '../core/parser'
import { View, generateMesh } from './view'
import type { WorkerInput, WorkerOutput } from './worker'
import * as THREE from 'three'

const App: React.VFC = () => null
renderDOM(<App />, document.getElementById('app')!)

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
  worker.addEventListener('message', (e: MessageEvent<WorkerOutput>) => {
    const { data } = e
    if (data.complete) {
      statusDOM.innerHTML = data.error ? 'unknown error' : statusDOM.innerHTML.replace('...', 'complete')
      return
    }
    const { positions, normals, resolution } = data
    console.log(resolution, positions.length / 9)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    statusDOM.innerHTML = `${resolution}&times;${resolution}&times;${resolution} ...`
    setGeometry(geometry)
  })
}
// max(x^4+y^4+z^4,abs(x)+abs(y)+abs(z)-1)=0.5

const view = new View()
view.setSize(800, 600)
view.onZoomChange = update
const viewDOM = document.querySelector<HTMLDivElement>('.view')!
viewDOM.appendChild(view.renderer.domElement)
function setSize() {
  view.setSize(viewDOM.offsetWidth, viewDOM.offsetHeight)
}
setSize()
window.addEventListener('resize', setSize)
setInterval(setSize, 1000) // for resize event bug on iOS

const errorDOM = document.querySelector<HTMLSpanElement>('#error')!
const statusDOM = document.querySelector<HTMLSpanElement>('#status')!
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

let geometry: THREE.BufferGeometry | null = null
let mesh: THREE.Mesh | null = null
function setGeometry(g: THREE.BufferGeometry) {
  geometry?.dispose()
  geometry = g
  if (mesh) view.scene.remove(mesh)
  view.scene.add(mesh = generateMesh(geometry))
  view.needsRender = true
  view.render()
}
