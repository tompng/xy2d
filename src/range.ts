export type VRange = [number, number] // [min, max]
export type TRange = [number, number, number] // [v0,v1,e] v0*t+v1*(1-t)±e
export function addVC(a: VRange, b: number): VRange {
  return [a[0] + b, a[1] + b]
}
export function subCV(a: number, b: VRange): VRange {
  return [a - b[1], a - b[0]]
}
export function addVV(a: VRange, b: VRange): VRange {
  return [a[0] + b[0], a[1] + b[1]]
}
export function subVV(a: VRange, b: VRange): VRange {
  return [a[0] - b[1], a[1] - b[0]]
}
export function multVC(a: VRange, b: number): VRange {
  return b > 0 ? [a[0] * b, a[1] * b] : [a[1] * b, a[0] * b]
}
export function minusV([min, max]: VRange): VRange {
  return [-max, -min]
}
export function multVV([amin, amax]: VRange, [bmin, bmax]: VRange): VRange {
  const v00 = amin * bmin
  const v01 = amin * bmax
  const v10 = amax * bmin
  const v11 = amax * bmax
  return [Math.min(v00, v01, v10, v11), Math.max(v00, v01, v10, v11)]
}
export function invV([min, max]: VRange): VRange {
  if (min <= 0 && 0 <= max) {
    if (min !== 0 && max === 0) return [-Infinity, 1 / min]
    if (min === 0 && max !== 0) return [1 / max, Infinity]
    return [-Infinity, Infinity]
  }
  return [1 / max, 1 / min]
}
export function divVV(a: VRange, b: VRange): VRange {
  return multVV(a, invV(b))
}
export function sinV([min, max]: VRange): VRange {
  if (max - min > 2 * Math.PI) return [-1, 1]
  let vmin = Math.sin(min)
  let vmax = Math.sin(max)
  if (vmax < vmin) [vmin, vmax] = [vmax, vmin]
  const imin = Math.floor((min - Math.PI / 2) / Math.PI)
  const imax = Math.floor((max - Math.PI / 2) / Math.PI)
  if (imin < 2 * Math.floor(imax / 2)) vmax = 1
  if (imin <= 2 * Math.floor((imax - 1) / 2)) vmin = -1
  return [vmin, vmax]
}
export function cosV(a: VRange): VRange {
  return sinV(addVC(a, -Math.PI / 2))
}
export function expV(a: VRange): VRange {
  return [Math.exp(a[0]), Math.exp(a[1])]
}
export function logV([min, max]: VRange): VRange {
  return [min <= 0 ? -Infinity : Math.log(min), Math.log(max)]
}
export function sqrtV([min, max]: VRange): VRange {
  if (max < 0) return [0, 0]
  return [min < 0 ? 0 : Math.sqrt(min), Math.sqrt(max)]
}
export function powVC([amin, amax]: VRange, b: number): VRange {
  if (amin < 0 && 0 < amax) {
    if (Math.round(b) === b) {
      if (b % 2 == 0) {
        const v = Math.pow(Math.max(Math.abs(amin), Math.abs(amax)), b)
        return b < 0 ? [v, Infinity] : [0, v]
      } else {
        return b < 0 ? [-Infinity, Infinity] : [Math.pow(amin, b), Math.pow(amax, b)]
      }
    } else {
      const v = Math.pow(amax, b)
      return b < 0 ? [v, Infinity] : [0, v]
    }
  }
  if (amin < 0 && Math.floor(b) !== b) return [0, 0]
  const v1 = Math.pow(amin, b)
  const v2 = Math.pow(amax, b)
  return b < 0 ? [v2, v1] : [v1, v2]
}
export function powCV(a: number, [bmin, bmax]: VRange): VRange {
  if (a < 0) return [0, 0]
  return [Math.pow(a, bmin), Math.pow(a, bmax)]
}
export function powVV([amin, amax]: VRange, [bmin, bmax]: VRange) {
  if (amax < 0) return [0, 0]
  if (amin < 0) amin = 0
  const p = Math.pow(amin, bmin)
  const q = Math.pow(amin, bmax)
  const r = Math.pow(amax, bmin)
  const s = Math.pow(amax, bmax)
  return [
    Math.min(p, q, r, s),
    Math.max(p, q, r, s)
  ]
}
