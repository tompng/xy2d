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
  pointRadius = 1.5
  rendered = false
  constructor(
    public fvalue: ValueFunction,
    public frange: RangeFunction,
    public range: Range,
    public resolution: number,
    public colors: Colors
  ) {
    this.backgroundCanvas = document.createElement('canvas')
    this.lineCanvas = document.createElement('canvas')
    this.backgroundCanvas.style.position = 'absolute'
    this.lineCanvas.style.position = 'absolute'
    this.backgroundCanvas.style.zIndex = '1'
    this.lineCanvas.style.zIndex = '2'
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
  resetRange(range: Range) {
    this.range = range
    this.resetResolution(this.resolution)
  }
  resetResolution(resolution: number) {
    this.resolution = resolution
    this.backgroundCanvas.width = this.backgroundCanvas.height = resolution
    this.lineCanvas.width = this.lineCanvas.height = resolution + 2 * this.offset
    this.rendered = false
  }
  release() {
    // release memory immediately
    this.backgroundCanvas.width = this.backgroundCanvas.height = 0
    this.lineCanvas.width = this.lineCanvas.height = 0
  }
  render() {
    this.rendered = true
    const bgCtx = this.backgroundCanvas.getContext('2d')!
    const lineCtx = this.lineCanvas.getContext('2d')!
    const { colors, resolution, offset, pointRadius } = this
    const solver = new Solver(this.frange, this.fvalue, this.range, this.resolution)
    solver.calculate()
    const areaResults = solver.areaResults
    const pointResults = solver.pointResults
    const areaPointResult = solver.areaPointResult
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

export class View {
  center = { x: 0, y: 0 }
  width = 800
  height = 800
  viewSize = 4
  panelResolution = 128
  panels = new Map<string, { ix: number; iy: number; prior: boolean; panel: Panel }>()
  dom = document.createElement('div')
  pool: Panel[] = []
  constructor(
    public fvalue: ValueFunction,
    public frange: RangeFunction,
    public colors: Colors
  ) {
    this.dom.style.cssText = `
      position: absolute;
      box-shadow: 0 0 1px black;
      background: white;
    `
  }
  update(timeout = 30) {
    this.dom.style.width = `${this.width}px`
    this.dom.style.height = `${this.height}px`
    const { center, width, height, viewSize, panelResolution } = this
    const viewResolution = Math.min(width, height)
    const panelSize = panelResolution / viewResolution * viewSize
    const xmin = center.x - viewSize * width / viewResolution / 2
    const xmax = center.x + viewSize * width / viewResolution / 2
    const ymin = center.y - viewSize * height / viewResolution / 2
    const ymax = center.y + viewSize * height / viewResolution / 2
    const margin = panelSize
    ;[...this.panels.entries()].forEach(([key, data]) => {
      const { ix, iy, panel } = data
      if (
        xmin - margin < (ix * 1) * panelSize && ix * panelSize < xmax + margin &&
        ymin - margin < (iy * 1) * panelSize && iy * panelSize < ymax + margin
      ) {
        data.prior = false
        return
      }
      this.panels.delete(key)
      panel.backgroundCanvas.remove()
      panel.lineCanvas.remove()
      this.pool.push(panel)
    })
    for (let ix = Math.floor(xmin / panelSize), ixmax = Math.floor(xmax / panelSize); ix <= ixmax; ix++) {
      for (let iy = Math.floor(ymin / panelSize), iymax = Math.floor(ymax / panelSize); iy <= iymax; iy++) {
        const key = `${ix}_${iy}`
        const existingPanel = this.panels.get(key)
        if (existingPanel) {
          existingPanel.prior = true
          continue
        }
        const panel = this.createPanel({ x: ix * panelSize, y: iy * panelSize, size: panelSize })
        this.dom.appendChild(panel.backgroundCanvas)
        this.dom.appendChild(panel.lineCanvas)
        this.panels.set(key, { ix, iy, panel, prior: true })
      }
    }
    this.panels.forEach(({ ix, iy, panel }) => {
      const x = width / 2 + (ix * panelSize - center.x) * panelResolution / panelSize
      const y = height / 2 - ((iy + 1)* panelSize - center.y) * panelResolution / panelSize
      panel.backgroundCanvas.style.left = `${x}px`
      panel.backgroundCanvas.style.top = `${y}px`
      panel.lineCanvas.style.left = `${x - panel.offset}px`
      panel.lineCanvas.style.top = `${y - panel.offset}px`
    })
    while (this.pool.length > 64) this.pool.pop()?.release()
    this.render(timeout)
  }
  timer: number | null = null
  render(timeout = 30) {
    if (this.timer) return
    const t0 = performance.now()
    let aborted = false
    for (const target of [true, 'false']) {
      for (const [, { panel, prior }] of this.panels) {
        if (panel.rendered || prior !== target) continue
        panel.render()
        if (performance.now() - t0 < timeout) continue
        aborted = true
        break
      }
      if (aborted) continue
    }
    if (!aborted) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.render()
    }, 10) as unknown as number // FIXME: fix tsconfig?
  }
  createPanel(range: Range) {
    const panel = this.pool.pop()
    if (!panel) return new Panel(this.fvalue, this.frange, range, this.panelResolution, this.colors)
    panel.resetRange(range)
    return panel
  }
  clear() {
    this.panels.forEach(({ panel }) => {
      panel.backgroundCanvas.remove()
      panel.lineCanvas.remove()
      this.pool.push(panel)
    })
    this.panels.clear()
  }
  release() {
    this.pool.forEach(p => p.release())
    if (this.timer) clearTimeout(this.timer)
    for (const [, { panel, }] of this.panels) {
      panel.backgroundCanvas.remove()
      panel.lineCanvas.remove()
      panel.release()
    }
    this.pool.length = 0
    this.panels.clear()
  }
}
