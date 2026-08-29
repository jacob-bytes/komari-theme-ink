export type BlueprintStatus = 'ok' | 'warn' | 'offline'

export interface BlueprintNode {
  uuid: string
  /** 位号 = node.name */
  tag: string
  /** 副行 = remark || uuid.slice(0, 8) */
  host: string
  /** 分区名 = region || '未分区' */
  region: string
  /** 分组 = group 字段,空串归入「未分组」 */
  group: string | null
  cpu: number
  mem: number
  disk: number
  /** '84/200 GiB' */
  diskText: string
  /** B/s */
  netIn: number
  netOut: number
  /** 最新平均延迟 ms,无 ping 任务为 null */
  ping: number | null
  status: BlueprintStatus
  os: string
  kernel: string
  arch: string
  virt: string
  uptimeDays: number
  load: [number, number, number] | null
  proc: number | null
  tcp: number | null
  udp: number | null
  online: boolean
  /** 离线时相对时间,在线为 '' */
  lastSeen: string
}

export interface BlueprintZone {
  name: string
  nodes: BlueprintNode[]
  online: number
  warn: number
  offline: number
}

export interface BlueprintData {
  zones: BlueprintZone[]
  flat: BlueprintNode[]
  totals: { online: number, warn: number, offline: number }
}

/** 单节点权限/历史所需最小字段 */
export interface BlueprintHistorySeries {
  cpu: number[]
  ping: number[]
  ready: boolean
}
