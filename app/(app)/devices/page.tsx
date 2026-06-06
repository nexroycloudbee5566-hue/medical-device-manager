'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Device, DEVICE_STATUS_LABEL, DeviceStatus, Profile } from '@/lib/types'
import { logAuditEvent } from '@/lib/audit-log'
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
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  X,
  Download,
  Copy,
  Printer,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { downloadCsv, csvFilename } from '@/lib/csv-export'
import { buildDevicesCsv } from '@/lib/export-csv-data'
import Link from 'next/link'
import {
  workbookFromArrayBuffer,
  parseDeviceRegistryWorkbook,
  excelImportRowToDeviceInsert,
  detectDeviceRegistrySheet,
} from '@/lib/excel-device-import'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  MeLabelPrintDialog,
  type MeLabelPrintTarget,
} from '@/components/devices/me-label-print-dialog'
import { DeviceKarte } from '@/components/devices/device-karte'

const STATUS_BADGE: Record<DeviceStatus, string> = {
  active: 'bg-green-100 text-green-700 border-0',
  moved: 'bg-blue-100 text-blue-700 border-0',
  disposed: 'bg-slate-100 text-slate-500 border-0',
  unknown: 'bg-yellow-100 text-yellow-700 border-0',
  repair: 'bg-orange-100 text-orange-700 border-0',
}

const STATUS_FILTER_OPTIONS: { value: DeviceStatus; label: string }[] = [
  { value: 'active', label: '利用中' },
  { value: 'moved', label: '移動' },
  { value: 'disposed', label: '破棄' },
  { value: 'unknown', label: '不明' },
  { value: 'repair', label: '修理中' },
]

type SortKey =
  | 'barcode'
  | 'name'
  | 'equipment_category'
  | 'manufacturer'
  | 'location'
  | 'next_maintenance_due'
  | 'status'

function sortValue(d: Device, key: SortKey): string {
  switch (key) {
    case 'barcode':
      return d.barcode ?? ''
    case 'name':
      return d.name
    case 'equipment_category':
      return d.equipment_category ?? ''
    case 'manufacturer':
      return [d.manufacturer, d.model].filter(Boolean).join(' ')
    case 'location':
      return d.location ?? ''
    case 'next_maintenance_due':
      return d.next_maintenance_due ?? ''
    case 'status':
      return d.status
    default:
      return ''
  }
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'ja'),
  )
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
  next_maintenance_due: '',
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
  const [locationFilter, setLocationFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [managementFilter, setManagementFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('barcode')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [editDevice, setEditDevice] = useState<Device | null>(null)
  const [newDeviceOpen, setNewDeviceOpen] = useState(false)
  /** 複製元（新規登録フォームの初期値） */
  const [duplicateFrom, setDuplicateFrom] = useState<Device | null>(null)
  const [form, setForm] = useState(emptyDevice)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [labelPrintOpen, setLabelPrintOpen] = useState(false)
  const [labelPrintTargets, setLabelPrintTargets] = useState<MeLabelPrintTarget[]>([])
  const [karteDevice, setKarteDevice] = useState<Device | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      setIsAdmin((data as Pick<Profile, 'role'> | null)?.role === 'admin')
    })
  }, [supabase])

  const fetchDevices = useCallback(async () => {
    const { data, error } = await supabase.from('devices').select('*').order('barcode')
    if (error) {
      console.error('[機器台帳] 取得エラー:', error.message)
      alert(`機器一覧の取得に失敗しました: ${error.message}`)
      setLoading(false)
      return
    }
    setDevices((data as Device[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const karteDeviceId = karteDevice?.id
  useEffect(() => {
    if (!karteDeviceId) return
    const updated = devices.find((d) => d.id === karteDeviceId)
    if (updated) setKarteDevice(updated)
    else setKarteDevice(null)
  }, [devices, karteDeviceId])

  async function handleBarcodeSearch(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const code = barcodeInput.trim()
    if (!code) return
    const found = devices.find((d) => d.barcode === code)
    if (found) {
      setKarteDevice(found)
    } else {
      alert(`「${code}」に一致する機器が見つかりませんでした。`)
    }
    setBarcodeInput('')
  }

  const locationOptions = useMemo(
    () => uniqueSorted(devices.map((d) => d.location)),
    [devices],
  )
  const categoryOptions = useMemo(
    () => uniqueSorted(devices.map((d) => d.equipment_category)),
    [devices],
  )
  const managementOptions = useMemo(
    () => uniqueSorted(devices.map((d) => d.management_category)),
    [devices],
  )

  const hasActiveFilters =
    search !== '' ||
    statusFilter !== 'all' ||
    locationFilter !== 'all' ||
    categoryFilter !== 'all' ||
    managementFilter !== 'all'

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setLocationFilter('all')
    setCategoryFilter('all')
    setManagementFilter('all')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const list = devices.filter((d) => {
      if (
        q &&
        !d.name.toLowerCase().includes(q) &&
        !(d.barcode?.toLowerCase().includes(q)) &&
        !(d.manufacturer?.toLowerCase().includes(q)) &&
        !(d.model?.toLowerCase().includes(q)) &&
        !(d.location?.toLowerCase().includes(q)) &&
        !(d.equipment_category?.toLowerCase().includes(q)) &&
        !(d.management_category?.toLowerCase().includes(q)) &&
        !(d.serial_number?.toLowerCase().includes(q)) &&
        !(d.dealer?.toLowerCase().includes(q))
      )
        return false
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (locationFilter !== 'all' && (d.location ?? '') !== locationFilter) return false
      if (categoryFilter !== 'all' && (d.equipment_category ?? '') !== categoryFilter)
        return false
      if (managementFilter !== 'all' && (d.management_category ?? '') !== managementFilter)
        return false
      return true
    })

    return [...list].sort((a, b) => {
      const av = sortValue(a, sortKey)
      const bv = sortValue(b, sortKey)
      const cmp = av.localeCompare(bv, 'ja', { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [
    devices,
    search,
    statusFilter,
    locationFilter,
    categoryFilter,
    managementFilter,
    sortKey,
    sortDir,
  ])

  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    if (!isAdmin) {
      alert('Excel取込は管理者のみ利用できます。')
      e.target.value = ''
      return
    }
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
      void logAuditEvent(supabase, {
        action: 'import',
        entityType: 'device',
        summary: `機器台帳 Excel 取込（新規 ${toInsert.length} / 更新 ${toUpdate.length}）`,
        metadata: { inserted: toInsert.length, updated: toUpdate.length },
      })
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
    const name = form.name.trim()
    if (!name) {
      alert('機種名を入力してください。')
      return
    }
    if (!editDevice && duplicateFrom && !form.barcode.trim()) {
      alert('複製登録では、新しい ME No. を入力してください。')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name,
        barcode: form.barcode.trim() || null,
        model: form.model.trim() || null,
        manufacturer: form.manufacturer.trim() || null,
        serial_number: form.serial_number.trim() || null,
        manufacture_year_month: form.manufacture_year_month.trim() || null,
        location: form.location.trim() || null,
        equipment_category: form.equipment_category.trim() || null,
        specific_maintenance: form.specific_maintenance.trim() || null,
        management_category: form.management_category.trim() || null,
        dealer: form.dealer.trim() || null,
        purchase_date: form.purchase_date.trim() || null,
        status: form.status,
        next_maintenance_due: form.next_maintenance_due.trim() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (editDevice) {
        const { data, error } = await supabase
          .from('devices')
          .update(payload)
          .eq('id', editDevice.id)
          .select('id')
          .maybeSingle()

        if (error) {
          console.error('[機器台帳] 更新エラー:', error)
          alert(
            `保存に失敗しました: ${error.message}\n\nステータスが「利用中/移動/破棄/不明/修理中」に対応していない場合は、Supabaseで update_status_check_constraint.sql を実行してください。`,
          )
          return
        }
        if (!data) {
          alert('保存に失敗しました（対象の機器が見つかりません）。一覧を更新してから再度お試しください。')
          return
        }
        void logAuditEvent(supabase, {
          action: 'update',
          entityType: 'device',
          entityId: editDevice.id,
          summary: `機器を更新（${payload.barcode ?? payload.name}）`,
        })
      } else {
        const { error } = await supabase.from('devices').insert(payload)
        if (error) {
          console.error('[機器台帳] 登録エラー:', error)
          alert(`登録に失敗しました: ${error.message}`)
          return
        }
        void logAuditEvent(supabase, {
          action: 'create',
          entityType: 'device',
          summary: `機器を登録（${payload.barcode ?? payload.name}）`,
        })
      }

      await fetchDevices()
      setEditDevice(null)
      setNewDeviceOpen(false)
      setDuplicateFrom(null)
      setForm(emptyDevice)
    } finally {
      setSaving(false)
    }
  }

  function openNew() {
    setDuplicateFrom(null)
    setForm(emptyDevice)
    setNewDeviceOpen(true)
  }

  function openEdit(device: Device) {
    setDuplicateFrom(null)
    setForm(deviceToForm(device))
    setEditDevice(device)
    setNewDeviceOpen(false)
  }

  function deviceDeleteLabel(device: Device): string {
    return device.barcode ? `${device.barcode}（${device.name}）` : device.name
  }

  async function handleDeleteDevice(device: Device) {
    if (
      !confirm(
        `この機器を台帳から削除しますか？\n${deviceDeleteLabel(device)}\n\n点検記録も削除されます。修理依頼との紐づけは解除されます。取り消せません。`,
      )
    ) {
      return
    }

    setDeletingId(device.id)
    try {
      const { error: unlinkError } = await supabase
        .from('requests')
        .update({ device_id: null })
        .eq('device_id', device.id)
      if (unlinkError) {
        console.error('[機器台帳] 依頼紐づけ解除エラー:', unlinkError)
        alert(`削除に失敗しました: ${unlinkError.message}`)
        return
      }

      const { error } = await supabase.from('devices').delete().eq('id', device.id)
      if (error) {
        console.error('[機器台帳] 削除エラー:', error)
        alert(`削除に失敗しました: ${error.message}`)
        return
      }

      void logAuditEvent(supabase, {
        action: 'delete',
        entityType: 'device',
        entityId: device.id,
        summary: `機器を削除（${deviceDeleteLabel(device)}）`,
      })

      if (editDevice?.id === device.id) {
        setEditDevice(null)
        setNewDeviceOpen(false)
        setDuplicateFrom(null)
        setForm(emptyDevice)
      }
      await fetchDevices()
    } finally {
      setDeletingId(null)
    }
  }

  function openDuplicate(device: Device) {
    setEditDevice(null)
    setDuplicateFrom(device)
    setForm(deviceToFormForDuplicate(device))
    setNewDeviceOpen(true)
  }

  function openLabelPrint(devs: MeLabelPrintTarget[]) {
    if (!isAdmin) {
      alert('ラベル印刷は管理者のみ利用できます。')
      return
    }
    const withMe = devs.filter((d) => d.barcode?.trim())
    if (withMe.length === 0) {
      alert('ME No. が設定された機器がありません。')
      return
    }
    if (withMe.length > 50 && !confirm(`${withMe.length} 件のラベルを印刷します。よろしいですか？`)) {
      return
    }
    setLabelPrintTargets(withMe)
    setLabelPrintOpen(true)
  }

  function exportCsv() {
    if (filtered.length === 0) {
      alert('エクスポートするデータがありません。')
      return
    }
    downloadCsv(csvFilename('機器台帳'), buildDevicesCsv(filtered))
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
          {isAdmin && (
            <>
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
              <Button
                variant="outline"
                size="sm"
                disabled={loading || filtered.every((d) => !d.barcode?.trim())}
                onClick={() => openLabelPrint(filtered)}
                title="表示中の機器の ME No. ラベルを印刷"
              >
                <Printer className="h-4 w-4 mr-1.5" />
                ラベル印刷
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={loading || filtered.length === 0}
            onClick={exportCsv}
          >
            <Download className="h-4 w-4 mr-1.5" />
            CSV出力
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

      {/* Filters & sort */}
      <div className="space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
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
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="状態" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての状態</SelectItem>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={(v) => setLocationFilter(v ?? 'all')}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="設置場所" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての設置場所</SelectItem>
              {locationOptions.map((loc) => (
                <SelectItem key={loc} value={loc}>
                  {loc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? 'all')}>
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="機器区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての機器区分</SelectItem>
              {categoryOptions.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={managementFilter} onValueChange={(v) => setManagementFilter(v ?? 'all')}>
            <SelectTrigger className="w-44 bg-white">
              <SelectValue placeholder="管理区分" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">すべての管理区分</SelectItem>
              {managementOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500">
              <X className="h-4 w-4 mr-1" />
              絞り込み解除
            </Button>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {filtered.length} 件表示
          {devices.length !== filtered.length && `（全 ${devices.length} 件）`}
          <span className="text-slate-400 mx-2">·</span>
          行をクリックで機器カルテ表示 · 列見出しをクリックで並べ替え
        </p>
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
        <div className={cn('grid gap-6 items-start', karteDevice ? 'lg:grid-cols-2' : 'grid-cols-1')}>
        <Card className="border-0 shadow-sm overflow-hidden min-w-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <SortableHead label="ME No." column="barcode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-28" />
                <SortableHead label="機種名" column="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="機器区分" column="equipment_category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="メーカー / 型式" column="manufacturer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="設置場所" column="location" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="次回点検日" column="next_maintenance_due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortableHead label="状態" column="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-24" />
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((device) => (
                <TableRow
                  key={device.id}
                  className={cn(
                    'hover:bg-slate-50 cursor-pointer',
                    karteDevice?.id === device.id && 'bg-blue-50 hover:bg-blue-50',
                  )}
                  onClick={() => setKarteDevice(device)}
                >
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
                    {device.location ?? '-'}
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
                    <Badge className={STATUS_BADGE[normalizeFormStatus(device.status)]}>
                      {DEVICE_STATUS_LABEL[normalizeFormStatus(device.status)]}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(device)}
                        className="h-8 w-8 p-0"
                        title="編集"
                      >
                        <Edit className="h-4 w-4 text-slate-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDuplicate(device)}
                        className="h-8 w-8 p-0"
                        title="複製"
                      >
                        <Copy className="h-4 w-4 text-slate-400" />
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openLabelPrint([device])}
                          className="h-8 w-8 p-0"
                          title="ME No. ラベル印刷"
                          disabled={!device.barcode?.trim()}
                        >
                          <Printer className="h-4 w-4 text-slate-400" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDeleteDevice(device)}
                        className="h-8 w-8 p-0"
                        title="削除"
                        aria-label="削除"
                        disabled={deletingId === device.id}
                      >
                        {deletingId === device.id ? (
                          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        {karteDevice && (
          <DeviceKarte
            device={karteDevice}
            onClose={() => setKarteDevice(null)}
            className="lg:sticky lg:top-4"
          />
        )}
        </div>
      )}

      <MeLabelPrintDialog
        open={labelPrintOpen}
        onOpenChange={setLabelPrintOpen}
        targets={labelPrintTargets}
      />

      {/* Device form dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setEditDevice(null)
            setNewDeviceOpen(false)
            setDuplicateFrom(null)
            setForm(emptyDevice)
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editDevice ? '機器情報を編集' : duplicateFrom ? '機器情報を複製（新規登録）' : '新規機器登録'}
            </DialogTitle>
          </DialogHeader>
          {duplicateFrom && !editDevice && (
            <p className="text-xs text-blue-800 bg-blue-50 border border-blue-100 rounded-md px-3 py-2 -mt-2">
              「{duplicateFrom.barcode ?? duplicateFrom.name}」の内容をコピーしています。ME No. と製造番号は空欄です。登録前に必ず入力してください。
            </p>
          )}
          <DeviceForm
            form={form}
            locationOptions={locationOptions}
            onChange={(key, val) => setForm((f) => ({ ...f, [key]: val }))}
          />
          <p className="text-xs text-slate-500 pt-1">
            同一型式の定期点検テンプレートは{' '}
            <Link href="/maintenance/master" className="text-blue-600 underline font-medium">
              メンテナンスマスタ
            </Link>
            で登録してください（メーカー・型式ごと）。
            {isAdmin && (
              <>
                P-touch ラベルは{' '}
                <button
                  type="button"
                  className="text-blue-600 underline font-medium"
                  disabled={!form.barcode.trim()}
                  onClick={() =>
                    openLabelPrint([
                      {
                        barcode: form.barcode.trim(),
                        name: form.name.trim() || '（未入力）',
                        location: form.location.trim() || null,
                      },
                    ])
                  }
                >
                  ME No. から印刷
                </button>
                （要セットアップ: docs/ptouch-setup.md）。
              </>
            )}
          </p>
          <DialogFooter
            className={cn(
              'flex-col-reverse gap-2 sm:flex-row',
              editDevice ? 'sm:justify-between' : 'sm:justify-end',
            )}
          >
            {editDevice && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => void handleDeleteDevice(editDevice)}
                disabled={saving || deletingId === editDevice.id}
              >
                {deletingId === editDevice.id && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                削除する
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => {
                  setEditDevice(null)
                  setNewDeviceOpen(false)
                  setDuplicateFrom(null)
                  setForm(emptyDevice)
                }}
              >
                キャンセル
              </Button>
              <Button onClick={handleSave} disabled={saving || !form.name || deletingId != null}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editDevice ? '保存する' : '登録する'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableHead({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string
  column: SortKey
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sortKey === column
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          'inline-flex items-center gap-1 font-medium hover:text-slate-900 transition-colors',
          active ? 'text-slate-900' : 'text-slate-600',
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" />
        )}
      </button>
    </TableHead>
  )
}

function normalizeFormStatus(status: string): DeviceStatus {
  if (status === 'inactive') return 'disposed'
  const allowed: DeviceStatus[] = ['active', 'moved', 'disposed', 'unknown', 'repair']
  if (allowed.includes(status as DeviceStatus)) return status as DeviceStatus
  return 'unknown'
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
    purchase_date: device.purchase_date?.slice(0, 10) ?? '',
    status: normalizeFormStatus(device.status),
    next_maintenance_due: device.next_maintenance_due?.slice(0, 10) ?? '',
    notes: device.notes ?? '',
  }
}

/** 複製用: 一意の ME No.・製造番号は空にする */
function deviceToFormForDuplicate(device: Device): typeof emptyDevice {
  return {
    ...deviceToForm(device),
    barcode: '',
    serial_number: '',
  }
}

const LOCATION_UNSET = '__unset__'

function DeviceForm({
  form,
  locationOptions,
  onChange,
}: {
  form: typeof emptyDevice
  locationOptions: string[]
  onChange: (key: string, val: string) => void
}) {
  const formLocationOptions = useMemo(() => {
    const current = form.location.trim()
    if (current && !locationOptions.includes(current)) {
      return uniqueSorted([...locationOptions, current])
    }
    return locationOptions
  }, [locationOptions, form.location])

  return (
    <div className="grid grid-cols-2 gap-4 py-2">
      <div className="space-y-1.5">
        <Label>ME No.</Label>
        <Input value={form.barcode} onChange={(e) => onChange('barcode', e.target.value)} placeholder="ME-SP001" />
      </div>
      <div className="space-y-1.5">
        <Label>設置場所</Label>
        <Select
          value={form.location.trim() || LOCATION_UNSET}
          onValueChange={(v) => onChange('location', v === LOCATION_UNSET ? '' : (v ?? ''))}
          disabled={formLocationOptions.length === 0}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="設置場所を選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LOCATION_UNSET}>未選択</SelectItem>
            {formLocationOptions.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {formLocationOptions.length === 0 && (
          <p className="text-xs text-amber-800">
            登録済みの設置場所がありません。Excel 取込などで先に設置場所を登録してください。
          </p>
        )}
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
      <div className="space-y-1.5">
        <Label>次回点検予定</Label>
        <Input
          type="date"
          value={form.next_maintenance_due}
          onChange={(e) => onChange('next_maintenance_due', e.target.value)}
        />
        <p className="text-[11px] text-slate-500">未入力でクリア。年間計画・ダッシュボードの予定日に反映されます。</p>
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>備考</Label>
        <Textarea value={form.notes} onChange={(e) => onChange('notes', e.target.value)} placeholder="備考" rows={2} />
      </div>
    </div>
  )
}
