import { astToFunction, astToRangeFunction } from './ast'
import { parse } from './parser'
import { View } from './view'
;(window as any).parse = parse

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}

let prevView: View | undefined
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
  if (prevView) {
    prevView.fvalue = fvalue
    prevView.frange = frange
    prevView.colors = colors
    prevView.reset()
    prevView.update(200)
    prevView.renderAxis()
    return
  }
  const view = prevView = new View(fvalue, frange, colors)
  const setSize = () => {
    view.width = window.innerWidth - 40
    view.height = window.innerHeight - 100
  }
  setSize()
  window.onresize = () => {
    setSize()
    if (!view.locked) view.update()
    else view.updatePosition()
    view.renderAxis()
  }
  document.body.appendChild(view.dom)
  view.update(200)
  view.renderAxis()
  view.dom.style.overflow = 'hidden'
  let unlockTimer: number | null = null
  gesture(view.dom, ({ dx, dy, zoom }) => {
    const size = Math.min(view.width, view.height)
    view.center.x -= view.viewSize * dx / size
    view.center.y += view.viewSize * dy / size
    const tx = view.center.x + (zoom.x - 0.5) * view.width / size * view.viewSize
    const ty = view.center.y + (0.5 - zoom.y) * view.height / size * view.viewSize
    const dtx = tx - view.center.x
    const dty = ty - view.center.y
    view.center.x += dtx
    view.center.y += dty
    view.sizePerPixel /= zoom.v
    view.center.x -= dtx / zoom.v
    view.center.y -= dty / zoom.v
    if (zoom.v !== 1) {
      view.updatePosition()
      view.renderAxis()
      if (unlockTimer) {
        clearTimeout(unlockTimer)
      } else {
        view.lock()
      }
      unlockTimer = setTimeout(() => {
        unlockTimer = null
        view.locked = false
        view.clear()
        view.update(200)
        view.renderAxis()
      }, 200) as unknown as number
    } else {
      view.update()
      view.renderAxis()
    }
  })
  ;(window as any).view = view
}

function gesture(dom: HTMLElement, cb: (e: { dx: number; dy: number; zoom: { x: number; y: number; v: number } }) => void) {
  dom.addEventListener('wheel', e => {
    e.preventDefault()
    if (e.ctrlKey) {
      const v = Math.pow(2, -(e.deltaY + e.deltaX) / 128)
      const x = (e.pageX - dom.offsetLeft) / dom.offsetWidth
      const y = (e.pageY - dom.offsetTop) / dom.offsetHeight
      cb({ dx: 0, dy: 0, zoom: { x, y, v }})
    } else {
      cb({ dx: -e.deltaX, dy: -e.deltaY, zoom: { x: 0, y: 0, v: 1 } })
    }
  })
  const pointers = new Map<number, { x: number; y: number }>()
  dom.addEventListener('touchstart', e => e.preventDefault())
  function calcCenter() {
    const xsum = [...pointers.values()].map(p => p.x).reduce((a, b) => a + b, 0)
    const ysum = [...pointers.values()].map(p => p.y).reduce((a, b) => a + b, 0)
    const size = pointers.size || 1
    return { x: xsum / size, y: ysum / size }
  }
  dom.addEventListener('pointerdown', e => {
    e.preventDefault()
    if (pointers.size == 2) return
    pointers.set(e.pointerId, { x: e.screenX, y: e.screenY })
  })
  document.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId)
    if (!p) return
    e.preventDefault()
    const x = e.screenX
    const y = e.screenY
    const centerWas = calcCenter()
    const lenWas = Math.hypot(p.x - centerWas.x, p.y - centerWas.y)
    const dx = (x - p.x) / pointers.size
    const dy = (y - p.y) / pointers.size
    p.x = x
    p.y = y
    const center = calcCenter()
    const len = Math.hypot(p.x - center.x, p.y - center.y)
    const zoom = {
      x: (center.x - dom.offsetLeft) / dom.offsetWidth,
      y: (center.y - dom.offsetTop) / dom.offsetHeight,
      v: (len + 2) / (lenWas + 2)
    }
    cb({ dx, dy, zoom })
  })
  document.addEventListener('pointerup', e => {
    pointers.delete(e.pointerId)
  })
  document.addEventListener('pointercancel', e => {
    pointers.delete(e.pointerId)
  })
}

onload = () => {
  const input = document.querySelector('input')!
  document.querySelector('form')!.onsubmit = e => {
    e.preventDefault()
    calc(input.value)
  }
  document.querySelector('input')!.onblur = () => calc(input.value)
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
