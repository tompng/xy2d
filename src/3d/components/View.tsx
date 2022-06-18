import React, { useState, useEffect, useRef } from 'react'
import { View as WGLView, RenderingOption, SurfaceObject, DisposableDirGeometriesData } from '../view'
import type { WorkerInput, WorkerOutput } from '../worker'
import * as THREE from 'three'
import { randomColor } from './Form'
import { parseMultiple, astToValueFunctionCode, astToRangeFunctionCode, presets3D } from '../../core/multiline'

export type Camera = {
  distance: number
  xyTheta: number
  zTheta: number
  rotate: number
  radius: number
}

type ViewProps = {
  watcher: WorkerWatcher
  width: number
  height: number
  camera: Camera
  onCameraChange: (camera: Camera) => void
}
export const View = React.memo<ViewProps>(({ watcher, camera, onCameraChange, width, height }) => {
  const ref = useRef<HTMLDivElement>(null)
  const viewRef = useRef<WGLView>()
  useEffect(() => {
    const view = new WGLView()
    viewRef.current = view
    ref.current?.appendChild(view.renderer.domElement)
    const meshes = new Map<string, SurfaceObject>()
    view.onUpdate = (x, y, z) => {
      for (const obj of meshes.values()) {
        obj.switchMesh(x, y, z)
      }
    }
    watcher.onUpdate = () => {
      for (const [id, worker] of watcher.workers.entries()) {
        let item = meshes.get(id)
        const data = worker.data
        if (item && item.data !== data) {
          view.scene.remove(item.mesh)
          item.dispose()
          item = undefined
        }
        if (!data) continue
        const option = watcher.renderingOptions.get(id) ?? {}
        if (!item) {
          item = new SurfaceObject(data, option, true)
          view.scene.add(item.mesh)
          meshes.set(id, item)
        } else {
          item.update({ ...option, alpha: 0.8 }) // TODO: delete overwriting alpha
        }
      }
      for (const [id, item] of meshes.entries()) {
        if (watcher.workers.has(id)) continue
        view.scene.remove(item.mesh)
      }
      view.needsRender = true
      view.render()
    }
    return () => {
      // webglrenderer.dispose() doesnot realy release it
      console.error('cannot dispose threejs renderer')
    }
  }, [])
  useEffect(() => {
    const view = viewRef.current!
    view.xyTheta = camera.xyTheta
    view.zTheta = camera.zTheta
    view.cameraDistance = camera.distance
    const speed = -(camera.rotate ** 3 / 64)
    if (speed === 0 && view.rotation?.speed) {
      view.rotation = null
    } else if(speed !== 0 && view.rotation?.speed !== speed) {
      view.rotation = { speed, theta: view.xyTheta, time: performance.now(), paused: false }
    }
    if (view.renderRadius !== camera.radius) {
      view.renderRadius = view.zoomRadius = camera.radius
    }
    view.needsRender = true
  }, [camera])
  useEffect(() => {
    const view = viewRef.current!
    view.onZoomChange = radius => onCameraChange({ ...camera, radius })
    view.onCameraChange = (xyTheta, zTheta) => onCameraChange({ ...camera, xyTheta, zTheta })
  }, [camera, onCameraChange])
  useEffect(() => {
    viewRef.current?.setSize(width, height)
  }, [width, height])
  return (<div style={{ width, height }} ref={ref}></div>)
})

export type FormulaProgress = {
  type: 'eq' | 'var' | 'func' | null
  resolution: number
  complete: boolean
  name?: string
  value?: number
  error?: string
}

class PolygonizeWorker {
  worker = new Worker('./dist/worker3d.js')
  state: FormulaProgress = {
    type: 'eq',
    resolution: 0,
    complete: false,
  }
  constructor(public valueCode: string | null, public rangeCode: string | null, public radius: number, public onChange: () => void, transparent: boolean, public data: DisposableDirGeometriesData | null = null) {
    try {
      if (valueCode && rangeCode) {
        this.run(valueCode, rangeCode, transparent)
        console.log(valueCode, rangeCode)
      } else {
        this.data?.dispose()
        this.data = null
      }
    } catch (e) {
      this.state = { ...this.state, complete: true, error: String(e) }
      if (this.state.resolution === 0) {
        this.data?.dispose()
        this.data = null
      }
      this.onChange()
    }
  }
  run(fvalue: string, frange: string, transparent: boolean) {
    const inputData: WorkerInput = { transparent, fvalue, frange, radius: this.radius }
    this.worker.postMessage(inputData)
    this.worker.addEventListener('message', (e: MessageEvent<WorkerOutput>) => {
      const { data } = e
      if (data.type === 'complete' || data.type === 'error') {
        this.state = { ...this.state, complete: true }
        if (data.type === 'error') {
          this.state.error = 'unknown error'
        }
        this.onChange()
        return
      }
      const { positions, normals, resolution } = data
      console.log(resolution, positions.length / 9)
      const positionAttribute = new THREE.BufferAttribute(positions, 3)
      const normalAttribute = new THREE.BufferAttribute(normals, 3)
      this.data?.dispose()
      if (data.type === 'transparent') {
        const { dirIndices } = data
        const dirGeometries = dirIndices.map(({ x, y, z, indices }) => {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', positionAttribute)
          geometry.setAttribute('normal', normalAttribute)
          geometry.setIndex(new THREE.BufferAttribute(indices, 1))
          return { x, y, z, geometry }
        })
        const dispose = () => dirGeometries.map(({ geometry }) => geometry.dispose)
        this.data = { dirGeometries, dispose }
      } else {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', positionAttribute)
        geometry.setAttribute('normal', normalAttribute)
        this.data = { dirGeometries: [{ x: 0, y: 0, z: 0, geometry }], dispose: () => geometry.dispose() }
      }
      this.state = { ...this.state, resolution }
      this.onChange()
    })
  }
  terminate() {
    if (!this.state.complete) this.worker.terminate()
    this.data?.dispose()
  }
}

export type FormulaInputType = {
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
  renderingOptions: Map<string, RenderingOption>
  onUpdate?: () => void
}

function initialFormulas(originalInputs: FormulaInputType[]): FormulaType[] {
  const inputs = [...originalInputs]
  if (inputs.length === 0 || inputs[inputs.length - 1].text !== '') inputs.push({ text: '', renderingOption: { color: randomColor() } })
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
  const watcherRef = useRef<WorkerWatcher>({ workers: new Map(), renderingOptions: new Map() })
  useEffect(() => {
    const workers = watcherRef.current.workers
    const args = ['x', 'y', 'z']
    const parsedFormulas = parseMultiple(formulas.map(f => f.text), args, presets3D)

    const update = () => {
      setFormulas(formulas => formulas.map(f => ({ ...f, progress: workers.get(f.id)?.state })))
      watcherRef.current.onUpdate?.()
    }
    let changed = false
    for (let i = 0; i < formulas.length; i++) {
      const { id } = formulas[i]
      const parsed = parsedFormulas[i]
      let w = workers.get(id)
      let valueCode: string | null = null
      let rangeCode: string | null = null
      if (parsed.type === 'eq' && parsed.ast && !parsed.error) {
        try {
          valueCode =  astToValueFunctionCode(parsed.ast, args)
          rangeCode =  astToRangeFunctionCode(parsed.ast, args, { pos: false, neg: false })
        } catch(e) {
          valueCode = rangeCode = null
          parsed.error = String(e)
        }
      }
      if (!w || w.valueCode !== valueCode || w.rangeCode !== rangeCode || w.radius !== radius) {
        changed = true
        const prevData = w?.data
        w?.terminate()
        const transparent = true
        w = new PolygonizeWorker(valueCode, rangeCode, radius, update, transparent, prevData)
        workers.set(id, w)
      }
      let nextState: FormulaProgress | null = null
      if (parsed.error) {
        nextState = {
          type: null,
          resolution: 0,
          complete: true,
          error: parsed.error
        }
      } else if (parsed.type !== 'eq') {
        nextState = {
          type: parsed.type,
          resolution: 0,
          complete: true,
          name: parsed.name,
          value: typeof parsed.ast === 'number' ? parsed.ast : undefined
        }
      }
      if (nextState && JSON.stringify(nextState) !== JSON.stringify(w.state)) {
        w.state = nextState
        changed = true
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
  useEffect(() => {
    watcherRef.current.renderingOptions = new Map(formulas.map(f => [f.id, f.renderingOption]))
    watcherRef.current.onUpdate?.()
  }, [formulas])
  return [formulas, setFormulas, watcherRef.current]
}
