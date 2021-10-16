import React, { useState, useCallback, useEffect } from 'react'
import { List, ListItem, ListItemAvatar, Avatar, TextField, ListItemText } from '@mui/material'
export const Form = (): JSX.Element => {
  return (
    <div style={{ position: 'fixed', left: 0, bottom: 0, width: '100%', height: '40%', background: 'white', overflow: 'auto' }}>
      <MathList />
    </div>
  )
}

type MathListItemProps = {
  formula: FormulaType
  update: (formula: FormulaType) => void
  delete: (formula: FormulaType) => void
}
const MathListItem: React.VFC<MathListItemProps> = ({ formula, update }) => {
  const [text, setText] = useState(formula.text)
  const submit = () => update({ ...formula, text })
  return (
    <ListItem>
      <ListItemAvatar>
        <Avatar>
          あ
        </Avatar>
      </ListItemAvatar>
      <ListItemText>
        <form onSubmit={e => { e.preventDefault(); submit()}}>
          <TextField
            fullWidth
            value={text}
            onChange={e => setText(e.target.value)}
            onBlur={submit}
          />
        </form>
      </ListItemText>
    </ListItem>
  )
}

type FormulaType = {
  id: number
  text: string
  other?: { color: string }
}
function newFormula(text = ''): FormulaType {
  return { id: Math.random(), text }
}
function normalizeFormulas(formulas: FormulaType[]) {
  const normalized = [...formulas]
  if (normalized.length === 0 || normalized[normalized.length - 1].text !== '') normalized.push(newFormula())
  while (normalized.length >= 2 && normalized[normalized.length - 1].text === '' && normalized[normalized.length - 2].text === '') normalized.pop()
  return normalized
}
const MathList: React.VFC = () => {
  const [formulas, setFormulas] = useState<FormulaType[]>([newFormula()])
  const updateFormula = useCallback((formula: FormulaType) => {
    setFormulas(formulas => normalizeFormulas(formulas.map(f => (f.id === formula.id ? formula : f))))
  }, [])
  const deleteFormula = useCallback((formula: FormulaType) => {
    setFormulas(formulas => normalizeFormulas(formulas.filter(f => f.id !== formula.id)))
  }, [])

  return (
    <List>
      {
        formulas.map(formula => {
          return <MathListItem key={formula.id} formula={formula} update={updateFormula} delete={deleteFormula} />
        })
      }
    </List>
  )
}
