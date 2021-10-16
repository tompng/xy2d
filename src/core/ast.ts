import { expanders, specialVariables, results, GAPMARK, NANMARK, Expander, MinMaxVarName, NameGenerator, RangeResult } from "./expander"

export type RangeFunction = (xmin: number, xmax: number, ymin: number, ymax: number) => RangeResult
export type RangeFunction3D = (xmin: number, xmax: number, ymin: number, ymax: number, zmin: number, zmax: number) => RangeResult
export type ValueFunction = (x: number, y: number) => number
export type ValueFunction3D = (x: number, y: number, z: number) => number
export type ASTNode = string | number | {
  op: string
  args: ASTNode[]
}

const mathConstants = { e: Math.E, pi: Math.PI }

export function extractVariables(ast: ASTNode, constants: Record<string, number> = mathConstants) {
  const set = new Set<string>()
  function extract(ast: ASTNode) {
    if (typeof ast === 'number') return
    if (typeof ast === 'string') {
      if (!constants[ast]) set.add(ast)
    } else {
      ast.args.forEach(arg => extract(arg))
    }
  }
  extract(ast)
  return [...set]
}

function isNumberArray(arr: any[]): arr is number[] {
  return arr.every(arg => typeof arg === 'number')
}

export function compactAST(ast: ASTNode, constants: Record<string, number>): ASTNode {
  if (typeof ast === 'number') return ast
  if (typeof ast === 'string') {
    const value = constants[ast]
    return typeof value === 'number' ? value : ast
  }
  const args = ast.args.map(arg => compactAST(arg, constants))
  if (isNumberArray(args)) {
    if (args.length === 2) {
      const [a, b] = args
      switch (ast.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': return a / b
        case '^': return a ** b
        case 'hypot': return Math.hypot(a, b)
        case 'atan':
        case 'atan2': return Math.atan2(a, b)
        case 'pow': return Math.pow(a, b)
      }
    } else if (args.length === 1) {
      const [a] = args
      switch (ast.op) {
        case '-@': return -a
        case 'exp': return Math.exp(a)
        case 'log': return Math.log(a)
        case 'sqrt': return Math.sqrt(a)
        case 'sin': return Math.sin(a)
        case 'cos': return Math.cos(a)
        case 'tan': return Math.tan(a)
        case 'sinh': return Math.sinh(a)
        case 'cosh': return Math.cosh(a)
        case 'tanh': return Math.tanh(a)
        case 'asin': return Math.asin(a)
        case 'acos': return Math.acos(a)
        case 'atan': return Math.atan(a)
        case 'asinh': return Math.asinh(a)
        case 'acosh': return Math.acosh(a)
        case 'atanh': return Math.atanh(a)
        case 'abs': return Math.abs(a)
        case 'floor': return Math.floor(a)
        case 'round': return Math.round(a)
        case 'ceil': return Math.ceil(a)
        case 'sign': return Math.sign(a)
      }
    } else if (args.length !== 0) {
      switch (ast.op) {
        case 'min': return Math.min(...args)
        case 'max': return Math.max(...args)
      }
    }
  }
  return { op: ast.op, args }
}

export function astToCode(ast: ASTNode, argNames: Set<string>): string {
  if (typeof ast === 'number') return ast.toString()
  if (typeof ast === 'string') {
    if (argNames.has(ast)) return ast
    throw new Error(`Unknown constant or variable: ${ast}`)
  }
  const args = ast.args.map(arg => astToCode(arg, argNames))
  if (args.length === 2) {
    const [a, b] = args
    switch (ast.op) {
      case '^': return `(${a}**${b})`
      case '+':
      case '-':
      case '*':
      case '/':
        return `(${a}${ast.op}${b})`
      case 'atan':
        return `Math.atan2(${a},${b})`
      default:
        return `Math.${ast.op}(${a},${b})`
    }
  } else if (args.length === 1) {
    const [a] = args
    if (ast.op === '-@') return `(-${a})`
    return `Math.${ast.op}(${a})`
  } else {
    return `Math.${ast.op}(${args.join(',')})`
  }
}

export function astToFunction(ast: ASTNode, constants: Record<string, number> = mathConstants): ValueFunction {
  const args = new Set(['x', 'y', 'r', 'theta'])
  const variables = extractVariables(ast)
  const codes: string[] = []
  if (variables.includes('theta')) codes.unshift('const theta=Math.atan2(y,x);')
  if (variables.includes('r')) codes.unshift('const r=Math.hypot(x,y);')
  const retval = astToCode(compactAST(ast, constants), args)
  const code = codes.length === 0 ? retval : `{${codes.join('')}return ${retval}}`
  return eval(`(x, y) => ${code}`)
}

export function astTo3DFunction(ast: ASTNode, constants: Record<string, number> = mathConstants): ValueFunction3D {
  const args = new Set(['x', 'y', 'z', 'r', 'theta', 'phi'])
  const variables = extractVariables(ast)
  const codes: string[] = []
  if (variables.includes('phi')) codes.unshift('const phi=Math.atan2(Math.hypot(x,y),z);')
  if (variables.includes('theta')) codes.unshift('const theta=Math.atan2(y,x);')
  if (variables.includes('r')) codes.unshift('const r=Math.hypot(x,y,z);')
  const retval = astToCode(compactAST(ast, constants), args)
  const code = codes.length === 0 ? retval : `{${codes.join('')}return ${retval}}`
  return eval(`(x, y, z) => ${code}`)
}


function astToRangeVarNameCode(
  ast: ASTNode,
  args: Record<string, MinMaxVarName>,
  expanders: Record<string, Expander>,
  namer: NameGenerator
): [MinMaxVarName | number, string] {
  const variables = extractVariables(ast)
  const normalVariables = new Set(Object.keys(args))
  const codes: string[] = []
  const specialArgs = { ...args }
  ;[...new Set(variables)].forEach(varname => {
    if (normalVariables.has(varname)) return
    const expander = specialVariables[varname]
    if (!expander) throw `Unknown variable ${varname}`
    const [names, code] = expander(Object.values(args), namer)
    codes.push(code)
    specialArgs[varname] = names as MinMaxVarName
  })
  const [result, code] = astToRangeVarNameCodeRec(ast, specialArgs, expanders, namer)
  codes.push(code)
  return [result, codes.join(';')]
}

function astToRangeVarNameCodeRec(ast: ASTNode, argMap: Record<string, MinMaxVarName>, expanders: Record<string, Expander>, namer: NameGenerator): [MinMaxVarName | number, string] {
  if (typeof ast === 'number') return [ast, '']
  if (typeof ast === 'string') {
    const varname = argMap[ast]
    if (!varname) throw new Error(`Unknown constant or variable: ${ast}`)
    return [varname, '']
  }
  const argCodes = ast.args.map(arg => astToRangeVarNameCodeRec(arg, argMap, expanders, namer))
  const codes = argCodes.map(a => a[1])
  const args = argCodes.map(a => a[0])
  const expander = expanders[ast.op]
  if (!expander) throw new Error(`Expander undefined for: ${ast.op}`)
  const [c, ccode] = expander(args, namer)
  return [c, codes.join(';') + ';' + ccode]
}

export function astToRangeFunction(ast: ASTNode, option: { pos?: boolean; neg?: boolean }, constants: Record<string, number> = mathConstants) {
  return astToRangeFunctionBase(ast, { ...option, dim: 2 }, constants)
}

export function astTo3DRangeFunction(ast: ASTNode, option: { pos?: boolean; neg?: boolean }, constants: Record<string, number> = mathConstants) {
  return astToRangeFunctionBase(ast, { ...option, dim: 3 }, constants)
}

export function astToRangeFunctionBase<DIM extends 2 | 3>(ast: ASTNode, option: { pos?: boolean; neg?: boolean, dim: DIM }, constants: Record<string, number> = mathConstants): DIM extends 2 ? RangeFunction : RangeFunction3D {
  let nameGeneratorIndex = 9
  const nameGenerator = () => {
    let n = nameGeneratorIndex++
    const suffix = n % 10
    n = (n - suffix) / 10
    let name = ''
    while (name === '' || n > 0) {
      name = String.fromCharCode('a'.charCodeAt(0) + n % 26) + name
      n = Math.floor(n / 26)
    }
    return name + suffix
  }
  const args: Record<string, [string, string]> = option.dim == 2
    ? { x: ['xmin', 'xmax'], y: ['ymin', 'ymax'] }
    : { x: ['xmin', 'xmax'], y: ['ymin', 'ymax'], z: ['zmin', 'zmax'] }
  const [result, code] = astToRangeVarNameCode(
    compactAST(ast, constants),
    args,
    expanders,
    nameGenerator
  )
  const epsilon = 1e-15
  const argsPart = option.dim == 2 ? '(xmin,xmax,ymin,ymax)' : '(xmin,xmax,ymin,ymax,zmin,zmax)'
  if (typeof result === 'number') {
    const val = isNaN(result) ? results.NAN : result < -epsilon ? results.NEG : result > epsilon ? results.POS : results.ZERO
    return eval(`${argsPart}=>${val}`)
  }
  const gapTest = code.includes(GAPMARK)
  const nanTest = code.includes(NANMARK)
  const gapPrepare = gapTest ? 'let _gap=false;' : ''
  const nanPrepare = nanTest ? 'let _nan=false;' : ''
  const preparePart = gapPrepare + nanPrepare
  const [minvar, maxvar] = result
  const markEmbeddedCode = code.replaceAll(GAPMARK, '_gap=true;').replaceAll(NANMARK, '_nan=true;')
  const gapRetPart = gapTest ? `_gap?${results.HASGAP}:` : ''
  const nanRetPart = nanTest ? `_nan?${results.HASNAN}:` : ''
  let returnPart: string
  if (option.pos && option.neg) {
    returnPart = `return ${nanRetPart}${minvar}>${epsilon}?${results.POS}:${maxvar}<${-epsilon}?${results.NEG}:${gapRetPart}${results.BOTH}`
  } else if (option.pos) {
    returnPart = `return ${minvar}>${epsilon}?${nanRetPart}${results.POS}:${maxvar}<${-epsilon}?${results.NEG}:${gapRetPart}${results.BOTH}`
  } else if (option.neg) {
    returnPart = `return ${minvar}>${epsilon}?${results.POS}:${maxvar}<${-epsilon}?${nanRetPart}${results.NEG}:${gapRetPart}${results.BOTH}`
  } else {
    returnPart = `return ${minvar}>${epsilon}?${results.POS}:${maxvar}<${-epsilon}?${results.NEG}:${gapRetPart}${results.BOTH}`
  }
  return eval(`${argsPart}=>{${preparePart}${markEmbeddedCode};${returnPart}}`)
}