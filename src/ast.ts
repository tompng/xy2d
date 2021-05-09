import { expanders, results, GAPMARK, NANMARK, Expander, MinMaxVarName, NameGenerator, RangeResult } from "./expander"

type UnaryOp =
  | '-@' | 'log' | 'exp'
  | 'sin' | 'cos' | 'tan'
  | 'sinh' | 'cosh' | 'tanh'
  | 'asin' | 'acos' | 'atan'
  | 'asinh' | 'acosh' | 'atanh' | 'sqrt'
type BinaryOp = '+' | '-' | '*' | '/' | '^' | 'hypot' | 'atan2' | 'pow'
export type ASTNode = string | number | {
  op: UnaryOp
  a: ASTNode
} | {
  op: BinaryOp
  a: ASTNode
  b: ASTNode
}

export const ast = {
  add: (a: ASTNode, b: ASTNode) => ({ op: '+', a, b } as ASTNode),
  sub: (a: ASTNode, b: ASTNode) => ({ op: '-', a, b } as ASTNode),
  mult: (a: ASTNode, b: ASTNode) => ({ op: '*', a, b } as ASTNode),
  div: (a: ASTNode, b: ASTNode) => ({ op: '/', a, b } as ASTNode),
  pow: (a: ASTNode, b: ASTNode) => ({ op: '^', a, b } as ASTNode),
  minus: (a: ASTNode) => ({ op: '-@', a } as ASTNode),
  sin: (a: ASTNode) => ({ op: 'sin', a } as ASTNode),
  cos: (a: ASTNode) => ({ op: 'cos', a } as ASTNode),
  f1: (op: UnaryOp, a: ASTNode) => ({ op: op, a } as ASTNode),
  f2: (op: BinaryOp, a: ASTNode, b: ASTNode) => ({ op: op, a, b } as ASTNode),
  sqrt: (a: ASTNode) => ({ op: 'sqrt', a } as ASTNode),
  exp: (a: ASTNode) => ({ op: 'exp', a } as ASTNode),
  log: (a: ASTNode) => ({ op: 'log', a } as ASTNode),
}

const mathConstants = { e: Math.E, pi: Math.PI }

export function compactAST(ast: ASTNode, constants: Record<string, number>): ASTNode {
  if (typeof ast === 'number') return ast
  if (typeof ast === 'string') {
    const value = constants[ast]
    return typeof value === 'number' ? value : ast
  }
  if ('b' in ast) {
    const a = compactAST(ast.a, constants)
    const b = compactAST(ast.b, constants)
    if (typeof a !== 'number' || typeof b !== 'number') return { ...ast, a, b }
    switch (ast.op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return a / b
      case '^': return a ** b
      case 'hypot': return Math.hypot(a, b)
      case 'atan2': return Math.atan2(a, b)
      case 'pow': return Math.pow(a, b)
    }
  } else {
    const a = compactAST(ast.a, constants)
    if (typeof a !== 'number') return { ...ast, a }
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
    }
  }
}

export function astToCode(ast: ASTNode, args: Set<string>): string {
  if (typeof ast === 'number') return ast.toString()
  if (typeof ast === 'string') {
    if (args.has(ast)) return ast
    throw new Error(`Unknown constant or variable: ${ast}`)
  }
  const a = astToCode(ast.a, args)
  const b = 'b' in ast ? astToCode(ast.b, args) : undefined
  switch (ast.op) {
    case '^': return `(${a}**${b})`
    case '-@': return `(-${a})`
    case '+':
    case '-':
    case '*':
    case '/':
      return `(${a}${ast.op}${b})`
    default:
      if ('b' in ast) return `Math.${ast.op}(${a},${b})`
      return `Math.${ast.op}(${a})`
  }
}
export function astToRangeCode(ast: ASTNode, args: Set<string>): string | number {
  if (typeof ast === 'number') return ast
  if (typeof ast === 'string') {
    if (args.has(ast)) return ast
    throw new Error(`Unknown constant or variable: ${ast}`)
  }
  const a = astToRangeCode(ast.a, args)
  if ('b' in ast) {
    const b = astToRangeCode(ast.b, args)
    const ta = typeof a === 'number' ? 'C' : 'V'
    const tb = typeof b === 'number' ? 'C' : 'V'
    switch (ast.op) {
      case '+': return ta === 'C' ? `addVC(${b},${a})` : tb === 'C' ? `addVC(${a},${b})` : `addVV(${a},${b})`
      case '-': return ta === 'C' ? `subCV(${a},${b})` : typeof(b) === 'number' ? `addVC(${a},${-b})` : `subVV(${a},${b})`
      case '*': return ta === 'C' ? `multVC(${b},${a})` : tb === 'C' ? `multVC(${a},${b})` : `multVV(${a},${b})`
      case '/': return ta === 'C' ? `multVC(invV(${b}),${a})` : typeof b === 'number' ? `multVC(${a},${1 / b})` : `divVV(${a},${b})`
      case '^': return `pow${ta}${tb}(${a},${b})`
      default: throw 'Error'
    }
  } else {
    if (ast.op === '-@') return `minusV(${a})`
    return `${ast.op}V(${a})`
  }
}

export function astToFunction(ast: ASTNode, constants: Record<string, number> = mathConstants): (x: number, y: number) => number {
  const args = new Set(['x', 'y'])
  return eval(`(x, y) => ${astToCode(compactAST(ast, constants), args)}`)
}

function astToRangeVarNameCode(ast: ASTNode, args: Record<string, MinMaxVarName>, expanders: Record<string, Expander>, namer: NameGenerator): [MinMaxVarName | number, string] {
  if (typeof ast === 'number') return [ast, '']
  if (typeof ast === 'string') {
    const varname = args[ast]
    if (!varname) throw new Error(`Unknown constant or variable: ${ast}`)
    return [varname, '']
  }
  const [a, acode] = astToRangeVarNameCode(ast.a, args, expanders, namer)
  const [b, bcode] = 'b' in ast ? astToRangeVarNameCode(ast.b, args, expanders, namer) : [0, '']
  const expander = expanders[ast.op]
  if (!expander) throw new Error(`Expander undefined for: ${ast.op}`)
  const [c, ccode] = expander(a, b, namer)
  return [c, acode + ';' + bcode + ';' + ccode]
}

export function astToRangeFunction(ast: ASTNode, option: { pos?: boolean; neg?: boolean }, constants: Record<string, number> = mathConstants): (xmin: number, xmax: number, ymin: number, ymax: number) => RangeResult {
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
  const [result, code] = astToRangeVarNameCode(
    compactAST(ast, constants),
    { x: ['xmin', 'xmax'], y: ['ymin', 'ymax']},
    expanders,
    nameGenerator
  )
  const epsilon = 1e-15
  const argsPart = '(xmin,xmax,ymin,ymax)'
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
