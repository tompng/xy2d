import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useFormulas, View, Camera, FormulaInputType } from './View'
import { MathList, randomColor } from './Form'
import {
  Slider, Input,
  Dialog, DialogTitle, DialogContent,
  Fab, IconButton, Button, Box, Grid, Typography
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import CameraSwitch from '@mui/icons-material/CameraSwitch'
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded'

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

function getInitialFormula() {
  let radius = 1
  let formulas: FormulaInputType[] = [{ text: 'r^3=1+4xyz', renderingOption: { color: randomColor() } }]
  try {
    const queries = location.search.substr(location.search[0] === '?' ? 1 : 0).split('&')
    for (const q of queries) {
      const [key, value] = q.split('=', 2)
      if (key === 'r') {
        const r = parseFloat(value)
        if (!isNaN(r)) radius = Math.max(0.001, Math.min(r, 1000))
      } else if (key === 'f') {
        const res = JSON.parse(decodeURIComponent(value)) as unknown
        if (Array.isArray(res)) {
          formulas = res.map(f => {
            const text = ('text' in f && typeof f.text === 'string') ? f.text : ''
            const color = ('color' in f && typeof f.color === 'string') ? f.color : undefined
            return { text, renderingOption: { color } }
          })
        }
      }
    }
  } catch(e) {
    console.error(e)
  }
  return [formulas, radius] as const
}
const [initialFormulas, initialRadius] = getInitialFormula()

const debounce = {
  time: null as number | null,
  timer: null as number | null,
  path: '',
  interval: 1000
}
function replacePath(path: string) {
  debounce.path = path
  const time = performance.now()
  if (debounce.timer) return
  if (debounce.time == null || time - debounce.time > debounce.interval) {
    debounce.time = time
    history.replaceState({}, '', path)
    return
  }
  debounce.timer = setTimeout(() => {
    debounce.timer = null
    debounce.time = performance.now()
    history.replaceState({}, '', debounce.path)
  }, debounce.interval) as unknown as number
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
  const [camera, setCamera] = useState({ xyTheta: 0.5, zTheta: 0.1, distance: 1, radius: initialRadius, rotate: 0 })
  const [formulas, setFormulas, watcher] = useFormulas(initialFormulas, camera.radius)
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false)
  const radiusString = camera.radius.toFixed(Math.max(-Math.round(Math.log10(camera.radius)) + 2, 0))
  useEffect(() => {
    const formatted = formulas.map(f => ({ text: f.text, color: f.renderingOption.color }))
    while (formatted.length > 0 && formatted[formatted.length - 1].text === '') formatted.pop()
    const path = location.pathname + `?r=${camera.radius}&f=${encodeURIComponent(JSON.stringify(formatted))}`
    replacePath(path)
  }, [formulas, camera.radius])
  return (
    <>
      <div style={{ position: 'fixed', left: 0, top: 0 }}>
        <View watcher={watcher} camera={camera} onCameraChange={setCamera} width={windowSize.width} height={windowSize.height - height} />
      </div>
      <div style={{ position: 'fixed', left: 0, bottom: 0, width: '100%', height, background: 'white', overflow: 'auto' }}>
        <MathList formulas={formulas} setFormulas={setFormulas} />
      </div>
      <AreaDragHandler y={-height} onDragMove={onDragMove}>
        <div style={{ position: 'fixed', cursor: 'ns-resize', left: 0, bottom: height - 8, width: '100%', height: 32 }}></div>
      </AreaDragHandler>
      <div style={{ position: 'fixed', right: 56, bottom: height + 8, color: 'gray', fontSize: '14px' }}>
        (-{radiusString} &lt; x, y, z &lt; {radiusString})
      </div>
      <Fab size="small" style={{ position: 'fixed', left: 8, bottom: height + 8 }} onClick={() => setHeight(height === 0 ? formulaAreaInitialHeight() : 0)}>
        {height === 0 ? <KeyboardArrowUpRounded /> : <KeyboardArrowDownRounded />}
      </Fab>
      <Fab size="small" style={{ position: 'fixed', right: 8, bottom: height + 8 }} onClick={() => setCameraDialogOpen(true)}>
        <CameraSwitch />
      </Fab>
      <CameraDialog open={cameraDialogOpen} onClose={() => setCameraDialogOpen(false)} camera={camera} onChange={setCamera} />
    </>
  )
}

type AreaDragHanderParams = {
  y: number
  onDragMove: (y: number, complete: boolean) => void
  onClick?: () => void
  children?: React.ReactNode
}

const AreaDragHandler = React.memo<AreaDragHanderParams>(({ y, onDragMove, onClick, children }) => {
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
})

type CameraDialogProps = { open: boolean; onClose: () => void; camera: Camera; onChange: (camera: Camera) => void }
const CameraDialog = React.memo<CameraDialogProps>(({ open, onClose, camera, onChange }) => {
  const yaw = (camera.xyTheta * 180 / Math.PI % 360 + 360) % 360
  const pitch = camera.zTheta * 180 / Math.PI
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        Camera Settings
        <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <CameraSlider title="Distance" min={0.5} scale={10} max={1.5} step={0.1} value={camera.distance} onChange={distance => onChange({ ...camera, distance })} />
        <CameraSlider title="Yaw" min={0} max={360} step={1} value={yaw} onChange={v => onChange({ ...camera, xyTheta: v * Math.PI / 180, rotate: 0 })} />
        <CameraSlider title="Pitch" min={-90} max={90} step={1} value={pitch} onChange={v => onChange({ ...camera, zTheta: v * Math.PI / 180, rotate: 0 })} />
        <RotationInput min={-8} max={8} step={1} value={camera.rotate} onChange={rotate => onChange({ ...camera, rotate })} />
        <NumberInput title="Calculation Range" min={0.001} step={0.001} max={1000} value={camera.radius} onChange={radius => onChange({ ...camera, radius })} />
      </DialogContent>
    </Dialog>
  )
})

function useNumberFieldHandler(value: number, onChange: (value: number) => void, min: number, max: number) {
  const [textValue, setTextValue] = useState(String(value))
  const handleChange = useCallback((input: string | number, changeText?: boolean) => {
    let newValue = typeof input === 'string' ? parseFloat(input) : input
    if (isNaN(newValue)) newValue = value
    if (newValue < min) newValue = min
    if (max < newValue) newValue = max
    onChange(newValue)
    if (changeText) {
      setTextValue(String(newValue))
    } else {
      setTextValue(String(input))
    }
  }, [min, max, onChange])
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!locked) setTextValue(String(value))
  }, [locked, value])
  return [textValue, handleChange, setLocked] as const
}

const CameraSlider = React.memo<{ title: string; value: number; min: number; step: number; scale?: number; max: number; onChange: (v: number) => void }>(({
  title, value, step, min, max, onChange, scale
}) => {
  const sliderScale = scale ?? 1
  const [textValue, handleChange, setLocked] = useNumberFieldHandler(value, onChange, min, max)
  return (
    <Box sx={{ width: 250 }}>
      <Typography gutterBottom>
        {title}
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={8}>
          <Slider
            value={value * sliderScale}
            min={min * sliderScale} max={max * sliderScale}
            onChange={(_e, v) => handleChange((v as number) / sliderScale)}
          />
        </Grid>
        <Grid item xs={4}>
          <Input
            value={textValue}
            fullWidth
            onChange={e => { handleChange(e.target.value) }}
            onFocus={() => setLocked(true)}
            onBlur={e => { handleChange(e.target.value, true); setLocked(false) }}
            inputProps={{ step, min, max, type: 'number' }}
          />
        </Grid>
      </Grid>
    </Box>
  )
})

const NumberInput = React.memo<{ title: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }>(({
  title, value, step, min, max, onChange
}) => {
  const [textValue, handleChange, setLocked] = useNumberFieldHandler(value, onChange, min, max)
  return (
    <Box sx={{ width: 250 }}>
      <Typography gutterBottom>
        {title}
      </Typography>
      <Input
        value={textValue}
        fullWidth
        onChange={e => handleChange(e.target.value) }
        onFocus={() => setLocked(true)}
        onBlur={e => { handleChange(e.target.value, true); setLocked(false) }}
        inputProps={{ step, min, max, type: 'number' }}
      />
    </Box>
  )
})

const RotationInput = React.memo<{ value: number; min: number; max: number; step: number; onChange: (v: number) => void }>(({
  value, step, min, max, onChange
}) => {
  const [textValue, handleChange, setLocked] = useNumberFieldHandler(value, onChange, min, max)
  return (
    <Box sx={{ width: 250 }}>
      <Typography gutterBottom>
        Rotate Speed
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={4}>
          <Button disabled={value === 0} onClick={() => handleChange(0)}>stop</Button>
        </Grid>
        <Grid item xs={8}>
          <Input
            value={textValue}
            fullWidth
            onChange={e => handleChange(e.target.value) }
            onFocus={() => setLocked(true)}
            onBlur={e => { handleChange(e.target.value, true); setLocked(false) }}
            inputProps={{ step, min, max, type: 'number' }}
          />
        </Grid>
      </Grid>
    </Box>
  )
})
