import { VRange } from './range'
import { ast, astToFunction, astToRangeFunction, astToRangeInlineFunction } from './ast'



const circleAST = ast.add(ast.add(ast.mult('x', 'x'), ast.mult('y', 'y')), -1)
const fAST = ast.mult(circleAST, ast.add(ast.add('x', ast.mult('y', 'x')), 1))

const finline = astToRangeInlineFunction(fAST)



const frangeBase = astToRangeFunction(fAST)
const frange: Fxy = (xmin, xmax, ymin, ymax) => frangeBase([xmin, xmax], [ymin, ymax])
const f = finline
const fvalue = astToFunction(fAST)
;(window as any).frange = frange
;(window as any).frangeBase = frangeBase
;(window as any).finline = finline
;(window as any).fvalue = fvalue

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

type Fxy = (xmin: number, xmax: number, ymin: number, ymax: number) => VRange

type RangeCallback = (x: VRange, y: VRange, step: number, sign: 1 | -1 | 0) => void

class Solver {
  queue: [number, number, number, number, number, number, number][] = [] // xmin, xmax, ymin, ymax, w, h, step
  stepPerRun = 4
  completed = false
  aborted = false
  cnt = 0
  constructor(public f: Fxy, x: VRange, y: VRange, w: number, h: number, public report: RangeCallback) {
    this.queue.push([...x, ...y, Math.round(w), Math.round(h), 0])
  }
  runStep() {
    if (this.queue.length === 0) {
      this.completed = true
      return
    }
    this.cnt += 1
    const [xmin, xmax, ymin, ymax, xres, yres, step] = this.queue.shift()!
    const [min, max] = f(xmin, xmax, ymin, ymax)
    if (max < 0 || 0 < min) {
      this.report([xmin, xmax], [ymin, ymax], step, max < 0 ? -1 : 1)
      return
    }
    this.report([xmin, xmax], [ymin, ymax], step, 0)
    if (xres === 1 && yres === 1) return
    const xr = Math.round(xres / 2)
    const xmid = xmin + (xmax - xmin) * xr / xres
    const yr = Math.round(yres / 2)
    const ymid = ymin + (ymax - ymin) * yr / yres
    if (xres <= 1) {
      this.queue.push(
        [xmin, xmax, ymin, ymid, xres, yr, step + 1],
        [xmin, xmax, ymid, ymax, xres, yres - yr, step + 1]
      )
    } else if (yres <= 1) {
      this.queue.push(
        [xmin, xmid, ymin, ymax, xr, yres, step + 1],
        [xmid, xmax, ymin, ymax, xres - xr, yres, step + 1]
      )
    } else {
      this.queue.push(
        [xmin, xmid, ymin, ymid, xr, yr, step + 1],
        [xmid, xmax, ymin, ymid, xres - xr, yr, step + 1],
        [xmin, xmid, ymid, ymax, xr, yres - yr, step + 1],
        [xmid, xmax, ymid, ymax, xres - xr, yres - yr, step + 1]
      )
    }
  }
  async run() {
    let timeSum = 0
    while (!this.completed && !this.aborted) {
      const t0 = performance.now()
      for (let i = this.stepPerRun; i > 0; i--) this.runStep()
      const time = performance.now() - t0
      const step = 16 / time
      this.stepPerRun = Math.max(4, this.stepPerRun / 4, Math.min(step, this.stepPerRun * 4))
      await sleep(16)
      timeSum += time
      console.log(this.queue.length, this.cnt, step)
    }
    console.log('sum: ' + timeSum)
  }
  abort() {
    this.aborted = true
  }
}

onload = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  document.body.appendChild(canvas)
  ctx.translate(256, 256)
  ctx.scale(512 / 2.4, -512 / 2.4)
  ctx.lineWidth = 4 / 512
  ctx.strokeStyle = 'black'
  const coords: [number, number][] = []
  ;(window as any).coords = coords
  ;(window as any).ctx = ctx
  const solver = new Solver(f, [-1.2, 1.2], [-1.2, 1.2], 128, 128, ([xmin, xmax], [ymin, ymax], step, sign) => {
    // if (step != 6) return
    if (sign === 0) {
      const [v00] = f(xmin, xmin, ymin, ymin)
      const [v01] = f(xmin, xmin, ymax, ymax)
      const [v10] = f(xmax, xmax, ymin, ymin)
      const [v11] = f(xmax, xmax, ymax, ymax)
      const coords: [number, number][] = []
      if (v00 * v01 <= 0) coords.push([xmin, ymin - (ymax - ymin) * v00 / (v01 - v00)])
      if (v10 * v11 <= 0) coords.push([xmax, ymin - (ymax - ymin) * v10 / (v11 - v10)])
      if (v00 * v10 <= 0) coords.push([xmin - (xmax - xmin) * v00 / (v10 - v00), ymin])
      if (v01 * v11 <= 0) coords.push([xmin - (xmax - xmin) * v01 / (v11 - v01), ymax])
      if (coords.length === 0) return
      ctx.save()
      ctx.beginPath()
      ctx.rect(xmin, ymin, xmax - xmin, ymax - ymin)
      ctx.clip()
      ctx.fillStyle = 'white'
      ctx.fill()
      ctx.beginPath()
      if (coords.length === 2) {
        ctx.moveTo(...coords[0])
        ctx.lineTo(...coords[1])
      } else if (coords.length === 3) {
        const cx = (coords[0][0]+coords[1][0]+coords[2][0]) / 3
        const cy = (coords[0][1]+coords[1][1]+coords[2][1]) / 3
        coords.forEach(([px, py]) => {
          ctx.moveTo(cx, cy)
          ctx.lineTo(px, py)
        })
      } else if (coords.length === 4) {
        ctx.moveTo(...coords[0])
        ctx.lineTo(...coords[2])
        ctx.moveTo(...coords[1])
        ctx.lineTo(...coords[3])
      }
      ctx.stroke()
      ctx.restore()
    } else {
      ctx.fillStyle = sign < 0 ? '#eff' : '#fef'
      ctx.fillRect(xmin, ymin, xmax - xmin, ymax - ymin)
    }
  })
  solver.run()
}

;(window as any).f = f


