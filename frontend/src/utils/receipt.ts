import type { DropPoint, DropReceipt, ReceiptStatus } from '@/types'

/** 投放点排期占用视图：总表、导出与冲突判定统一走这里 */
export interface PointOccupancy {
  /** 是否占用排期（已撤场不占用，群体可安排下一地块） */
  occupies: boolean
  /** 生效占用起 */
  start: string
  /** 生效占用止（延期时为新的撤场日） */
  end: string
  /** 回执状态；未登记回执时为「未登记」 */
  status: ReceiptStatus | '未登记'
  /** 占用依据：有回执按回执，没登记仍按原计划 */
  source: '计划' | '回执'
}

/** 投放点 id → 回执 索引 */
export function receiptMapOf(receipts: DropReceipt[]): Map<string, DropReceipt> {
  return new Map(receipts.map((item) => [item.dropPointId, item]))
}

/**
 * 计算投放点的生效占用：
 * - 待投放 / 在园：按计划窗口占用；
 * - 延期：按延期后的新撤场日占用；
 * - 已撤场：不再占用，群体可安排下一地块；
 * - 未登记回执：仍按原计划判断。
 */
export function effectiveOccupancy(point: DropPoint, receipt?: DropReceipt): PointOccupancy {
  if (!receipt) {
    return { occupies: true, start: point.dropWindow, end: point.withdrawTime, status: '未登记', source: '计划' }
  }
  if (receipt.status === '已撤场') {
    return { occupies: false, start: point.dropWindow, end: point.withdrawTime, status: receipt.status, source: '回执' }
  }
  if (receipt.status === '延期' && receipt.delayedWithdrawDate) {
    return { occupies: true, start: point.dropWindow, end: receipt.delayedWithdrawDate, status: receipt.status, source: '回执' }
  }
  return { occupies: true, start: point.dropWindow, end: point.withdrawTime, status: receipt.status, source: '回执' }
}
