import { RangeFunction3D, ValueFunction3D } from '../core/ast'
import { generateMarchingCubeTable } from './marchingcube'
export type Range3D = Parameters<RangeFunction3D>

export function splitRanges(frange: RangeFunction3D, ranges: Range3D[]) {
  const output: Range3D[] = []
  for(const r of ranges) {
    const [xmin, xmax, ymin, ymax, zmin, zmax] = r
    const x = (xmin + xmax) / 2
    const y = (ymin + ymax) / 2
    const z = (zmin + zmax) / 2
    if(frange(xmin, x, ymin, y, zmin, z) < 0) output.push([xmin, x, ymin, y, zmin, z])
    if(frange(x, xmax, ymin, y, zmin, z) < 0) output.push([x, xmax, ymin, y, zmin, z])
    if(frange(xmin, x, y, ymax, zmin, z) < 0) output.push([xmin, x, y, ymax, zmin, z])
    if(frange(x, xmax, y, ymax, zmin, z) < 0) output.push([x, xmax, y, ymax, zmin, z])
    if(frange(xmin, x, ymin, y, z, zmax) < 0) output.push([xmin, x, ymin, y, z, zmax])
    if(frange(x, xmax, ymin, y, z, zmax) < 0) output.push([x, xmax, ymin, y, z, zmax])
    if(frange(xmin, x, y, ymax, z, zmax) < 0) output.push([xmin, x, y, ymax, z, zmax])
    if(frange(x, xmax, y, ymax, z, zmax) < 0) output.push([x, xmax, y, ymax, z, zmax])
  }
  return output
}
const marchingCubePattern = generateMarchingCubeTable()

type PolygonizeRange = { xmin: number; ymin: number; zmin: number; size: number; resolution: number }
export function polygonize(fvalue: ValueFunction3D, ranges: Range3D[], segments: number, area: PolygonizeRange, detailedEdge: boolean): number[] {
  const polygon: number[] = []
  const N = segments + 1
  const cssize = N ** 2
  let lprev = new Float64Array(cssize)
  let lnext = new Float64Array(cssize)
  const edges: [number, number, number, number][] | undefined = detailedEdge ? [] : undefined
  for (const range of ranges) polygonizeRange(fvalue, range, segments, lprev, lnext, polygon, edges)
  if (!edges || edges.length === 0) return polygon
  return polygonizeEdge(fvalue, polygon, edges, { ...area, resolution: area.resolution * segments })
}

function polygonizeRange(
  fvalue: ValueFunction3D, range: Range3D, segments: number, lprev: Float64Array, lnext: Float64Array,
  output: number[], edges?: [number, number, number, number][]
) {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = range
  const N = segments + 1
  const xscale = (xmax - xmin) / segments
  const yscale = (ymax - ymin) / segments
  const zscale = (zmax - zmin) / segments
  for (let i = 0; i <= segments; i++) {
    const x = xmin + xscale * i
    for (let j = 0; j <= segments; j++) {
      lprev[i * N + j] = fvalue(x, ymin + yscale * j, zmin)
    }
  }
  for (let k = 0; k < segments; k++) {
    const z = zmin + zscale * k
    const z1 = zmin + zscale * (k + 1)
    for (let i = 0; i <= segments; i++) {
      const x = xmin + xscale * i
      for (let j = 0; j <= segments; j++) {
        lnext[i * N + j] = fvalue(x, ymin + yscale * j, z1)
      }
    }
    polygonizeCrossSection(lprev, lnext, segments, fvalue, xmin, ymin, z, z1, xscale, yscale, zscale, output, edges)
    ;[lnext, lprev] = [lprev, lnext]
  }
}

function polygonizeCrossSection(
  lprev: Float64Array, lnext: Float64Array, segments: number,
  fvalue: ValueFunction3D,
  xmin: number, ymin: number, z: number, z1: number,
  xscale: number, yscale: number, zscale: number,
  output: number[], edges?: [number, number, number, number][]
) {
  function find(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v0: number, v1: number) {
    const s = v0 / (v0 - v1)
    if (!(0 < s && s < 1)) return s
    const vm = fvalue((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    return v0 * vm <= 0 ? v0 / (v0 - vm) / 2 : (1 + vm / (vm - v1)) / 2
  }
  const N = segments + 1
  for (let i = 0; i < segments; i++) {
    const x = xmin + xscale * i
    const x1 = xmin + xscale * (i + 1)
    for (let j = 0; j < segments; j++) {
      const idx = i * N + j
      const v000 = lprev[idx]
      const v100 = lprev[idx + N]
      const v010 = lprev[idx + 1]
      const v110 = lprev[idx + N + 1]
      const v001 = lnext[idx]
      const v101 = lnext[idx + N]
      const v011 = lnext[idx + 1]
      const v111 = lnext[idx + N + 1]
      const bit = (v000 > 0 ? 1 : 0) |
                  (v100 > 0 ? 2 : 0) |
                  (v010 > 0 ? 4 : 0) |
                  (v110 > 0 ? 8 : 0) |
                  (v001 > 0 ? 16 : 0) |
                  (v101 > 0 ? 32 : 0) |
                  (v011 > 0 ? 64 : 0) |
                  (v111 > 0 ? 128 : 0)
      if (bit === 0 || bit === 255) continue
      const y = ymin + yscale * j
      const y1 = ymin + yscale * (j + 1)
      if (edges) {
        const approxC = (v000 + v001 + v010 + v011 + v100 + v101 + v110 + v111) / 8
        const approxX = (v100 + v101 + v110 + v111 - v000 - v001 - v010 - v011) / 8
        const approxY = (v010 + v011 + v110 + v111 - v000 - v001 - v100 - v101) / 8
        const approxZ = (v001 + v011 + v101 + v111 - v000 - v010 - v100 - v110) / 8
        const diff = Math.sqrt(
          (
            (-approxX - approxY - approxZ + approxC - v000) ** 2 +
            (-approxX - approxY + approxZ + approxC - v001) ** 2 +
            (-approxX + approxY - approxZ + approxC - v010) ** 2 +
            (-approxX + approxY + approxZ + approxC - v011) ** 2 +
            (+approxX - approxY - approxZ + approxC - v100) ** 2 +
            (+approxX - approxY + approxZ + approxC - v101) ** 2 +
            (+approxX + approxY - approxZ + approxC - v110) ** 2 +
            (+approxX + approxY + approxZ + approxC - v111) ** 2
          ) / (approxX ** 2 + approxY ** 2 + approxZ ** 2)
        )
        if (diff > 1 / 16) edges.push([diff, x, y, z])
      }
      const coords = marchingCubePattern[bit]
      const edgeCoords = [
        find(x, y, z, x1, y, z, v000, v100), 0, 0,
        1, find(x1, y, z, x1, y1, z, v100, v110), 0,
        find(x, y1, z, x1, y1, z, v010, v110), 1, 0,
        0, find(x, y, z, x, y1, z, v000, v010), 0,
        0, 0, find(x, y, z, x, y, z1, v000, v001),
        1, 0, find(x1, y, z, x1, y, z1, v100, v101),
        1, 1, find(x1, y1, z, x1, y1, z1, v110, v111),
        0, 1, find(x, y1, z, x, y1, z1, v010, v011),
        find(x, y, z1, x1, y, z1, v001, v101), 0, 1,
        1, find(x1, y, z1, x1, y1, z1, v101, v111), 1,
        find(x, y1, z1, x1, y1, z1, v011, v111), 1, 1,
        0, find(x, y, z1, x, y1, z1, v001, v011), 1,
      ]
      for (let i = 0; i < coords.length; i+= 3) {
        const i1 = coords[i] * 3
        const i2 = coords[i + 1] * 3
        const i3 = coords[i + 2] * 3
        if (!isNaN(
          edgeCoords[i1] + edgeCoords[i1 + 1] + edgeCoords[i1 + 2] +
          edgeCoords[i2] + edgeCoords[i2 + 1] + edgeCoords[i2 + 2] +
          edgeCoords[i3] + edgeCoords[i3 + 1] + edgeCoords[i3 + 2]
        )) {
          output.push(
            x + (edgeCoords[i1] * xscale) || 0,
            y + (edgeCoords[i1 + 1] * yscale) || 0,
            z + (edgeCoords[i1 + 2] * zscale) || 0,
            x + (edgeCoords[i2] * xscale) || 0,
            y + (edgeCoords[i2 + 1] * yscale) || 0,
            z + (edgeCoords[i2 + 2] * zscale) || 0,
            x + (edgeCoords[i3] * xscale) || 0,
            y + (edgeCoords[i3 + 1] * yscale) || 0,
            z + (edgeCoords[i3 + 2] * zscale) || 0,
          )
        }
      }
    }
  }
}

function polygonizeEdge(fvalue: ValueFunction3D, polygon: number[], edges: [number, number, number, number][], range: PolygonizeRange): number[] {
  const maxEdges = Math.min(8192, Math.round(polygon.length / 100))
  if (maxEdges < edges.length && edges.length < maxEdges * 64) {
    edges.sort((a, b) => b[0] - a[0])
    edges.length = maxEdges
  }
  const { xmin, ymin, zmin, size, resolution } = range
  const delta = size / resolution
  const offset = delta / 2
  const edgeSet = new Set<number>()
  const adjSet = new Set<number>()
  for (const [_, x, y, z] of edges) {
    const ix = Math.floor((x + offset - xmin) / delta)
    const iy = Math.floor((y + offset - ymin) / delta)
    const iz = Math.floor((z + offset - zmin) / delta)
    const idx = resolution * (resolution * ix + iy) + iz
    edgeSet.add(idx)
    adjSet.add(idx)
    if (ix > 0) adjSet.add(idx - resolution * resolution)
    if (ix + 1 < resolution) adjSet.add(idx + resolution * resolution)
    if (iy > 0) adjSet.add(idx - resolution)
    if (iy + 1 < resolution) adjSet.add(idx + resolution)
    if (iz > 0) adjSet.add(idx - 1)
    if (iz + 1 < resolution) adjSet.add(idx + 1)
  }
  const output: number[] = []
  for (let i = 0; i < polygon.length; i += 9) {
    const x1 = polygon[i], y1 = polygon[i + 1], z1 = polygon[i + 2]
    const x2 = polygon[i + 3], y2 = polygon[i + 4], z2 = polygon[i + 5]
    const x3 = polygon[i + 6], y3 = polygon[i + 7], z3 = polygon[i + 8]
    const ix = Math.floor(((x1 + x2 + x3) / 3 - xmin) / delta)
    const iy = Math.floor(((y1 + y2 + y3) / 3 - ymin) / delta)
    const iz = Math.floor(((z1 + z2 + z3) / 3 - zmin) / delta)
    if (edgeSet.has(resolution * (resolution * ix + iy) + iz)) continue
    output.push(x1, y1, z1, x2, y2, z2, x3, y3, z3)
  }
  const segments = 4
  const cssize = (segments + 1) ** 2
  const lprev = new Float64Array(cssize)
  const lnext = new Float64Array(cssize)
  for (const idx of adjSet) {
    const idxxy = Math.floor(idx / resolution)
    const ix = Math.floor(idxxy / resolution)
    const iy = idxxy % resolution
    const iz = idx % resolution
    const range: Range3D = [
      xmin + ix * delta,
      xmin + (ix + 1) * delta,
      ymin + iy * delta,
      ymin + (iy + 1) * delta,
      zmin + iz * delta,
      zmin + (iz + 1) * delta,
    ]
    polygonizeRange(fvalue, range, 3, lprev, lnext, output)
  }
  return output
}
