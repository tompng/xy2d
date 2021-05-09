import { astToFunction, astToRangeFunction } from './ast'
import { parse } from './parser'
import { Panel } from './view'
;(window as any).parse = parse

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
let canvas = document.createElement('canvas')

let panel: Panel | undefined
function calc(exp: string) {
  const [ast, mode] = parse(exp)
  const compareOption = {
    pos: mode !== '=',
    neg: mode === null
  }
  const frange = astToRangeFunction(ast, compareOption)
  const fvalue = astToFunction(ast)
  const resolution = 512
  const colors =
    mode === '=' ? { zero: '#aaa', line: 'black' } :
    mode === '>' ? { pos: '#aaf', line: '#444' } :
    mode === '>=' ? { zero: '#aaa', pos: '#aaf', line: 'black' } :
    { zero: '#aaa', neg: '#aaf', pos: '#faa', line: 'black' }
  const range = { x: -1.2, y: -1.2, size: 2.4 }
  if (!panel) {
    const newPanel = new Panel(fvalue, frange, range, resolution, colors)
    document.body.appendChild(newPanel.backgroundCanvas)
    document.body.appendChild(newPanel.lineCanvas)
    ;[newPanel.backgroundCanvas, newPanel.lineCanvas].forEach((canvas, i) => {
      canvas.style.position = 'absolute'
      canvas.style.left = `${40 - newPanel.offset * i}px`
      canvas.style.top = `${40 - newPanel.offset * i}px`
    })
    panel = newPanel
  } else {
    panel.reset(fvalue, frange, range, resolution, colors)
  }
  panel.render()
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
