import type { ASTNode } from './ast'

// TODO: pow, abs min, max, etc
const functionNames = new Set(['log', 'exp', 'sqrt', 'hypot', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'atan2', '√'])
const constantNames = new Set(['e', 'pi', 'π', 'PI', 'E'])
const varNames = new Set(['x', 'y'])
const comparers = new Set(['<', '=', '>', '<=', '>='])
const operators = new Set(['+', '-', '*', '/', '^', '**'])
const tokenSet = new Set([...functionNames, ...constantNames, ...varNames, ...operators, ...comparers, ',', ' '])

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
const alias: Record<string, string | undefined> = { '**': '^', '√': 'sqrt', 'π': 'pi', 'PI': 'pi', 'E': 'e' }
function convertAlias(s: string) {
  return alias[s] || s
}

function matchToken(s: string, i: number): [number | string, number] | null{
  if (s[i].match(/\d/)) {
    let len = 1
    const dotCount = 0
    while (i + len < s.length && (s[i + len].match(/\d/) || (dotCount === 0 && s[i + len] === '.'))) len++
    return [parseFloat(s.substr(i, len)), len]
  }
  for (let len = 5; len >= 1; len-=1) {
    if (tokenSet.has(s.substr(i, len))) return [convertAlias(s.substr(i, len)), len]
  }
  return null
}

type TokenParenGroup = (string | number | TokenParenGroup)[]
function tokenize(group: ParenGroup): TokenParenGroup {
  const out: TokenParenGroup = []
  const pattern = group.map(s => typeof s === 'string' ? s : '@').join('')
  for (let i = 0; i < group.length;) {
    const item = group[i]
    if (item === ' ') {
      if (out[out.length - 1] !== item) out.push(item)
    } else if (typeof item === 'string') {
      const result = matchToken(pattern, i)
      if (!result) throw `Unexpected Token "${pattern[i]}"`
      const [v, len] = result
      out.push(v)
      i += len
    } else {
      out.push(tokenize(item))
      i ++
    }
  }
  return out
}

export function parse(s: string) {
  const pg = parseParen(s)
  const tg = tokenize(pg)
  return buildRootAST(tg)
}

function buildRootAST(group: TokenParenGroup): [ASTNode, '=' | '>' | '>=' | null] {
  const idx = group.findIndex(item => typeof item === 'string' && comparers.has(item))
  if (idx === -1) {
    const ast = buildAST(group)
    if (Array.isArray(ast)) throw 'Unexpected comma'
    return [ast, null]
  }
  const cmp = group[idx] as string
  const left = buildAST(group.slice(0, idx))
  const right = buildAST(group.slice(idx + 1))
  if (Array.isArray(left) || Array.isArray(right)) throw 'Unexpected comma'
  const ast: ASTNode = cmp.includes('>') ? { op: '-', a: left, b: right } : { op: '-', a: right, b: left }
  if (cmp === '=') return [ast, '=']
  return [ast, cmp.includes('=') ? '>=' : '>']
}
type ArgGroup = ASTNode[]
const oplist = [new Set(['+', '-']), new Set(['*', '/', ' ']), new Set('^')]
function buildFuncMult(group: TokenParenGroup): ASTNode {
  const astOrArgOrOps = group.map(g => typeof g === 'object' ? buildAST(g) : g)
  let index = 0
  function takeWhile<T = ASTNode | ArgGroup | string>(cond: (item: ASTNode | ArgGroup | string) => boolean) {
    const items: T[] = []
    while (index < astOrArgOrOps.length && cond(astOrArgOrOps[index])) {
      items.push(astOrArgOrOps[index] as unknown as T)
      index++
    }
    return items
  }
  const mults: ASTNode[] = []
  while (index < astOrArgOrOps.length) {
    const funcnames = takeWhile<string>(item => typeof item === 'string' && functionNames.has(item))
    if (funcnames.length !== 0) {
      const numvars = takeWhile<string | number>(item => typeof item === 'string' || typeof item === 'number')
      let args: ASTNode[]
      if (numvars.length === 0) {
        const arg = astOrArgOrOps[index]
        index++
        if (!arg) throw `No Function Arguments: ${funcnames[funcnames.length - 1]}`
        if (Array.isArray(arg)) args = arg
        else args = [arg]
      } else {
        const astnumvars: ASTNode[] = numvars
        args = [astnumvars.reduce((a, b) => ({ op: '*', a, b }))]
      }
      for (let i = funcnames.length - 1; i >= 0; i--) {
        const op = funcnames[i]
        if (args.length == 2) args = [{ op, a: args[0], b: args[1] } as ASTNode]
        else args = [{ op, a: args[0] } as ASTNode]
      }
      mults.push(args[0])
    } else {
      const item = astOrArgOrOps[index]
      if (Array.isArray(item)) throw `Unexpected Comma Group`
      mults.push(item)
      index++
    }
  }
  if (mults.length === 0) throw `Unexpected Empty Block`
  return mults.reduce((a, b) => ({ op: '*', a, b }))
}
function splitByOp(group: TokenParenGroup, index: number): ASTNode {
  if (index === oplist.length) return buildFuncMult(group)
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
  let ast = first.length === 0 ? null : splitByOp(first, index + 1)
  operators.forEach((op, i) => {
    const left = ast
    const rgroup = groups[i + 1]
    const right = rgroup.length === 0 ? null : splitByOp(rgroup, index + 1)
    if (!right) {
      if (op === ' ') return
      throw `No Right Hand Side: ${op}`
    } 
    if (!left) {
      if (op === '-') ast = { op: '-@', a: right }
      else if (op === ' ') ast = right
      else throw `No Left Hand Side: ${op}`
    } else {
      ast = { op, a: left, b: right } as ASTNode
    }
  })
  if (!ast) throw 'Unexpected Empty Group'
  return ast
}
function buildAST(group: TokenParenGroup): ASTNode | ArgGroup {
  let current: TokenParenGroup = []
  const out = [current]
  for (let item of group) {
    if (item == ',') out.push(current = [])
    else current.push(item)
  }
  const astNodes = out.map(g => splitByOp(g, 0))
  if (astNodes.length === 1) return astNodes[0]
  return astNodes
}
