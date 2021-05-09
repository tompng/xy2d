import { ast, astToFunction, astToRangeFunction } from './ast'
import { Solver as SimpleSolver } from './solver'
import { parse } from './parser'
;(window as any).parse = parse

// FIXME
// y-x^x NaN

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
let canvas = document.createElement('canvas')
function calc(exp: string) {
  const [ast, mode] = parse(exp)
  const compareOption = {
    pos: mode !== '=',
    neg: mode === null
  }
  const frange = astToRangeFunction(ast, compareOption)
  const fvalue = astToFunction(ast)
  const size = 512
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.lineWidth = 4 / 512
  ctx.strokeStyle = 'black'
  const solver = new SimpleSolver(frange, fvalue, { x: -1.2, y: -1.2, size: 2.4 }, size, () => {})
  const t = performance.now()
  solver.calculate()
  console.log(performance.now() - t)
  const ar = solver.areaResults
  const pr = solver.pointResults
  const apr = solver.areaPointResult
  const colors = {
    '=': ['#aaa', null, null, null],
    '>': [null, null, '#aaf', null],
    '>=': ['#aaa', null, '#aaf', null],
    'all': ['#aaa', '#aaf', '#faa', '#eee']
  }[mode ?? 'all']
  if (mode !== '=') {
    for (let i = 0; i < ar.length;) {
      const x = ar[i++]
      const y = ar[i++]
      const s = ar[i++]
      const result = ar[i++]
      const color = colors[result]
      if (color) {
        ctx.fillStyle = color
        ctx.globalAlpha = 0.5+0.5*Math.random()
        ctx.fillRect(size*x, size*y, size*s, size*s)
        ctx.globalAlpha = 1
      }
    }
  }
  for (let i = 0; i < apr.length;) {
    const x = apr[i++]
    const y = apr[i++]
    const c = apr[i++]
    const color = colors[c]
    let len = 1
    ;(window as any).apr = apr
    while(apr[i] === x + len && apr[i + 1] === y && apr[i + 2] === c) {
      i += 3
      len += 1
    }
    if (len != 1) console.log(len)
    if (color) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, len, 1)
    }
  }
  ctx.fillStyle = mode !== '>' ? 'black' : '#444'
  for (let i = 0; i < pr.length; i += 4) {
    const x = pr[i + 2]
    const y = pr[i + 3]
    ctx.beginPath()
    ctx.globalAlpha = 0.8
    ctx.arc(x, y, 1, 0, 2 * Math.PI)
    ctx.fill()
  }
}

onload = () => {
  document.body.appendChild(canvas)
  const input = document.querySelector('input')!
  document.querySelector('form')!.onsubmit = e => {
    e.preventDefault()
    const value = input.value
    calc(value)
  }
  input.value = 'x^2+y^2>1'
  calc(input.value)
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
