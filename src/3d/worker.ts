import type { RangeFunction3D, ValueFunction3D } from '../ast'
import { Range3D, splitRanges, polygonize } from './polygonizer'
export type WorkerInput = {
  fvalue: string
  frange: string
  radius: number
}
export type WorkerOutput = {
  positions: Float32Array
  normals: Float32Array
  resolution: number
  complete: false
} | { complete: true }

function sendOutput(message: WorkerOutput) {
  postMessage(message)
}

addEventListener('message', e => {
  start(e.data as WorkerInput)
  sendOutput({ complete: true })
})

async function start(input: WorkerInput) {
  const frange = eval(input.frange) as RangeFunction3D
  const fvalue = eval(input.fvalue) as ValueFunction3D
  const { radius } = input
  let ranges: Range3D[] = [[-radius, radius, -radius, radius, -radius, radius]]
  let res = 1
  let numPolygons = 1
  const preferredRanges = 65536
  const maxPolygons = 800000
  const maxResolution = 1024
  const area = { xmin: -radius, ymin: -radius, zmin: -radius, size: 2 * radius }
  while (true) {
    ranges = splitRanges(frange, ranges)
    res *= 2
    const positions = new Float32Array(polygonize(fvalue, ranges, 4, { ...area, resolution: res }))
    const normals = generateNormals(positions)
    sendOutput({ normals, positions, resolution: res * 4, complete: false })
    numPolygons = positions.length / 9
    if (res * 4 >= maxResolution) return
    if (numPolygons * 4 > maxPolygons || ranges.length > preferredRanges) break
  }
  let N: number
  if (ranges.length < preferredRanges && numPolygons * (3 / 2) ** 2 < maxPolygons) {
    ranges = splitRanges(frange, ranges)
    res *= 2
    N = 3
  } else if (numPolygons * (5 / 4) ** 2 < maxPolygons) {
    N = 5
  } else {
    return
  }
  const positions = new Float32Array(polygonize(fvalue, ranges, N, { ...area, resolution: res }))
  numPolygons = positions.length / 9
  if (numPolygons > maxPolygons * 1.5) return
  const normals = generateNormals(positions)
  sendOutput({ positions, normals, resolution: res * N, complete: false })
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
