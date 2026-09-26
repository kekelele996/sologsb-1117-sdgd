import { Tag } from 'antd'
import type { ReceiptStatus } from '@/types'

const COLORS: Record<ReceiptStatus, string> = {
  待投放: 'gold',
  在园: 'green',
  已撤场: 'blue',
  延期: 'orange'
}

export interface ReceiptTagProps {
  status: ReceiptStatus
  hint?: string
}

/** 执行回执状态标签：待投放 / 在园 / 已撤场 / 延期 */
export default function ReceiptTag({ status, hint }: ReceiptTagProps): JSX.Element {
  return (
    <Tag color={COLORS[status]} data-testid="receipt-tag">
      {status}
      {hint ? ` · ${hint}` : ''}
    </Tag>
  )
}
