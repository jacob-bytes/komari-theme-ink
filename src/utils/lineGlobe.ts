import type { LonLat } from '@/data/world-outlines'

/**
 * 线状图纸地球的核心投影与几何纯函数（正交投影，无第三方依赖）。
 * 与 blueprint/svg.ts 的零依赖风格一致；组件只负责 UI 与交互。
 */

export interface GlobePoint {
  x: number
  y: number
  /** 球面前向（朝向观察者），用于裁剪背面 */
  visible: boolean
  /** 深度（0~1，越近越大），用于背面渐隐 */
  z: number
}

/**
 * 正交投影：经纬度 + 球心 (centerLon, centerLat) → SVG 平面坐标。
 * 返回坐标系以 (cx, cy) 为圆心、radius 为半径。
 */
export function ortho(
  lon: number,
  lat: number,
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
): GlobePoint {
  const lambda = (lon - centerLon) * Math.PI / 180
  const phi = lat * Math.PI / 180
  const phi0 = centerLat * Math.PI / 180
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const cosPhi0 = Math.cos(phi0)
  const sinPhi0 = Math.sin(phi0)
  const x = cosPhi * Math.sin(lambda)
  const y = cosPhi0 * sinPhi - sinPhi0 * cosPhi * Math.cos(lambda)
  const z = sinPhi0 * sinPhi + cosPhi0 * cosPhi * Math.cos(lambda)
  return {
    x: cx + radius * x,
    y: cy - radius * y,
    visible: z > 0.02,
    z,
  }
}

/** 海岸线多边形 → SVG path（背面可见时断开，形成裁剪） */
export function coastPath(
  polygon: LonLat[],
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
): string {
  let d = ''
  let pen = false
  for (const [lon, lat] of polygon) {
    const p = ortho(lon, lat, centerLon, centerLat, cx, cy, radius)
    if (!p.visible) {
      pen = false
      continue
    }
    d += pen ? `L${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    pen = true
  }
  return d
}

/** 经线（每 step 度一条，从 -90 到 90 纬度采样） */
export function meridianPaths(
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
  step = 30,
): string[] {
  const out: string[] = []
  for (let lon = -180; lon < 180; lon += step) {
    let d = ''
    let pen = false
    for (let lat = -90; lat <= 90; lat += 4) {
      const p = ortho(lon, lat, centerLon, centerLat, cx, cy, radius)
      if (!p.visible) {
        pen = false
        continue
      }
      d += pen ? `L${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      pen = true
    }
    if (d)
      out.push(d)
  }
  return out
}

/** 纬线（每 step 度一条，经度全周采样） */
export function parallelPaths(
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
  step = 30,
): string[] {
  const out: string[] = []
  for (let lat = -80; lat <= 80; lat += step) {
    let d = ''
    let pen = false
    for (let lon = -180; lon <= 180; lon += 4) {
      const p = ortho(lon, lat, centerLon, centerLat, cx, cy, radius)
      if (!p.visible) {
        pen = false
        continue
      }
      d += pen ? `L${p.x.toFixed(1)} ${p.y.toFixed(1)}` : `M${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      pen = true
    }
    if (d)
      out.push(d)
  }
  return out
}

/**
 * 节点坐标 → 投影点；背面返回 null。
 * 注意：coord 为 [lat, lng]（Komari 节点/聚合簇的坐标顺序），内部交换为 (lon, lat)。
 */
export function projectNode(
  coord: LonLat,
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
): GlobePoint | null {
  const p = ortho(coord[1], coord[0], centerLon, centerLat, cx, cy, radius)
  return p.visible ? p : null
}

export interface GlobeLabelRow {
  side: 'left' | 'right'
  name: string
  anchorX: number
  textY: number
  dotX: number
  dotY: number
  /** 节点深度（用于背面渐隐） */
  z: number
  /** 折线引线的弯折点 X（球缘外侧水平折点） */
  bendX: number
}

/**
 * 左右标签布局（防重叠：每侧按投影 y 排序后按动态行高堆叠）。
 * 行高随每侧数量自适应压缩（密集时自动减小间距，避免出界/交叉）。
 */
export function layoutLabels(
  items: Array<{ name: string, point: GlobePoint, side: 'left' | 'right' }>,
  cx: number,
  cy: number,
  radius: number,
): GlobeLabelRow[] {
  const left: Array<{ name: string, point: GlobePoint, side: 'left' | 'right' }> = []
  const right: Array<{ name: string, point: GlobePoint, side: 'left' | 'right' }> = []
  for (const item of items)
    (item.side === 'left' ? left : right).push(item)
  const pack = (rows: typeof left, alignLeft: boolean): GlobeLabelRow[] => {
    if (!rows.length)
      return []
    // 动态行高：可用高（球高）除以侧标签数，压缩区间 [16, 24]
    const rowHeight = Math.min(24, Math.max(16, (radius * 2) / rows.length))
    return rows
      .sort((a, b) => a.point.y - b.point.y)
      .map((item, index) => {
        const y = cy - ((rows.length - 1) * rowHeight) / 2 + index * rowHeight
        const anchorX = alignLeft ? cx - radius - 28 : cx + radius + 28
        const bendX = alignLeft ? cx - radius - 18 : cx + radius + 18
        return {
          side: item.side,
          name: item.name,
          anchorX,
          textY: y,
          dotX: item.point.x,
          dotY: item.point.y,
          z: item.point.z,
          bendX,
        }
      })
  }
  return [...pack(left, true), ...pack(right, false)]
}

/** 视场状态栏文本：ORTHOGRAPHIC · 107°E 30°N · MEDIUM */
export function formatViewportStatus(lon: number, lat: number): string {
  const lonPart = `${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}`
  const latPart = `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}`
  return `ORTHOGRAPHIC · ${lonPart} ${latPart} · MEDIUM`
}

/** 雷达扫描折线（可见点序列，null 表示背面断点） */
export interface ScanPolyline {
  pts: Array<{ x: number, y: number } | null>
  alpha: number
  width: number
}

/**
 * 球面扫描弧族：以 theta（弧度）为扫描中心的多条经线弧，
 * 每条弧经正交投影后为贴合曲率的弯曲弧线（背面自动剔除，null 断开）。
 * 用于雷达扫描线 3D 呈现（方案 B：球面弧线拟合，零依赖）。
 */
export function scanArcPoints(
  centerLon: number,
  centerLat: number,
  cx: number,
  cy: number,
  radius: number,
  theta: number,
  segments = 2,
  sweep = 0.35,
): ScanPolyline[] {
  const out: ScanPolyline[] = []
  for (let i = 0; i < segments; i++) {
    const arcLon = centerLon + theta * 180 / Math.PI - (sweep * i * 180 / Math.PI) / segments
    const pts: Array<{ x: number, y: number } | null> = []
    let pen = false
    for (let lat = -84; lat <= 84; lat += 4) {
      const p = ortho(arcLon, lat, centerLon, centerLat, cx, cy, radius)
      if (!p.visible) {
        pen = false
        continue
      }
      if (!pen)
        pts.push(null)
      pts.push({ x: p.x, y: p.y })
      pen = true
    }
    out.push({
      pts,
      alpha: i === 0 ? 0.6 : 0.1,
      width: i === 0 ? 1.5 : 1,
    })
  }
  return out
}
