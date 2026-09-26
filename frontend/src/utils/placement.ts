import type { BeeColony, DropPoint, ReceiptStatus } from '@/types'
import { OCCUPYING_RECEIPT_STATUSES } from '@/types'
import { flowerWindowOverlap } from '@/utils/geo'

/** 回执状态是否计入占用：待投放 / 在园 / 延期 占用，已撤场释放；未回执（undefined）按原计划占用 */
export function isOccupying(status: ReceiptStatus | undefined): boolean {
  if (status === undefined) return true
  return OCCUPYING_RECEIPT_STATUSES.includes(status)
}

export interface OccupancyWindow {
  /** 有效占用起（YYYY-MM-DD） */
  start: string
  /** 有效占用止（YYYY-MM-DD，延期取新撤场日） */
  end: string
  /** 是否占用（已撤场为 false） */
  occupied: boolean
  /** 占用依据：原计划 / 执行回执 / 已撤场不占用 */
  source: '计划' | '回执' | '已撤场'
}

/**
 * 计算投放点的有效占用区间：
 * - 没登记回执：按原计划 dropWindow ~ withdrawTime 判断；
 * - 回执为待投放 / 在园：按计划区间占用；
 * - 回执为延期：占用到新撤场日；
 * - 回执为已撤场：不占占用（群体可安排到下一地块）。
 */
export function occupancyOf(point: DropPoint): OccupancyWindow {
  const status = point.receipt?.status
  if (status === '已撤场') {
    return { start: '', end: '', occupied: false, source: '已撤场' }
  }
  if (status === '延期') {
    return {
      start: point.dropWindow,
      end: point.receipt?.extendedWithdrawTime || point.withdrawTime,
      occupied: true,
      source: '回执'
    }
  }
  if (status === undefined) {
    return { start: point.dropWindow, end: point.withdrawTime, occupied: true, source: '计划' }
  }
  return { start: point.dropWindow, end: point.withdrawTime, occupied: true, source: '回执' }
}

/** 该投放点在某段时间内是否占用（用于安排页群体可用性判断） */
export function pointOccupiesDuring(point: DropPoint, start: string, end: string): boolean {
  const window = occupancyOf(point)
  if (!window.occupied) return false
  if (!start || !end) return true
  return flowerWindowOverlap(window.start, window.end, start, end).overlap
}

export interface ColonyBusyInfo {
  busy: boolean
  /** 占用来源投放点（busy 时给出冲突点位说明） */
  points: { point: DropPoint; start: string; end: string }[]
}

/**
 * 判断某个群在给定时间窗内是否已被其他投放点占用。
 * 已撤场的投放点不占用 → 该群可安排到下一地块；没登记回执仍按原计划判断。
 */
export function colonyBusyDuring(
  code: string,
  start: string,
  end: string,
  dropPoints: DropPoint[],
  excludePointId?: string
): ColonyBusyInfo {
  const points = dropPoints
    .filter((point) => point.id !== excludePointId && point.colonyCodes.includes(code))
    .filter((point) => pointOccupiesDuring(point, start, end))
    .map((point) => {
      const window = occupancyOf(point)
      return { point, start: window.start, end: window.end }
    })
  return { busy: points.length > 0, points }
}

/** 安排页：某时间窗内可安排（未被占用）的蜂群 */
export function availableColonies(colonies: BeeColony[], start: string, end: string, dropPoints: DropPoint[], excludePointId?: string): BeeColony[] {
  return colonies.filter((colony) => !colonyBusyDuring(colony.code, start, end, dropPoints, excludePointId).busy)
}
