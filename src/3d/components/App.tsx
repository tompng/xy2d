import React, { useState, useRef, useReducer, useEffect, useCallback } from 'react'
import { useFormulas, View } from './View'
import { FormulaType, newFormula, MathList } from './Form'

function useWindowSize() {
  const [windowSize, setWindowSize] = useState({ width: innerWidth, height: innerHeight })
  const ref = useRef(windowSize)
  useEffect(() => {
    const onResize = () => {
      if (innerWidth === ref.current.width && innerHeight === ref.current.height) return
      ref.current.width = innerWidth
      ref.current.height = innerHeight
      setWindowSize({ ...ref.current })
    }
    const timer = setInterval(onResize, 1000) // avoid resize & windowsize bug on iOS
    window.addEventListener('resize', onResize)
    return () => {
      clearInterval(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return windowSize
}

function formulaAreaInitialHeight() {
  return Math.min(innerHeight - 100, Math.max(innerHeight / 3, 300))
}
export const App: React.VFC = () => {
  const [height, setHeight] = useState(formulaAreaInitialHeight)
  const windowSize = useWindowSize()
  useEffect(() => setHeight(h => Math.min(h, windowSize.height - 100)), [windowSize])
  const onDragMove = useCallback((y: number, complete: boolean) => {
    let h = -y
    if (h < 0 || (complete && h < 30)) h = 0
    setHeight(Math.min(h, innerHeight - 100))
  }, [])
  const [radius, setRadius] = useState(1)
  const [formulas, setFormulas] = useState<FormulaType[]>([newFormula('sin4xcos4y+sin4ycos4z+sin4zcos4x=r^2/3'), newFormula()])
  const [statusMap, watcher] = useFormulas(formulas, radius)
  return (
    <>
      <div style={{ position: 'fixed', left: 0, top: 0 }}>
        <View watcher={watcher} onZoom={setRadius} width={windowSize.width} height={windowSize.height - height} />
      </div>
      <div style={{ position: 'fixed', left: 0, bottom: 0, width: '100%', height, background: 'white', overflow: 'auto' }}>
        <MathList formulas={formulas} formulaStatus={statusMap} setFormulas={setFormulas} />
      </div>
      <AreaDragHandler y={-height} onDragMove={onDragMove}>
        <div style={{ position: 'fixed', cursor: 'ns-resize', left: 0, bottom: height - 8, width: '100%', height: 32 }}></div>
      </AreaDragHandler>
      <AreaDragHandler y={-height} onDragMove={onDragMove} onClick={() => setHeight(h => h === 0 ? formulaAreaInitialHeight() : 0) }>
        <div style={{
          position: 'fixed', cursor: 'pointer', left: 8, bottom: height + 8, width: 40, height: 40,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
        }}>
        </div>
      </AreaDragHandler>
    </>
  )
}

type AreaDragHanderParams = {
  y: number
  onDragMove: (y: number, complete: boolean) => void
  onClick?: () => void
}
const AreaDragHandler: React.FC<AreaDragHanderParams> = ({ y, onDragMove, onClick, children }) => {
  const callbackRef = useRef({ onDragMove, onClick })
  const pointerRef = useRef({ id: -1, y: 0, maxMove: 0, pageY: 0 })
  useEffect(() => { callbackRef.current = { onClick, onDragMove } }, [onClick, onDragMove])
  useEffect(() => {
    const handle = (e: PointerEvent, complete: boolean) => {
      e.preventDefault()
      const p = pointerRef.current
      p.maxMove = Math.max(p.maxMove, Math.abs(e.pageY - p.pageY))
      callbackRef.current.onDragMove(p.y + e.pageY - p.pageY, complete)
    }
    const move = (e: PointerEvent) => {
      if (pointerRef.current.id !== e.pointerId) return
      handle(e, false)
    }
    const up = (e: PointerEvent) => {
      if (pointerRef.current.id !== e.pointerId) return
      pointerRef.current.id = -1
      handle(e, true)
      if (pointerRef.current.maxMove < 10) callbackRef.current.onClick?.()
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
    }
  }, [])
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    pointerRef.current = { id: e.pointerId, y, maxMove: 0, pageY: e.pageY }
  }, [y])
  return <div onPointerDown={onPointerDown} style={{ touchAction: 'none' }}>{children}</div>
}
