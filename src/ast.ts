import * as range from "./range"
import type { VRange } from "./range"

type ASTNode = string | number | {
  op: 'sin' | 'cos' | 'log' | 'exp' | '-@'
  a: ASTNode
} | {
  op: '+' | '-' | '*' | '/' | '^'
  a: ASTNode
  b: ASTNode
}

export const ast = {
  add: (a: ASTNode, b: ASTNode) => ({ op: '+', a, b } as ASTNode),
  sub: (a: ASTNode, b: ASTNode) => ({ op: '-', a, b } as ASTNode),
  mult: (a: ASTNode, b: ASTNode) => ({ op: '*', a, b } as ASTNode),
  div: (a: ASTNode, b: ASTNode) => ({ op: '/', a, b } as ASTNode),
  pow: (a: ASTNode, b: ASTNode) => ({ op: '^', a, b } as ASTNode),
  minus: (a: ASTNode) => ({ op: '-', a } as ASTNode),
  sin: (a: ASTNode) => ({ op: 'sin', a } as ASTNode),
  cos: (a: ASTNode) => ({ op: 'cos', a } as ASTNode),
  exp: (a: ASTNode) => ({ op: 'exp', a } as ASTNode),
  log: (a: ASTNode) => ({ op: 'log', a } as ASTNode),
}

export function compactAST(ast: ASTNode, constants: Record<string, number>): ASTNode {
  if (typeof ast === 'number') return ast
  if (typeof ast === 'string') {
    const value = constants[ast]
    return typeof value === 'number' ? value : ast
  }
  if ('b' in ast) {
    const { a, b } = ast
    if (typeof a !== 'number') return ast
    if (typeof b !== 'number') return ast
    switch (ast.op) {
      case '+': return a + b
      case '-': return a - b
      case '*': return a * b
      case '/': return a / b
      case '^': return a ** b
    }
  } else {
    const { a } = ast
    if (typeof a !== 'number') return ast
    switch (ast.op) {
      case '-@': return -a
      case 'sin': return Math.sin(a)
      case 'cos': return Math.cos(a)
      case 'exp': return Math.exp(a)
      case 'log': return Math.log(a)
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
  if (ast.op == '^') return `(${a}**${b})`
  if (ast.op == '-@') return `(-${a})`
  if ('b' in ast) return `(${a}${ast.op}${b})`
  return `Math.${ast.op}(${a})`
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
    }
  } else {
    if (ast.op === '-@') return `minusV(${a})`
    return `${ast.op}V(${a})`
  }
}

export function astToFunction(ast: ASTNode, constants: Record<string, number> = {}): (x: number, y: number) => number {
  const args = new Set(['x', 'y'])
  return eval(`(x, y) => ${astToCode(compactAST(ast, constants), args)}`)
}

export function astToRangeFunction(ast: ASTNode, constants: Record<string, number> = {}): (x: VRange, y: VRange) => VRange {
  const injects = Object.keys(range).join(',')
  const args = new Set(['x', 'y'])
  const code = `({ ${injects} }) => (x, y) => ${astToRangeCode(compactAST(ast, constants), args)}`
  return eval(code)(range)
}
