import { create } from 'zustand'
import type { DropPoint } from '@/types'
import { db, deleteRow, loadAll, putRow } from '@/hooks/usePersistentStore'
import { receiptStore } from '@/stores/receiptStore'

export interface DropPointState {
  rows: DropPoint[]
  loaded: boolean
  hydrate: () => Promise<void>
  save: (row: DropPoint) => Promise<void>
  remove: (id: string) => Promise<void>
  removeByOrchard: (orchardId: string) => Promise<void>
}

export const droppointStore = create<DropPointState>((set, get) => ({
  rows: [],
  loaded: false,
  hydrate: async () => {
    const rows = await loadAll<DropPoint>(db.dropPoints)
    rows.sort((a, b) => a.code.localeCompare(b.code, 'zh-Hans-CN'))
    set({ rows, loaded: true })
  },
  save: async (row) => {
    await putRow<DropPoint>(db.dropPoints, row)
    await get().hydrate()
  },
  remove: async (id) => {
    await deleteRow<DropPoint>(db.dropPoints, id)
    await receiptStore.getState().removeByDropPoint(id)
    await get().hydrate()
  },
  removeByOrchard: async (orchardId) => {
    const targets = get().rows.filter((row) => row.orchardId === orchardId)
    await Promise.all(targets.map((row) => deleteRow<DropPoint>(db.dropPoints, row.id)))
    await Promise.all(targets.map((row) => receiptStore.getState().removeByDropPoint(row.id)))
    await get().hydrate()
  }
}))
