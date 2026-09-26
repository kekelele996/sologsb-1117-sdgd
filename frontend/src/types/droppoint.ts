/** 执行回执状态：待投放 / 在园 / 已撤场 / 延期 */
export const RECEIPT_STATUSES = ['待投放', '在园', '已撤场', '延期'] as const
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number]

/** 计入占用的回执状态（已撤场释放点位与群体，可安排到下一地块） */
export const OCCUPYING_RECEIPT_STATUSES: ReceiptStatus[] = ['待投放', '在园', '延期']

/** DropPoint 投放点执行回执：记录现场实际执行情况 */
export interface ExecutionReceipt {
  /** 回执状态 */
  status: ReceiptStatus
  /** 实际投放箱数 */
  actualBoxes: number
  /** 异常说明（少投、蜂群异常、天气等） */
  exceptionNote: string
  /** 延期后的新撤场日（YYYY-MM-DD），仅「延期」状态必填 */
  extendedWithdrawTime: string
  /** 实际到达/投放日期（YYYY-MM-DD） */
  arrivedAt: string
  /** 实际撤场日期（YYYY-MM-DD），已撤场时填写 */
  withdrewAt: string
  /** 登记时间（YYYY-MM-DD HH:mm） */
  recordedAt: string
}

/** DropPoint 投放点 */
export interface DropPoint {
  id: string
  orchardId: string
  longitude: number
  latitude: number
  /** 编号，如 A-03 */
  code: string
  /** 可容纳箱数 */
  capacityBoxes: number
  /** 遮阴条件 */
  shade: string
  /** 水源距离（米） */
  waterDistance: number
  /** 投放时间窗（起） */
  dropWindow: string
  /** 撤场时间 */
  withdrawTime: string
  /** 责任人 */
  owner: string
  /** 该投放点安排的群号（用于冲突判定） */
  colonyCodes: string[]
  /** 执行回执；未登记（undefined）时仍按原计划时间窗判断占用 */
  receipt?: ExecutionReceipt
}
