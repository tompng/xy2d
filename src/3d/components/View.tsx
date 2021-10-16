import React, { useState, useEffect, useRef } from 'react'
import { astTo3DFunction, astTo3DRangeFunction } from '../../core/ast'
import { parse } from '../../core/parser'
import { View as WGLView, generateMesh } from '../view'
import type { WorkerInput, WorkerOutput } from '../worker'
import * as THREE from 'three'

export const View: React.VFC<{ onZoom: (radius: number) => void; watcher: WorkerWatcher; width: number; height: number }> = ({ onZoom, watcher, width, height }) => {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<WGLView>()
  useEffect(() => {
    const view = new WGLView()
    viewRef.current = view
    ref.current?.appendChild(view.renderer.domElement)
    view.onZoomChange = onZoom
    const meshes = new Map<string, { mesh: THREE.Mesh, geom: THREE.BufferGeometry }>()
    watcher.onUpdate = () => {
      for (const [id, worker] of watcher.workers.entries()) {
        const item = meshes.get(id)
        const geometry = worker.geometry
        if (item?.geom === geometry) continue
        if (item) view.scene.remove(item.mesh)
        if (!geometry) continue
        const mesh = generateMesh(geometry)
        view.scene.add(mesh)
        meshes.set(id, { mesh, geom: geometry })
      }
      for (const [id, item] of meshes.entries()) {
        if (watcher.workers.has(id)) continue
        view.scene.remove(item.mesh)
      }
      view.needsRender = true
      view.render()
    }
    // cannot dispose threejs renderer (view.renderer.dispose() doesnot realy release it)
  }, [])
  useEffect(() => {
    viewRef.current?.setSize(width, height)
  }, [width, height])
  return (<div style={{ width, height }} ref={ref}></div>)
}

type FormulaInputType = {
  id: string
  text: string
}

type FormulaState = {
  status: string
  resolution: number
  complete: boolean
  error: string | null
}
class PolygonizeWorker {
  worker = new Worker('./dist/worker3d.js')
  state: FormulaState = {
    status: '',
    resolution: 0,
    complete: false,
    error: null
  }
  geometry: THREE.BufferGeometry | null = null
  constructor(public exp: string, public radius: number, public onChange: () => void) {
    try {
      this.run()
    } catch (e) {
      this.state = { ...this.state, complete: true, error: String(e) }
      this.onChange()
    }
  }
  run() {
    const [ast] = parse(this.exp)
    const frange = astTo3DRangeFunction(ast, { pos: false, neg: false })
    const fvalue = astTo3DFunction(ast)
    const inputData: WorkerInput = { frange: frange.toString(), fvalue: fvalue.toString(), radius: this.radius }
    this.worker.postMessage(inputData)
    this.worker.addEventListener('message', (e: MessageEvent<WorkerOutput>) => {
      const { data } = e
      if (data.complete) {
        this.state = { ...this.state, complete: true }
        if (data.error) this.state.error = 'unknown error'
        this.onChange()
        return
      }
      const { positions, normals, resolution } = data
      console.log(resolution, positions.length / 9)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      this.state = { ...this.state, resolution }
      this.geometry?.dispose()
      this.geometry = geometry
      this.onChange()
    })
  }
  terminate() {
    if (!this.state.complete) this.worker.terminate()
    this.geometry?.dispose()
  }
}

type WorkerWatcher = { workers: WorkerMap; onUpdate?: () => void }
type WorkerMap = Map<string, PolygonizeWorker>
export function useFormulas<Input extends FormulaInputType>(
  inputs: Input[], radius: number
): [Map<string, FormulaState>, WorkerWatcher] {
  const workersRef = useRef<WorkerWatcher>({ workers: new Map() })
  const [formulas, setFormulas] = useState(() => new Map<string, FormulaState>())
  useEffect(() => {
    const workers = workersRef.current.workers
    const update = () => {
      setFormulas(new Map([...workers.entries()].map(([id, worker]) => [id, worker.state])))
      workersRef.current.onUpdate?.()
    }
    let changed = false
    for (const { id, text } of inputs) {
      let w = workers.get(id)
      if (!w || w.exp !== text || w.radius !== radius) {
        changed = true
        const newWorker = new PolygonizeWorker(text, radius, update)
        if (w) {
          newWorker.geometry = w.geometry
          w.geometry = null
          w.terminate()
        }
        workers.set(id, newWorker)
      }
    }
    const ids = new Set(inputs.map(input => input.id))
    for (const [id, w] of workers.entries()) {
      if (ids.has(id)) continue
      w.terminate()
      workers.delete(id)
    }
    if (changed) update()
  }, [inputs, radius])
  return [formulas, workersRef.current]
}
