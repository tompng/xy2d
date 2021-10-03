import { astTo3DFunction, astTo3DRangeFunction } from '../ast'
import { parse } from '../parser'
import { Range3D, splitRanges, polygonize } from './polygonizer'
import { View, generateGeometry, generateMesh } from './view'
import type { BufferGeometry } from 'three'

onload = polygonizeTest
function sleep(millisec: number) {
  return new Promise(r => setTimeout(r, millisec))
}

async function polygonizeTest() {
  const exp = 'sin(5xy+1)+sin(5yz+2)+sin(5zx+3)-1/2=0'
  let [ast, mode] = parse(exp)
  const frange = astTo3DRangeFunction(ast, { pos: false, neg: false })
  const fvalue = astTo3DFunction(ast)
  let ranges: Range3D[] = [[-1,1,-1,1,-1,1]]

  const view = new View()
  view.setSize(800, 600)
  document.body.appendChild(view.renderer.domElement)

  let geometry: BufferGeometry | null = null

  for (let i = 0; i < 5; i++) {
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
