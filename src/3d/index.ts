import { astTo3DFunction, astTo3DRangeFunction } from '../ast'
import { parse } from '../parser'
import { Range3D, splitRanges, polygonize } from './polygonizer'

;(window as any).parse = parse

function test() {
  // const exp = 'x*x+y*y+sin(z)^4-1=0'
  const exp = 'sin(5xy+1)+sin(5yz+2)+sin(5zx+3)-1/2=0'
  let [ast, mode] = parse(exp)
  const frange = astTo3DRangeFunction(ast, { pos: false, neg: false })
  const fvalue = astTo3DFunction(ast)
  ;(window as any).frange = frange
  ;(window as any).fvalue = fvalue
  const ranges: Range3D[] = [[-1,1,-1,1,-1,1]]
  let levels = ranges
  while (true) {
    const t = performance.now()
    levels = splitRanges(frange, levels)
    console.log({ time: performance.now()-t, count: levels.length, size: (ranges[0][1]-ranges[0][0])/(levels[0][1]-levels[0][0]) })
    const t2 = performance.now()
    for (const [x,x2,y,y2,z,z2] of levels) {
      for (let i = 0; i <= 4; i++)for (let j = 0; j <= 4; j++)for (let k = 0; k <= 4; k++) fvalue(x+(x2-x)*i/4,y+(y2-y)*j/4,z+(z2-z)*k/4)
    }
    console.log({ time: performance.now()-t2, count: levels.length*125 })
    if (levels.length > 100000) break
  }
}
// test()

onload = polygonizeTest
function polygonizeTest() {
  const ranges: Range3D[] = [[-1,1,-1,1,-1,1]]
  const polygons = polygonize((x,y,z)=>x*x+y*y+(z-1)**2-0.9, ranges, 20)
  
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  document.body.appendChild(canvas)
  canvas.width = 512
  canvas.height = 512
  ctx.lineWidth = 0.1
  for (let i = 0; i < polygons.length; i += 9) {
    const [x1, y1, z1, x2, y2, z2, x3, y3, z3] = polygons.slice(i, i + 9)
    ctx.beginPath()
    ctx.moveTo(256 + 128 * x1, 256 + 128 * y1)
    ctx.lineTo(256 + 128 * x2, 256 + 128 * y2)
    ctx.lineTo(256 + 128 * x3, 256 + 128 * y3)
    ctx.stroke()
    ctx.beginPath()
    ctx.fill()
  }
}