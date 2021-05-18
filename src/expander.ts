export type MinMaxVarName = [string, string]
export type Expander = (args: (MinMaxVarName | number)[], namer: NameGenerator) => [MinMaxVarName | number, string]
export type NameGenerator = () => string

export type RangeResult = -3 | -2 | -1 | 0 | 1 | 2 | 3
const HASGAP = -3
const HASNAN = -2
const BOTH = -1
const ZERO = 0
const NEG = 1
const POS = 2
const NAN = 3
export const results = { NEG, POS, BOTH, HASGAP, HASNAN, NAN, ZERO }
export const GAPMARK = '/*GAP*/'
export const NANMARK = '/*NAN*/'

function raiseArgNumError(name: string) {
  throw `Wrong number of arguments: ${name}`
}
function assertArgNum(name: string, args: any[], n: number) {
  if (args.length !== n) raiseArgNumError(name)
}

const add: Expander = ([a, b], namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a + b, '']
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar}=${typeof a === 'number' ? a : a[0]}+${typeof b === 'number' ? b : b[0]}`
  const maxcode = `const ${maxvar}=${typeof a === 'number' ? a : a[1]}+${typeof b === 'number' ? b : b[1]}`
  return [[minvar, maxvar], `${mincode};${maxcode}`]
}
const sub: Expander = ([a, b], namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a - b, '']
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar}=${typeof a === 'number' ? a : a[0]}-${typeof b === 'number' ? b : b[1]}`
  const maxcode = `const ${maxvar}=${typeof a === 'number' ? a : a[1]}-${typeof b === 'number' ? b : b[0]}`
  return [[minvar, maxvar], `${mincode};${maxcode}`]
}
const minus: Expander = ([a], namer) => {
  if (typeof a === 'number') return [-a, '']
  const [min, max] = a
  const minvar = namer()
  const maxvar = namer()
  return [[minvar, maxvar], `const ${minvar}=-${max},${maxvar}=-${min}`]
}
function pow2(a: MinMaxVarName | number, namer: NameGenerator): [MinMaxVarName | number, string] {
  if (typeof a === 'number') return [a * a, '']
  const [vmin, vmax] = a
  const minvar = namer()
  const maxvar = namer()
  const min2 = namer()
  const max2 = namer()
  const prepare = `const ${min2}=${vmin}*${vmin},${max2}=${vmax}*${vmax}`
  const mincode = `const ${minvar}=${vmin}<0&&0<${vmax}?0:Math.min(${min2},${max2})`
  const maxcode = `const ${maxvar}=Math.max(${min2},${max2})`
  return [[minvar, maxvar], [prepare, mincode, maxcode].join(';')]
}
function powVarUInt(a: MinMaxVarName, b: number, namer: NameGenerator): [MinMaxVarName, string] {
  const minvar = namer()
  const maxvar = namer()
  const [vmin, vmax] = a
  if (b % 2 === 1) return [[minvar, maxvar], `const ${minvar}=${vmin}**${b},${maxvar}=${vmax}**${b}`]
  const fmin = namer()
  const fmax = namer()
  const prepare = `const ${fmin}=${vmin}**${b},${fmax}=${vmax}**${b}`
  const mincode = `const ${minvar}=${vmin}<0&&0<${vmax}?0:Math.min(${fmin},${fmax})`
  const maxcode = `const ${maxvar}=Math.max(${fmin},${fmax})`
  return [[minvar, maxvar], [prepare, mincode, maxcode].join(';')]
}
function powVarPositive([vmin, vmax]: MinMaxVarName, b: number, namer: NameGenerator): [MinMaxVarName, string] {
  if (Math.floor(b) === b) return powVarUInt([vmin, vmax], b, namer)
  const minvar = namer()
  const maxvar = namer()
  const code = [
    `let ${minvar},${maxvar};`,
    `if(${vmax}<0){${minvar}=${maxvar}=0}`,
    `else{${minvar}=${vmin}<0?0:${vmin}**${b};${maxvar}=${vmax}**${b}}`
  ].join('')
  return [[minvar, maxvar], code]
}


const mult: Expander = ([a, b], namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a * b, '']
  if (a === b) return pow2(a, namer)
  const minvar = namer()
  const maxvar = namer()
  if (typeof a === 'number' || typeof b === 'number') {
    const n = typeof a === 'number' ? a : b as number
    const [minname, maxname] = typeof a !== 'number' ? a : b as MinMaxVarName
    if (n === 0) return [0, '']
    const mincode = `const ${minvar}=${n > 0 ? minname : maxname}*${n}`
    const maxcode = `const ${maxvar}=${n > 0 ? maxname : minname}*${n}`
    return [[minvar, maxvar], `${mincode};${maxcode}`]
  }
  const v1 = namer()
  const v2 = namer()
  const v3 = namer()
  const v4 = namer()
  const [amin, amax] = a
  const [bmin, bmax] = b
  const codes = [
    `const ${v1}=${amin}*${bmin},${v2}=${amin}*${bmax},${v3}=${amax}*${bmin},${v4}=${amax}*${bmax}`,
    `const ${minvar}=Math.min(${v1},${v2},${v3},${v4}),${maxvar}=Math.max(${v1},${v2},${v3},${v4})`
  ]
  return [[minvar, maxvar], codes.join(';')]
}
function inv(value: MinMaxVarName | number, namer: NameGenerator): [MinMaxVarName | number, string] {
  if (typeof value === 'number') return [1 / value, '']
  const [min, max] = value
  const minvar = namer()
  const maxvar = namer()
  const codes = [
    `let ${minvar},${maxvar};`,
    `if(${min}<=0&&0<=${max}){${GAPMARK};${minvar}=${min}===0&&${max}!==0?1/${max}:-Infinity;${maxvar}=${min}!==0&&${max}===0?1/${min}:Infinity}`,
    `else{${minvar}=1/${max};${maxvar}=1/${min}}`
  ]
  return [[minvar, maxvar], codes.join('')]
}
const div: Expander = ([a, b], namer) => {
  if (typeof b === 'number') return mult([a, 1 / b], namer)
  const [binv, invcode] = inv(b, namer)
  const [result, multcode] = mult([a, binv], namer)
  return [result, `${invcode};${multcode}`]
}
const pow: Expander = (args, namer) => {
  assertArgNum('pow', args, 2)
  const [a, b] = args
  if (typeof b === 'number') {
    if (typeof a === 'number') return [a ** b, '']
    if (b === 0) return [1, '']
    if (b === 1) return [a, '']
    if (b === 2) return pow2(a, namer)
    const [powabs, code] = powVarPositive(a, Math.abs(b), namer)
    if (b > 0) return [powabs, code]
    const [result, invcode] = inv(powabs, namer)
    return [result, `${code};${invcode}`]
  }
  const minvar = namer()
  const maxvar = namer()
  if (typeof a === 'number') {
    if (a === 0) return [0, '']
    if (a === Math.E) return exp([b], namer)
    const [bmin, bmax] = b
    const abs = Math.abs(a)
    if (a < 0) {
      return [
        [minvar, maxvar],
        `const ${minvar}=0,${maxvar}=${-a}**${-1 < a ? bmin : bmax}`
      ]
    }
    return [
      [minvar, maxvar],
      `const ${minvar}=${a}**${a < 1 ? bmax : bmin},${maxvar}=${abs}**${a < 1 ? bmin : bmax}`
    ]
  }
  const [amin, amax] = a
  const [bmin, bmax] = b
  const amin2 = namer()
  const v1 = namer()
  const v2 = namer()
  const v3 = namer()
  const v4 = namer()
  const code = [
    `let ${minvar},${maxvar};`,
    `if(${amax}<0){return ${NAN}}`,
    `else{`,
    `if(${amin}<0){${NANMARK}};`,
    `const ${amin2}=${amin}<0?0:${amin};`,
    `const ${v1}=${amin2}**${bmin},${v2}=${amin2}**${bmax},${v3}=${amax}**${bmin},${v4}=${amax}**${bmax};`,
    `${minvar}=Math.min(${v1},${v2},${v3},${v4});`,
    `${maxvar}=Math.max(${v1},${v2},${v3},${v4})`,
    `}`
  ].join('')
  return [[minvar, maxvar], code]
}

function createConvexExpander(func: (n: number) => number, funcName: string, type: 'down' | 'up'): Expander {
  return (args, namer) => {
    assertArgNum(funcName, args, 1)
    const [a] = args
    if (typeof a === 'number') return [func(a), '']
    const [min, max] = a
    const minvar = namer()
    const maxvar = namer()
    const fmin = namer()
    const fmax = namer()
    const has0 = `${min}<0&&0<${max}?${func(0)}:`
    const prepare = `const ${fmin}=Math.${funcName}(${min}),${fmax}=Math.${funcName}(${max})`
    const mincode = `const ${minvar}=${type === 'down' ? has0 : ''}Math.min(${fmin},${fmax})`
    const maxcode = `const ${maxvar}=${type === 'up' ? has0 : ''}Math.max(${fmin},${fmax})`
    return [[minvar, maxvar], [prepare, mincode, maxcode].join(';')]
  }
}

function createMonotonicExpander(func: (v: number) => number, funcName: string, type: 'inc' | 'dec', range: { min?: [number, number]; max?: [number, number] } = {}): Expander {
  const rangeMin = range.min
  const rangeMax = range.max
  return (args, namer) => {
    assertArgNum(funcName, args, 1)
    const [a] = args
    if (typeof a === 'number') {
      const v = rangeMin && a <= rangeMin[0] ? rangeMin[1] : rangeMax && a <= rangeMax[0] ? rangeMax[1] : func(a)
      return [v, '']
    }
    const [min, max] = a
    const minvar = namer()
    const maxvar = namer()
    const conditions: string[] = []
    if (rangeMin) conditions.push(`if(${min}<${rangeMin[0]}){if(${max}<=${rangeMin[0]})return ${NAN};${NANMARK}}`)
    if (rangeMax) conditions.push(`if(${rangeMax[0]}<${max}){if(${rangeMax[0]}<=${min})return ${NAN};${NANMARK}}`)
    const lcode = rangeMin ? `${min}<=${rangeMin[0]}?${rangeMin[1]}:Math.${funcName}(${min});` : `Math.${funcName}(${min})`
    const rcode = rangeMax ? `${rangeMax[0]}<=${max}?${rangeMax[1]}:Math.${funcName}(${max});` : `Math.${funcName}(${max})`
    const vcode = `${minvar}=${type === 'inc' ? lcode : rcode};${maxvar}=${type === 'inc' ? rcode : lcode}`
    const code = [
      `let ${minvar},${maxvar};`,
      ...conditions,
      vcode
    ].join('')
    return [[minvar, maxvar], code]
  }
}

const exp = createMonotonicExpander(Math.exp, 'exp', 'inc')
const log = createMonotonicExpander(Math.log, 'log', 'inc', { min: [0, -Infinity] })
const sqrt = createMonotonicExpander(Math.sqrt, 'sqrt', 'inc', { min: [0, 0] })
const sinh = createMonotonicExpander(Math.sinh, 'sinh', 'inc')
const cosh = createConvexExpander(Math.cosh, 'cosh', 'down')
const tanh = createMonotonicExpander(Math.tanh, 'tanh', 'inc')
const asin = createMonotonicExpander(Math.asin, 'asin', 'inc', { min: [-1, -Math.PI / 2], max: [1, Math.PI / 2] })
const acos = createMonotonicExpander(Math.acos, 'acos', 'dec', { min: [-1, Math.PI], max: [1, 0] })
const atan = createMonotonicExpander(Math.atan, 'atan', 'inc')
const asinh = createMonotonicExpander(Math.asinh, 'asinh', 'inc')
const acosh = createMonotonicExpander(Math.acosh, 'acosh', 'inc', { min: [1, 0] })
const atanh = createMonotonicExpander(Math.atanh, 'atanh', 'inc', { min: [-1, -Infinity], max: [1, Infinity] })

function sincos(a: MinMaxVarName, mode: 'sin' | 'cos', namer: NameGenerator): [MinMaxVarName, string] {
  const [min, max] = a
  const minvar = namer()
  const maxvar = namer()
  const s1 = namer()
  const s2 = namer()
  const i1 = namer()
  const i2 = namer()
  const offset = mode === 'sin' ? '-0.5' : ''
  const code = [
    `let ${minvar},${maxvar};`,
    `if(${max}-${min}>${2 * Math.PI}){${minvar}=-1;${maxvar}=1}`,
    `else{`,
    `const ${s1}=Math.${mode}(${min}),${s2}=Math.${mode}(${max});`,
    `if(${s1}<${s2}){${minvar}=${s1};${maxvar}=${s2}}else{${minvar}=${s2};${maxvar}=${s1}}`,
    `const ${i1}=Math.floor(${min}*${1 / Math.PI}${offset}),${i2}=Math.floor(${max}*${1 / Math.PI}${offset});`,
    `if(${i1}<(${i2}&-2))${maxvar}=1;`,
    `if(${i1}<=((${i2}-1)&-2))${minvar}=-1`,
    `}`
  ].join('')
  return [[minvar, maxvar], code]
}

const sin: Expander = (args, namer) => {
  assertArgNum('sin', args, 1)
  const [a] = args
  if (typeof a === 'number') return [Math.sin(a), '']
  return sincos(a, 'sin', namer)
}
const cos: Expander = (args, namer) => {
  assertArgNum('cos', args, 1)
  const [a] = args
  if (typeof a === 'number') return [Math.cos(a), '']
  return sincos(a, 'cos', namer)
}

// TODO: use Math.tan, not div(sin,cos)
const tan: Expander = (args, namer) => {
  assertArgNum('tan', args, 1)
  const [a] = args
  if (typeof a === 'number') return [Math.tan(a), '']
  const [cvar, ccode] = cos([a], namer)
  const [svar, scode] = sin([a], namer)
  const [tvar, tcode] = div([svar, cvar], namer)
  return [tvar, [ccode, scode, tcode].join(';')]
}

const hypot: Expander = (args, namer) => {
  assertArgNum('hypot', args, 2)
  const [a, b] = args
  if (typeof a === 'number') return [Math.tan(a), '']
  const [avar, acode] = pow2(a, namer)
  const [bvar, bcode] = pow2(b, namer)
  const [svar, scode] = add([avar, bvar], namer)
  const [rvar, rcode] = sqrt([svar], namer)
  return [rvar, [acode, bcode, scode, rcode].join(';')]
}

const atan2: Expander = (args, namer) => {
  assertArgNum('atan2', args, 2)
  const [y, x] = args
  if (typeof y === 'number') {
    if (typeof x === 'number') return [Math.atan2(y, x), '']
    const [xmin, xmax] = x
    const minvar = namer()
    const maxvar = namer()
    const t1 = namer()
    const t2 = namer()
    const code = [
      `const ${t1}=Math.atan2(${y},${xmin}),${t2}=Math.atan2(${y},${xmax})`,
      `const ${minvar}=${t1}<${t2}?${t1}:${t2},${maxvar}=${t1}<${t2}?${t2}:${t1}`
    ].join(';')
    return [[minvar, maxvar], code]
  }
  const [ymin, ymax] = y
  if (typeof x === 'number') {
    const minvar = namer()
    const maxvar = namer()
    const t1 = namer()
    const t2 = namer()
    const assign = `${minvar}=${t1}<${t2}?${t1}:${t2};${maxvar}=${t1}<${t2}?${t2}:${t1}`
    const code = [
      `const ${t1}=Math.atan2(${ymin},${x}),${t2}=Math.atan2(${ymax},${x})`,
      `let ${minvar},${maxvar}`,
      x > 0 ? assign : `if(${ymin}<0&&${ymax}>0){${GAPMARK};${minvar}=${-Math.PI};${maxvar}=${Math.PI}}else{${assign}}`
    ].join(';')
    return [[minvar, maxvar], code]
  }
  const [xmin, xmax] = x
  const minvar = namer()
  const maxvar = namer()
  const v1 = namer()
  const v2 = namer()
  const v3 = namer()
  const v4 = namer()
  const code = [
    `let ${minvar},${maxvar};`,
    `if(${xmin}<0&&${ymin}<=0&&${ymax}>=0){${GAPMARK};${minvar}=${-Math.PI};${maxvar}=${Math.PI}}`,
    `else{const `,
      `${v1}=Math.atan2(${ymin},${xmin}),`,
      `${v2}=Math.atan2(${ymin},${xmax}),`,
      `${v3}=Math.atan2(${ymax},${xmin}),`,
      `${v4}=Math.atan2(${ymax},${xmax});`,
      `${minvar}=Math.min(${v1},${v2},${v3},${v4});${maxvar}=Math.max(${v1},${v2},${v3},${v4})`,
    `}`
  ].join('')
  return [[minvar, maxvar], code]
}

function numberOrMin(args: (number | MinMaxVarName)[]) {
  return args.map(a => typeof a === 'number' ? a : a[0])
}
function numberOrMax(args: (number | MinMaxVarName)[]) {
  return args.map(a => typeof a === 'number' ? a : a[1])
}

const min: Expander = (args, namer) => {
  if (args.length === 0) raiseArgNumError('min')
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar}=Math.min(${numberOrMin(args).join(', ')})`
  const maxcode = `const ${maxvar}=Math.min(${numberOrMax(args).join(', ')})`
  return [[minvar, maxvar], mincode + ';' + maxcode]
}

const max: Expander = (args, namer) => {
  if (args.length === 0) raiseArgNumError('min')
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar}=Math.max(${numberOrMin(args).join(', ')})`
  const maxcode = `const ${maxvar}=Math.max(${numberOrMax(args).join(', ')})`
  return [[minvar, maxvar], mincode + ';' + maxcode]
}

const abs: Expander = (args, namer) => {
  assertArgNum('abs', args, 1)
  const [a] = args
  if (typeof a === 'number') return [Math.abs(a), '']
  const [min, max] = a
  const minvar = namer()
  const maxvar = namer()
  const code = [
    `let ${minvar},${maxvar};`,
    `if(0<${min}){${minvar}=${min};${maxvar}=${max}}`,
    `else if(${max}<0){${minvar}=-${max};${maxvar}=-${min}}`,
    `else{${minvar}=0;${maxvar}=Math.max(-${min},${max})}`
  ].join('')
  return [[minvar, maxvar], code]
}

const atanOverload: Expander = (args, namer) => {
  if (args.length === 2) return atan2(args, namer)
  return atan(args, namer)
}

export const expanders = {
  '+': add,
  '-': sub,
  '-@': minus,
  '*': mult,
  '/': div,
  '^': pow,
  sqrt,
  exp,
  log,
  sin,
  cos,
  tan,
  sinh,
  cosh,
  tanh,
  asin,
  acos,
  atan: atanOverload,
  asinh,
  acosh,
  atanh,
  hypot,
  atan2,
  pow,
  abs,
  min,
  max
}

export const specialVariables: Record<string, Expander> = {
  theta: ([x, y], namer) => atan2([y, x], namer),
  r: hypot
}
