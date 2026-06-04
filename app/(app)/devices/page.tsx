'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Device, DEVICE_STATUS_LABEL, DeviceStatus } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Plus,
  Search,
  Barcode,
  Edit,
  Loader2,
  Cpu,
  RefreshCw,
  Upload,
} from 'lucide-react'
import Link from 'next/link'
import {
  workbookFromArrayBuffer,
  parseDeviceRegistryWorkbook,
  excelImportRowToDeviceInsert,
  detectDeviceRegistrySheet,
} from '@/lib/excel-device-import'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

const STATUS_BADGE: Record<DeviceStatus, string> = {
  active: 'bg-green-100 text-green-700 border-0',
  moved: 'bg-blue-100 text-blue-700 border-0',
  disposed: 'bg-slate-100 text-slate-500 border-0',
  unknown: 'bg-yellow-100 text-yellow-700 border-0',
  repair: 'bg-orange-100 text-orange-700 border-0',
}

const emptyDevice = {
  name: '',
  barcode: '',
  model: '',
  manufacturer: '',
  serial_number: '',
  manufacture_year_month: '',
  location: '',
  equipment_category: '',
  specific_maintenance: '',
  management_category: '',
  dealer: '',
  purchase_date: '',
  status: 'active' as DeviceStatus,
  notes: '',
}

export default function DevicesPage() {
  const supabase = createClient()
  const barcodeRef = useRef<HTMLInputElement>(null)
  const excelImportRef = useRef<HTMLInputElement>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(true)
  const [importBusy, setImportBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [newDeviceOpen, setNewDeviceOpen] = useState(false)
  const [form, setForm] = useState(emptyDevice)
  const [saving, setSaving] = useState(false)

  const fetchDevices = useCallback(async () => {
    const { data } = await supabase.from('devices').select('*').order('name')
    setDevices((data as Device[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  async function handleBarcodeSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const code = barcodeInput.trim()
    if (!code) return
    const found = devices.find((d) => d.barcode === code)
    if (found) {
      setEditDevice(found)
      setForm(deviceToForm(found))
    } else {
      alert(`「${code}」に一致する機器が見つかりませんでした。`)
    }
    setBarcodeInput('')
  }

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase()
    if (
      q &&
      !d.name.toLowerCase().includes(q) &&
      !(d.barcode?.toLowerCase().includes(q)) &&
      !(d.manufacturer?.toLowerCase().includes(q)) &&
      !(d.model?.toLowerCase().includes(q)) &&
      !(d.location?.toLowerCase().includes(q)) &&
      !(d.equipment_category?.toLowerCase().includes(q)) &&
      !(d.serial_number?.toLowerCase().includes(q))
    )
      return false
    if (statusFilter !== 'all' && d.status !== statusFilter) return false
    return true
  })

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportBusy(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = workbookFromArrayBuffer(buf)
      if (!detectDeviceRegistrySheet(wb)) {
        alert('榊原温泉病院 医療機器台帳の形式ではありません。「シート1」に ME No. と機種名があるか確認してください。')
        return
      }
      const rows = parseDeviceRegistryWorkbook(wb)
      if (rows.length === 0) {
        alert('取り込める行がありません。ME No. と機種名が入った行があるか確認してください。')
        return
      }
      // Excel内に同一 ME No. が複数行ある場合、後行で上書き（重複を除去）
      const deduped = new Map<string, ReturnType<typeof excelImportRowToDeviceInsert>>()
      for (const r of rows) {
        deduped.set(r.barcode, excelImportRowToDeviceInsert(r))
      }
      const payloads = [...deduped.values()]
      const dupCount = rows.length - payloads.length

      // 既存の barcode 一覧を取得して UPDATE / INSERT を分ける
      const { data: existingRaw } = await supabase
        .from('devices')
        .select('id, barcode')
      const existingMap = new Map<string, string>(
        (existingRaw ?? [])
          .filter((d) => d.barcode)
          .map((d) => [d.barcode as string, d.id as string])
      )

      const toInsert = payloads.filter((p) => !existingMap.has(p.barcode as string))
      const toUpdate = payloads.filter((p) => existingMap.has(p.barcode as string))

      const chunkSize = 40

      // INSERT
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize)
        const { error } = await supabase.from('devices').insert(chunk)
        if (error) {
          console.error(error)
          alert(`インポートに失敗しました（新規登録）: ${error.message}`)
          return
        }
      }

      // UPDATE（barcode でマッチした既存行を1件ずつ更新）
      for (const p of toUpdate) {
        const id = existingMap.get(p.barcode as string)!
        const { error } = await supabase.from('devices').update(p).eq('id', id)
        if (error) {
          console.error(error)
          alert(`インポートに失敗しました（更新）: ${error.message}`)
          return
        }
      }

      const dupMsg = dupCount > 0 ? `\n（同一 ME No. の重複 ${dupCount} 行は除去済み）` : ''
      alert(`Excelから ${payloads.length} 件を取り込みました。\n新規: ${toInsert.length} 件 / 更新: ${toUpdate.length} 件${dupMsg}`)
      fetchDevices()
    } catch (err) {
      console.error(err)
      alert('ファイルの読み込みに失敗しました。フォーマットを確認してください。')
    } finally {
      setImportBusy(false)
      e.target.value = ''
    }
  }

  async function handleSave() {
    setSaving(true)
    const payload = {
      name: form.name,
      barcode: form.barcode || null,
      model: form.model || null,
      manufacturer: form.manufacturer || null,
      serial_number: form.serial_number || null,
      manufacture_year_month: form.manufacture_year_month || null,
      location: form.location || null,
      equipment_category: form.equipment_category || null,
      specific_maintenance: form.specific_maintenance || null,
      management_category: form.management_category || null,
      dealer: form.dealer || null,
      purchase_date: form.purchase_date || null,
      status: form.status,
      notes: form.notes || null,
      hospital_id: null,
      updated_at: new Date().toISOString(),
    }

    if (editDevice) {
      await supabase.from('devices').update(payload).eq('id', editDevice.id)
    } else {
      await supabase.from('devices').insert(payload)
    }
    setSaving(false)
    setEditDevice(null)
    setNewDeviceOpen(false)
    setForm(emptyDevice)
    fetchDevices()
  }

  function openNew() {
    setForm(emptyDevice)
    setNewDeviceOpen(true)
  }

  function openEdit(device: Device) {
    setForm(deviceToForm(device))
    setEditDevice(device)
  }

  const dialogOpen = newDeviceOpen || !!editDevice

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">機器台帳</h1>
          <p className="text-slate-500 text-sm mt-0.5">登録機器の管理・検索</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={excelImportRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleExcelImport}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importBusy}
            onClick={() => excelImportRef.current?.click()}
          >
            {importBusy ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-1.5" />
            )}
            Excel取込
          </Button>
          <Button variant="outline" size="sm" onClick={fetchDevices}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            更新
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            機器登録
          </Button>
        </div>
      </div>

      {/* Barcode scanner */}
      <Card className="border-0 shadow-sm bg-blue-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <Barcode className="h-5 w-5 text-blue-600 shrink-0" />
            <div className="flex-1">
              <Label className="text-blue-700 font-medium text-sm">ME No.・バーコード検索</Label>
              <Input
                ref={barcodeRef}
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeSearch}
                placeholder="ME No.を入力またはバーコードをスキャンしEnter"
                className="mt-1 bg-white border-blue-200"
                autoFocus
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="機種名・ME No.・メーカー・設置場所などで検索"
            className="pl-9 bg-white"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-32 bg-white">
            <SelectValue placeholder="状態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての状態</SelectItem>
            <SelectItem value="active">稼働中</SelectItem>
            <SelectItem value="inactive">休止中</SelectItem>
            <SelectItem value="repair">修理中</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />読み込み中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Cpu className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">機器が見つかりません</p>
        </div>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-28">ME No.</TableHead>
                <TableHead>機種名</TableHead>
                <TableHead>機器区分</TableHead>
                <TableHead>メーカー / 型式</TableHead>
                <TableHead>設置場所</TableHead>
                <TableHead>次回点検日</TableHead>
                <TableHead className="w-20">状態</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((device) => (
                <TableRow key={device.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-xs text-slate-500">
                    {device.barcode ?? '-'}
                  </TableCell>
                  <TableCell className="font-medium">{device.name}</TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[8rem] truncate">
                    {device.equipment_category ?? '-'}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {[device.manufacturer, device.model].filter(Boolean).join(' / ') || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {[device.department, device.location].filter(Boolean).join(' ') || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {device.next_maintenance_due ? (
                      <span className={
                        new Date(device.next_maintenance_due) < new Date()
                          ? 'text-red-600 font-medium'
                          : new Date(device.next_maintenance_due) <
                            new Date(Date.now() + 30 * 86400000)
                            ? 'text-orange-600 font-medium'
                            : 'text-slate-600'
                      }>
                        {format(new Date(device.next_maintenance_due), 'yyyy/MM/dd', { locale: ja })}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[device.status]}>
                      {DEVICE_STATUS_LABEL[device.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(device)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-4 w-4 text-slate-400" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Device form dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) { setEditDevice(null); setNewDeviceOpen(false); setForm(emptyDevice) }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editDevice ? '機器情報を編集' : '新規機器登録'}</DialogTitle>
          </DialogHeader>
          <DeviceForm
            form={form}
            onChange={(key, val) => setForm((f) => ({ ...f, [key]: val }))}
          />
          <p className="text-xs text-slate-500 pt-1">
            同一型式の定期点検テンプレートは{' '}
            <Link href="/maintenance/master" className="text-blue-600 underline font-medium">
              メンテナンスマスタ
            </Link>
            で登録してください（メーカー・型式ごと）。
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setEditDevice(null); setNewDeviceOpen(false); setForm(emptyDevice) }}
            >
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editDevice ? '保存する' : '登録する'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function deviceToForm(device: Device): typeof emptyDevice {
  return {
    name: device.name,
    barcode: device.barcode ?? '',
    model: device.model ?? '',
    manufacturer: device.manufacturer ?? '',
    serial_number: device.serial_number ?? '',
    manufacture_year_month: device.manufacture_year_month ?? '',
    location: device.location ?? '',
    equipment_category: device.equipment_category ?? '',
    specific_maintenance: device.specific_maintenance ?? '',
    management_category: device.management_category ?? '',
    dealer: device.dealer ?? '',
    purchase_date: device.purchase_date ?? '',
    status: device.status,
    notes: device.notes ?? '',
  }
}

function DeviceForm({
  form,
  onChange,
}: {
  form: typeof emptyDevice
  onChange: (key: string, val: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div className="space-y-1.5">
        <Label>ME No.</Label>
        <Input value={form.barcode} onChange={(e) => onChange('barcode', e.target.value)} placeholder="ME-SP001" />
      </div>
      <div className="space-y-1.5">
        <Label>設置場所</Label>
        <Input value={form.location} onChange={(e) => onChange('location', e.target.value)} placeholder="2F東" />
      </div>
      <div className="space-y-1.5">
        <Label>機器区分</Label>
        <Input value={form.equipment_category} onChange={(e) => onChange('equipment_category', e.target.value)} placeholder="シリンジポンプ" />
      </div>
      <div className="space-y-1.5">
        <Label>特定保守</Label>
        <Input value={form.specific_maintenance} onChange={(e) => onChange('specific_maintenance', e.target.value)} placeholder="○ / -" />
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>管理区分</Label>
        <Input value={form.management_category} onChange={(e) => onChange('management_category', e.target.value)} placeholder="高度管理医療機器" />
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>機種名 *</Label>
        <Input value={form.name} onChange={(e) => onChange('name', e.target.value)} placeholder="機種名" required />
      </div>
      <div className="space-y-1.5">
        <Label>型式</Label>
        <Input value={form.model} onChange={(e) => onChange('model', e.target.value)} placeholder="TE-332S" />
      </div>
      <div className="space-y-1.5">
        <Label>製造元メーカー</Label>
        <Input value={form.manufacturer} onChange={(e) => onChange('manufacturer', e.target.value)} placeholder="TERUMO" />
      </div>
      <div className="space-y-1.5">
        <Label>製造番号</Label>
        <Input value={form.serial_number} onChange={(e) => onChange('serial_number', e.target.value)} placeholder="製造番号" />
      </div>
      <div className="space-y-1.5">
        <Label>製造年月</Label>
        <Input value={form.manufacture_year_month} onChange={(e) => onChange('manufacture_year_month', e.target.value)} placeholder="2010/01" />
      </div>
      <div className="space-y-1.5">
        <Label>購入年月</Label>
        <Input type="date" value={form.purchase_date} onChange={(e) => onChange('purchase_date', e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label>販売ディーラー</Label>
        <Input value={form.dealer} onChange={(e) => onChange('dealer', e.target.value)} placeholder="スズケン" />
      </div>
      <div className="space-y-1.5">
        <Label>ステータス</Label>
        <Select value={form.status} onValueChange={(v) => onChange('status', v ?? 'active')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">利用中</SelectItem>
            <SelectItem value="moved">移動</SelectItem>
            <SelectItem value="disposed">破棄</SelectItem>
            <SelectItem value="unknown">不明</SelectItem>
            <SelectItem value="repair">修理中</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>備考</Label>
        <Textarea value={form.notes} onChange={(e) => onChange('notes', e.target.value)} placeholder="備考" rows={2} />
      </div>
    </div>
  )
}
