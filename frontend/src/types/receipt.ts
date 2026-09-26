/** 投放点执行回执状态 */
export const RECEIPT_STATUSES = ['待投放', '在园', '已撤场', '延期'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

/** DropReceipt 投放点执行回执：蜂群到场 / 撤场 / 延期的实际执行记录（每个投放点一条） */
export interface DropReceipt {
  id: string
  /** 对应投放点 */
  dropPointId: string
  status: ReceiptStatus
  /** 实际投放箱数（保存时校验不得超过点位容量） */
  actualBoxes: number
  /** 异常说明 */
  exceptionNote: string
  /** 延期后的新撤场日（仅「延期」状态填写） */
  delayedWithdrawDate: string
  /** 登记日期 */
  recordedAt: string
}
