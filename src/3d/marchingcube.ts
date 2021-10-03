type CoordPair = [number, number]
function marchingCubePatternByBit(bit: number) {
  function bitAt(i: number) { return ((bit>>i) & 1) as 0 | 1}
  let bitcount = 0
  for (let i = 0; i < 8; i++) bitcount += bitAt(i)
  const output: CoordPair[] = []
  for(let coord = 0; coord < 8; coord++) {
    const cval = bitAt(coord)
    const ca = coord ^ 1
    const cb = coord ^ 2
    const cc = coord ^ 4
    const a = bitAt(ca)
    const b = bitAt(cb)
    const c = bitAt(cc)
    const aeq = a === cval
    const beq = b === cval
    const ceq = c === cval
    if (!aeq && !beq && !ceq) {
      // 1頂点パターン
      output.push([coord, ca], [coord, cb], [coord, cc])
    }
    if (bitcount === 4 && cval + a + b + c === 4) {
      // 4点中心連結パターン
      const p0: CoordPair = [ca, ca ^ 2]
      const p1: CoordPair = [ca, ca ^ 4]
      const p2: CoordPair = [cc, cc ^ 1]
      const p3: CoordPair = [cc, cc ^ 2]
      const p4: CoordPair = [cb, cb ^ 4]
      const p5: CoordPair = [cb, cb ^ 1]
      output.push(
        p0, p1, p2,
        p0, p2, p5,
        p5, p2, p3,
        p5, p3, p4
      )
    }
    if ((bitcount === 3 && cval === 1 && a + b + c === 2) || (bitcount === 5 && cval === 0 && a + b + c == 1)) {
      // 3点連結パターン
      const axis = !aeq ? 1 : !beq ? 2 : 4
      const [a1, a2] = [1, 2, 4].filter(a => a != axis)
      const p0: CoordPair = [coord, coord ^ axis]
      const p1: CoordPair = [coord ^ a1, coord ^ a1 ^ axis]
      const p2: CoordPair = [coord ^ a1, coord ^ a1 ^ a2]
      const p3: CoordPair = [coord ^ a2, coord ^ a1 ^ a2]
      const p4: CoordPair = [coord ^ a2, coord ^ a2 ^ axis]
      output.push(p0, p1, p2, p0, p2, p3, p0, p3, p4)
    }
    for (const [pair, pval] of [[ca, a], [cb, b], [cc, c]]) {
      if (cval !== pval || pair < coord) continue
      const n1 = (cval == a ? 1 : 0) + (cval == b ? 1 : 0) + (cval == c ? 1 : 0)
      const n2 = (pval === bitAt(pair ^ 1) ? 1 : 0) + (pval === bitAt(pair ^ 2) ? 1 : 0) + (pval === bitAt(pair ^ 4) ? 1 : 0)
      if (n1 !== 1 || n2 !== 1) continue
      // 2点連結パターン(TODO: 曖昧パターン)
      const axis = coord ^ pair
      const [a1, a2] = [1, 2, 4].filter(a => a != axis)
      const p0: CoordPair = [coord, coord ^ a1]
      const p1: CoordPair = [coord, coord ^ a2]
      const p2: CoordPair = [pair, pair ^ a2]
      const p3: CoordPair = [pair, pair ^ a1]
      output.push(p0, p1, p2, p0, p2, p3)
    }
  }
  if (bitcount === 4) {
    for (let coord = 0; coord < 4; coord++) {
      if (bitAt(coord) !== 1) continue
      for (const [a1, a2, a3] of [[1, 2, 4], [1, 4, 2], [2, 1, 4], [2, 4, 1], [4, 1, 2], [4, 2, 1]]) {
        if (bitAt(coord ^ a1) === 1 && bitAt(coord ^ a1 ^ a2) === 1 && bitAt(coord ^ a1 ^ a2 ^ a3) === 1) {
          // 4点連結ジグザグパターン
          const p0: CoordPair = [coord, coord ^ a3]
          const p1: CoordPair = [coord, coord ^ a2]
          const p2: CoordPair = [coord ^ a1 ^ a2, coord ^ a2]
          const p3: CoordPair = [coord ^ a1 ^ a2 ^ a3, coord ^ a2 ^ a3]
          const p4: CoordPair = [coord ^ a1 ^ a2 ^ a3, coord ^ a1 ^ a3]
          const p5: CoordPair = [coord ^ a1, coord ^ a1 ^ a3]
          output.push(p0, p1, p2, p0, p2, p5)
          output.push(p5, p2, p3, p3, p4, p5)
        }
      }
    }
    for (let axis of [1, 2, 4]) {
      let sum = 0
      for (let coord = 0; coord < 8; coord++) sum += bitAt(coord & (~axis))
      if (sum === 0 || sum === 8) {
        // 4点連結平面パターン
        const [a1, a2] = [1, 2, 4].filter(a => a != axis)
        const p0: CoordPair = [0, axis]
        const p1: CoordPair = [a1, a1 | axis]
        const p2: CoordPair = [a1 | a2, 7]
        const p3: CoordPair = [a2, a2 | axis]
        output.push(p0, p1, p2, p0, p2, p3)
      }
    }
  }
  return output
}
export function generateMarchingCubeTable() {
  const pattern: number[][] = []
  const edgeByPair = new Map<number, number>()
  function addEdge(a: number, b: number) {
    const id = edgeByPair.size / 2
    edgeByPair.set(a * 8 + b, id)
    edgeByPair.set(b * 8 + a, id)
  }
  const xy = [0, 1, 3, 2]
  xy.forEach((c, i) => addEdge(c, xy[(i + 1) % 4]))
  xy.forEach(c => addEdge(c, c | 4))
  xy.forEach((c, i) => addEdge(c | 4, xy[(i + 1) % 4] | 4))
  for(let bit = 0; bit < 256; bit++) {
    const pairs = marchingCubePatternByBit(bit)
    const edgePoints = pairs.map(([a, b]) => edgeByPair.get(a * 8 + b)!)
    pattern[bit] = edgePoints
  }
  return pattern
}
