export function convertLatex(s: string) {
  s = s.replaceAll(/\\operatorname\{[a-zA-Z0-9]+\}/g, a => a.substring(14, a.length - 1))
  const block = parse1(s)
  return convert(block)
}

type Block = (ParenGroup | AbsGroup | Block | string)[]
type ParenGroup = {
  type: 'paren'
  children: Block
}
type AbsGroup = {
  type: 'abs'
  children: Block
}

function parse1(s: string) {
  let index = 0
  const chars = [...s]
  const root: Block = []
  let current = root
  const stack = [root]
  function takeCommand() {
    let cmd = ''
    while (index < chars.length && 'a' <= chars[index] && chars[index] <= 'z') {
      cmd += chars[index]
      index++
    }
    return cmd
  }
  while (index < chars.length) {
    const c = chars[index++]
    if (c === '{') {
      const children: Block = []
      current.push(children)
      stack.push(current = children)
    } else if (c === '}') {
      stack.pop()
      current = stack[stack.length - 1]
    } else if (c === '\\') {
      const cmd = takeCommand()
      if (cmd === 'left' || cmd === 'mleft') {
        const k = chars[index++]
        const children: Block = []
        if (k === '|') current.push({ type: 'abs', children })
        else current.push({ type: 'paren', children })
        stack.push(current = children)
      } else if (cmd === 'right' || cmd === 'mright') {
        index++
        stack.pop()
        current = stack[stack.length - 1]
      } else {
        current.push(cmd)
      }
    } else {
      current.push(c)
    }
  }
  return root
}

function convert(block: Block): string {
  const elements: string[] = []
  let index = 0
  while (index < block.length) {
    const node = block[index++]
    if (Array.isArray(node)) {
      elements.push(`(${convert(node)})`)
    } else if (typeof node === 'object') {
      let s = convert(node.children)
      if (node.type === 'abs') elements.push(`abs(${s})`)
      else elements.push(`(${s})`)
    } else if (node === '^') {
      const next = block[index]
      elements.push('^')
      if (typeof next === 'string') {
        elements.push(`(${next})`)
        index++
      }
    } else if (node.length >= 2) {
      elements.push(node)
    } else {
      if (node !== ' ') elements.push(node)
    }
  }
  index = 0
  const output: string[] = []
  while (index < elements.length) {
    const s = elements[index++]
    if (s === 'frac') {
      output.push(`((${elements[index++]})/(${elements[index++]}))`)
    } else {
      output.push(s)
    }
  }
  return output.join('')
}
