import { ast, astToFunction, astToRangeFunction } from './ast'
import { Solver as SimpleSolver } from './solver'

const circleAST = ast.add(ast.add(ast.mult('x', 'x'), ast.mult('y', 'y')), -1)
const fAST = ast.mult(circleAST, ast.add(ast.add('x', ast.mult('y', 'x')), 1))
const frange = astToRangeFunction(fAST)
const fvalue = astToFunction(fAST)
;(window as any).frange = frange
;(window as any).fvalue = fvalue

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

onload = () => {
  const canvas = document.createElement('canvas')
  const size = 512
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  document.body.appendChild(canvas)
  ctx.lineWidth = 4 / 512
  ctx.strokeStyle = 'black'
  const coords: [number, number][] = []
  ;(window as any).coords = coords
  ;(window as any).ctx = ctx
  const solver = new SimpleSolver(frange, fvalue, { x: -1.2, y: -1.2, size: 2.4 }, 512, () => {})
  const t = performance.now()
  solver.calculateRange(1)
  console.log(performance.now() - t)
  const ar = solver.areaResults
  solver.calculate()
  ;(window as any).ar = ar
  for (let i = 0; i < ar.length;) {
    const x = ar[i++]
    const y = ar[i++]
    const s = ar[i++]
    const sgn = ar[i++]
    ctx.fillStyle = sgn < 0 ? '#eff' : '#fef'
    ctx.fillRect(size*x, size*y, size*s, size*s)
  }
  const pr = solver.pointResults
  ctx.fillStyle = 'black'
  for (let i = 0; i < pr.length;) {
    const x = pr[i++]
    const y = pr[i++]
    ctx.beginPath()
    ctx.arc(x, y, 1, 0, 2 * Math.PI)
    ctx.fill()
  }
}
