'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Request, getStatusList, getNextStatus, REQUEST_TYPE_LABEL } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  RefreshCw,
  Wrench,
  ShoppingCart,
  Calendar,
  User,
  ChevronRight,
  Banknote,
  Cpu,
} from 'lucide-react'
import { coerceEstimateAmount, formatYen } from '@/lib/estimate-amount'

export const REQUEST_STATUS_COLORS: Record<string, string> = {
  '依頼受付': 'bg-slate-100 text-slate-700',
  '確認中': 'bg-blue-100 text-blue-700',
  '選定': 'bg-purple-100 text-purple-700',
  '業者見積依頼': 'bg-yellow-100 text-yellow-800',
  '見積受取': 'bg-orange-100 text-orange-700',
  '院内決済': 'bg-red-100 text-red-700',
  '業者報告': 'bg-pink-100 text-pink-700',
  '修理': 'bg-teal-100 text-teal-700',
  '購入': 'bg-teal-100 text-teal-700',
  '完了': 'bg-green-100 text-green-700',
}

export function RequestCard({
  request,
  onSelect,
  onStatusUpdate,
}: {
  request: Request
  onSelect: () => void
  onStatusUpdate: () => void
}) {
  const supabase = createClient()
  const [updating, setUpdating] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [pendingNext, setPendingNext] = useState<string | null>(null)
  const [handledByName, setHandledByName] = useState('')
  const nextStatus = getNextStatus(request.type, request.status)

  useEffect(() => {
    if (!advanceOpen) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('profiles').select('name').eq('id', user.id).maybeSingle().then(({ data }) => {
        setHandledByName(data?.name?.trim() ? data.name : '')
      })
    })
  }, [advanceOpen, supabase])

  function openAdvanceConfirm(next: string) {
    setPendingNext(next)
    setAdvanceOpen(true)
  }

  async function confirmAdvance() {
    const next = pendingNext
    if (!next) return
    const actor = handledByName.trim()
    if (!actor) {
      alert('対応者（記名）を入力してください。')
      return
    }
    setUpdating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('request_logs').insert({
        request_id: request.id,
        from_status: request.status,
        to_status: next,
        changed_by: user?.id,
        handled_by_name: actor,
      })
      await supabase
        .from('requests')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', request.id)
      setAdvanceOpen(false)
      setPendingNext(null)
      onStatusUpdate()
    } finally {
      setUpdating(false)
    }
  }

  const statusList = getStatusList(request.type)
  const currentIdx = statusList.indexOf(request.status as never)
  const progress = Math.round(((currentIdx) / (statusList.length - 1)) * 100)

  const equipmentLabel =
    (request.devices as { name?: string } | undefined)?.name?.trim() ||
    request.requested_equipment?.trim() ||
    null

  return (
    <>
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className={`p-2 rounded-lg shrink-0 ${request.type === 'repair' ? 'bg-orange-50' : 'bg-green-50'}`}>
                {request.type === 'repair'
                  ? <Wrench className="h-4 w-4 text-orange-600" />
                  : <ShoppingCart className="h-4 w-4 text-green-600" />
                }
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-slate-500">
                    {REQUEST_TYPE_LABEL[request.type]}
                  </span>
                  <Badge
                    className={`text-xs font-medium border-0 ${REQUEST_STATUS_COLORS[request.status] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {request.status}
                  </Badge>
                </div>
                <p className="font-semibold text-slate-800 mt-0.5 truncate">{request.description}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-slate-500"
              onClick={onSelect}
            >
              詳細
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-3">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>進捗</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-2 text-sm">
            {request.reception_ce_name?.trim() && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <User className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                <span className="truncate">受付: {request.reception_ce_name}</span>
              </div>
            )}
            {equipmentLabel && (
              <div className="flex items-start gap-1.5 text-slate-600">
                <Cpu className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span className="break-words">依頼機器: {equipmentLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-slate-500">
              <User className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{request.requester_name}</span>
              {request.requester_dept && (
                <span className="text-slate-400 truncate">({request.requester_dept})</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {format(new Date(request.created_at), 'yyyy年M月d日 HH:mm', { locale: ja })}
              </span>
            </div>
            {coerceEstimateAmount(request.estimate_amount) !== null && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Banknote className="h-3.5 w-3.5 shrink-0 text-orange-600" />
                <span>見積 {formatYen(coerceEstimateAmount(request.estimate_amount)!)}</span>
              </div>
            )}
          </div>

          {nextStatus && nextStatus !== '完了' && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (nextStatus === '見積受取') {
                    onSelect()
                    return
                  }
                  openAdvanceConfirm(nextStatus)
                }}
                disabled={updating}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                {updating ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {nextStatus === '見積受取'
                  ? '見積受取へ（金額は詳細から入力）'
                  : `次のステップへ: ${nextStatus}`}
              </Button>
            </div>
          )}
          {nextStatus === '完了' && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => openAdvanceConfirm('完了')}
                disabled={updating}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {updating ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                完了にする
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={advanceOpen}
        onOpenChange={(v) => {
          if (!v) {
            setAdvanceOpen(false)
            setPendingNext(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ステータスを進める</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">{request.status}</span>
              {' → '}
              <span className="font-medium text-blue-700">{pendingNext}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="advance-handled-by">対応者（記名）*</Label>
              <Input
                id="advance-handled-by"
                value={handledByName}
                onChange={(e) => setHandledByName(e.target.value)}
                placeholder="このステップを進めたCEの氏名"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => { setAdvanceOpen(false); setPendingNext(null) }}>
              キャンセル
            </Button>
            <Button type="button" onClick={confirmAdvance} disabled={updating}>
              {updating && <RefreshCw className="h-4 w-4 animate-spin mr-2" />}
              進める
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
