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

export type FormulaProgress = {
  resolution: number
  complete: boolean
  error: string | null
}
class PolygonizeWorker {
  worker = new Worker('./dist/worker3d.js')
  state: FormulaProgress = {
    resolution: 0,
    complete: false,
    error: null
  }
  constructor(public text: string, public radius: number, public onChange: () => void, public geometry: THREE.BufferGeometry | null = null) {
    try {
      this.run()
    } catch (e) {
      this.state = { ...this.state, complete: true, error: String(e) }
      if (this.state.resolution === 0) {
        this.geometry?.dispose()
        this.geometry = null
      }
      this.onChange()
    }
  }
  run() {
    const [ast] = parse(this.text)
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

type RenderingOption = { color?: string }

type FormulaInputType = {
  text: string
  renderingOption?: RenderingOption
}

export type FormulaType = {
  id: string
  text: string
  renderingOption: RenderingOption
  progress?: FormulaProgress
}
type WorkerWatcher = {
  workers: Map<string, PolygonizeWorker>
  onUpdate?: () => void
}

function initialFormulas(originalInputs: FormulaInputType[]): FormulaType[] {
  const inputs = [...originalInputs]
  if (inputs.length === 0 || inputs[inputs.length - 1].text !== '') inputs.push({ text: '' })
  return inputs.map(({ text, renderingOption }) => ({
    id: String(Math.random()),
    text,
    renderingOption: renderingOption ?? {}
  }))
}
export type SetFormulasType = (value: FormulaType[] | ((formulas: FormulaType[]) => FormulaType[])) => void
export function useFormulas(
  inputs: FormulaInputType[], radius: number
): [FormulaType[], SetFormulasType, WorkerWatcher] {
  const [formulas, setFormulas] = useState<FormulaType[]>(() => initialFormulas(inputs))
  const workersRef = useRef<WorkerWatcher>({ workers: new Map() })
  useEffect(() => {
    const workers = workersRef.current.workers
    const update = () => {
      setFormulas(formulas => formulas.map(f => ({ ...f, progress: workers.get(f.id)?.state })))
      workersRef.current.onUpdate?.()
    }
    let changed = false
    for (const { id, text } of formulas) {
      let w = workers.get(id)
      if (!w || w.text !== text || w.radius !== radius) {
        changed = true
        const newWorker = new PolygonizeWorker(text, radius, update, w?.geometry)
        if (w) {
          w.geometry = null
          w.terminate()
        }
        workers.set(id, newWorker)
      }
    }
    const ids = new Set(formulas.map(f => f.id))
    for (const [id, w] of workers.entries()) {
      if (ids.has(id)) continue
      w.terminate()
      workers.delete(id)
    }
    if (changed) update()
  }, [formulas, radius])
  return [formulas, setFormulas, workersRef.current]
}
