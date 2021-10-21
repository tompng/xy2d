import { parse, predefinedFunctionNames } from './parser'
import { ASTNode, UniqASTNode, UniqASTOpNode, extractVariables, extractFunctions, astToCode, astToRangeVarNameCode, preEvaluateAST } from './ast'
import { expanders, results as Results, GAPMARK, NANMARK } from "./expander"
import { createNameGenerator, MinMaxVarName, UniqASTGenerator } from './util'

export type Presets = Record<string, string | number>
type VarDef = { type: 'var'; name: string; deps: string[]; ast: UniqASTNode | null; error?: string }
type FuncDef = { type: 'func'; name: string; deps: string[]; args: string[]; ast: UniqASTNode | null; error?: string }
type Equation = { type: 'eq'; deps: string[]; ast: UniqASTNode | null; error?: string }
type Definition = VarDef | FuncDef
type Formula = Definition | Equation
export function parseMultiple(formulaTexts: string[], argNames: string[], presets?: Presets) {
  const uniq = new UniqASTGenerator()
  const predefinedVars = new Set(argNames)
  const varNames = new Set(predefinedVars)
  const varDefRegexp = /^ *([a-zA-Z]) *(\( *[a-zA-Z](?: *, *[a-zA-Z])* *\))? *=(.*)/
  const funcNames = new Set(predefinedFunctionNames)
  if (presets){
    for (const name in presets) varNames.add(name)
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
  if (presets){
    for (const name in presets) {
      const value = presets[name]
      if (typeof value === 'number') {
        vars.set(name, { type: 'var', name, ast: value, deps: [] })
      } else {
        const [ast] = parse(value, varNames, new Set())
        const deps = extractVariables(ast)
        vars.set(name, { type: 'var', name, deps, ast: uniq.convert(ast) })
      }
    }
  }

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
  const preEvaluateResults = new Map<UniqASTNode, UniqASTNode>()
  return formulas.map(f => {
    if (!f.ast) return f
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

export function astToFunctionCode(ast: UniqASTNode, args: string[]) {
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

export const presets2D: Presets = {
  'pi': Math.PI,
  'e': Math.E,
  'r': 'hypot(x,y)',
  'theta': 'atan2(y,x)'
}
export const presets3D: Presets = {
  ...presets2D,
  'r':'hypot(x,y,z)',
  'phi':'atan2(hypot(x,y),z)',
}

const formulas = [
  'r=x*x+y*y+th',
  '((x+y)+z)^2+sin((x+y)+z)+cos(x+y)',
  'u=-1.23',
  'k=2.71828+e',
  'g=k-π',
  'a=12+x+b',
  'sin(x+y+a*e)=(b*x+y+e^x)',
  'b=x+y+z',
  'a+xy',
  'f(x,y,w)=x+y+a+w+z',
  'f(x,y,z)=1',
  'b=xy',
  'f(x,y,3)=f(f(f(y,x,2),f(y,x,2),3),f(f(y,x,2),f(y,x,2),3),xyz)',
  'R(a,b)=a*a-b*b+x',
  'I(a,b)=2*a*b+y',
  'S(a,b)=R(R(R(a,b),I(a,b)),I(R(a,b),I(a,b)))',
  'J(a,b)=I(R(R(a,b),I(a,b)),I(R(a,b),I(a,b)))',
  'S(S(x,y),J(x,y))**2+J(S(x,y),J(x,y))**2<4',
  'x+y+S(3,5)+S(5,2)*(x+y)'
]

const argNames = ['x', 'y', 'z']
const parsedFormulas = parseMultiple(formulas, argNames, presets3D)
for (const f of parsedFormulas) {
  console.log(f)
  if (f.type === 'eq' && f.ast) {
    console.log(astToFunctionCode(f.ast, argNames))
    console.log(astToRangeFunctionCode(f.ast, argNames, {}))
    console.log(eval(astToFunctionCode(f.ast, argNames))(0,1,2))
    console.log(eval(astToRangeFunctionCode(f.ast, argNames, {}))(0,0.1,1,1.1,2,2.1))
  }
}
