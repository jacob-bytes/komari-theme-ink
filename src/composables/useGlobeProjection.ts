import type { GeoProjection, GeoRawProjection } from 'd3-geo'
import { drag as d3Drag } from 'd3-drag'
import { geoEquirectangularRaw, geoOrthographicRaw, geoProjection } from 'd3-geo'
import { select } from 'd3-selection'
import { onScopeDispose, ref } from 'vue'

/** 球面(orthographic)↔平面(equirectangular)插值投影：t=0 纯球面，t=1 纯平面 */
function interpolateRaw(t: number): GeoRawProjection {
  return (lambda: number, phi: number) => {
    const [ox, oy] = geoOrthographicRaw(lambda, phi)
    const [ex, ey] = geoEquirectangularRaw(lambda, phi)
    // 等距矩形投影原始输出范围是 [-π,π]×[-π/2,π/2]，除以 π 归一化到与正射投影一致的 [-1,1] 量级，
    // 这样两端可以复用同一个 scale()，插值过程中不需要额外补偿缩放比例
    const nex = ex / Math.PI
    const ney = ey / Math.PI
    return [ox + t * (nex - ox), oy + t * (ney - oy)]
  }
}

export interface GlobeProjectionOptions {
  /** 拖拽旋转的像素->角度灵敏度，默认 0.28 */
  dragSensitivity?: number
  /** 空闲自动缓慢旋转的角速度（度/帧），默认 0.06 */
  autoRotateSpeed?: number
}

export type GlobeMode = 'globe' | 'map'

/**
 * 管理地球/地图投影插值过渡、拖拽旋转与惯性、自动缓慢旋转的组合式函数。
 * 只负责交互状态与投影对象生成，画布绘制与节点标记定位由调用方在每帧读取 projection() 结果完成。
 */
export function useGlobeProjection(options: GlobeProjectionOptions = {}) {
  const dragSensitivity = options.dragSensitivity ?? 0.28
  const autoRotateSpeed = options.autoRotateSpeed ?? 0.06

  const mode = ref<GlobeMode>('globe')
  // 0 = 纯球面，1 = 纯平面地图
  const transitionProgress = ref(0)
  // [lambda, phi, gamma] 单位：度
  const rotation = ref<[number, number, number]>([-10, -20, 0])
  const isDragging = ref(false)
  const autoRotateEnabled = ref(true)

  let transitionRaf = 0
  let inertiaRaf = 0
  let autoRotateRaf = 0
  let focusRaf = 0
  let lastPointer: { x: number, y: number } | null = null
  let velocity = { x: 0, y: 0 }
  let resumeAutoRotateTimer: ReturnType<typeof setTimeout> | null = null

  function easeCubicInOut(x: number): number {
    return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
  }

  function stopTransitionAnimation(): void {
    if (transitionRaf) {
      cancelAnimationFrame(transitionRaf)
      transitionRaf = 0
    }
  }

  function animateTransition(target: number): void {
    stopTransitionAnimation()
    const start = transitionProgress.value
    const distance = target - start
    if (Math.abs(distance) < 0.001) {
      transitionProgress.value = target
      return
    }
    const duration = 650
    const startTime = performance.now()
    const step = (now: number) => {
      const elapsed = now - startTime
      const rawT = Math.min(1, elapsed / duration)
      transitionProgress.value = start + distance * easeCubicInOut(rawT)
      if (rawT < 1)
        transitionRaf = requestAnimationFrame(step)
      else
        transitionRaf = 0
    }
    transitionRaf = requestAnimationFrame(step)
  }

  function toggleMode(): void {
    mode.value = mode.value === 'globe' ? 'map' : 'globe'
    animateTransition(mode.value === 'map' ? 1 : 0)
  }

  function setMode(next: GlobeMode): void {
    if (mode.value === next)
      return
    mode.value = next
    animateTransition(next === 'map' ? 1 : 0)
  }

  function stopInertia(): void {
    if (inertiaRaf) {
      cancelAnimationFrame(inertiaRaf)
      inertiaRaf = 0
    }
  }

  function stopAutoRotate(): void {
    if (autoRotateRaf) {
      cancelAnimationFrame(autoRotateRaf)
      autoRotateRaf = 0
    }
  }

  function clampPhi(phi: number): number {
    return Math.max(-89, Math.min(89, phi))
  }

  function runAutoRotate(): void {
    stopAutoRotate()
    if (!autoRotateEnabled.value || isDragging.value)
      return
    const step = () => {
      const [lambda, phi, gamma] = rotation.value
      rotation.value = [lambda + autoRotateSpeed, phi, gamma]
      autoRotateRaf = requestAnimationFrame(step)
    }
    autoRotateRaf = requestAnimationFrame(step)
  }

  function scheduleAutoRotateResume(): void {
    if (resumeAutoRotateTimer)
      clearTimeout(resumeAutoRotateTimer)
    resumeAutoRotateTimer = setTimeout(() => {
      runAutoRotate()
    }, 2200)
  }

  function applyInertia(): void {
    stopAutoRotate()
    const friction = 0.92
    const step = () => {
      velocity = { x: velocity.x * friction, y: velocity.y * friction }
      if (Math.hypot(velocity.x, velocity.y) < 0.01) {
        inertiaRaf = 0
        scheduleAutoRotateResume()
        return
      }
      const [lambda, phi, gamma] = rotation.value
      rotation.value = [lambda + velocity.x, clampPhi(phi - velocity.y), gamma]
      inertiaRaf = requestAnimationFrame(step)
    }
    inertiaRaf = requestAnimationFrame(step)
  }

  function bindDrag(el: HTMLElement): () => void {
    const selection = select(el)
    const behavior = d3Drag<HTMLElement, unknown>()
      .on('start', (event) => {
        isDragging.value = true
        stopInertia()
        stopAutoRotate()
        if (resumeAutoRotateTimer)
          clearTimeout(resumeAutoRotateTimer)
        lastPointer = { x: event.x, y: event.y }
        velocity = { x: 0, y: 0 }
      })
      .on('drag', (event) => {
        if (!lastPointer)
          return
        const dx = event.x - lastPointer.x
        const dy = event.y - lastPointer.y
        lastPointer = { x: event.x, y: event.y }
        const vx = dx * dragSensitivity
        const vy = dy * dragSensitivity
        velocity = { x: vx, y: vy }
        const [lambda, phi, gamma] = rotation.value
        rotation.value = [lambda + vx, clampPhi(phi - vy), gamma]
      })
      .on('end', () => {
        isDragging.value = false
        lastPointer = null
        applyInertia()
      })
    selection.call(behavior)
    runAutoRotate()
    return () => {
      selection.on('.drag', null)
      stopInertia()
      stopAutoRotate()
      if (resumeAutoRotateTimer)
        clearTimeout(resumeAutoRotateTimer)
    }
  }

  function setAutoRotate(enabled: boolean): void {
    autoRotateEnabled.value = enabled
    if (enabled)
      runAutoRotate()
    else
      stopAutoRotate()
  }

  function stopFocusAnimation(): void {
    if (focusRaf) {
      cancelAnimationFrame(focusRaf)
      focusRaf = 0
    }
  }

  /** 将经度差归一化到 [-180, 180]，保证旋转走最短路径而不是绕远路 */
  function normalizeLambdaDelta(delta: number): number {
    let d = delta % 360
    if (d > 180)
      d -= 360
    if (d < -180)
      d += 360
    return d
  }

  /** 平滑旋转地球，使指定经纬度的地区转到正面中心。仅用于球面态，地图态旋转没有意义 */
  function focusOn(lon: number, lat: number, durationMs = 700): void {
    stopInertia()
    stopAutoRotate()
    stopFocusAnimation()
    if (resumeAutoRotateTimer)
      clearTimeout(resumeAutoRotateTimer)

    const [startLambda, startPhi, startGamma] = rotation.value
    const targetLambda = startLambda + normalizeLambdaDelta(-lon - startLambda)
    const targetPhi = clampPhi(-lat)
    const deltaLambda = targetLambda - startLambda
    const deltaPhi = targetPhi - startPhi
    const startTime = performance.now()

    const step = (now: number) => {
      const elapsed = now - startTime
      const rawT = Math.min(1, elapsed / durationMs)
      const eased = easeCubicInOut(rawT)
      rotation.value = [startLambda + deltaLambda * eased, startPhi + deltaPhi * eased, startGamma]
      if (rawT < 1) {
        focusRaf = requestAnimationFrame(step)
      }
      else {
        focusRaf = 0
        scheduleAutoRotateResume()
      }
    }
    focusRaf = requestAnimationFrame(step)
  }

  /** 根据当前过渡进度与旋转状态构造投影对象，供 Canvas 绘制与坐标计算复用 */
  function buildProjection(width: number, height: number): GeoProjection {
    const t = transitionProgress.value
    const projection = geoProjection(interpolateRaw(t)) as GeoProjection
    // 球面直径占容器较小边的比例调低一些，给外层卡片边框留出呼吸空间，不让地球紧贴边缘
    const scale = Math.min(width, height) / 2.3
    projection
      .scale(scale)
      .translate([width / 2, height / 2])
      .rotate(rotation.value)
      .precision(0.3)
    if (t >= 0.999) {
      // 完全进入平面地图态：小圆裁剪角=180° 在数值上是退化情形（裁剪圆退化为一个点），
      // 会让 d3.geoPath 在计算经纬网格/陆地边界与裁剪圆的交点时产生穿越整张画布的杂散线段
      // （表现为地图上多条不该出现的水平横线）。此时切换回 d3 默认的"反经线裁剪"，
      // 行为与标准等距矩形投影一致，从根源上消除这条杂散线，而不是靠隐藏网格来遮掩问题
      projection.clipAngle(null)
    }
    else {
      // 球面态裁剪角为 90°（只显示正面半球）；随 t 增大朝平面态过渡时逐步放宽，
      // 制造"背面地区逐渐展开显现"的过渡动画效果
      projection.clipAngle(90 + t * 90)
    }
    return projection
  }

  /**
   * 判断经纬度点是否在当前裁剪角范围内可见。Canvas 绘制的陆地/网格由 d3.geoPath 自动裁剪，
   * 但节点标记是单独定位的 DOM 元素，需要手动做同样的可见性��断才能正确隐藏/淡出背面点位
   */
  function isPointVisible(lon: number, lat: number): boolean {
    const t = transitionProgress.value
    // 平面地图态改用反经线裁剪（见 buildProjection），不再按到球心的角距离隐藏点位，
    // 地图上任意经纬度点都应当可见
    if (t >= 0.999)
      return true
    const clipDeg = 90 + t * 90
    const [rl, rp] = rotation.value
    const centerLon = -rl
    const centerLat = -rp
    const toRad = Math.PI / 180
    const phi1 = lat * toRad
    const phi2 = centerLat * toRad
    const dLambda = (lon - centerLon) * toRad
    const cosc = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda)
    const distDeg = Math.acos(Math.max(-1, Math.min(1, cosc))) * (180 / Math.PI)
    return distDeg <= clipDeg
  }

  onScopeDispose(() => {
    stopTransitionAnimation()
    stopInertia()
    stopAutoRotate()
    stopFocusAnimation()
    if (resumeAutoRotateTimer)
      clearTimeout(resumeAutoRotateTimer)
  })

  return {
    mode,
    transitionProgress,
    rotation,
    isDragging,
    autoRotateEnabled,
    toggleMode,
    setMode,
    bindDrag,
    setAutoRotate,
    buildProjection,
    isPointVisible,
    focusOn,
  }
}
