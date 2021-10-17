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

const CameraDialog: React.VFC<{ open: boolean; onClose: () => void; camera: Camera; onChange: (camera: Camera) => void }> = ({ open, onClose, camera, onChange }) => {
  const yaw = (camera.xyTheta * 180 / Math.PI % 360 + 360) % 360
  const pitch = camera.zTheta * 180 / Math.PI
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        Camera Settings
        <IconButton aria-label="close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        <CameraSlider title="Distance" min={0.5} scale={10} max={1.5} step={0.1} value={camera.distance} onChange={distance => onChange({ ...camera, distance })} />
        <CameraSlider title="Yaw" min={0} max={360} step={1} value={yaw} onChange={v => onChange({ ...camera, xyTheta: v * Math.PI / 180, rotate: 0 })} />
        <CameraSlider title="Pitch" min={-90} max={90} step={1} value={pitch} onChange={v => onChange({ ...camera, zTheta: v * Math.PI / 180 })} />
        <CameraSlider title="Rotate Speed" min={-4} max={4} step={1} value={camera.rotate} onChange={rotate => onChange({ ...camera, rotate })} />
      </DialogContent>
    </Dialog>
  )
}
const CameraSlider: React.VFC<{ title: string; value: number; min: number; step: number; scale?: number; max: number; mod?: boolean; onChange: (v: number) => void }> = ({
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
    <Box>
      <Typography id="input-slider" gutterBottom>
        {title}
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs>
          <Slider
            value={value * sliderScale}
            min={min * sliderScale} max={max * sliderScale}
            onChange={(_e, v) => handleChange((v as number) / sliderScale)}
            aria-labelledby="input-slider"
          />
        </Grid>
        <Grid item>
          <Input
            value={textValue}
            size="small"
            onChange={e => { setTextValue(e.target.value); handleChange(parseFloat(e.target.value)) }}
            inputProps={{
              step,
              min,
              max,
              type: 'number',
              'aria-labelledby': 'input-slider',
            }}
          />
        </Grid>
      </Grid>
    </Box>
  )
}
