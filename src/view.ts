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
    public colors: Colors,
  ) {
    this.backgroundCanvas = document.createElement('canvas')
    this.lineCanvas = document.createElement('canvas')
    this.backgroundCanvas.style.position = 'absolute'
    this.lineCanvas.style.position = 'absolute'
    this.backgroundCanvas.style.zIndex = '0'
    this.lineCanvas.style.zIndex = '1'
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
    const debugRender = (window as any).debugRender
    const bgCtx = this.backgroundCanvas.getContext('2d')!
    const lineCtx = this.lineCanvas.getContext('2d')!
    const { colors, resolution, offset, pointRadius } = this
    const solver = new Solver(this.frange, this.fvalue, this.range, this.resolution)
    solver.calculate()
    const areaResults = solver.areaResults
    const pointResults = solver.pointResults
    const areaPointResult = solver.areaPointResult
    const palette = [colors.zero, colors.neg, colors.pos, colors.nan]
    for (let c = 0; c < 4; c++){
      const color = palette[c]
      if (!color) continue
      bgCtx.fillStyle = color
      for (let i = 0; i < areaResults.length;) {
        const x = areaResults[i++]
        const y = areaResults[i++]
        const size = areaResults[i++]
        const result = areaResults[i++]
        if (result !== c) continue
        bgCtx.globalAlpha = debugRender ? 0.5+0.5*Math.random() : 1
        bgCtx.fillRect(resolution * x , resolution - resolution * (y + size), resolution * size, resolution * size)
      }
      bgCtx.globalAlpha = 1
      for (let i = 0; i < areaPointResult.length;) {
        const x = areaPointResult[i++]
        const y = areaPointResult[i++]
        const r = areaPointResult[i++]
        if (r !== c) continue
        let len = 1
        while(areaPointResult[i] === x + len && areaPointResult[i + 1] === y && areaPointResult[i + 2] === c) {
          i += 3
          len += 1
        }
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
  panelResolution = 128
  renderedPanelSize = 0
  panels = new Map<string, { ix: number; iy: number; prior: boolean; panel: Panel }>()
  dom = document.createElement('div')
  pool: Panel[] = []
  locked = false
  axisCanvas: HTMLCanvasElement
  sizePerPixel = 0
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
    this.axisCanvas = document.createElement('canvas')
    this.dom.appendChild(this.axisCanvas)
    this.axisCanvas.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      z-index: 2;
    `
    this.setViewSize(4)
  }
  lock() {
    this.locked = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  setViewSize(viewSize: number) {
    const viewResolution = Math.min(this.width, this.height)
    this.sizePerPixel = viewSize / viewResolution
  }
  update(timeout = 30) {
    if (this.locked) {
      this.updatePosition()
      return
    }
    this.dom.style.width = `${this.width}px`
    this.dom.style.height = `${this.height}px`
    const { center, width, height, sizePerPixel, panelResolution } = this
    const viewResolution = Math.min(width, height)
    const viewSize = sizePerPixel * viewResolution
    const panelSize = panelResolution / viewResolution * viewSize / devicePixelRatio
    this.renderedPanelSize = panelSize
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
    this.updatePosition()
    while (this.pool.length > 64) this.pool.pop()?.release()
    this.render(timeout)
  }
  get viewSize() {
    const viewResolution = Math.min(this.width, this.height)
    return this.sizePerPixel * viewResolution
  }
  updatePosition() {
    const { width, height, center, renderedPanelSize, panelResolution, sizePerPixel } = this
    const viewResolution = Math.min(width, height)
    const viewSize = sizePerPixel * viewResolution
    const panelSize = panelResolution / viewResolution * viewSize
    const xAt = (ix: number) => width / 2 + (ix * renderedPanelSize - center.x) * panelResolution / panelSize
    const yAt = (iy: number) => height / 2 - (iy* renderedPanelSize - center.y) * panelResolution / panelSize
    this.panels.forEach(({ ix, iy, panel }) => {
      const offset = renderedPanelSize * panel.offset / panelSize
      const x = Math.floor(xAt(ix))
      const y = Math.floor(yAt(iy + 1))
      const w = Math.floor(xAt(ix + 1)) - x
      const h = Math.floor(yAt(iy)) - y
      panel.backgroundCanvas.style.left = `${x}px`
      panel.backgroundCanvas.style.top = `${y}px`
      panel.lineCanvas.style.left = `${x - offset}px`
      panel.lineCanvas.style.top = `${y - offset}px`
      panel.backgroundCanvas.style.width = `${w}px`
      panel.backgroundCanvas.style.height = `${h}px`
      panel.lineCanvas.style.width = `${w + offset * 2}px`
      panel.lineCanvas.style.height = `${h + offset * 2}px`
    })
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
      panel.release()
    })
    this.panels.clear()
  }
  reset() {
    this.pool.forEach(p => p.release())
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const [, { panel, }] of this.panels) {
      panel.backgroundCanvas.remove()
      panel.lineCanvas.remove()
      panel.release()
    }
    this.pool.length = 0
    this.panels.clear()
  }
  renderAxis() {
    const { axisCanvas, width, height, center, sizePerPixel } = this
    const canvasWidth = width * devicePixelRatio
    const canvasHeight = height * devicePixelRatio
    const viewResolution = Math.min(width, height)
    const viewSize = sizePerPixel * viewResolution
    if (axisCanvas.width !== canvasWidth || axisCanvas.height !== canvasHeight) {
      axisCanvas.width = canvasWidth
      axisCanvas.height = canvasHeight
      axisCanvas.style.width = width + 'px'
      axisCanvas.style.height = height + 'px'
    }
    const ctx = axisCanvas.getContext('2d')
    if (!ctx) return
    ctx.save()
    ctx.scale(canvasWidth / width, canvasHeight / height)
    ctx.clearRect(0, 0, width, height)
    let xoffset = 0
    let yoffset = 0
    const xconv = (x: number) => width / 2 + (x - center.x) * viewResolution / viewSize + xoffset
    const yconv = (y: number) => height / 2 - (y - center.y) * viewResolution / viewSize + yoffset
    const xinv = (x: number) => center.x + (x - width / 2) * viewSize / viewResolution
    const yinv = (y: number) => center.y + (height / 2 - y) * viewSize / viewResolution
    xoffset = Math.floor(xconv(0)) - xconv(0)
    yoffset = Math.floor(yconv(0)) - yconv(0)
    const xzero = xconv(0)
    const yzero = yconv(0)
    const fontSize = 14
    let step = 10 ** Math.ceil(Math.log10(viewSize))
    const min = Math.max(fontSize * 8, viewResolution / 8)
    let substep: number
    while (true) {
      const px = viewResolution * step / viewSize
      if (px / 10 > min) {
        step /= 10
        continue
      }
      if (px * 0.2 > min) {
        substep = 4
        step *= 0.2
      } else if (px / 2 > min) {
        substep = 5
        step /= 2
      } else {
        substep = 5
      }
      break
    }
    const ixmin = Math.ceil(xinv(0) / step * substep)
    const ixmax = Math.ceil(xinv(width) / step * substep)
    for (let ix = ixmin; ix < ixmax; ix++) {
      ctx.globalAlpha = ix === 0 ? 1 : ix % substep === 0 ? 0.5 : 0.1
      const x = xconv(ix * step / substep)
      ctx.fillRect(x - 0.5, 0, 1, height)
    }
    const iymin = Math.ceil(yinv(height) / step * substep)
    const iymax = Math.ceil(yinv(0) / step * substep)
    for (let iy = iymin; iy < iymax; iy++) {
      ctx.globalAlpha = iy === 0 ? 1 : iy % substep === 0 ? 0.5 : 0.1
      const y = yconv(iy * step / substep)
      ctx.fillRect(0, y - 0.5, width, 1)
    }
    const clamp = (v: number, min: number, max: number) => v < min ? min : max < v ? max : v
    ctx.fillStyle = 'black'
    ctx.globalAlpha = 1
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `bold ${fontSize}px sans-serif`
    ctx.lineWidth = 2
    ctx.strokeStyle = 'white'
    for (let ix = ixmin; ix < ixmax; ix++) {
      if (ix === 0 || ix % substep !== 0) continue
      const x = xconv(ix * step / substep)
      const label = (ix * step / substep).toFixed(10).replace(/\.?0+$/, '')
      const y = clamp(yzero + fontSize, fontSize / 2, height - fontSize / 2)
      ctx.strokeText(label, x, y)
      ctx.fillText(label, x, y)
    }
    let labelOffsetX = xzero > width - fontSize * 10 ? -fontSize / 4 : fontSize / 4
    ctx.textAlign = labelOffsetX < 0 ? 'right' : 'left'
    for (let iy = iymin; iy < iymax; iy++) {
      if (iy === 0 || iy % substep !== 0) continue
      const label = (iy * step / substep).toFixed(10).replace(/\.?0+$/, '')
      const x = clamp(xzero + labelOffsetX, 0, width)
      const y = yconv(iy * step / substep)
      ctx.strokeText(label, x, y)
      ctx.fillText(label, x, y)
    }
    ctx.restore()
  }
}
