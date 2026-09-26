import { Tag } from 'antd'
import type { ReceiptStatus } from '@/types'

const COLORS: Record<ReceiptStatus | '未登记', string> = {
  待投放: 'gold',
  在园: 'green',
  已撤场: 'default',
  延期: 'orange',
  未登记: 'default'
}

export interface ReceiptStatusTagProps {
  status: ReceiptStatus | '未登记'
  /** 附加说明（如延期后的新撤场日） */
  hint?: string
}

/** 投放点执行回执状态标签：4 种回执状态 + 未登记 各自配色 */
export default function ReceiptStatusTag({ status, hint }: ReceiptStatusTagProps): JSX.Element {
  return (
    <Tag color={COLORS[status]} data-testid="receipt-status-tag">
      {status}
      {hint ? ` · ${hint}` : ''}
    </Tag>
  )
}
