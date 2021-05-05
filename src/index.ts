import { ast, astToFunction, astToRangeFunction } from './ast'
import { Solver as SimpleSolver } from './solver'

const circleAST = ast.add(ast.add(ast.mult('x', 'x'), ast.mult('y', 'y')), -1)
const gAST = ast.mult(circleAST, ast.add(ast.add('x', ast.mult('y', 'x')), 1))
const divxyAST = ast.div(1, ast.add('x', 'y'))
const fAST = ast.mult(gAST, divxyAST)
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
  const solver = new SimpleSolver(frange, fvalue, { x: -1.2, y: -1.2, size: 2.4 }, size, () => {})
  const t = performance.now()
  solver.calculate()
  console.log(performance.now() - t)
  const ar = solver.areaResults
  const pr = solver.pointResults
  console.log(performance.now() - t)
  ;(window as any).ar = ar
  for (let i = 0; i < ar.length;) {
    const x = ar[i++]
    const y = ar[i++]
    const s = ar[i++]
    const result = ar[i++]
    ctx.fillStyle = ['#aaa', '#aff', '#faf'][result]
    ctx.globalAlpha = 0.5+0.5*Math.random()
    ctx.fillRect(size*x, size*y, size*s, size*s)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = 'black'
  for (let i = 0; i < pr.length; i += 4) {
    const x = pr[i + 2]
    const y = pr[i + 3]
    ctx.beginPath()
    ctx.globalAlpha = 0.8
    ctx.arc(x, y, 2, 0, 2 * Math.PI)
    ctx.fill()
  }
  // const lines = pointsToLines(pr, size)
  // console.log(lines.length)
  // ctx.lineWidth = 4
  // ctx.strokeStyle = 'red'
  // lines.forEach((line) => {
  //   ctx.beginPath()
  //   ctx.moveTo(line[0], line[1])
  //   for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1])
  //   ctx.stroke()
  // })
}

// points: [xi, yi, x, y, ...]
function pointsToLines(points: number[], resolution: number) {
  const xmap = new Map<number, number>()
  const ymap = new Map<number, number>()
  const visited = new Set<number>()
  const keys: number[] = []
  const N = 2 * resolution
  for (let i = 0; i < points.length;) {
    const xi = points[i++]
    const yi = points[i++]
    const x = points[i++]
    const y = points[i++]
    const key = yi * N + xi
    keys.push(key)
    xmap.set(key, x)
    ymap.set(key, y)
  }
  const lines: number[][] = []
  keys.forEach(key0 => {
    const line = [xmap.get(key0)!, ymap.get(key0)!]
    for (let i = 0; i < 2; i++) {
      let key = key0
      let xi = key % N
      let yi = (key - xi) / N
      while (true) {
        if (!visited.has(key * 2) && xmap.has(key - N)) {
          visited.add(key * 2)
          key -= N
          yi --
        } else if (!visited.has(key * 2 + 1) && xmap.has(key - 1)) {
          visited.add(key * 2 + 1)
          key --
          xi --
        } else if (!visited.has((key + N) * 2) && xmap.has(key + N)) {
          visited.add((key + N) * 2)
          key += N
          yi ++
        } else if (!visited.has((key + 1) * 2 + 1) && xmap.has(key + 1)) {
          visited.add((key + 1) * 2 + 1)
          key ++
          xi ++
        } else {
          break
        }
        if (i === 0) {
          line.push(xmap.get(key)!, ymap.get(key)!)
        } else {
          line.unshift(xmap.get(key)!, ymap.get(key)!)
        }
      }
    }
    if (line.length > 2) lines.push(line)
  })
  return lines
}