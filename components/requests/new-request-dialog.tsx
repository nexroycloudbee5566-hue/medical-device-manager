'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Device, RequestType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Barcode } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  /** 指定時は依頼種別を固定（修理／購入の各画面から開くとき） */
  fixedType?: RequestType
}

export function NewRequestDialog({ open, onClose, onCreated, fixedType }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const [type, setType] = useState<RequestType>(fixedType ?? 'repair')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [selectedRepairDevice, setSelectedRepairDevice] = useState<Device | null>(null)
  const [requestedEquipment, setRequestedEquipment] = useState('')
  const [receptionCeName, setReceptionCeName] = useState('')
  const [requesterName, setRequesterName] = useState('')
  const [requesterDept, setRequesterDept] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (fixedType) setType(fixedType)
  }, [fixedType, open])

  async function lookupRepairDeviceByBarcode() {
    const code = barcodeInput.trim()
    if (!code) return
    setLookupBusy(true)
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .eq('barcode', code)
        .maybeSingle()

      if (error || !data) {
        alert(`バーコード「${code}」に一致する機器が見つかりませんでした。`)
        return
      }
      const dev = data as Device
      if (dev.status !== 'active') {
        alert('対象機器は稼働中の機器のみ選択できます。')
        return
      }
      setSelectedRepairDevice(dev)
      setBarcodeInput('')
      setRequestedEquipment(`${dev.name}${dev.barcode ? ` [${dev.barcode}]` : ''}`)
    } finally {
      setLookupBusy(false)
    }
  }

  function clearRepairDevice() {
    setSelectedRepairDevice(null)
    setRequestedEquipment('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const effectiveType = fixedType ?? type
    const recv = receptionCeName.trim()
    const equip = requestedEquipment.trim()
    const dept = requesterDept.trim()
    const name = requesterName.trim()
    const desc = description.trim()

    if (!recv) {
      alert('受付CEを入力してください。')
      return
    }
    if (effectiveType === 'repair' && !selectedRepairDevice) {
      alert('対象機器をバーコードで選択してください。')
      return
    }
    if (!equip) {
      alert('依頼機器を入力してください。')
      return
    }
    if (!name) {
      alert('依頼者氏名を入力してください。')
      return
    }
    if (!dept) {
      alert('依頼者部署を入力してください。')
      return
    }
    if (!desc) {
      alert('依頼内容を入力してください。')
      return
    }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()

    const { data: request, error } = await supabase.from('requests').insert({
      type: effectiveType,
      status: '依頼受付',
      hospital_id: null,
      device_id: effectiveType === 'repair' ? (selectedRepairDevice?.id ?? null) : null,
      requested_equipment: equip,
      reception_ce_name: recv,
      requester_name: name,
      requester_dept: dept,
      description: desc,
      notes: notes.trim() || null,
      created_by: user?.id,
    }).select().single()

    if (!error && request) {
      await supabase.from('request_logs').insert({
        request_id: request.id,
        from_status: null,
        to_status: '依頼受付',
        changed_by: user?.id,
        handled_by_name: recv,
      })
    }

    setLoading(false)
    if (!error) {
      onCreated()
      onClose()
      resetForm()
    }
  }

  function resetForm() {
    setType(fixedType ?? 'repair')
    setBarcodeInput('')
    setSelectedRepairDevice(null)
    setRequestedEquipment('')
    setReceptionCeName('')
    setRequesterName('')
    setRequesterDept('')
    setDescription('')
    setNotes('')
  }

  const effectiveType = fixedType ?? type

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); resetForm() } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新規依頼登録</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {!fixedType && (
            <div className="space-y-1.5">
              <Label>依頼種別 *</Label>
              <Select value={type} onValueChange={(v) => setType(v as RequestType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="repair">修理依頼</SelectItem>
                  <SelectItem value="purchase">購入依頼</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reception-ce">受付CE *</Label>
            <Input
              id="reception-ce"
              value={receptionCeName}
              onChange={(e) => setReceptionCeName(e.target.value)}
              placeholder="受付したCEの氏名"
              required
            />
          </div>

          {effectiveType === 'repair' && (
            <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/80 p-3">
              <Label className="text-blue-900 flex items-center gap-2">
                <Barcode className="h-4 w-4" />
                対象機器（バーコード）*
              </Label>
              <p className="text-xs text-blue-800/80 -mt-1">登録前にバーコードで機器を選択してください。</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                <Input
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      lookupRepairDeviceByBarcode()
                    }
                  }}
                  placeholder="バーコードを読み取りまたは入力して Enter"
                  className="bg-white border-blue-200 flex-1"
                  disabled={lookupBusy}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={lookupRepairDeviceByBarcode}
                  disabled={lookupBusy || !barcodeInput.trim()}
                >
                  {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : '選択'}
                </Button>
              </div>
              {selectedRepairDevice && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm bg-white rounded-md px-3 py-2 border border-blue-100">
                  <span className="text-slate-800 font-medium">
                    {selectedRepairDevice.name}
                    {selectedRepairDevice.barcode && (
                      <span className="font-mono text-slate-500 ml-2">[{selectedRepairDevice.barcode}]</span>
                    )}
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-500" onClick={clearRepairDevice}>
                    解除
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="requested-equipment">依頼機器 *</Label>
            <Textarea
              id="requested-equipment"
              value={requestedEquipment}
              onChange={(e) => setRequestedEquipment(e.target.value)}
              placeholder={
                effectiveType === 'purchase'
                  ? '例: 電動式ベッド NB-001 同等品／モニタ一体型除細動器 など'
                  : 'バーコードで選択すると自動入力されます。必要に応じて編集してください。'
              }
              rows={effectiveType === 'purchase' ? 3 : 2}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="requester">依頼者氏名 *</Label>
              <Input
                id="requester"
                value={requesterName}
                onChange={(e) => setRequesterName(e.target.value)}
                placeholder="山田 太郎"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dept">依頼者部署 *</Label>
              <Input
                id="dept"
                value={requesterDept}
                onChange={(e) => setRequesterDept(e.target.value)}
                placeholder="循環器内科"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">依頼内容 *</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="依頼の詳細を入力してください"
              rows={3}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">備考（任意）</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="未入力でも登録できます"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); resetForm() }}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              登録する
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
