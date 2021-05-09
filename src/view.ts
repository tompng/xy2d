import { RangeFunction, ValueFunction } from './ast'
import { Solver } from './solver'

type Colors = {
  zero?: string | null
  neg?: string | null
  pos?: string | null
  nan?: string | null
  line?: string | null
}
type Range = { x: number; y: number; size: number }
export class Panel {
  backgroundCanvas: HTMLCanvasElement
  lineCanvas: HTMLCanvasElement
  offset = 2
  constructor(
    public fvalue: ValueFunction,
    public frange: RangeFunction,
    public range: Range,
    public resolution: number,
    public colors: Colors
  ) {
    this.backgroundCanvas = document.createElement('canvas')
    this.lineCanvas = document.createElement('canvas')
    this.resetResolution(resolution)
  }
  reset(
    fvalue: ValueFunction,
    frange: RangeFunction,
    range: Range,
    resolution: number,
    colors: Colors
   ) {
    this.fvalue = fvalue
    this.frange = frange
    this.range = range
    this.colors = colors
    this.resetResolution(resolution)
  }
  resetResolution(resolution: number) {
    this.resolution = resolution
    this.backgroundCanvas.width = this.backgroundCanvas.height = resolution
    this.lineCanvas.width = this.lineCanvas.height = resolution + 2 * this.offset
  }
  render() {
    const bgCtx = this.backgroundCanvas.getContext('2d')!
    const lineCtx = this.lineCanvas.getContext('2d')!
    const { colors, resolution, offset } = this
    const solver = new Solver(this.frange, this.fvalue, this.range, this.resolution)
    solver.calculate()
    const areaResults = solver.areaResults
    const pointResults = solver.pointResults
    const areaPointResult = solver.areaPointResult
    const pointRadius = offset
    const palette = [colors.zero, colors.neg, colors.pos, colors.nan]
    for (let i = 0; i < areaResults.length;) {
      const x = areaResults[i++]
      const y = areaResults[i++]
      const size = areaResults[i++]
      const result = areaResults[i++]
      const color = palette[result]
      if (color) {
        bgCtx.fillStyle = color
        bgCtx.globalAlpha = 0.5+0.5*Math.random()
        bgCtx.fillRect(resolution * x , resolution - resolution * (y + size), resolution * size, resolution * size)
        bgCtx.globalAlpha = 1
      }
    }
    for (let i = 0; i < areaPointResult.length;) {
      const x = areaPointResult[i++]
      const y = areaPointResult[i++]
      const c = areaPointResult[i++]
      let len = 1
      while(areaPointResult[i] === x + len && areaPointResult[i + 1] === y && areaPointResult[i + 2] === c) {
        i += 3
        len += 1
      }
      const color = palette[c]
      if (color) {
        bgCtx.fillStyle = color
        bgCtx.fillRect(x, resolution - y - 1, len, 1)
      }
    }
    if (colors.line) {
      lineCtx.fillStyle = colors.line
      for (let i = 0; i < pointResults.length; i += 4) {
        const x = pointResults[i + 2]
        const y = pointResults[i + 3]
        lineCtx.beginPath()
        lineCtx.globalAlpha = 0.8
        lineCtx.arc(offset + x, offset + resolution - 1 - y, pointRadius, 0, 2 * Math.PI)
        lineCtx.fill()
      }
    }
  }
}
