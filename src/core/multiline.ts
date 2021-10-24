import { parse, predefinedFunctionNames } from './parser'
import { ASTNode, UniqASTNode, UniqASTOpNode, extractVariables, extractFunctions, astToCode, astToRangeVarNameCode, preEvaluateAST } from './ast'
import { expanders, Results, GAPMARK, NANMARK } from "./expander"
import { createNameGenerator, MinMaxVarName, CompareMode, UniqASTGenerator } from './util'

type PresetFunc = [args: string[], body: string]
export type Presets = Record<string, string | number | PresetFunc>
type VarDef = { type: 'var'; name: string; deps: string[]; ast: UniqASTNode | null; error?: string }
type FuncDef = { type: 'func'; name: string; deps: string[]; args: string[]; ast: UniqASTNode | null; error?: string }
type Equation = { type: 'eq'; mode: CompareMode; deps: string[]; ast: UniqASTNode | null; error?: string }
type Definition = VarDef | FuncDef
type Formula = Definition | Equation
export function parseMultiple(formulaTexts: string[], argNames: string[], presets?: Presets) {
  const uniq = new UniqASTGenerator()
  const predefinedVars = new Set(argNames)
  const varNames = new Set(predefinedVars)
  const varDefRegexp = /^ *([a-zA-Z]) *(\( *[a-zA-Z](?: *, *[a-zA-Z])* *\))? *=(.*)/
  const funcNames = new Set(predefinedFunctionNames)
  if (presets){
    for (const name in presets) {
      if (Array.isArray(presets[name])) {
        funcNames.add(name)
      } else {
        varNames.add(name)
      }
    }
  }
  for (const f of formulaTexts) {
    const match = f.match(varDefRegexp)
    if (!match) continue
    const [_, name, args] = match
    if (args) funcNames.add(name)
    else varNames.add(name)
  }
  const vars = new Map<string, VarDef>()
  const funcs = new Map<string, FuncDef>()
  function addVar(name: string, body: string | number) {
    let definition: VarDef
    if (typeof body === 'number') {
      definition = { type: 'var', name, ast: body, deps: [] }
    } else {
      try {
        const [ast, mode] = parse(body, varNames, funcNames)
        const deps = extractVariables(ast)
        definition = { type: 'var', name, deps, ast: uniq.convert(ast) }
      } catch(e) {
        definition = { type: 'var', name, deps: [], ast: null, error: String(e) }
      }
    }
    vars.set(name, definition)
    return definition
  }
  function addFunc(name: string, args: string[], body: string) {
    let definition: FuncDef
    try {
      const [ast, mode] = parse(body, new Set([...varNames, ...args]), funcNames)
      if (mode != null) throw `invalid compare operator`
      const variables = extractVariables(ast).filter(n => !args.includes(n))
      const deps = [...variables, ...extractFunctions(ast, funcNames)]
      definition = { type: 'func', name, deps, args, ast: uniq.convert(ast) }
    } catch (e) {
      definition = { type: 'func', name, deps: [], args, ast: null, error: String(e) }
    }
    funcs.set(name, definition)
    return definition
  }
  if (presets){
    for (const name in presets) {
      const value = presets[name]
      if (Array.isArray(value)) {
        const [args, body] = value
        addFunc(name, args, body)
      } else {
        addVar(name, value)
      }
    }
  }

  const formulas: Formula[] = formulaTexts.map(f => {
    const match = f.match(varDefRegexp)
    const name = match?.[1]
    if (!match || !name || vars.has(name) || funcs.has(name) || predefinedVars.has(name) || predefinedFunctionNames.has(name)) {
      try {
        const [ast, mode] = parse(f, varNames, funcNames)
        const deps = extractVariables(ast)
        return { type: 'eq', mode, deps, ast: uniq.convert(ast) }
      } catch (e) {
        return { type: 'eq', mode: null, deps: [], ast: null, error: String(e) }
      }
    }
    const argpart = match[2]
    const body = match[3]
    if (argpart) {
      const args = argpart.substring(1, argpart.length - 1).split(',').map(s => s.trim())
      return addFunc(name, args, body)
    } else {
      return addVar(name, body)
    }
  })
  const defs = new Map<string, Definition>([...vars.entries(), ...funcs.entries()])
  recursiveCheck(formulas, defs)
  const preEvaluateResults = new Map<UniqASTNode, UniqASTNode>()
  return formulas.map(f => {
    if (!f.ast || f.error) return f
    if (f.type === 'func') return f
    try {
      const expandedAST = preEvaluateAST(expandAST(f.ast, vars, funcs, uniq), uniq, preEvaluateResults)
      return { ...f, ast: expandedAST }
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
        formula.error = `cannot define recursively: ${formula.name}`
        formula.ast = null
        return
      }
      rec.add(formula.name)
    }
    for (const n of formula.deps) {
      const d = defs.get(n)
      if (d) check(d)
    }
    const errorDep = formula.deps.find(n => defs.get(n)?.error)
    if (errorDep) {
      formula.error = formula.error || `${errorDep} is not defined`
      formula.ast = null
    }
    if (formula.type !== 'eq') rec.delete(formula.name)
  }
  for (const f of formulas) check(f)
}

function expandAST(ast: UniqASTNode, vars: Map<string, VarDef>, funcs: Map<string, FuncDef>, uniq: UniqASTGenerator): UniqASTNode {
  const expandeds = new Map<UniqASTNode, UniqASTNode>()
  function expand(ast: UniqASTNode): UniqASTNode {
    const output = expandeds.get(ast)
    if (output) return output
    if (typeof ast === 'number') return ast
    if (typeof ast === 'string') {
      const vdef = vars.get(ast)
      if (!vdef?.ast) return ast
      return expandAST(vdef.ast, vars, funcs, uniq)
    }
    const args = ast.args.map(arg => expandAST(arg, vars, funcs, uniq))
    const fdef = funcs.get(ast.op)
    let expanded: UniqASTNode
    if (!fdef?.ast) {
      expanded = uniq.create(ast.op, args)
    } else {
      if (args.length !== fdef.args.length) throw `Wrong number of arguments for ${fdef.name}(${fdef.args.join(',')})`
      const argVars = new Map(fdef.args.map((name, i) => [name, args[i]] as const))
      const argReplaced = replaceUniqAST(fdef.ast, argVars, uniq)
      expanded = expand(argReplaced)
    }
    return expanded
  }
  return expand(ast)
}

function replaceUniqAST(ast: UniqASTNode, converts: Map<UniqASTNode, UniqASTNode>, uniq: UniqASTGenerator): UniqASTNode {
  const replaceds = new Map<UniqASTNode, UniqASTNode>()
  function replace(ast: UniqASTNode): UniqASTNode {
    const output = replaceds.get(ast)
    if (output) return output
    const ast2 = converts.get(ast)
    if (ast2 != null) return ast2
    if (typeof ast !== 'object') return ast
    const replaced = uniq.create(ast.op, ast.args.map(arg => replaceUniqAST(arg, converts, uniq)))
    replaceds.set(ast, replaced)
    return replaced
  }
  return replace(ast)
}

function extractReusedAST(ast: UniqASTNode): UniqASTNode[] {
  const set = new Set<UniqASTNode>()
  const reused = new Set<UniqASTOpNode>()
  function extractDups(ast: UniqASTNode) {
    if (typeof ast !== 'object') return
    if (set.has(ast)) {
      reused.add(ast)
      return
    }
    set.add(ast)
    for (const arg of ast.args) extractDups(arg)
  }
  extractDups(ast)
  let astCnt = 0
  const astId = new Map<UniqASTNode, number>()
  function indexAst(ast: UniqASTNode) {
    if (astId.has(ast) || typeof ast !== 'object') return
    ast.args.forEach(indexAst)
    astId.set(ast, astCnt++)
  }
  indexAst(ast)
  return [...reused].sort((a, b) => astId.get(a)! - astId.get(b)!)
}

function toProcedure(ast: UniqASTNode) {
  const reuseds = extractReusedAST(ast)
  const converts = new Map<UniqASTNode, string>(reuseds.map((ast, i) => [ast, `_v${i}`]))
  const replaceds = new Map<UniqASTNode, ASTNode>()
  function replace(ast: UniqASTNode, root?: boolean): ASTNode {
    const ast2 = root ? null : replaceds.get(ast) ?? converts.get(ast)
    if (ast2 != null) return ast2
    if (typeof ast !== 'object') return ast
    const replaced =  { op: ast.op, args: ast.args.map(arg => replace(arg)) }
    if (!root) replaceds.set(ast, replaced)
    return replaced
  }
  const vars = new Map<string, ASTNode>()
  for (const vast of reuseds) {
    const name = converts.get(vast)!
    vars.set(name, replace(vast, true))
  }
  return [vars, replace(ast, true)] as const
}

export function astToValueFunctionCode(ast: UniqASTNode, args: string[]) {
  const [vars, rast] = toProcedure(ast)
  const varNames = new Set([...args, ...vars.keys()])
  const codes = [...vars.entries()].map(([name, ast]) => `const ${name}=${astToCode(ast, varNames)}`)
  return `(${args.join(',')})=>{${codes.join('\n')}\nreturn ${astToCode(rast, varNames)}}`
}

export function astToRangeFunctionCode(uniqAST: UniqASTNode, args: string[], option: { pos?: boolean; neg?: boolean }) {
  const [tempVars, returnAST] = toProcedure(uniqAST)
  const namer = createNameGenerator()
  const vars: Record<string, MinMaxVarName> = {}
  for (const arg of args) vars[arg] = [arg + 'min', arg + 'max']
  const codes = [...tempVars.entries()].map(([name, ast]) => {
    const [result, code] = astToRangeVarNameCode(ast, vars, expanders, namer)
    if (typeof result === 'number') {
      const varname = namer()
      vars[name] = [varname, varname] // Must not happen?
      return `const ${varname}=${result}`
    } else {
      vars[name] = result
      return code
    }
  })
  const [result, rcode] = astToRangeVarNameCode(
    returnAST,
    vars,
    expanders,
    namer
  )
  const argsPart = `(${args.map(a => `${a}min,${a}max`).join(',')})`
  const epsilon = 1e-15
  if (typeof result === 'number') {
    const val = isNaN(result) ? Results.NAN : result < -epsilon ? Results.NEG : result > epsilon ? Results.POS : Results.ZERO
    return `${argsPart}=>${val}`
  }
  const fullCode = [...codes, rcode].join('\n')

  const gapTest = fullCode.includes(GAPMARK)
  const nanTest = fullCode.includes(NANMARK)
  const gapPrepare = gapTest ? 'let _gap=false;' : ''
  const nanPrepare = nanTest ? 'let _nan=false;' : ''
  const preparePart = gapPrepare + nanPrepare
  const [minvar, maxvar] = result
  const markEmbeddedCode = fullCode.replaceAll(GAPMARK, '_gap=true;').replaceAll(NANMARK, '_nan=true;')
  const gapRetPart = gapTest ? `_gap?${Results.HASGAP}:` : ''
  const nanRetPart = nanTest ? `_nan?${Results.HASNAN}:` : ''
  let returnPart: string
  if (option.pos && option.neg) {
    returnPart = `return ${nanRetPart}${minvar}>${epsilon}?${Results.POS}:${maxvar}<${-epsilon}?${Results.NEG}:${gapRetPart}${Results.BOTH}`
  } else if (option.pos) {
    returnPart = `return ${minvar}>${epsilon}?${nanRetPart}${Results.POS}:${maxvar}<${-epsilon}?${Results.NEG}:${gapRetPart}${Results.BOTH}`
  } else if (option.neg) {
    returnPart = `return ${minvar}>${epsilon}?${Results.POS}:${maxvar}<${-epsilon}?${nanRetPart}${Results.NEG}:${gapRetPart}${Results.BOTH}`
  } else {
    returnPart = `return ${minvar}>${epsilon}?${Results.POS}:${maxvar}<${-epsilon}?${Results.NEG}:${gapRetPart}${Results.BOTH}`
  }
  return `${argsPart}=>{${preparePart}${markEmbeddedCode};${returnPart}}`
}

const presetConstants: Presets = { pi: Math.PI, e: Math.E }
const presetFunctions: Presets = {
  mod: [['x', 'y'], 'x-floor(x/y)*y']
}

export const presets2D: Presets = {
  ...presetConstants,
  ...presetFunctions,
  r: 'hypot(x,y)',
  theta: 'atan2(y,x)'
}
export const presets3D: Presets = {
  ...presetConstants,
  ...presetFunctions,
  r: 'hypot(x,y,z)',
  theta: 'atan2(y,x)',
  phi: 'atan2(hypot(x,y),z)',
}
