import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Segmented, Select, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import type { BeeColony, DropPoint, DropReceipt, Orchard, ReceiptStatus } from '@/types'
import { RECEIPT_STATUSES } from '@/types'
import FlowerWindowBar from '@/components/common/FlowerWindowBar'
import RouteMap from '@/components/common/RouteMap'
import StatusTag from '@/components/common/StatusTag'
import ReceiptStatusTag from '@/components/common/ReceiptStatusTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { orchardStore } from '@/stores/orchardStore'
import { colonyStore } from '@/stores/colonyStore'
import { droppointStore } from '@/stores/droppointStore'
import { routeStore } from '@/stores/routeStore'
import { receiptStore } from '@/stores/receiptStore'
import { bloomDays, flowerWindowOverlap } from '@/utils/geo'
import { effectiveOccupancy, receiptMapOf } from '@/utils/receipt'
import { suggestColonyBoxes } from '@/types'
import { uid } from '@/utils/id'

interface Placement {
  colonyCode: string
  orchardId: string
  dropCode: string
  start: string
  end: string
  /** 占用依据：回执或原计划 */
  source: '计划' | '回执'
}

interface ConflictItem {
  colonyCode: string
  a: Placement
  b: Placement
  days: number
  range: string
}

interface ScheduleRow {
  key: string
  orchard: Orchard
  days: number
  suggest: number
  placedCodes: string[]
  dropCodes: string[]
  conflicted: boolean
}

interface ReceiptRow {
  key: string
  point: DropPoint
  orchardName: string
  receipt?: DropReceipt
  occupies: boolean
  effStart: string
  effEnd: string
  status: ReceiptStatus | '未登记'
}

type ReceiptFilter = ReceiptStatus | '未登记' | ''

interface ReceiptFormValues {
  status: ReceiptStatus
  actualBoxes: number
  exceptionNote: string
  delayedWithdrawDate?: dayjs.Dayjs
}

/** 季内授粉安排总表：日期条带展示花期与已投放群体，冲突处标红；执行回执决定投放点实际占用 */
export default function SchedulePage(): JSX.Element {
  const orchards = usePersistentStore(orchardStore, (state) => state.rows)
  const colonies = usePersistentStore(colonyStore, (state) => state.rows)
  const dropPoints = usePersistentStore(droppointStore, (state) => state.rows)
  const routes = usePersistentStore(routeStore, (state) => state.rows)
  const receipts = usePersistentStore(receiptStore, (state) => state.rows)
  const [scope, setScope] = useState<'all' | 'conflict'>('all')
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('')
  const [receiptPoint, setReceiptPoint] = useState<DropPoint | null>(null)
  const [receiptForm] = Form.useForm<ReceiptFormValues>()
  const watchedReceiptStatus = Form.useWatch('status', receiptForm)

  const receiptMap = useMemo(() => receiptMapOf(receipts), [receipts])

  /** 由投放点的群号安排 + 生效占用（回执优先，未登记按计划），汇总出「某群在某地块」的时间占用 */
  const placements = useMemo<Placement[]>(() => {
    const list: Placement[] = []
    dropPoints.forEach((point: DropPoint) => {
      const occ = effectiveOccupancy(point, receiptMap.get(point.id))
      if (!occ.occupies) return // 已撤场：群体释放，可安排下一地块
      point.colonyCodes.forEach((code) => {
        list.push({
          colonyCode: code,
          orchardId: point.orchardId,
          dropCode: point.code,
          start: occ.start,
          end: occ.end,
          source: occ.source
        })
      })
    })
    colonies.forEach((colony: BeeColony) => {
      if (!colony.currentOrchardId) return
      const orchard = orchards.find((item) => item.id === colony.currentOrchardId)
      if (!orchard) return
      const already = list.some((item) => item.colonyCode === colony.code && item.orchardId === colony.currentOrchardId)
      if (already) return
      list.push({
        colonyCode: colony.code,
        orchardId: colony.currentOrchardId,
        dropCode: '（当前所在）',
        start: orchard.bloomStart,
        end: orchard.bloomEnd,
        source: '计划'
      })
    })
    return list
  }, [dropPoints, colonies, orchards, receiptMap])

  /** 同一蜂群同一天被排入两个地块 → 冲突列表 */
  const conflicts = useMemo<ConflictItem[]>(() => {
    const result: ConflictItem[] = []
    const codes = Array.from(new Set(placements.map((item) => item.colonyCode)))
    codes.forEach((code) => {
      const list = placements.filter((item) => item.colonyCode === code)
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          if (list[i].orchardId === list[j].orchardId) continue
          const overlap = flowerWindowOverlap(list[i].start, list[i].end, list[j].start, list[j].end)
          if (overlap.overlap) {
            result.push({ colonyCode: code, a: list[i], b: list[j], days: overlap.days, range: overlap.range })
          }
        }
      }
    })
    return result
  }, [placements])

  const rows = useMemo<ScheduleRow[]>(
    () =>
      orchards.map((orchard) => {
        const related = placements.filter((item) => item.orchardId === orchard.id)
        return {
          key: orchard.id,
          orchard,
          days: bloomDays(orchard),
          suggest: suggestColonyBoxes(orchard),
          placedCodes: Array.from(new Set(related.map((item) => item.colonyCode))),
          dropCodes: Array.from(new Set(related.map((item) => item.dropCode))),
          conflicted: conflicts.some((item) => item.a.orchardId === orchard.id || item.b.orchardId === orchard.id)
        }
      }),
    [orchards, placements, conflicts]
  )

  /** 投放点 × 回执 明细行（含生效占用窗口） */
  const receiptRows = useMemo<ReceiptRow[]>(
    () =>
      dropPoints.map((point) => {
        const receipt = receiptMap.get(point.id)
        const occ = effectiveOccupancy(point, receipt)
        return {
          key: point.id,
          point,
          orchardName: orchardName(point.orchardId),
          receipt,
          occupies: occ.occupies,
          effStart: occ.start,
          effEnd: occ.end,
          status: occ.status
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropPoints, receiptMap, orchards]
  )

  const visibleReceiptRows = receiptFilter ? receiptRows.filter((row) => row.status === receiptFilter) : receiptRows

  /** 群体可用性：没有任何生效占用的群体即为可用，可安排下一地块 */
  const availability = useMemo(
    () =>
      colonies.map((colony) => ({
        colony,
        active: placements.filter((item) => item.colonyCode === colony.code)
      })),
    [colonies, placements]
  )

  const visibleRows = scope === 'conflict' ? rows.filter((row) => row.conflicted) : rows
  const totalSuggest = rows.reduce((sum, row) => sum + row.suggest, 0)
  const availableCount = availability.filter((item) => item.active.length === 0).length

  function orchardName(id: string): string {
    return orchards.find((item) => item.id === id)?.name ?? '未知地块'
  }

  function openReceipt(point: DropPoint): void {
    setReceiptPoint(point)
    const existing = receiptMap.get(point.id)
    receiptForm.setFieldsValue({
      status: existing?.status ?? '待投放',
      actualBoxes: existing ? existing.actualBoxes : point.colonyCodes.length,
      exceptionNote: existing?.exceptionNote ?? '',
      delayedWithdrawDate: existing?.delayedWithdrawDate ? dayjs(existing.delayedWithdrawDate) : undefined
    })
  }

  async function submitReceipt(): Promise<void> {
    if (!receiptPoint) return
    const values = await receiptForm.validateFields()
    const existing = receiptMap.get(receiptPoint.id)
    const row: DropReceipt = {
      id: existing?.id ?? uid('rc'),
      dropPointId: receiptPoint.id,
      status: values.status,
      actualBoxes: Number(values.actualBoxes) || 0,
      exceptionNote: values.exceptionNote?.trim() ?? '',
      delayedWithdrawDate: values.status === '延期' && values.delayedWithdrawDate ? values.delayedWithdrawDate.format('YYYY-MM-DD') : '',
      recordedAt: dayjs().format('YYYY-MM-DD')
    }
    try {
      await receiptStore.getState().save(row, receiptPoint.capacityBoxes)
      message.success(`投放点 ${receiptPoint.code} 回执已登记（${row.status}，实际 ${row.actualBoxes} 箱）`)
      setReceiptPoint(null)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回执保存失败')
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">季内授粉安排总表</h2>
          <p className="page-sub">
            按日期条带展示各地块盛花期与已投放群体；占用以执行回执为准（待投放 / 在园 / 延期按新撤场日占用，已撤场释放，未登记按计划），同一蜂群占用期重叠即冲突标红。
          </p>
        </div>
        <Segmented
          value={scope}
          onChange={(value) => setScope(value as 'all' | 'conflict')}
          options={[
            { label: `全部地块（${rows.length}）`, value: 'all' },
            { label: `仅冲突地块（${rows.filter((row) => row.conflicted).length}）`, value: 'conflict' }
          ]}
        />
      </div>

      {conflicts.length > 0 ? (
        <Alert
          type="error"
          showIcon
          message={`发现 ${conflicts.length} 处蜂群排程冲突：同一群体被排入花期重叠的不同地块`}
          description={
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {conflicts.map((item) => (
                <li key={`${item.colonyCode}-${item.a.dropCode}-${item.b.dropCode}`}>
                  蜂群 <b>{item.colonyCode}</b>：{orchardName(item.a.orchardId)}（{item.a.dropCode} {item.a.start}~{item.a.end}）与{' '}
                  {orchardName(item.b.orchardId)}（{item.b.dropCode} {item.b.start}~{item.b.end}）重叠 {item.days} 天（{item.range}）
                </li>
              ))}
            </ul>
          }
        />
      ) : (
        <Alert type="success" showIcon message="当前排程无蜂群冲突" />
      )}

      <Row gutter={16}>
        <Col xs={24} xl={14}>
          <Card size="small" title="花期条带与已投放群体" styles={{ body: { display: 'flex', flexDirection: 'column', gap: 12 } }}>
            {visibleRows.map((row) => (
              <div key={row.key} className={row.conflicted ? 'conflict-row' : ''} style={{ padding: 8, borderRadius: 8 }}>
                <FlowerWindowBar orchard={row.orchard} others={orchards.filter((item) => item.id !== row.orchard.id)} width={420} />
                <Space wrap size={4} style={{ marginTop: 6 }}>
                  <Tag>建议 {row.suggest} 箱</Tag>
                  <Tag color="blue">花期 {row.days} 天</Tag>
                  <Tag color={row.orchard.accessibility === '大车可达' ? 'green' : row.orchard.accessibility === '仅小车' ? 'gold' : 'red'}>
                    {row.orchard.accessibility}
                  </Tag>
                  {row.placedCodes.length > 0 ? (
                    row.placedCodes.map((code) => <Tag key={code} color="cyan">已投放 {code}</Tag>)
                  ) : (
                    <Tag>尚未安排群体</Tag>
                  )}
                  {row.conflicted ? <Tag color="red">存在冲突</Tag> : null}
                </Space>
              </div>
            ))}
            {visibleRows.length === 0 ? <Typography.Text type="secondary">没有符合条件的地块</Typography.Text> : null}
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card size="small" title="地图总览（地块 / 投放点 / 转场折线）">
            <RouteMap orchards={orchards} dropPoints={dropPoints} routes={routes} height={360} title="季内投放分布" />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={`投放点执行回执（${visibleReceiptRows.length} / ${receiptRows.length} 个点位）`}
        extra={
          <Select<ReceiptFilter>
            style={{ width: 150 }}
            value={receiptFilter}
            onChange={(value) => setReceiptFilter(value)}
            options={[
              { value: '', label: '全部回执状态' },
              ...RECEIPT_STATUSES.map((item) => ({ value: item, label: item })),
              { value: '未登记', label: '未登记' }
            ]}
          />
        }
      >
        <Table<ReceiptRow>
          dataSource={visibleReceiptRows}
          rowKey="key"
          pagination={false}
          locale={{ emptyText: '没有符合筛选的投放点' }}
          columns={[
            { title: '投放点', key: 'code', width: 90, render: (_, record: ReceiptRow) => record.point.code },
            { title: '地块', dataIndex: 'orchardName', key: 'orchard', width: 130 },
            {
              title: '计划窗口',
              key: 'plan',
              width: 190,
              render: (_, record: ReceiptRow) => `${record.point.dropWindow} ~ ${record.point.withdrawTime}`
            },
            {
              title: '安排群号',
              key: 'codes',
              render: (_, record: ReceiptRow) => (record.point.colonyCodes.length > 0 ? record.point.colonyCodes.join('、') : '—')
            },
            {
              title: '回执状态',
              key: 'status',
              width: 150,
              render: (_, record: ReceiptRow) => (
                <ReceiptStatusTag
                  status={record.status}
                  hint={record.status === '延期' && record.receipt?.delayedWithdrawDate ? `撤场延至 ${record.receipt.delayedWithdrawDate}` : undefined}
                />
              )
            },
            {
              title: '实际箱数',
              key: 'boxes',
              width: 110,
              render: (_, record: ReceiptRow) =>
                record.receipt ? `${record.receipt.actualBoxes} / ${record.point.capacityBoxes} 箱` : `容量 ${record.point.capacityBoxes} 箱`
            },
            {
              title: '生效占用',
              key: 'occ',
              width: 220,
              render: (_, record: ReceiptRow) =>
                record.occupies ? (
                  <span>
                    {record.effStart} ~ {record.effEnd}{' '}
                    <Tag color={record.receipt ? 'geekblue' : 'default'}>{record.receipt ? '按回执' : '按计划'}</Tag>
                  </span>
                ) : (
                  <Tag color="green">不占用 · 群体可转下一地块</Tag>
                )
            },
            {
              title: '异常说明',
              key: 'note',
              render: (_, record: ReceiptRow) => record.receipt?.exceptionNote || '—'
            },
            {
              title: '操作',
              key: 'action',
              width: 110,
              render: (_, record: ReceiptRow) => (
                <Button size="small" type="link" onClick={() => openReceipt(record.point)}>
                  {record.receipt ? '修改回执' : '登记回执'}
                </Button>
              )
            }
          ]}
        />
      </Card>

      <Card size="small" title={`群体可用性（${availableCount} / ${colonies.length} 群可安排下一地块）`}>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {availability.map(({ colony, active }) => (
            <div key={colony.id}>
              <Tag color="cyan">{colony.code}</Tag>
              {active.length === 0 ? (
                <Tag color="green">可用 · 可安排下一地块</Tag>
              ) : (
                active.map((item) => (
                  <Tag key={`${item.orchardId}-${item.dropCode}`} color="gold" style={{ marginTop: 4 }}>
                    占用中：{orchardName(item.orchardId)} {item.dropCode} {item.start} ~ {item.end}（{item.source === '回执' ? '按回执' : '按计划'}）
                  </Tag>
                ))
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {colony.species} · {colony.strengthFrames} 足框
              </Typography.Text>
            </div>
          ))}
          {colonies.length === 0 ? <Typography.Text type="secondary">暂无蜂群，请先在蜂群台账中登记</Typography.Text> : null}
        </Space>
      </Card>

      <Card size="small" title={`各地块排程明细（建议箱数合计 ${totalSuggest} 箱）`}>
        <Table<ScheduleRow>
          dataSource={rows}
          rowKey="key"
          pagination={false}
          rowClassName={(record) => (record.conflicted ? 'conflict-row' : '')}
          columns={[
            { title: '地块', dataIndex: ['orchard', 'name'], key: 'name' },
            { title: '作物', dataIndex: ['orchard', 'crop'], key: 'crop', width: 90 },
            { title: '面积（亩）', dataIndex: ['orchard', 'areaMu'], key: 'area', width: 100 },
            {
              title: '盛花期',
              key: 'bloom',
              render: (_, record: ScheduleRow) => `${record.orchard.bloomStart} ~ ${record.orchard.bloomEnd}`
            },
            { title: '花期天数', dataIndex: 'days', key: 'days', width: 100 },
            { title: '建议箱数', dataIndex: 'suggest', key: 'suggest', width: 100 },
            {
              title: '投放点',
              key: 'drops',
              render: (_, record: ScheduleRow) => (record.dropCodes.length > 0 ? record.dropCodes.join('、') : '—')
            },
            {
              title: '已投放群体',
              key: 'colonies',
              render: (_, record: ScheduleRow) => (
                <Space wrap size={4}>
                  {record.placedCodes.length > 0 ? record.placedCodes.map((code) => <Tag key={code}>{code}</Tag>) : <span>—</span>}
                </Space>
              )
            },
            {
              title: '状态',
              key: 'status',
              width: 120,
              render: (_, record: ScheduleRow) =>
                record.conflicted ? <Tag color="red">冲突</Tag> : <Tag color="green">正常</Tag>
            }
          ]}
        />
      </Card>

      <Card size="small" title="蜂群当前状态">
        <Space wrap>
          {colonies.map((colony) => (
            <StatusTag
              key={colony.id}
              status={colony.status}
              hint={colony.currentOrchardId ? orchardName(colony.currentOrchardId) : '未分配地块'}
            />
          ))}
        </Space>
      </Card>

      <Modal
        title={receiptPoint ? `执行回执 · ${receiptPoint.code}（${orchardName(receiptPoint.orchardId)}）` : '执行回执'}
        open={receiptPoint !== null}
        onCancel={() => setReceiptPoint(null)}
        onOk={() => void submitReceipt()}
        okText="保存回执"
        width={560}
        destroyOnClose={false}
      >
        {receiptPoint ? (
          <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
            计划窗口 {receiptPoint.dropWindow} ~ {receiptPoint.withdrawTime} · 点位容量 {receiptPoint.capacityBoxes} 箱 · 安排群号{' '}
            {receiptPoint.colonyCodes.length > 0 ? receiptPoint.colonyCodes.join('、') : '—'}
          </Typography.Paragraph>
        ) : null}
        <Form form={receiptForm} layout="vertical">
          <Form.Item name="status" label="执行状态" rules={[{ required: true, message: '请选择执行状态' }]}>
            <Select options={RECEIPT_STATUSES.map((item) => ({ value: item, label: item }))} />
          </Form.Item>
          <Form.Item
            name="actualBoxes"
            label={`实际箱数（容量 ${receiptPoint?.capacityBoxes ?? 0} 箱，超出将拒存）`}
            rules={[{ required: true, message: '请填写实际箱数' }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          {watchedReceiptStatus === '延期' ? (
            <Form.Item
              name="delayedWithdrawDate"
              label="延期后的新撤场日"
              rules={[
                {
                  validator: (_, value: dayjs.Dayjs | undefined) => {
                    if (!value) return Promise.reject(new Error('延期需填写新的撤场日'))
                    if (receiptPoint && !value.isAfter(dayjs(receiptPoint.withdrawTime))) {
                      return Promise.reject(new Error(`新撤场日需晚于计划撤场日 ${receiptPoint.withdrawTime}`))
                    }
                    return Promise.resolve()
                  }
                }
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          <Form.Item name="exceptionNote" label="异常说明">
            <Input.TextArea rows={2} placeholder="如 连续阴雨撤场顺延 / 到场缺 2 箱 / 花期提前结束" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
