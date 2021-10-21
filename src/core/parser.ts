import type { ASTNode } from './ast'
import type { CompareMode } from './util'
export const predefinedFunctionNames = new Set([
  'log', 'exp', 'sqrt', 'pow', 'hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'atan2', '√', 'abs', 'arctan', 'min', 'max',
  'floor', 'ceil', 'round', 'sgn', 'sign', 'signum'
])
const comparers = new Set(['<', '=', '>', '<=', '>='])
const operators = new Set(['+', '-', '*', '/', '^', '**'])
const alias: Record<string, string | undefined> = {
  '**': '^', '√': 'sqrt', 'arctan': 'atan',
  'π': 'pi', 'PI': 'pi', 'E': 'e',
  'th': 'theta', 'θ': 'theta', 'φ': 'phi',
  'sgn': 'sign', 'signum': 'sign'
}
const tokenSet = new Set([...predefinedFunctionNames, ...operators, ...comparers, ',', ' '])

type ParenGroup = (string | ParenGroup)[]
function parseParen(input: string): ParenGroup {
  const stack: ParenGroup[] = [[]]
  let current = stack[stack.length - 1]
  for (const c of input) {
    if (c === '(') {
      const child: ParenGroup = []
      current.push(child)
      stack.push(current = child)
    } else if (c === ')') {
      stack.pop()
      if (stack.length === 0) throw 'Paren Mismatch'
      current = stack[stack.length - 1]
    } else {
      current.push(c)
    }
  }
  if (stack.length !== 1) throw 'Paren Mismatch'
  return current
}

function convertAlias(s: string) {
  return alias[s] || s
}

type Tokens = { set: Set<string>; max: number }

function matchToken(s: string, i: number, tokens: Tokens): [number | string, number] | null{
  if (s[i].match(/\d/)) {
    let len = 1
    let dotCount = 0
    while (i + len < s.length && (s[i + len].match(/\d/) || (dotCount === 0 && s[i + len] === '.'))) {
      if (s[i + len] === '.') dotCount++
      len++
    }
    return [parseFloat(s.substr(i, len)), len]
  }
  for (let len = tokens.max; len >= 1; len-=1) {
    if (tokens.set.has(s.substr(i, len))) return [convertAlias(s.substr(i, len)), len]
  }
  return null
}

type TokenParenGroup = (string | number | TokenParenGroup)[]
function tokenize(group: ParenGroup, tokens: Tokens): TokenParenGroup {
  const out: TokenParenGroup = []
  const pattern = group.map(s => typeof s === 'string' ? s : '@').join('')
  for (let i = 0; i < group.length;) {
    const item = group[i]
    if (item === ' ') {
      if (out[out.length - 1] !== item) out.push(item)
      i += 1
    } else if (typeof item === 'string') {
      const result = matchToken(pattern, i, tokens)
      if (!result) throw `Unexpected Token "${pattern[i]}"`
      const [v, len] = result
      out.push(v)
      i += len
    } else {
      out.push(tokenize(item, tokens))
      i ++
    }
  }
  return out
}

export function parse(s: string, extraVariables?: Set<string>, extraFunctions?: Set<string>) {
  const pg = parseParen(s)
  const tokens = { set: new Set(tokenSet), max: 0 }
  const functions = new Set(predefinedFunctionNames)
  if (extraVariables) extraVariables.forEach(t => tokens.set.add(t))
  if (extraFunctions) extraFunctions.forEach(t => {
    tokens.set.add(t)
    functions.add(t)
  })
  for (const t of tokens.set) {
    if (tokens.max < t.length) tokens.max = t.length
  }
  const tg = tokenize(pg, tokens)
  return buildRootAST(tg, functions)
}

function buildRootAST(group: TokenParenGroup, functionNames: Set<string>): [ASTNode, CompareMode] {
  const idx = group.findIndex(item => typeof item === 'string' && comparers.has(item))
  if (idx === -1) {
    const ast = buildAST(group, functionNames)
    if (Array.isArray(ast)) throw 'Unexpected comma'
    return [ast, null]
  }
  const cmp = group[idx] as string
  const left = buildAST(group.slice(0, idx), functionNames)
  const right = buildAST(group.slice(idx + 1), functionNames)
  if (Array.isArray(left) || Array.isArray(right)) throw 'Unexpected comma'
  const ast: ASTNode = cmp.includes('>') ? { op: '-', args: [left, right] } : { op: '-', args: [right, left] }
  if (cmp === '=') return [ast, '=']
  return [ast, cmp.includes('=') ? '>=' : '>']
}
type ArgGroup = ASTNode[]
const oplist = [new Set(['+', '-']), new Set(['*', '/', ' '])]
function buildFuncMultPow(group: TokenParenGroup, functionNames: Set<string>): ASTNode {
  type Args = { type: 'args'; value: ArgGroup }
  type Paren = { type: 'paren', value: ASTNode }
  const values: (string | number | Args | Paren)[] = group.map(g => {
    if (typeof g !== 'object') return g
    const astOrArg = buildAST(g, functionNames)
    return Array.isArray(astOrArg) ? { type: 'args' as const, value: astOrArg } : { type: 'paren' as const, value: astOrArg }
  })
  const mults: ASTNode[] = []
  let concatable = false
  let pow: ASTNode | undefined
  for (let index = values.length - 1; index >= 0; index--) {
    const v = values[index]
    if (typeof v === 'object') {
      const prev = index > 0 && values[index - 1]
      const isPrevFunc = typeof prev === 'string' && functionNames.has(prev)
      if (v.type === 'args') {
        if (!isPrevFunc) throw 'Function Required'
        const fcall = { op: prev, args: v.value } as ASTNode
        if (pow) {
          mults.unshift({ op: '^', args: [fcall, pow] })
          pow = undefined
        } else {
          mults.unshift(fcall)
        }
        index--
      } else {
        if (pow && !isPrevFunc) {
          mults.unshift({ op: '^', args: [v.value, pow] })
          pow = undefined
        } else {
          mults.unshift(v.value)
        }
      }
      concatable = false
    } else if (v === '^') {
      if (!mults[0] || pow) throw `Error after ^`
      pow = mults.shift()
      concatable = false
    } else if (typeof v === 'string' && functionNames.has(v)) {
      if (!mults[0]) throw `Function Arg Required: ${v}`
      if (pow) {
        mults[0] = { op: '^', args: [{ op: v, args: [mults[0]] }, pow] }
        pow = undefined
      } else {
        mults[0] = { op: v, args: [mults[0]] }
      }
      concatable = false
    } else {
      if (pow) {
        mults.unshift({ op: '^', args: [v, pow] })
        pow = undefined
      } else if (concatable) {
        mults[0] = { op: '*', args: [v, mults[0]] }
      } else {
        mults.unshift(v)
      }
      concatable = true
    }
  }
  if (pow) throw 'Error at ^'
  if (mults.length === 0) throw `Unexpected Empty Block`
  return mults.reduce((a, b) => ({ op: '*', args: [a, b] }))
}
function splitByOp(group: TokenParenGroup, index: number, functionNames: Set<string>): ASTNode {
  if (index === oplist.length) return buildFuncMultPow(group, functionNames)
  const ops = oplist[index]
  let current: TokenParenGroup = []
  const groups: TokenParenGroup[] = [current]
  const operators: string[] = []
  for (let item of group) {
    if (typeof item === 'string' && ops.has(item)) {
      operators.push(item)
      groups.push(current = [])
    } else {
      current.push(item)
    }
  }
  const first = groups[0]
  let ast = first.length === 0 ? null : splitByOp(first, index + 1, functionNames)
  operators.forEach((op, i) => {
    const left = ast
    const rgroup = groups[i + 1]
    const right = rgroup.length === 0 ? null : splitByOp(rgroup, index + 1, functionNames)
    if (right == null) {
      if (op === ' ') return
      throw `No Right Hand Side: ${op}`
    } 
    if (left == null) {
      if (op === '-') ast = { op: '-@', args: [right] }
      else if (op === ' ') ast = right
      else throw `No Left Hand Side: ${op}`
    } else {
      ast = { op: op === ' ' ? '*' : op, args: [left, right] } as ASTNode
    }
  })
  if (ast == null) throw 'Unexpected Empty Group'
  return ast
}
function buildAST(group: TokenParenGroup, functionNames: Set<string>): ASTNode | ArgGroup {
  let current: TokenParenGroup = []
  const out = [current]
  for (let item of group) {
    if (item == ',') out.push(current = [])
    else current.push(item)
  }
  const astNodes = out.map(g => splitByOp(g, 0, functionNames))
  if (astNodes.length === 1) return astNodes[0]
  return astNodes
}
