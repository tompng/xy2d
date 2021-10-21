import React, { useState, useRef, useCallback } from 'react'
import {
  List, ListItem, ListItemText, ListItemAvatar, Avatar,
  Slider, Input, TextField,
  Dialog, DialogTitle, DialogContent,
  IconButton, Grid
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { styled } from '@mui/material/styles'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import type { FormulaType, FormulaProgress, SetFormulasType } from './View'
type MathListItemProps = {
  formula: FormulaType
  update: (formula: FormulaType) => void
  delete: (formula: FormulaType) => void
}

const MathListItem = React.memo<MathListItemProps>(({ formula, update }) => {
  const [text, setText] = useState(formula.text)
  const submit = () => update({ ...formula, text })
  const sortable = useSortable({ id: formula.id })
  const dndStyle = {
    transform: sortable.transform ? `translate3D(0, ${sortable.transform.y}px, 0)` : ''
  }
  const isDef = formula.progress?.type === 'var' || formula.progress?.type === 'func'
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <div ref={sortable.setNodeRef} style={dndStyle}>
      <ListItem>
        <div
          style={{
            touchAction: 'none',
            cursor: 'move',
            position: 'relative',
            flexShrink: 0,
            width: 64,
            height: 80,
            marginLeft: -16
          }}
          {...sortable.listeners}
          {...sortable.attributes}
          tabIndex={undefined}
        >
          <ClickableInsideDND onClick={() => setDialogOpen(true)}>
            <div style={{
              backgroundColor: (!isDef && formula.renderingOption.color) || 'white',
              position: 'absolute',
              left: 16,
              top: 16,
              width: 32,
              height: 32,
              lineHeight: '30px',
              textAlign: 'center',
              fontSize: '12px',
              borderRadius: '50%',
              border: '2px solid gray'
            }}>
              {isDef && 'def'}
            </div>
          </ClickableInsideDND>
        </div>
        <ListItemText style={{ position: 'relative' }}>
          <form onSubmit={e => { e.preventDefault(); submit()}}>
            <TextField
              fullWidth
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={submit}
            />
          </form>
          {text && formula.text === text && <FormulaStatus progress={formula.progress} />}
        </ListItemText>
      </ListItem>
      <ColorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        color={formula.renderingOption.color ?? '#ffffff'}
        onChange={color => update({ ...formula, renderingOption: { ...formula.renderingOption, color } })}
      />
    </div>
  )
})

const FormulaStatus = React.memo<{ progress?: FormulaProgress }>(({ progress }) => {
  if (!progress) return null
  const { name, complete, error, resolution, value } = progress
  let message: string | null = null
  if (resolution > 0) {
    const res = resolution === 0 ? '' : [resolution, resolution, resolution].join('×')
    message = res + (error || (complete ? '' : '...'))
  } else if (error) {
    message = error
  } else if (value != null) {
    message = `${name} = ${value}`
  }
  return <div style={{ position: 'absolute', left: 0, bottom: 0, color: error ? 'red' : '', fontSize: '12px' }}>
    {message}
  </div>
})

export function randomColor() {
  let s = '#'
  for (let i = 0; i < 3; i++) s += Math.floor(192 + 64 * Math.random()).toString(16)
  return s
}

export function newFormula(text = ''): FormulaType {
  return { id: String(Math.random()), text, renderingOption: { color: randomColor() } }
}
function normalizeFormulas(formulas: FormulaType[]) {
  const normalized = [...formulas]
  if (normalized.length === 0 || normalized[normalized.length - 1].text !== '') normalized.push(newFormula())
  while (normalized.length >= 2 && normalized[normalized.length - 1].text === '' && normalized[normalized.length - 2].text === '') normalized.pop()
  return normalized
}

type MathListProps = {
  formulas: FormulaType[]
  setFormulas: SetFormulasType
}
export const MathList = React.memo<MathListProps>(({ formulas, setFormulas }) => {
  const updateFormula = useCallback((formula: FormulaType) => {
    setFormulas(formulas => normalizeFormulas(formulas.map(f => (f.id === formula.id ? formula : f))))
  }, [])
  const deleteFormula = useCallback((formula: FormulaType) => {
    setFormulas(formulas => normalizeFormulas(formulas.filter(f => f.id !== formula.id)))
  }, [])

  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const {active, over} = event
    if (!over) return
    if (active.id !== over.id) {
      setFormulas(formulas => {
        const ids = formulas.map(f => f.id)
        const oldIndex = ids.indexOf(active.id)
        const newIndex = ids.indexOf(over.id)
        return normalizeFormulas(arrayMove(formulas, oldIndex, newIndex))
      })
    }
  }, [])
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={formulas} strategy={verticalListSortingStrategy}>
        <List>
          {
            formulas.map(formula => (
              <MathListItem
                key={formula.id}
                formula={formula}
                update={updateFormula}
                delete={deleteFormula}
              />
            ))
          }
        </List>
      </SortableContext>
    </DndContext>
  )
})

const ClickableInsideDND = React.memo<{ onClick?: () => void; children?: React.ReactNode }>(({ onClick, children }) => {
  const ref = useRef({ id: -1, time: 0, x: 0, y: 0 })
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    ref.current = { id: e.pointerId, time: performance.now(), x: e.pageX, y: e.pageY }
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const down = ref.current
    if (down.id !== e.pointerId || performance.now() - ref.current.time > 200) return
    if (Math.hypot(e.pageX - down.x, e.pageY - down.y) < 10) onClick?.()

  }, [onClick])
  return <div onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ cursor: 'pointer' }}>{children}</div>
})

const ColorDialog = React.memo<{ open: boolean; onClose: () => void; color: string; onChange: (color: string) => void }>(({
  open, onClose, color, onChange
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        Surface Color
        <IconButton aria-label="close" onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <ColorPicker color={color} onChange={onChange} />
      </DialogContent>
    </Dialog>
  )
})

const ColorPicker = React.memo<{ color: string; onChange: (color: string) => void }>(({ color, onChange }) => {
  const [r, g, b] = [0, 1, 2].map(i => parseInt(color.substr(2 * i + 1, 2), 16))
  const update = (r: number, g: number, b: number) => {
    onChange('#' + [r, g, b].map(c => {
      const c2 = c < 0 ? 0 : c > 255 ? 255 : Math.round(c)
      return Math.floor(c2 / 16).toString(16) + (c2 % 16).toString(16)
    }).join(''))
  }
  return (<>
    <ColorSlider SliderComponent={RedSlider} value={r} onChange={r => update(r, g, b)} />
    <ColorSlider SliderComponent={GreenSlider} value={g} onChange={g => update(r, g, b)} />
    <ColorSlider SliderComponent={BlueSlider} value={b} onChange={b => update(r, g, b)} />
  </>)
})

function createColoredSlider(color: string) {
  return styled(Slider)({
    color,
    height: 8,
    '& .MuiSlider-valueLabel': {
      backgroundColor: color,
    },
  })
}
const RedSlider = createColoredSlider('#f44')
const GreenSlider = createColoredSlider('#4f4')
const BlueSlider = createColoredSlider('#44f')
type SliderComponentType = ReturnType<typeof createColoredSlider>
type ColorSliderProps = { SliderComponent: SliderComponentType; value: number; onChange: (value: number) => void }
const ColorSlider = React.memo<ColorSliderProps>(({ SliderComponent, value, onChange }) => {
  const handleChange = (value: number) => {
    if (0 <= value && value <= 255) onChange(value)
  }
  return (
    <Grid container spacing={2} alignItems="center" sx={{ width: 250 }}>
      <Grid item xs={8}>
        <SliderComponent
          value={value}
          min={0} max={255}
          onChange={(_e, v) => handleChange(v as number)}
        />
      </Grid>
      <Grid item xs={4}>
        <Input
          value={value}
          fullWidth
          onChange={e => handleChange(parseInt(e.target.value))}
          inputProps={{ step: 15, min: 0, max: 255, type: 'number' }}
        />
      </Grid>
    </Grid>
  )
})
