import type { RangeFunction3D, ValueFunction3D } from '../core/ast'
import { Range3D, splitRanges, polygonize } from './polygonizer'
export type WorkerInput = {
  transparent: boolean
  fvalue: string
  frange: string
  radius: number
}

type WorkerNormalResult = {
  type: 'opaque'
  positions: Float32Array
  normals: Float32Array
  resolution: number
}
type WorkerComplete = {
  type: 'complete'
}
type WorkerError = {
  type: 'error'
}
type WorkerTransparentResult = {
  type: 'transparent'
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  dirRanges: {
    x: number
    y: number
    z: number
    start: number
    count: number
  }[]
  resolution: number
}

export type WorkerOutput = WorkerComplete | WorkerError | WorkerNormalResult | WorkerTransparentResult

function sendMessage(message: WorkerOutput) {
  postMessage(message)
}

addEventListener('message', e => {
  let sent = false
  try {
    start(e.data as WorkerInput, output => {
      sent = true
      sendMessage(output)
    })
  } catch (e) {
    console.error(e)
  }
  if (sent) {
    sendMessage({ type: 'complete' })
  } else {
    sendMessage({ type: 'error' })
  }
})

function toTransparentOutput(positions: Float32Array, normals: Float32Array, resolution: number, radius: number) {
  const numTriangles = positions.length / 9
  const triangleIndices: number[] = []
  const centers: [number, number, number][] = []
  for (let i = 0; i < numTriangles; i++) {
    const item: [number, number, number] = [0, 0, 0]
    for (let j = 0; j < 3; j++) {
      const k = 9 * i + j
      const v = (positions[k] + positions[3 + k] + positions[6 + k]) / 3
      const iv = Math.floor(resolution * (v + radius) / radius / 2)
      item[j] = iv < 0 ? 0 : iv >= resolution ? resolution - 1 : iv
    }
    triangleIndices.push(i)
    centers.push(item)
  }
  let indicesIndex = 0
  const indices = new Uint32Array(numTriangles * 3 * 26)
  const data: WorkerTransparentResult = {
    type: 'transparent',
    positions,
    normals,
    resolution,
    indices,
    dirRanges: []
  }
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        if (dx === 0 && dy === 0 && dz === 0) continue
        const offset = ((dx < 0 ? 1 : 0) + (dy < 0 ? 1 : 0) + (dz < 0 ? 1 : 0)) * resolution
        const indicesList: number[][] = [...new Array(3 * (resolution + 1))].map(() => [])
        for (let i = 0; i < numTriangles; i++) {
          const [ix, iy, iz] = centers[i]
          const idx = offset + ix * dx + iy * dy + iz * dz
          indicesList[idx].push(i)
        }
        const start = indicesIndex
        for (const idxs of indicesList) {
          for (const idx of idxs) {
            indices[indicesIndex] = 3 * idx
            indices[indicesIndex + 1] = 3 * idx + 1
            indices[indicesIndex + 2] = 3 * idx + 2
            indicesIndex += 3
          }
        }
        const dr = Math.hypot(dx ** 2 + dy ** 2 + dz ** 2)
        data.dirRanges.push({
          x: dx / dr,
          y: dy / dr,
          z: dz / dr,
          start,
          count: numTriangles * 3
        })
      }
    }
  }
  return data
}

function start(input: WorkerInput, sendOutput: (output: WorkerOutput) => void) {
  const frange = eval(input.frange) as RangeFunction3D
  const fvalue = eval(input.fvalue) as ValueFunction3D
  const { radius } = input
  let ranges: Range3D[] = [[-radius, radius, -radius, radius, -radius, radius]]
  let res = 1
  const preferredRanges = 65536
  const maxPolygons = input.transparent ? 200000 : 800000
  const maxResolution = 1024
  const area = { xmin: -radius, ymin: -radius, zmin: -radius, size: 2 * radius }
  const polygonizeEdge = !input.transparent
  const send = (positions: Float32Array, normals: Float32Array, resolution: number) => {
    if (input.transparent) {
      sendOutput(toTransparentOutput(positions, normals, resolution, radius))
    } else {
      sendOutput({ type: 'opaque', positions, normals, resolution })
    }
  }
  let numPolygonsWithoutEdge = 1
  while (true) {
    ranges = splitRanges(frange, ranges)
    res *= 2
    const result = polygonize(fvalue, ranges, 4, { ...area, resolution: res }, polygonizeEdge)
    numPolygonsWithoutEdge = result[0]
    const positions = new Float32Array(result[1])
    const numPolygons = positions.length / 9
    send(positions, generateNormals(positions), res * 4)
    if (res * 4 >= maxResolution) return
    if (numPolygons > maxPolygons * 1.5) return
    if (numPolygonsWithoutEdge * 4 > maxPolygons || ranges.length > preferredRanges) break
  }
  let N: number
  if (ranges.length < preferredRanges && numPolygonsWithoutEdge * (3 / 2) ** 2 < maxPolygons) {
    ranges = splitRanges(frange, ranges)
    res *= 2
    N = 3
  } else if (numPolygonsWithoutEdge * (5 / 4) ** 2 < maxPolygons) {
    N = 5
  } else {
    return
  }
  const positions = new Float32Array(polygonize(fvalue, ranges, N, { ...area, resolution: res }, polygonizeEdge)[1])
  const numPolygons = positions.length / 9
  if (numPolygons > maxPolygons * 1.5) return
  send(positions, generateNormals(positions), res * N)
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
