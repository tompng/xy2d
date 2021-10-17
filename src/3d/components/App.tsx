import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useFormulas, View, Camera } from './View'
import { MathList } from './Form'
import {
  Slider, Input,
  Dialog, DialogTitle, DialogContent,
  Fab, IconButton, Box, Grid, Typography
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
export const App: React.VFC = () => {
  const [height, setHeight] = useState(formulaAreaInitialHeight)
  const windowSize = useWindowSize()
  useEffect(() => setHeight(h => Math.min(h, windowSize.height - 100)), [windowSize])
  const onDragMove = useCallback((y: number, complete: boolean) => {
    let h = -y
    if (h < 0 || (complete && h < 30)) h = 0
    setHeight(Math.min(h, innerHeight - 100))
  }, [])
  const [camera, setCamera] = useState({ xyTheta: 0.5, zTheta: 0.1, distance: 1, radius: 1, rotate: 0 })
  const [formulas, setFormulas, watcher] = useFormulas([{ text: 'sin4xcos4y+sin4ycos4z+sin4zcos4x=r^2/3' }], camera.radius)
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false)
  const radiusString = camera.radius.toFixed(Math.max(-Math.round(Math.log10(camera.radius)) + 2, 0))
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
      <div style={{ position: 'fixed', right: 72, bottom: height + 8, color: 'gray', fontSize: '14px' }}>
        (-{radiusString} &lt; x, y, z &lt; {radiusString})
      </div>
      <Fab style={{ position: 'fixed', left: 8, bottom: height + 8 }} onClick={() => setHeight(height === 0 ? formulaAreaInitialHeight() : 0)}>
        {height === 0 ? <KeyboardArrowUpRounded /> : <KeyboardArrowDownRounded />}
      </Fab>
      <Fab style={{ position: 'fixed', right: 8, bottom: height + 8 }} onClick={() => setCameraDialogOpen(true)}>
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
        <NumberInput title="Rotate Speed" min={-8} max={8} step={1} value={camera.rotate} onChange={rotate => onChange({ ...camera, rotate })} />
        <NumberInput title="Rendering Radius" min={0.001} step={0.001} max={1000} value={camera.radius} onChange={radius => onChange({ ...camera, radius })} />
      </DialogContent>
    </Dialog>
  )
})

const NumberInput = React.memo<{ title: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }>(({
  title, value, step, min, max, onChange
}) => {
  const handleChange = (value: number) => {
    if (value < min) value = min
    if (value > max) value = max
    if (!isNaN(value)) onChange(value)
  }
  const [textValue, setTextValue] = useState(value.toFixed(4))
  useEffect(() => {
    if (parseFloat(textValue).toFixed(4) !== value.toFixed(4)) setTextValue(value.toFixed(4))
  }, [value])
  return (
    <Box sx={{ width: 250 }}>
      <Typography gutterBottom>
        {title}
      </Typography>
      <Input
        value={textValue}
        fullWidth
        onChange={e => { setTextValue(e.target.value); handleChange(parseFloat(e.target.value)) }}
        inputProps={{ step, min, max, type: 'number' }}
      />
    </Box>
  )
})

const CameraSlider = React.memo<{ title: string; value: number; min: number; step: number; scale?: number; max: number; onChange: (v: number) => void }>(({
  title, value, step, min, max, onChange, scale
}) => {
  const sliderScale = scale ?? 1
  const handleChange = (value: number) => {
    if (min <= value && value <= max) onChange(value)
  }
  const [textValue, setTextValue] = useState(value.toFixed(2))
  useEffect(() => {
    if (parseFloat(textValue).toFixed(2) !== value.toFixed(2)) setTextValue(value.toFixed(2))
  }, [value])
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
            onChange={e => { setTextValue(e.target.value); handleChange(parseFloat(e.target.value)) }}
            inputProps={{ step, min, max, type: 'number' }}
          />
        </Grid>
      </Grid>
    </Box>
  )
})
