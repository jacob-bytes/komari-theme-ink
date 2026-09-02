import type { StatusRecord } from '@/utils/rpc'
import dayjs from 'dayjs'

/**
 * Uptime 历史时间轴 —— 近似估算说明
 *
 * 后端没有独立的上线/下线事件日志（无 incident/outage 表），只有周期性上报的
 * StatusRecord 时间序列。因此这里采用「按天分桶 + 上报密度」的启发式估算：
 * 一个自然日内实际收到的上报次数，相对该节点当天理论应有的上报次数的比例，
 * 决定当天被判定为 ok / degraded / down / no-data。
 *
 * 这是估算口径，不是精确的 SLA 可用率：
 * - 掉线又恢复但发生在同一天、且当天其余时段上报正常，会被计入 ok（被日粒度平均掉）；
 * - 节点上报间隔本身会漂移（网络抖动、Agent 重启等），密度阈值只能是相对宽松的判断；
 * - 因此 UI 上必须明确标注「估算」，不能包装成精确的可用率数字。
 */

/**
 * 估算「在当前记录条数上限（maxRecordCount）下，能被密集样本真正覆盖的天数」。
 *
 * 背景（真实 bug，不是数据碰巧一致）：请求历史记录时会带一个固定的 maxRecordCount 上限
 * （见 LOAD_RECORD_MAX_COUNT），而后端在超出上限时只会返回时间窗口内最新的一段记录。
 * 如果节点上报间隔很短（比如每 30 秒一条），几天的窗口就足以超过这个上限——于是请求 7、14 天
 * 却实际只拿到最近一两天的密集数据，更早的日期不是「节点真的没有历史/离线」，而是「压根没请求到」。
 * 之前的实现把这些被截断掉的早期日期一律标成 no-data（灰色），导致几乎所有上报频率相近的节点
 * 都呈现出「前面几天灰、最后一两天才有颜色」的相同形状，看起来像是所有服务器数据都一样。
 *
 * 修复思路：不再盲目按配置的天数（timelineDays）铺满时间轴，而是先用已拿到的记录估算出
 * 真实的上报间隔，反推这批 maxRecordCount 条记录理论上能撑起多少天的「密集覆盖」，
 * 时间轴只按这个真实可信的天数渲染——上报越频繁的节点，可信窗口越短；上报越稀疏的节点，
 * 可信窗口越长。不同节点会因为各自真实的上报节奏而展示出不同的天数/形状，而不是被统一的
 * 截断误判成看起来一样。
 */
export function estimateCoverableDays(
  records: Pick<StatusRecord, 'time'>[],
  maxRecordCount: number,
  requestedDays: number,
): number {
  const safeRequestedDays = Math.max(1, Math.floor(requestedDays))
  if (!records.length || !Number.isFinite(maxRecordCount) || maxRecordCount <= 0)
    return safeRequestedDays

  const timestamps = records
    .map(record => dayjs(record.time).valueOf())
    .filter(ts => Number.isFinite(ts))
    .sort((a, b) => a - b)

  if (timestamps.length < 2)
    return safeRequestedDays

  const intervalMinutes = estimateReportIntervalMinutes(timestamps)
  const coverableDays = Math.floor((maxRecordCount * intervalMinutes) / (24 * 60))

  if (coverableDays <= 0)
    return safeRequestedDays

  return Math.max(1, Math.min(safeRequestedDays, coverableDays))
}

export type UptimeDayStatus = 'ok' | 'degraded' | 'down' | 'no-data'

export interface UptimeDayBucket {
  /** 该天的日期（本地时区，YYYY-MM-DD） */
  date: string
  /** 估算状态 */
  status: UptimeDayStatus
  /** 当天实际收到的上报次数 */
  sampleCount: number
  /** 当天理论应有的上报次数（由上报间隔推算，最少为 1） */
  expectedCount: number
  /** 上报密度比例（0-1），无预期样本时为 null */
  ratio: number | null
}

const DEGRADED_RATIO_THRESHOLD = 0.85
const DOWN_RATIO_THRESHOLD = 0.4

/**
 * 从上报记录的时间间隔中位数推算「理论上报间隔（分钟）」，用于计算每天理论应有的上报次数。
 * 使用中位数而非平均数，避免个别长间隙（重启/掉线）拉高估算的间隔。
 */
export function estimateReportIntervalMinutes(sortedTimestamps: number[]): number {
  if (sortedTimestamps.length < 2)
    return 1

  const gaps: number[] = []
  for (let i = 1; i < sortedTimestamps.length; i++) {
    const prev = sortedTimestamps[i - 1]
    const curr = sortedTimestamps[i]
    if (prev === undefined || curr === undefined)
      continue
    const gapMinutes = (curr - prev) / 60_000
    if (gapMinutes > 0)
      gaps.push(gapMinutes)
  }

  if (!gaps.length)
    return 1

  gaps.sort((a, b) => a - b)
  const mid = Math.floor(gaps.length / 2)
  const median = gaps.length % 2 === 0
    ? ((gaps[mid - 1] ?? 0) + (gaps[mid] ?? 0)) / 2
    : gaps[mid] ?? 1

  return Math.max(0.5, median)
}

/**
 * 将节点的 StatusRecord 历史按天分桶，估算每天的上线状态。
 *
 * @param records 该节点的历史上报记录（时间顺序不要求，内部会排序）
 * @param days 时间轴覆盖的天数（含今天）
 * @param referenceTime 参考「现在」的时间，默认当前时间；今天按已过去的时长折算理论样本数
 */
export function buildUptimeDayBuckets(
  records: Pick<StatusRecord, 'time'>[],
  days: number,
  referenceTime: dayjs.Dayjs = dayjs(),
): UptimeDayBucket[] {
  const safeDays = Math.max(1, Math.floor(days))
  const todayStart = referenceTime.startOf('day')
  const rangeStart = todayStart.subtract(safeDays - 1, 'day')

  const timestamps = records
    .map(record => dayjs(record.time).valueOf())
    .filter(ts => Number.isFinite(ts))
    .sort((a, b) => a - b)

  const intervalMinutes = estimateReportIntervalMinutes(timestamps)

  // 按天分组计数
  const countByDate = new Map<string, number>()
  const rangeStartMs = rangeStart.valueOf()
  const rangeEndMs = todayStart.add(1, 'day').valueOf()
  for (const ts of timestamps) {
    if (ts < rangeStartMs || ts >= rangeEndMs)
      continue
    const dateKey = dayjs(ts).format('YYYY-MM-DD')
    countByDate.set(dateKey, (countByDate.get(dateKey) ?? 0) + 1)
  }

  // 节点历史记录的起点：早于这一天的分桶视为「节点当时还不存在/未开始上报」，标记为无数据而非离线
  const firstRecordDayStart = timestamps.length
    ? dayjs(timestamps[0]).startOf('day')
    : null

  const buckets: UptimeDayBucket[] = []
  for (let i = 0; i < safeDays; i++) {
    const dayStart = rangeStart.add(i, 'day')
    const dateKey = dayStart.format('YYYY-MM-DD')
    const isToday = dayStart.isSame(todayStart, 'day')
    const isBeforeFirstRecord = firstRecordDayStart !== null && dayStart.isBefore(firstRecordDayStart, 'day')

    // 当天理论时长：今天按「已过去的时间」折算，历史整天按 24 小时
    const elapsedMinutes = isToday
      ? Math.max(1, referenceTime.diff(dayStart, 'minute'))
      : 24 * 60

    const expectedCount = Math.max(1, Math.round(elapsedMinutes / intervalMinutes))
    const sampleCount = countByDate.get(dateKey) ?? 0

    let status: UptimeDayStatus
    let ratio: number | null

    if (!timestamps.length || isBeforeFirstRecord) {
      // 整个范围都没有记录，或该天早于节点最早的一条上报：无数据
      status = 'no-data'
      ratio = null
    }
    else if (sampleCount === 0) {
      status = 'down'
      ratio = 0
    }
    else {
      ratio = Math.min(1, sampleCount / expectedCount)
      if (ratio >= DEGRADED_RATIO_THRESHOLD)
        status = 'ok'
      else if (ratio >= DOWN_RATIO_THRESHOLD)
        status = 'degraded'
      else
        status = 'down'
    }

    buckets.push({ date: dateKey, status, sampleCount, expectedCount, ratio })
  }

  return buckets
}

export const UPTIME_STATUS_LABEL: Record<UptimeDayStatus, string> = {
  'ok': '正常',
  'degraded': '部分异常',
  'down': '离线',
  'no-data': '无数据',
}
