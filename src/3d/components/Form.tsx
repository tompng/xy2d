import React, { useState, useRef, useReducer, useEffect, useCallback } from 'react'
import { List, ListItem, ListItemAvatar, Avatar, TextField, ListItemText } from '@mui/material'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import type { FormulaState } from './View'
type MathListItemProps = {
  formula: FormulaType
  progress?: FormulaState
  update: (formula: FormulaType) => void
  delete: (formula: FormulaType) => void
}

const MathListItem: React.VFC<MathListItemProps> = ({ formula, update, progress }) => {
  const [text, setText] = useState(formula.text)
  const submit = () => update({ ...formula, text })
  const sortable = useSortable({ id: formula.id })
  const dndStyle = {
    transform: sortable.transform ? `translate3D(0, ${sortable.transform.y}px, 0)` : ''
  }
  return (
    <div ref={sortable.setNodeRef} style={dndStyle}>
      <ListItem >
        <ListItemAvatar style={{ touchAction: 'none', cursor: 'move' }} {...sortable.listeners} {...sortable.attributes}>
          <ClickableInsideDND onClick={() => alert(1)}>
            <Avatar>
              い
            </Avatar>
          </ClickableInsideDND>
        </ListItemAvatar>
        <ListItemText style={{ position: 'relative' }}>
          <form onSubmit={e => { e.preventDefault(); submit()}}>
            <TextField
              fullWidth
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={submit}
            />
          </form>
          {text && formula.text === text && <FormulaStatus progress={progress} />}
        </ListItemText>
      </ListItem>
    </div>
  )
}

const FormulaStatus: React.VFC<{ progress?: FormulaState }> = ({ progress }) => {
  if (!progress) return null
  const { complete, error, resolution } = progress
  const rmessage = resolution === 0 ? '' : [resolution, resolution, resolution].join('×')
  const message = error || (complete ? '' : '...')
  return <div style={{ position: 'absolute', left: 0, bottom: 0, color: error ? 'red' : '', fontSize: '10px' }}>
    {rmessage}{message}
  </div>
}

export type FormulaType = {
  id: string
  text: string
  other?: { color: string }
}
export function newFormula(text = ''): FormulaType {
  return { id: String(Math.random()), text }
}
function normalizeFormulas(formulas: FormulaType[]) {
  const normalized = [...formulas]
  if (normalized.length === 0 || normalized[normalized.length - 1].text !== '') normalized.push(newFormula())
  while (normalized.length >= 2 && normalized[normalized.length - 1].text === '' && normalized[normalized.length - 2].text === '') normalized.pop()
  return normalized
}

type MathListProps = {
  formulas: FormulaType[]
  formulaStatus: Map<string, FormulaState>
  setFormulas: (formulas: FormulaType[] | ((formulas: FormulaType[]) => FormulaType[])) => void
}
export const MathList: React.VFC<MathListProps> = ({ formulas, formulaStatus, setFormulas }) => {
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
                progress={formulaStatus.get(formula.id)}
              />
            ))
          }
        </List>
      </SortableContext>
    </DndContext>
  )
}

const ClickableInsideDND: React.FC<{ onClick?: () => void }> = ({ onClick, children }) => {
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
}
