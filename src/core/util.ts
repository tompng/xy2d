export type MinMaxVarName = [min: string, max: string]
export type RangeResult = -3 | -2 | -1 | 0 | 1 | 2 | 3
export type RangeFunction2D = (xmin: number, xmax: number, ymin: number, ymax: number) => RangeResult
export type RangeFunction3D = (xmin: number, xmax: number, ymin: number, ymax: number, zmin: number, zmax: number) => RangeResult
export type ValueFunction2D = (x: number, y: number) => number
export type ValueFunction3D = (x: number, y: number, z: number) => number
export type ASTOpNode = { op: string; args: ASTNode[] }
export type ASTNode = string | number | ASTOpNode
export type UniqASTOpNode = { op: string; args: UniqASTNode[]; uniqId: number, uniqKey: string }
export type UniqASTNode = string | number | UniqASTOpNode
export type NameGenerator = () => string
export type CompareMode = '=' | '>' | '>=' | null

export function createNameGenerator(): NameGenerator {
  let nameGeneratorIndex = 9
  return () => {
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
}

export class UniqASTGenerator {
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
