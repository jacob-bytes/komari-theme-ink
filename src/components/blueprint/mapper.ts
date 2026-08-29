import type { BlueprintData, BlueprintNode, BlueprintStatus, BlueprintZone } from './types'
import type { NodeData } from '@/stores/nodes'

export const BLUEPRINT_WARN_THRESHOLD = 85

/** 已用/总量 → 0-100 百分比（ram/disk 是字节字段，需换算）；总量无效时返回 0 */
function percent(used: number | null | undefined, total: number | null | undefined): number {
  if (!Number.isFinite(used) || !Number.isFinite(total) || (total ?? 0) <= 0)
    return 0
  return Math.min(100, Math.max(0, ((used ?? 0) / (total!)) * 100))
}

/** 四舍五入到 1 位小数 */
function round1(v: number): number {
  return Math.round(v * 10) / 10
}

function fmtDiskText(n: NodeData): string {
  const total = n.disk_total ?? 0
  const used = n.disk ?? 0
  return `${Math.round(used / 1024 ** 3)}/${Math.round(total / 1024 ** 3)} GiB`
}

function relativeLastSeen(iso?: string): string {
  if (!iso)
    return '未知'
  const diff = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0)
    return '未知'
  const h = Math.floor(diff / 3600_000)
  if (h >= 1)
    return `${h} 小时前`
  return `${Math.max(1, Math.floor(diff / 60_000))} 分钟前`
}

function deriveStatus(n: NodeData): BlueprintStatus {
  if (!n.online)
    return 'offline'
  // ram/disk 是字节字段，必须换算成百分比再与阈值比较
  return (n.cpu >= BLUEPRINT_WARN_THRESHOLD || percent(n.ram, n.mem_total) >= BLUEPRINT_WARN_THRESHOLD) ? 'warn' : 'ok'
}

export function mapNode(n: NodeData, pingAvg?: number | null): BlueprintNode {
  const status = deriveStatus(n)
  const load: [number, number, number] | null = n.online && n.load != null
    ? [n.load, n.load5, n.load15]
    : null
  return {
    uuid: n.uuid,
    tag: n.name,
    host: n.public_remark || n.remark || '-',
    region: n.region || '未分区',
    group: n.group || null,
    cpu: round1(n.cpu ?? 0),
    mem: round1(percent(n.ram, n.mem_total)),
    disk: round1(percent(n.disk, n.disk_total)),
    diskText: fmtDiskText(n),
    netIn: n.net_in ?? 0,
    netOut: n.net_out ?? 0,
    ping: pingAvg != null && pingAvg > 0 ? Math.round(pingAvg) : null,
    status,
    os: n.os || '未知系统',
    kernel: n.kernel_version || '—',
    arch: n.arch || '—',
    virt: n.virtualization || '—',
    uptimeDays: n.uptime != null ? Math.floor(n.uptime / 86400) : 0,
    load,
    proc: n.online ? (n.process ?? null) : null,
    tcp: n.online ? (n.connections ?? null) : null,
    udp: n.online ? (n.connections_udp ?? null) : null,
    online: n.online,
    lastSeen: n.online ? '' : relativeLastSeen(n.status_updated_at ?? n.time),
  }
}

/** pingAvgByUuid:节点平均延迟(由 ping composable 层提供);缺省时延迟列为 null */
export function mapNodes(nodes: NodeData[], pingAvgByUuid?: Map<string, number | null>): BlueprintData {
  const flat = nodes.map(n => mapNode(n, pingAvgByUuid?.get(n.uuid) ?? null))
  const byRegion = new Map<string, BlueprintNode[]>()
  for (const n of flat) {
    const list = byRegion.get(n.region) ?? []
    list.push(n)
    byRegion.set(n.region, list)
  }
  const zones: BlueprintZone[] = Array.from(byRegion.entries(), ([name, ns]) => ({
    name,
    nodes: ns,
    online: ns.filter(x => x.status !== 'offline').length,
    warn: ns.filter(x => x.status === 'warn').length,
    offline: ns.filter(x => x.status === 'offline').length,
  }))
    .sort((a, b) => b.nodes.length - a.nodes.length)
  return {
    zones,
    flat,
    totals: {
      online: flat.filter(n => n.status !== 'offline').length,
      warn: flat.filter(n => n.status === 'warn').length,
      offline: flat.filter(n => n.status === 'offline').length,
    },
  }
}
