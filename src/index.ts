import { astToFunction, astToRangeFunction } from './ast'
import { parse } from './parser'
import { Panel, View } from './view'
;(window as any).parse = parse

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

let view: View | undefined
function calc(exp: string) {
  const [ast, mode] = parse(exp)
  const compareOption = {
    pos: mode !== '=',
    neg: mode === null
  }
  const frange = astToRangeFunction(ast, compareOption)
  const fvalue = astToFunction(ast)
  const colors =
    mode === '=' ? { zero: '#aaa', line: 'black' } :
    mode === '>' ? { pos: '#aaf', line: '#444' } :
    mode === '>=' ? { zero: '#aaa', pos: '#aaf', line: 'black' } :
    { zero: '#aaa', neg: '#aaf', pos: '#faa', line: 'black' }
  if (view) {
    view.release()
    view.dom.remove()
  }
  const newView = new View(fvalue, frange, colors)
  document.body.appendChild(newView.dom)
  newView.update(200)
  newView.dom.style.overflow = 'hidden'

  gesture(newView.dom, ({ dx, dy }) => {
    const size = Math.min(newView.width, newView.height)
    newView.center.x -= newView.viewSize * dx / size
    newView.center.y += newView.viewSize * dy / size
    newView.update()
  })
  view = newView
  ;(window as any).view = newView
}

function gesture(dom: HTMLElement, cb: (e: { dx: number; dy: number }) => void) {
  dom.addEventListener('wheel', e => {
    cb({ dx: -e.deltaX, dy: -e.deltaY })
    e.preventDefault()
  })
  const pointers = new Map<number, { x: number; y: number }>()
  dom.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.screenX, y: e.screenY })
  })
  document.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    const dx = e.screenX - p.x
    const dy = e.screenY - p.y
    p.x = e.screenX
    p.y = e.screenY
    cb({ dx, dy })
  })
  document.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId)
  })


}

onload = () => {
  const input = document.querySelector('input')!
  document.querySelector('form')!.onsubmit = e => {
    e.preventDefault()
    const value = input.value
    calc(value)
  }
  input.value = 'x^2+y^2>1'
  input.value = '((sqrt(1/16^2+x^2)-1/3)^2+((11y-1)/12)^2-1/7)*((sqrt(x^2)-4/13)^2+(y-1/8)^2-1/9)*((sqrt(x^2)-2/7)^2+(y-1/6)^2-(2/11)^2)*(exp(-y-1/2-(3+(1.2-cos14x)^(1/4))/(5+(5/3*x(1+y/3))^16)*1.2/(1+exp(4y)))+exp(-6+3x+3y)+exp(-6-3x+3y)-2/3)'
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
