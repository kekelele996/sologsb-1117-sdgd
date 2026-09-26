import { create } from 'zustand'
import type { DropReceipt } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'

export interface ReceiptState {
  rows: DropReceipt[]
  loaded: boolean
  hydrate: () => Promise<void>
  /** 保存回执；实际箱数超过投放点容量时拒存，并抛出包含超出数量的错误 */
  save: (row: DropReceipt, capacityBoxes: number) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByDropPoint: (dropPointId: string) => Promise<void>
}

export const receiptStore = create<ReceiptState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<DropReceipt>(db.receipts)
    rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    set({ rows, loaded: true })
  },
  save: async (row, capacityBoxes) => {
    if (row.actualBoxes > capacityBoxes) {
      throw new Error(`实际箱数 ${row.actualBoxes} 箱超过投放点容量 ${capacityBoxes} 箱，超出 ${row.actualBoxes - capacityBoxes} 箱，已拒存`)
    }
    await putRow<DropReceipt>(db.receipts, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<DropReceipt>(db.receipts, id)
    await get().hydrate()
  },
  removeByDropPoint: async (dropPointId) => {
    const targets = get().rows.filter((row) => row.dropPointId === dropPointId)
    await Promise.all(targets.map((row) => deleteRow<DropReceipt>(db.receipts, row.id)))
    await get().hydrate()
  }
}))
