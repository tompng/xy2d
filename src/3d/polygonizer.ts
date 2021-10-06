import { RangeFunction3D, ValueFunction3D } from '../ast'
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

export function polygonize(fvalue: ValueFunction3D, ranges: Range3D[], segments: number) {
  const polygon: number[] = []
  const N = segments + 1
  let lprev = new Float64Array(N ** 2)
  let lnext = new Float64Array(N ** 2)
  for (const range of ranges) {
    const [xmin, xmax, ymin, ymax, zmin, zmax] = range
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
      for (let i = 0; i < segments; i++) {
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
          const bit = (v000 >= 0 ? 1 : 0) |
                      (v100 >= 0 ? 2 : 0) |
                      (v010 >= 0 ? 4 : 0) |
                      (v110 >= 0 ? 8 : 0) |
                      (v001 > 0 ? 16 : 0) |
                      (v101 > 0 ? 32 : 0) |
                      (v011 > 0 ? 64 : 0) |
                      (v111 > 0 ? 128 : 0)
          if (bit === 0 || bit === 255) continue
          const x = xmin + xscale * i
          const y = ymin + yscale * j
          const coords = marchingCubePattern[bit]
          const edgeCoords = [
            v000 / (v000 - v100), 0, 0,
            1, v100 / (v100 - v110), 0,
            v010 / (v010 - v110), 1, 0,
            0, v000 / (v000 - v010), 0,
            0, 0, v000 / (v000 - v001),
            1, 0, v100 / (v100 - v101),
            1, 1, v110 / (v110 - v111),
            0, 1, v010 / (v010 - v011),
            v001 / (v001 - v101), 0, 1,
            1, v101 / (v101 - v111), 1,
            v011 / (v011 - v111), 1, 1,
            0, v001 / (v001 - v011), 1,
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
              polygon.push(
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
      ;[lnext, lprev] = [lprev, lnext]
    }
  }
  return polygon
}
