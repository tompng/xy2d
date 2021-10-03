import type { RangeFunction3D, ValueFunction3D } from '../ast'
import { Range3D, splitRanges, polygonize } from './polygonizer'
export type WorkerInput = {
  fvalue: string
  frange: string
}
export type WorkerOutput = {
  positions: Float32Array
  normals: Float32Array
  resolution: number
  complete: boolean
}
addEventListener('message', e => {
  start(e.data as WorkerInput)
})

async function start(input: WorkerInput) {
  const frange = eval(input.frange) as RangeFunction3D
  const fvalue = eval(input.fvalue) as ValueFunction3D
  let ranges: Range3D[] = [[-1,1,-1,1,-1,1]]
  let res = 1
  while (true) {
    ranges = splitRanges(frange, ranges)
    res *= 2
    const positions = new Float32Array(polygonize(fvalue, ranges, 4))
    const normals = generateNormals(positions)
    const data: WorkerOutput = {
      normals,
      positions,
      resolution: res * 4,
      complete: false
    }
    if (res >= 256 || ranges.length > 20000) data.complete = true
    postMessage(data)
    if (data.complete) break
  }
}

function generateNormals(positions: Float32Array) {
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
  return normals
}