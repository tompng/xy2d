export type MinMaxVarName = [string, string]
export type Expander = (a: MinMaxVarName | number, b: MinMaxVarName | number, namer: NameGenerator) => [MinMaxVarName | number, string]
export type NameGenerator = () => string

const add: Expander = (a, b, namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a + b, '']
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar} = ${typeof a === 'number' ? a : a[0]} + ${typeof b === 'number' ? b : b[0]}`
  const maxcode = `const ${maxvar} = ${typeof a === 'number' ? a : a[1]} + ${typeof b === 'number' ? b : b[1]}`
  return [[minvar, maxvar], `${mincode};${maxcode}`]
}
const sub: Expander = (a, b, namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a - b, '']
  const minvar = namer()
  const maxvar = namer()
  const mincode = `const ${minvar} = ${typeof a === 'number' ? a : a[0]} - ${typeof b === 'number' ? b : b[1]}`
  const maxcode = `const ${maxvar} = ${typeof a === 'number' ? a : a[1]} - ${typeof b === 'number' ? b : b[0]}`
  return [[minvar, maxvar], `${mincode};${maxcode}`]
}
const mult: Expander = (a, b, namer) => {
  if (typeof a === 'number' && typeof b === 'number') return [a * b, '']
  const minvar = namer()
  const maxvar = namer()
  if (typeof a === 'number' || typeof b === 'number') {
    const n = typeof a === 'number' ? a : b as number
    const [minname, maxname] = typeof a !== 'number' ? a : b as MinMaxVarName
    if (n === 0) return [0, '']
    const mincode = `const ${minvar} = ${n > 0 ? minname : maxname} * ${n}`
    const maxcode = `const ${maxvar} = ${n > 0 ? maxname : minname} * ${n}`
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
function inv([min, max]: MinMaxVarName, namer: NameGenerator): [MinMaxVarName, string] {
  const minvar = namer()
  const maxvar = namer()
  const codes = [
    `let ${minvar},${maxvar};`,
    `if(${min}<=0&&0<=${max}){${minvar}=${min}===0&&${max}!==0?1/${max}:-Infinity;${maxvar}=${min}!==0&&${max}===0?1/${min}:Infinity}`,
    `else{${minvar}=1/${max};${maxvar}=1/${min}}`
  ]
  return [[minvar, maxvar], codes.join('')]
}
const div: Expander = (a, b, namer) => {
  if (typeof b === 'number') return mult(a, 1 / b, namer)
  const [binv, invcode] = inv(b, namer)
  const [result, multcode] = mult(a, binv, namer)
  return [result, `${invcode};${multcode}`]
}

export const expanders = {
  '+': add,
  '-': sub,
  '*': mult,
  '/': div
}
