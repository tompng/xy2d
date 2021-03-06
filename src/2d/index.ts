import { extractVariables } from '../core/ast'
import { parse } from '../core/parser'
import { View } from './view'
import { MathfieldElement } from 'mathlive'
import { convertLatex } from '../core/latex'
import { ValueFunction2D, RangeFunction2D } from '../core/util'
import { parseMultiple, presets2D, astToRangeFunctionCode, astToValueFunctionCode } from '../core/multiline'

const autoOperatorNames = (() => {
  const names = ['sqrt', 'exp', 'log', 'hypot', 'abs', 'min', 'max', 'pow', 'sgn', 'sign', 'signum', 'round', 'floor', 'ceil']
  for (const base of ['sin', 'cos', 'tan']) {
    for (const prefix of ['a', 'arc', '']) {
      names.push(prefix + base, prefix + base + 'h')
    }
  }
  return names.join(' ')
})()

const initialValue = '\\max(\\left|x+2y\\right|,\\left|y-2x\\right|)<1+\\frac{\\sin(4\\theta)}{3}'

function initializeInput() {
  const wrapper = document.querySelector<HTMLDivElement>('#mathinput')!
  const mfe = new MathfieldElement()
  mfe.plonkSound = null
  mfe.keypressSound = null
  mfe.value = initialValue
  mfe.virtualKeyboardMode = 'auto'
  const errorDOM = document.querySelector<HTMLDivElement>('#error')!
  const update = () => {
    try {
      errorDOM.textContent = ''
      calc(convertLatex(mfe.value))
    } catch (e) {
      errorDOM.textContent = String(e)
    }
  }
  mfe.onchange = update
  update()
  wrapper.appendChild(mfe)
}


;(window as any).parse = parse

let _view: View | undefined
function calc(exp: string) {
  const argNames = ['x', 'y']
  const [parsed] = parseMultiple([exp], argNames, presets2D)
  if (parsed.type !== 'eq') throw 'not an equation'
  if (!parsed.ast) throw String(parsed.error)
  let { ast, mode } = parsed

  const variables = extractVariables(ast)
  if (!mode && variables.length <= 1) {
    if (variables.length === 0 || variables[0] === 'x') {
      ast = { op: '-', args: ['y', ast], uniqId: -1, uniqKey: '' }
      mode = '='
    } else if (variables[0] === 'y') {
      ast = { op: '-', args: ['x', ast], uniqId: -1, uniqKey: '' }
      mode = '='
    }
  }

  const compareOption = {
    pos: mode !== '=',
    neg: mode === null
  }
  const frange: RangeFunction2D = eval(astToRangeFunctionCode(ast, argNames, compareOption))
  const fvalue: ValueFunction2D = eval(astToValueFunctionCode(ast, argNames))

  const colors =
    mode === '=' ? { zero: '#aaa', line: 'black' } :
    mode === '>' ? { pos: '#aaf', line: '#444' } :
    mode === '>=' ? { zero: '#aaa', pos: '#aaf', line: 'black' } :
    { zero: '#aaa', neg: '#aaf', pos: '#faa', line: 'black' }
  if (_view) {
    _view.fvalue = fvalue
    _view.frange = frange
    _view.colors = colors
    _view.pixelRatio = devicePixelRatio
    _view.reset()
    _view.update(200)
    _view.renderAxis()
    return
  }
  const view = _view = new View(fvalue, frange, colors, devicePixelRatio)
  const setSize = () => {
    view.width = window.innerWidth - 40
    view.height = window.innerHeight - 140
  }
  setSize()
  window.onresize = () => {
    if (devicePixelRatio !== view.pixelRatio) {
      view.pixelRatio = devicePixelRatio
      view.reset()
    }
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
  initializeInput()
  const debugRenderEl = document.querySelector<HTMLInputElement>('#debugcheck')!
  debugRenderEl.onchange = () => {
    (window as any).debugRender = debugRenderEl.checked
  }
}