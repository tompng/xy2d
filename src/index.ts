import { astToFunction, astToRangeFunction, extractVariables } from './ast'
import { parse } from './parser'
import { View } from './view'
import css from 'mathquill/build/mathquill.css'
import { convertLatex } from './latex'

const style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)

;(window as any).jQuery = require('jquery')
require('mathquill/build/mathquill.js')
const MQ = (window as any).MathQuill.getInterface(2)
;(window as any).MQ = MQ
const autoOperatorNames = (() => {
  const names = ['sqrt', 'exp', 'log', 'hypot', 'abs', 'min', 'max', 'pow']
  for (const base of ['sin', 'cos', 'tan']) {
    for (const prefix of ['a', 'arc', '']) {
      names.push(prefix + base, prefix + base + 'h')
    }
  }
  return names.join(' ')
})()
setTimeout(() => {
  const el = document.querySelector<HTMLDivElement>('#mqinput')!
  el.style.color = 'black'
  const mathField = MQ.MathField(el, {
    handlers: {
      edit: () => {
        try {
          calc(convertLatex(mathField.latex()))
        } catch (e) {
          console.error(e)
        }
      }
    },
    autoCommands: 'pi theta sqrt',
    autoOperatorNames,
    restrictMismatchedBrackets: true
  })
  ;(window as any).mathField = mathField
  calc(convertLatex(mathField.latex()))
})

;(window as any).parse = parse

let prevView: View | undefined
function calc(exp: string) {
  let [ast, mode] = parse(exp)
  const variables = extractVariables(ast)
  if (!mode && variables.length <= 1) {
    if (variables.length === 0 || variables[0] === 'x') {
      ast = { op: '-', args: ['y', ast] }
      mode = '='
    } else if (variables[0] === 'y') {
      ast = { op: '-', args: ['x', ast] }
      mode = '='
    } else if (variables[0] === 'theta') {
      ast = { op: '-', args: ['r', ast] }
      mode = '='
    }
  }

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
    view.height = window.innerHeight - 140
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
