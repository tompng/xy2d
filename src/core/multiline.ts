import { parse, predefinedFunctionNames } from './parser'
import { ASTNode, extractVariables, extractFunctions } from './ast'

type VarDef = { type: 'var'; name: string; deps: string[]; ast: ASTNode | null; error?: string }
type FuncDef = { type: 'func'; name: string; deps: string[]; args: string[]; ast: ASTNode | null; error?: string }
type Equation = { type: 'eq'; deps: string[]; ast: ASTNode | null; error?: string }
type Formula = VarDef | FuncDef | Equation
function parseMultiple(formulaTexts: string[]) {
  const predefinedVars = new Set(['x', 'y', 'z'])
  const vars = new Set(predefinedVars)
  const varDefRegexp = /^ *([a-zA-Z]) *(\( *[a-zA-Z](?: *, *[a-zA-Z])* *\))? *=(.*)/
  const functions = new Set(predefinedFunctionNames)
  for (const f of formulaTexts) {
    const match = f.match(varDefRegexp)
    if (!match) continue
    const [_, name, args] = match
    if (args) functions.add(name)
    else vars.add(name)
  }
  const defs = new Map<string, VarDef | FuncDef >()
  const formulas: Formula[] = formulaTexts.map(f => {
    const match = f.match(varDefRegexp)
    const name = match?.[1]
    if (!match || !name || defs.has(name) || predefinedFunctionNames.has(name)) {
      try {
        const [ast] = parse(f, vars, functions)
        const deps = extractVariables(ast)
        return { type: 'eq', deps, ast }
      } catch (e) {
        return { type: 'eq', deps: [], ast: null, error: String(e) }
      }
    }
    const argpart = match[2]
    const body = match[3]
    if (argpart) {
      const args = argpart.substring(1, argpart.length - 1).split(',').map(s => s.trim())
      let definition: FuncDef
      try {
        const [ast] = parse(body, new Set([...vars, ...args]), functions)
        const variables = extractVariables(ast).filter(n => !args.includes(n))
        const deps = [...variables, ...extractFunctions(ast, functions)]
        definition = { type: 'func', name, deps, args, ast }
      } catch (e) {
        definition = { type: 'func', name, deps: [], args, ast: null, error: String(e) }
      }
      defs.set(name, definition)
      return definition
    } else {
      let definition: VarDef
      try {
        const [ast] = parse(body, vars, functions)
        const deps = extractVariables(ast)
        definition = { type: 'var', name, deps, ast }
      } catch(e) {
        definition = { type: 'var', name, deps: [], ast: null, error: String(e) }
      }
      defs.set(name, definition)
      return definition
    }
  })
  recursiveCheck(formulas, defs)
  return formulas
}

function recursiveCheck(formulas: Formula[], defs: Map<string, VarDef | FuncDef>) {
  const rec = new Set<string>()
  function check(formula: Formula) {
    if (formula.error) return
    if (formula.type !== 'eq') {
      if (rec.has(formula.name)) {
        formula.error = `recursive`
        return
      }
      rec.add(formula.name)
    }
    for (const n of formula.deps) {
      const d = defs.get(n)
      if (d) check(d)
    }
    const errorDep = formula.deps.find(n => defs.get(n)?.error)
    if (errorDep) formula.error = formula.error || `${errorDep} is not defined`
    if (formula.type !== 'eq') rec.delete(formula.name)
  }
  for (const f of formulas) check(f)
}

const formulas = [
  'a=12+x+b',
  'sin(x+y+a)=(b*x+y)',
  'b=x+y+z',
  'a+xy',
  'c=1**&&',
  'f(x,y,w)=x+y+a+w',
  'f(x,y,z)=1',
  'b=xy',
  'f(x,y)=f(y,x)'
]

console.log(parseMultiple(formulas))
