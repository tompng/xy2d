import { astTo3DFunction, astTo3DRangeFunction } from '../ast'
import { parse } from '../parser'
import { Range3D, splitRanges, polygonize } from './polygonizer'
import { View, generateGeometry, generateMesh } from './view'
import type { BufferGeometry } from 'three'

function sleep(millisec: number) {
  return new Promise(r => setTimeout(r, millisec))
}

// other samples: max(x^4+y^4+z^4,abs(x)+abs(y)+abs(z)-1)=0.5

const view = new View()
view.setSize(800, 600)
document.body.appendChild(view.renderer.domElement)

const errorDOM = document.querySelector<HTMLDivElement>('#error')!
const input = document.querySelector<HTMLInputElement>('#mathinput')!
async function update() {
  const exp = input.value
  try {
    await calc(exp)
  } catch (e) {
    errorDOM.textContent = String(e)
  }
}
input.onchange = update
input.oninput = () => {
  errorDOM.textContent = ''
}
update()

let geometry: BufferGeometry | null = null
async function calc(exp: string) {
  let [ast, mode] = parse(exp)
  const frange = astTo3DRangeFunction(ast, { pos: false, neg: false })
  const fvalue = astTo3DFunction(ast)
  let ranges: Range3D[] = [[-1,1,-1,1,-1,1]]
  for (let i = 0; i < 6; i++) {
    ranges = splitRanges(frange, ranges)
    const polygon = polygonize(fvalue, ranges, 4)
    geometry?.dispose()
    geometry = generateGeometry(polygon)
    const mesh = generateMesh(geometry)
    view.scene.clear()
    view.scene.add(mesh)
    view.needsRender = true
    await sleep(10)
  }
}
