import { parse, predefinedFunctionNames } from './parser'
import { ASTNode, extractVariables, extractFunctions, astTo3DFunction } from './ast'

type VarDef = { type: 'var'; name: string; deps: string[]; ast: UniqASTNode | null; error?: string }
type FuncDef = { type: 'func'; name: string; deps: string[]; args: string[]; ast: UniqASTNode | null; error?: string }
type Equation = { type: 'eq'; deps: string[]; ast: UniqASTNode | null; error?: string }
type Definition = VarDef | FuncDef
type Formula = Definition | Equation
function parseMultiple(formulaTexts: string[]) {
  const uniq = new UniqASTGenerator()
  const predefinedVars = new Set(['x', 'y', 'z'])
  const varNames = new Set(predefinedVars)
  const varDefRegexp = /^ *([a-zA-Z]) *(\( *[a-zA-Z](?: *, *[a-zA-Z])* *\))? *=(.*)/
  const funcNames = new Set(predefinedFunctionNames)
  for (const f of formulaTexts) {
    const match = f.match(varDefRegexp)
    if (!match) continue
    const [_, name, args] = match
    if (args) funcNames.add(name)
    else varNames.add(name)
  }
  const vars = new Map<string, VarDef>()
  const funcs = new Map<string, FuncDef>()
  const formulas: Formula[] = formulaTexts.map(f => {
    const match = f.match(varDefRegexp)
    const name = match?.[1]
    if (!match || !name || vars.has(name) || funcs.has(name) || predefinedFunctionNames.has(name)) {
      try {
        const [ast] = parse(f, varNames, funcNames)
        const deps = extractVariables(ast)
        return { type: 'eq', deps, ast: uniq.convert(ast) }
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
        const [ast] = parse(body, new Set([...varNames, ...args]), funcNames)
        const variables = extractVariables(ast).filter(n => !args.includes(n))
        const deps = [...variables, ...extractFunctions(ast, funcNames)]
        definition = { type: 'func', name, deps, args, ast: uniq.convert(ast) }
      } catch (e) {
        definition = { type: 'func', name, deps: [], args, ast: null, error: String(e) }
      }
      funcs.set(name, definition)
      return definition
    } else {
      let definition: VarDef
      try {
        const [ast] = parse(body, varNames, funcNames)
        const deps = extractVariables(ast)
        definition = { type: 'var', name, deps, ast: uniq.convert(ast) }
      } catch(e) {
        definition = { type: 'var', name, deps: [], ast: null, error: String(e) }
      }
      vars.set(name, definition)
      return definition
    }
  })
  const defs = new Map<string, Definition>([...vars.entries(), ...funcs.entries()])
  recursiveCheck(formulas, defs)
  return formulas.map(f => {
    if (!f.ast || f.type !== 'eq') return f
    try {
      // console.log(JSON.stringify(expandAST(f.ast, vars, funcs, uniq)))
      console.log(astTo3DFunction(expandAST(f.ast, vars, funcs, uniq)).toString())
      return { ...f, ast: expandAST(f.ast, vars, funcs, uniq) }
    } catch(e) {
      return { ...f, ast: null, error: String(e) }
    }
  })
}

function recursiveCheck(formulas: Formula[], defs: Map<string, Definition>) {
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

function expandAST(ast: UniqASTNode, vars: Map<string, VarDef>, funcs: Map<string, FuncDef>, gen: UniqASTGenerator): UniqASTNode {
  const expandeds = new Map<UniqASTNode, UniqASTNode>()
  function expand(ast: UniqASTNode): UniqASTNode {
    const output = expandeds.get(ast)
    if (output) return output
    if (typeof ast === 'number') return ast
    if (typeof ast === 'string') {
      const vdef = vars.get(ast)
      if (!vdef?.ast) return ast
      return expandAST(vdef.ast, vars, funcs, gen)
    }
    const args = ast.args.map(arg => expandAST(arg, vars, funcs, gen))
    const fdef = funcs.get(ast.op)
    let expanded: UniqASTNode
    if (!fdef?.ast) {
      expanded = gen.create(ast.op, args)
    } else {
      if (args.length !== fdef.args.length) throw `Wrong number of arguments for ${fdef.name}(${fdef.args.join(',')})`
      const argVars = new Map(fdef.args.map((name, i) => [name, args[i]] as const))
      const argReplaced = replaceVariables(fdef.ast, argVars, gen)
      expanded = expand(argReplaced)
    }
    return expanded
  }
  return expand(ast)
}

function replaceVariables(ast: UniqASTNode, vars: Map<string, UniqASTNode>, gen: UniqASTGenerator): UniqASTNode {
  const replaceds = new Map<UniqASTNode, UniqASTNode>()
  function replace(ast: UniqASTNode): UniqASTNode {
    const output = replaceds.get(ast)
    if (output) return output
    if (typeof ast === 'number') return ast
    if (typeof ast === 'string') return vars.get(ast) ?? ast
    const replaced = gen.create(ast.op, ast.args.map(arg => replaceVariables(arg, vars, gen)))
    replaceds.set(ast, replaced)
    return replaced
  }
  return replace(ast)
}

type UniqASTOpNode = { op: string; args: UniqASTNode[]; uniqId: number, uniqKey: string }
type UniqASTNode = string | number | UniqASTOpNode
class UniqASTGenerator {
  key2ast = new Map<string, UniqASTNode>()
  idCnt = 0
  create(op: string, args: UniqASTNode[]): UniqASTNode {
    const uniqKey = this.calcKey(op, args)
    const existing = this.key2ast.get(uniqKey)
    if (existing) return existing
    const uniqId = this.idCnt++
    const ast = { op, args, uniqId, uniqKey }
    this.key2ast.set(uniqKey, ast)
    return ast
  }
  convert(ast: ASTNode): UniqASTNode {
    if (typeof ast !== 'object') return ast
    return this.create(ast.op, ast.args.map(arg => this.convert(arg)))
  }
  calcKey(op: string, args: UniqASTNode[]) {
    const argIds = args.map(arg => typeof arg === 'object' ? `[${arg.uniqId}]` : String(arg))
    return [op, ...argIds].join('/')
  }
}



const formulas = [
  'a=12+x+b',
  'sin(x+y+a)=(b*x+y)',
  'b=x+y+z',
  'a+xy',
  'f(x,y,w)=x+y+a+w',
  'f(x,y,z)=1',
  'b=xy',
  'f(x,y,3)=f(y,x,2)'
]

console.log(parseMultiple(formulas))
