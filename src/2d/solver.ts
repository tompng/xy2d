import type { RangeResult } from '../core/expander'
type FRange = (xmin: number, xmax: number, ymin: number, ymax: number) => RangeResult
type FValue = (x: number, y: number) => number

export class Solver {
  stepPerRun = 4
  completed = false
  aborted = false
  areaResults: number[] = []
  pointResults: number[] = []
  areaPointResult: number[] = []
  constructor(
    public fRange: FRange,
    public fValue: FValue,
    public range: { x: number; y: number; size: number },
    public resolution: number
  ) {}
  calculate() {
    const minRanges = this.calculateRange(1)
    this.calculateLine(minRanges)
  }
  calculateLine(minRanges: number[]) {
    const baskets: (number[] | undefined)[] = []
    for (let i = 0; i < minRanges.length; i += 2) {
      const xi = minRanges[i]
      const yi = minRanges[i + 1]
      ;(baskets[yi] ||= []).push(xi)
    }
    const { x, y, size } = this.range
    const s = size / this.resolution
    const { fValue } = this
    let prevFs: number[] = new Array(this.resolution + 1).fill(0)
    let prevFs2: number[] = new Array(this.resolution + 1).fill(0)
    let yj = -1
    baskets.forEach((xs, yi) => {
      if (!xs) return
      if (yj !== y) {
        let xj = -1
        xs.forEach(xi => {
          if (xj !== xi) prevFs[xi] = fValue(x + xi * s, y + yi * s)
          prevFs[xj = xi + 1] = fValue(x + (xi + 1) * s, y + yi * s)
        })
      }
      let xj = -1
      xs.forEach(xi => {
        const a = prevFs[xi]
        const b = prevFs[xi + 1]
        const c = xj === xi ? prevFs2[xi] : prevFs2[xi] = fValue(x + xi * s, y + (yi + 1) * s)
        const d = prevFs2[xj = xi + 1] = fValue(x + (xi + 1) * s, y + (yi + 1) * s)
        let px = 0
        let py = 0
        let pw = 0
        if (a * b <= 0) {
          px += xi + (a === b ? 0.5 : a / (a - b))
          py += yi
          pw ++
        }
        if (a * c <= 0) {
          px += xi
          py += yi + (a === c ? 0.5 : a / (a - c))
          pw ++
        }
        if (b * d <= 0) {
          px += xi + 1
          py += yi + (b === d ? 0.5 : b / (b - d))
          pw ++
        }
        if (c * d <= 0) {
          px += xi + (c === d ? 0.5 : c / (c - d))
          py += yi + 1
          pw ++
        }
        if (-1e-15 < Math.min(a,b,c,d) && Math.max(a, b, c, d) < 1e-15) {
          this.areaPointResult.push(xi, yi, 0)
        } else if (pw !== 0) {
          this.pointResults.push(xi, yi, px / pw, py / pw)
        } else {
          const v = fValue(x + (xi + 0.5) * s, y + (yi + 0.5) * s)
          this.areaPointResult.push(xi, yi, isNaN(v) ? 3 : v > 0 ? 2 : v < 0 ? 1 : 0)
        }
      })
      ;[prevFs, prevFs2] = [prevFs2, prevFs]
      yj = y + 1
    })
  }
  calculateRange(minRes: number): number[] {
    const { fRange, resolution, areaResults } = this
    const { x, y, size } = this.range
    const result = fRange(x, x + size, y, y + size)
    if (result >= 0) {
      areaResults.push(0, 0, 1, result)
      return []
    }
    let queue = new Array(64).fill(0)
    let queue2 = new Array(64).fill(0)
    let queueLength = 2
    let res = resolution
    while (res >= minRes && queueLength > 0) {
      let len2 = 0
      let dt = res / resolution
      let s = size * dt
      for (let i = 0; i < queueLength; i += 2) {
        const u = queue[i]
        const v = queue[i + 1]
        const result = fRange(x + u * s, x + (u + 1) * s, y + v * s, y + (v + 1) * s)
        if (result >= 0) {
          areaResults.push(u * dt, v * dt, dt, result)
        } else if (res > minRes) {
          for (let j = 0; j < 4; j++) {
            queue2[len2++] = 2 * u + (j & 1)
            queue2[len2++] = 2 * v + (j >> 1)
          }
        } else if (result >= -2) {
          queue2[len2++] = u
          queue2[len2++] = v
        }
      }
      [queue, queue2] = [queue2, queue]
      queueLength = len2
      res /= 2
    }
    queue.length = queueLength
    return queue
  }
}
