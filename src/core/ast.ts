import { NameGenerator, UniqASTGenerator, MinMaxVarName, RangeResult } from './util'
import { Expander } from "./expander"

export type RangeFunction = (xmin: number, xmax: number, ymin: number, ymax: number) => RangeResult
export type RangeFunction3D = (xmin: number, xmax: number, ymin: number, ymax: number, zmin: number, zmax: number) => RangeResult
export type ValueFunction = (x: number, y: number) => number
export type ValueFunction3D = (x: number, y: number, z: number) => number
export type ASTOpNode = { op: string; args: ASTNode[] }
export type ASTNode = string | number | ASTOpNode
export type UniqASTOpNode = { op: string; args: UniqASTNode[]; uniqId: number, uniqKey: string }
export type UniqASTNode = string | number | UniqASTOpNode

export function extractVariables(ast: ASTNode) {
  const set = new Set<string>()
  function extract(ast: ASTNode) {
    if (typeof ast === 'number') return
    if (typeof ast === 'string') {
      set.add(ast)
    } else {
      for (const arg of ast.args) extract(arg)
    }
  }
  extract(ast)
  return [...set]
}
export function extractFunctions(ast: ASTNode, functions: Set<string>) {
  const set = new Set<string>()
  function extract(ast: ASTNode) {
    if (typeof ast === 'number' || typeof ast === 'string') return
    if (functions.has(ast.op)) set.add(ast.op)
    for (const arg of ast.args) extract(arg)
  }
  extract(ast)
  return [...set]
}

function isNumberArray(arr: any[]): arr is number[] {
  return arr.every(arg => typeof arg === 'number')
}

function evalOperatorArgs(op: string, args: number[]) {
  if (args.length === 2) {
    const [a, b] = args
    switch (op) {
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
    switch (op) {
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
    switch (op) {
      case 'min': return Math.min(...args)
      case 'max': return Math.max(...args)
      case 'hypot': return Math.hypot(...args)
    }
  }
}

export function preEvaluateAST(ast: UniqASTNode, uniq: UniqASTGenerator, astResult = new Map<UniqASTNode, UniqASTNode>()) {
  function traverse(ast: UniqASTNode): UniqASTNode {
    if (typeof ast !== 'object') return ast
    let result = astResult.get(ast)
    if (result != null) return result
    const args = ast.args.map(traverse)
    if (isNumberArray(args)) {
      const v = evalOperatorArgs(ast.op, args)
      if (v != null) result = v
    }
    if (result == null) result = uniq.create(ast.op, args)
    astResult.set(ast, result)
    return result
  }
  return traverse(ast)
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
        return `(${a}${ast.op}(${b}))`
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

export function astToRangeVarNameCode(
  ast: ASTNode,
  args: Record<string, MinMaxVarName>,
  expanders: Record<string, Expander>,
  namer: NameGenerator
): [MinMaxVarName | number, string] {
  const variables = extractVariables(ast)
  const validVars = new Set(Object.keys(args))
  for (const varname of variables) {
    if (!validVars.has(varname)) throw `Unknown variable ${varname}`
  }
  return astToRangeVarNameCodeRec(ast, args, expanders, namer)
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
