import { useMemo, useState } from 'react'
import { Alert, Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import type { DropPoint, ExecutionReceipt, Orchard, ReceiptStatus } from '@/types'
import { ACCESSIBILITIES, CROPS, RECEIPT_STATUSES, suggestColonyBoxes } from '@/types'
import CoordPicker from '@/components/common/CoordPicker'
import FlowerWindowBar from '@/components/common/FlowerWindowBar'
import ReceiptTag from '@/components/common/ReceiptTag'
import { usePersistentStore } from '@/hooks/usePersistentStore'
import { orchardStore } from '@/stores/orchardStore'
import { droppointStore } from '@/stores/droppointStore'
import { colonyStore } from '@/stores/colonyStore'
import { bloomDays } from '@/utils/geo'
import { availableColonies, colonyBusyDuring } from '@/utils/placement'
import { uid } from '@/utils/id'

interface OrchardFormValues {
  name: string
  crop: Orchard['crop']
  areaMu: number
  colonyIntensity: number
  ownerContact: string
  accessibility: Orchard['accessibility']
  historyYears: string
  note: string
  bloom: [dayjs.Dayjs, dayjs.Dayjs]
}

interface DropFormValues {
  code: string
  capacityBoxes: number
  shade: string
  waterDistance: number
  dropWindow: dayjs.Dayjs
  withdrawTime: dayjs.Dayjs
  owner: string
  colonyCodes: string[]
}

interface ReceiptFormValues {
  status: ReceiptStatus
  actualBoxes: number
  arrivedAt: dayjs.Dayjs
  withdrewAt: dayjs.Dayjs | null
  extendedWithdrawTime: dayjs.Dayjs
  exceptionNote: string
}

/** 果园地块管理：录入面积与花期后自动给出建议箱数与可达性标记，并维护投放点 */
export default function OrchardsPage(): JSX.Element {
  const orchards = usePersistentStore(orchardStore, (state) => state.rows)
  const dropPoints = usePersistentStore(droppointStore, (state) => state.rows)
  const colonies = usePersistentStore(colonyStore, (state) => state.rows)

  const [orchardModal, setOrchardModal] = useState(false)
  const [editingOrchard, setEditingOrchard] = useState<Orchard | null>(null)
  const [coord, setCoord] = useState({ longitude: 107.41, latitude: 34.61 })
  const [orchardForm] = Form.useForm<OrchardFormValues>()

  const [dropModal, setDropModal] = useState(false)
  const [dropOwner, setDropOwner] = useState<Orchard | null>(null)
  const [dropCoord, setDropCoord] = useState({ longitude: 107.41, latitude: 34.61 })
  const [dropForm] = Form.useForm<DropFormValues>()

  const [receiptModal, setReceiptModal] = useState(false)
  const [receiptPoint, setReceiptPoint] = useState<DropPoint | null>(null)
  const [receiptForm] = Form.useForm<ReceiptFormValues>()
  const [receiptFilter, setReceiptFilter] = useState<ReceiptStatus | 'unregistered' | ''>('')

  const watchedDropStart = Form.useWatch('dropWindow', dropForm)
  const watchedDropEnd = Form.useWatch('withdrawTime', dropForm)

  const watchedArea = Form.useWatch('areaMu', orchardForm) ?? 0
  const watchedIntensity = Form.useWatch('colonyIntensity', orchardForm) ?? 0
  const suggestPreview = suggestColonyBoxes({
    areaMu: Number(watchedArea) || 0,
    colonyIntensity: Number(watchedIntensity) || 0
  })

  const dropsOf = useMemo(
    () => (orchardId: string): DropPoint[] => dropPoints.filter((item) => item.orchardId === orchardId),
    [dropPoints]
  )

  function openCreate(): void {
    setEditingOrchard(null)
    setCoord({ longitude: 107.41, latitude: 34.61 })
    orchardForm.setFieldsValue({
      name: '',
      crop: '苹果',
      areaMu: 100,
      colonyIntensity: 0.1,
      ownerContact: '',
      accessibility: '大车可达',
      historyYears: '2025',
      note: '',
      bloom: [dayjs().month(3).date(8), dayjs().month(3).date(18)]
    })
    setOrchardModal(true)
  }

  function openEdit(orchard: Orchard): void {
    setEditingOrchard(orchard)
    setCoord({ longitude: orchard.longitude, latitude: orchard.latitude })
    orchardForm.setFieldsValue({
      name: orchard.name,
      crop: orchard.crop,
      areaMu: orchard.areaMu,
      colonyIntensity: orchard.colonyIntensity,
      ownerContact: orchard.ownerContact,
      accessibility: orchard.accessibility,
      historyYears: orchard.historyYears.join('、'),
      note: orchard.note,
      bloom: [dayjs(orchard.bloomStart), dayjs(orchard.bloomEnd)]
    })
    setOrchardModal(true)
  }

  async function submitOrchard(): Promise<void> {
    const values = await orchardForm.validateFields()
    const row: Orchard = {
      id: editingOrchard?.id ?? uid('orc'),
      name: values.name.trim(),
      crop: values.crop,
      areaMu: Number(values.areaMu) || 0,
      longitude: coord.longitude,
      latitude: coord.latitude,
      bloomStart: values.bloom[0].format('YYYY-MM-DD'),
      bloomEnd: values.bloom[1].format('YYYY-MM-DD'),
      colonyIntensity: Number(values.colonyIntensity) || 0,
      ownerContact: values.ownerContact.trim(),
      accessibility: values.accessibility,
      historyYears: values.historyYears
        .split(/[、,，\s]+/)
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item) && item > 0),
      note: values.note?.trim() ?? ''
    }
    await orchardStore.getState().save(row)
    message.success(`地块「${row.name}」已保存，建议蜂群 ${suggestColonyBoxes(row)} 箱`)
    setOrchardModal(false)
  }

  async function removeOrchard(orchard: Orchard): Promise<void> {
    const drops = dropsOf(orchard.id)
    if (drops.length > 0) {
      message.error(`「${orchard.name}」下仍有 ${drops.length} 个投放点，请先清理投放点`)
      return
    }
    await orchardStore.getState().remove(orchard.id)
    message.success('地块已删除')
  }

  function openDrop(orchard: Orchard): void {
    setDropOwner(orchard)
    setDropCoord({ longitude: orchard.longitude, latitude: orchard.latitude })
    const index = dropPoints.filter((item) => item.orchardId === orchard.id).length + 1
    dropForm.setFieldsValue({
      code: `${orchard.crop.slice(0, 1)}-${String(index).padStart(2, '0')}`,
      capacityBoxes: suggestColonyBoxes(orchard),
      shade: '',
      waterDistance: 300,
      dropWindow: dayjs(orchard.bloomStart).subtract(1, 'day'),
      withdrawTime: dayjs(orchard.bloomEnd).add(1, 'day'),
      owner: '',
      colonyCodes: []
    })
    setDropModal(true)
  }

  async function submitDrop(): Promise<void> {
    if (!dropOwner) return
    const values = await dropForm.validateFields()
    const row: DropPoint = {
      id: uid('dp'),
      orchardId: dropOwner.id,
      longitude: dropCoord.longitude,
      latitude: dropCoord.latitude,
      code: values.code.trim(),
      capacityBoxes: Number(values.capacityBoxes) || 0,
      shade: values.shade?.trim() ?? '',
      waterDistance: Number(values.waterDistance) || 0,
      dropWindow: values.dropWindow.format('YYYY-MM-DD'),
      withdrawTime: values.withdrawTime.format('YYYY-MM-DD'),
      owner: values.owner?.trim() ?? '',
      colonyCodes: values.colonyCodes ?? []
    }
    await droppointStore.getState().save(row)
    message.success(`投放点 ${row.code} 已保存`)
    setDropModal(false)
  }

  /** 新增投放点弹窗内：按填写的计划时间窗看各群体是否可用（已撤场释放、未登记按原计划） */
  const planStart = watchedDropStart?.format('YYYY-MM-DD') ?? ''
  const planEnd = watchedDropEnd?.format('YYYY-MM-DD') ?? ''

  function orchardNameOf(id: string): string {
    return orchards.find((item) => item.id === id)?.name ?? '未知地块'
  }

  function colonyOptions(): { value: string; label: string; disabled?: boolean }[] {
    return colonies.map((colony) => {
      const busy = colonyBusyDuring(colony.code, planStart, planEnd, dropPoints)
      if (!busy.busy) {
        return { value: colony.code, label: `${colony.code}（${colony.species} ${colony.strengthFrames} 足框）` }
      }
      const detail = busy.points
        .map((item) => `${item.point.code}@${orchardNameOf(item.point.orchardId)} 占用至 ${item.end}`)
        .join('、')
      return {
        value: colony.code,
        label: `${colony.code}（不可用：${detail}）`,
        disabled: true
      }
    })
  }

  function openReceipt(point: DropPoint): void {
    setReceiptPoint(point)
    const receipt = point.receipt
    receiptForm.setFieldsValue({
      status: receipt?.status ?? '在园',
      actualBoxes: receipt?.actualBoxes ?? point.capacityBoxes,
      arrivedAt: dayjs(receipt?.arrivedAt || undefined),
      withdrewAt: receipt?.withdrewAt ? dayjs(receipt.withdrewAt) : null,
      extendedWithdrawTime: dayjs(receipt?.extendedWithdrawTime || point.withdrawTime),
      exceptionNote: receipt?.exceptionNote ?? ''
    })
    setReceiptModal(true)
  }

  async function submitReceipt(): Promise<void> {
    if (!receiptPoint) return
    const values = await receiptForm.validateFields()
    const actualBoxes = Number(values.actualBoxes) || 0
    // 实际箱数超过点位容量 → 拒存并提示超出数量
    if (actualBoxes > receiptPoint.capacityBoxes) {
      message.error(`实际箱数超出点位容量：该点位可容纳 ${receiptPoint.capacityBoxes} 箱，超出 ${actualBoxes - receiptPoint.capacityBoxes} 箱，请调整后再提交`)
      return
    }
    const status = values.status
    const receipt: ExecutionReceipt = {
      status,
      actualBoxes,
      exceptionNote: values.exceptionNote?.trim() ?? '',
      extendedWithdrawTime: status === '延期' ? values.extendedWithdrawTime.format('YYYY-MM-DD') : '',
      arrivedAt: values.arrivedAt.format('YYYY-MM-DD'),
      withdrewAt: status === '已撤场' ? (values.withdrewAt ? values.withdrewAt.format('YYYY-MM-DD') : '') : '',
      recordedAt: dayjs().format('YYYY-MM-DD HH:mm')
    }
    await droppointStore.getState().save({ ...receiptPoint, receipt })
    message.success(`投放点 ${receiptPoint.code} 执行回执已登记（${status}）`)
    setReceiptModal(false)
  }

  async function clearReceipt(): Promise<void> {
    if (!receiptPoint) return
    const { receipt: _omitted, ...rest } = receiptPoint
    await droppointStore.getState().save(rest)
    message.success(`投放点 ${receiptPoint.code} 回执已清除，恢复按原计划判断`)
    setReceiptModal(false)
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2 className="page-title">果园地块管理</h2>
          <p className="page-sub">
            录入面积与需蜂强度后自动算出建议箱数；可达性以标签标记。每个地块可维护多个蜂群投放点（含可容纳箱数与时间窗），并回填执行回执（待投放 / 在园 / 已撤场 / 延期），安排群号时可查看群体在该时间窗是否可用。
          </p>
        </div>
        <Button type="primary" onClick={openCreate}>
          新建地块
        </Button>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            执行回执筛选
          </Typography.Text>
          <Select
            style={{ width: 180 }}
            value={receiptFilter}
            onChange={(value) => setReceiptFilter(value)}
            options={[
              { value: '', label: '全部投放点' },
              ...RECEIPT_STATUSES.map((item) => ({ value: item, label: item })),
              { value: 'unregistered', label: '未登记回执（按原计划）' }
            ]}
          />
          <Tag>投放点合计 {dropPoints.length}</Tag>
          {RECEIPT_STATUSES.map((status) => (
            <Tag key={status}>
              {status} {dropPoints.filter((item) => item.receipt?.status === status).length}
            </Tag>
          ))}
          <Tag>未登记 {dropPoints.filter((item) => !item.receipt).length}</Tag>
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        {orchards.map((orchard) => (
          <Col key={orchard.id} xs={24} xl={12}>
            <Card
              size="small"
              title={
                <Space wrap>
                  <span>{orchard.name}</span>
                  <Tag color="blue">{orchard.crop}</Tag>
                  <Tag color={orchard.accessibility === '大车可达' ? 'green' : orchard.accessibility === '仅小车' ? 'gold' : 'red'}>
                    {orchard.accessibility}
                  </Tag>
                  <Tag color="orange">建议 {suggestColonyBoxes(orchard)} 箱</Tag>
                </Space>
              }
              extra={
                <Space>
                  <Button size="small" onClick={() => openEdit(orchard)}>
                    编辑
                  </Button>
                  <Button size="small" onClick={() => openDrop(orchard)}>
                    新增投放点
                  </Button>
                  <Button size="small" danger onClick={() => void removeOrchard(orchard)}>
                    删除
                  </Button>
                </Space>
              }
            >
              <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
                {orchard.areaMu} 亩 · 需蜂 {orchard.colonyIntensity} 箱/亩 · 园主 {orchard.ownerContact || '—'} · 历史授粉{' '}
                {orchard.historyYears.length > 0 ? orchard.historyYears.join('、') : '—'} 年 · 花期 {bloomDays(orchard)} 天
              </Typography.Paragraph>
              <FlowerWindowBar orchard={orchard} others={orchards.filter((item) => item.id !== orchard.id)} width={420} />
              <Table<DropPoint>
                style={{ marginTop: 10 }}
                size="small"
                pagination={false}
                dataSource={dropsOf(orchard.id).filter((item) => {
                  if (!receiptFilter) return true
                  if (receiptFilter === 'unregistered') return !item.receipt
                  return item.receipt?.status === receiptFilter
                })}
                rowKey="id"
                locale={{ emptyText: '暂无符合回执筛选条件的投放点' }}
                columns={[
                  { title: '编号', dataIndex: 'code', key: 'code', width: 72 },
                  {
                    title: '容量/实际',
                    key: 'cap',
                    width: 90,
                    render: (_, record: DropPoint) =>
                      record.receipt ? (
                        <Typography.Text type={record.receipt.actualBoxes > record.capacityBoxes ? 'danger' : undefined}>
                          {record.receipt.actualBoxes}/{record.capacityBoxes} 箱
                        </Typography.Text>
                      ) : (
                        `${record.capacityBoxes} 箱`
                      )
                  },
                  { title: '投放窗', dataIndex: 'dropWindow', key: 'win', width: 104 },
                  {
                    title: '撤场',
                    key: 'with',
                    width: 150,
                    render: (_, record: DropPoint) => {
                      if (record.receipt?.status === '延期' && record.receipt.extendedWithdrawTime) {
                        return (
                          <Space size={2} direction="vertical">
                            <Typography.Text delete type="secondary" style={{ fontSize: 12 }}>
                              {record.withdrawTime}
                            </Typography.Text>
                            <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                              延至 {record.receipt.extendedWithdrawTime}
                            </Tag>
                          </Space>
                        )
                      }
                      return record.withdrawTime
                    }
                  },
                  {
                    title: '安排群号',
                    key: 'codes',
                    render: (_, record: DropPoint) =>
                      record.colonyCodes.length > 0 ? record.colonyCodes.join('、') : '—'
                  },
                  {
                    title: '执行回执',
                    key: 'receipt',
                    width: 150,
                    render: (_, record: DropPoint) =>
                      record.receipt ? (
                        <Space size={2} direction="vertical">
                          <ReceiptTag status={record.receipt.status} />
                          {record.receipt.exceptionNote ? (
                            <Typography.Text type="warning" style={{ fontSize: 12 }} title={record.receipt.exceptionNote} ellipsis>
                              {record.receipt.exceptionNote}
                            </Typography.Text>
                          ) : null}
                        </Space>
                      ) : (
                        <Tag>未登记</Tag>
                      )
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 120,
                    render: (_, record: DropPoint) => (
                      <Space size={0}>
                        <Button size="small" type="link" onClick={() => openReceipt(record)}>
                          回执
                        </Button>
                        <Button size="small" danger type="link" onClick={() => void droppointStore.getState().remove(record.id)}>
                          删除
                        </Button>
                      </Space>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Modal title={editingOrchard ? '编辑地块' : '新建地块'} open={orchardModal} onCancel={() => setOrchardModal(false)} onOk={() => void submitOrchard()} width={720} okText="保存">
        <Form form={orchardForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="地块名" rules={[{ required: true, message: '请填写地块名' }]}>
                <Input placeholder="如 北岭苹果园" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="crop" label="作物" rules={[{ required: true }]}>
                <Select options={CROPS.map((item) => ({ value: item, label: item }))} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="areaMu" label="面积（亩）" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="colonyIntensity" label="需蜂强度（箱/亩）" rules={[{ required: true }]}>
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="accessibility" label="道路可达性" rules={[{ required: true }]}>
                <Select options={ACCESSIBILITIES.map((item) => ({ value: item, label: item }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="ownerContact" label="园主联系方式">
                <Input placeholder="如 135****2043（周园主）" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="bloom" label="盛花期区间" rules={[{ required: true, message: '请选择盛花期区间' }]}>
                <DatePicker.RangePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="historyYears" label="历史授粉年份（顿号分隔）">
                <Input placeholder="如 2024、2025" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="note" label="备注">
                <Input placeholder="行距、坡向等" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="经纬度">
            <CoordPicker value={coord} onChange={setCoord} orchards={orchards} dropPoints={dropPoints} />
          </Form.Item>
          <OrchardSuggest suggest={suggestPreview} />
        </Form>
      </Modal>

      <Modal
        title={`新增投放点 · ${dropOwner?.name ?? ''}`}
        open={dropModal}
        onCancel={() => setDropModal(false)}
        onOk={() => void submitDrop()}
        width={720}
        okText="保存"
      >
        <Form form={dropForm} layout="vertical">
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="code" label="编号" rules={[{ required: true, message: '请填写投放点编号' }]}>
                <Input placeholder="如 A-03" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="capacityBoxes" label="可容纳箱数" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="waterDistance" label="水源距离（米）">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dropWindow" label="投放时间窗" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="withdrawTime" label="撤场时间" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="owner" label="责任人">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shade" label="遮阴条件">
                <Input placeholder="如 北侧有防风林，午后半阴" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="colonyCodes" label="安排群号（按计划时间窗判断群体可用性：已撤场释放可再安排，未登记回执按原计划占用）">
                <Select mode="multiple" options={colonyOptions()} placeholder="不可用群体已置灰，可先调整计划时间窗或到回执页登记撤场" />
              </Form.Item>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {planStart && planEnd
                  ? `该时间窗（${planStart} ~ ${planEnd}）内可用群体：${
                      availableColonies(colonies, planStart, planEnd, dropPoints)
                        .map((item) => item.code)
                        .join('、') || '无'
                    }`
                  : '选择投放 / 撤场时间后，自动判断各群体在该时间窗是否可用'}
              </Typography.Text>
            </Col>
          </Row>
          <Form.Item label="经纬度">
            <CoordPicker value={dropCoord} onChange={setDropCoord} orchards={orchards} dropPoints={dropPoints} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`执行回执 · ${receiptPoint ? `${receiptPoint.code}（${orchardNameOf(receiptPoint.orchardId)}）` : ''}`}
        open={receiptModal}
        onCancel={() => setReceiptModal(false)}
        onOk={() => void submitReceipt()}
        width={640}
        okText="提交回执"
        footer={
          <Space>
            {receiptPoint?.receipt ? (
              <Button danger onClick={() => void clearReceipt()}>
                清除回执
              </Button>
            ) : null}
            <Button onClick={() => setReceiptModal(false)}>取消</Button>
            <Button type="primary" onClick={() => void submitReceipt()}>
              提交回执
            </Button>
          </Space>
        }
      >
        {receiptPoint ? (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message={`点位容量 ${receiptPoint.capacityBoxes} 箱 · 计划 ${receiptPoint.dropWindow} ~ ${receiptPoint.withdrawTime} · 已安排群号 ${
              receiptPoint.colonyCodes.length > 0 ? receiptPoint.colonyCodes.join('、') : '（无）'
            }`}
          />
        ) : null}
        <Form form={receiptForm} layout="vertical">
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="执行状态" rules={[{ required: true, message: '请选择执行状态' }]}>
                <Select
                  options={RECEIPT_STATUSES.map((item) => ({ value: item, label: item }))}
                  onChange={() => receiptForm.validateFields(['extendedWithdrawTime'])}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="actualBoxes"
                label="实际投放箱数"
                rules={[
                  { required: true, message: '请填写实际箱数' },
                  {
                    validator: (_, value) => {
                      const max = receiptPoint?.capacityBoxes ?? 0
                      if (Number(value) > max) {
                        return Promise.reject(new Error(`超出点位容量 ${max} 箱，超出 ${Number(value) - max} 箱，无法保存`))
                      }
                      return Promise.resolve()
                    }
                  }
                ]}
                extra={receiptPoint ? `点位可容纳 ${receiptPoint.capacityBoxes} 箱，超出将拒存` : undefined}
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="arrivedAt" label="实际到达 / 投放日期" rules={[{ required: true, message: '请选择实际到达日期' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item shouldUpdate noStyle>
                {() =>
                  receiptForm.getFieldValue('status') === '已撤场' ? (
                    <Form.Item name="withdrewAt" label="实际撤场日期" rules={[{ required: true, message: '请选择实际撤场日期' }]}>
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item shouldUpdate noStyle>
                {() =>
                  receiptForm.getFieldValue('status') === '延期' ? (
                    <Form.Item
                      name="extendedWithdrawTime"
                      label="新撤场日"
                      rules={[
                        { required: true, message: '延期必须填写新撤场日' },
                        {
                          validator: (_, value) => {
                            if (value && receiptPoint && dayjs(value).isBefore(dayjs(receiptPoint.withdrawTime), 'day')) {
                              return Promise.reject(new Error('新撤场日不能早于原撤场日'))
                            }
                            return Promise.resolve()
                          }
                        }
                      ]}
                      extra={receiptPoint ? `原撤场日 ${receiptPoint.withdrawTime}，总表与导出按新撤场日计占用` : undefined}
                    >
                      <DatePicker style={{ width: '100%' }} />
                    </Form.Item>
                  ) : (
                    <Form.Item label="新撤场日">
                      <Input disabled placeholder="仅延期状态需要填写" />
                    </Form.Item>
                  )
                }
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="exceptionNote" label="异常说明">
                <Input.TextArea rows={2} placeholder="如 低温延后花期、1 群螨害提前回场、实际少投 2 箱等" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  )
}

/** 建议箱数提示条（面积 × 需蜂强度向上取整，最少 1 箱） */
function OrchardSuggest({ suggest }: { suggest: number }): JSX.Element {
  return (
    <Typography.Text type="secondary">
      系统建议投放 {suggest} 箱；按每个投放点 8 箱估算，约需 {Math.max(1, Math.ceil(suggest / 8))} 个投放点。
    </Typography.Text>
  )
}
