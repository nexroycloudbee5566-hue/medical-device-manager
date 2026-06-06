'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RequestLogRow } from '@/lib/request-logs'
import { updateRequestLog } from '@/lib/request-logs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'

interface Props {
  log: RequestLogRow | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

export function RequestLogEditDialog({ log, open, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [fromStatus, setFromStatus] = useState('')
  const [toStatus, setToStatus] = useState('')
  const [handledByName, setHandledByName] = useState('')
  const [notes, setNotes] = useState('')
  const [createdAt, setCreatedAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!log || !open) return
    setFromStatus(log.from_status ?? '')
    setToStatus(log.to_status)
    setHandledByName(log.handled_by_name?.trim() ?? '')
    setNotes(log.notes?.trim() ?? '')
    setCreatedAt(toDatetimeLocalValue(log.created_at))
  }, [log, open])

  async function handleSave() {
    if (!log) return
    const nextTo = toStatus.trim()
    if (!nextTo) {
      alert('変更後ステータスを入力してください。')
      return
    }
    setSaving(true)
    try {
      const payload: Parameters<typeof updateRequestLog>[2] = {
        from_status: fromStatus.trim() || null,
        to_status: nextTo,
        handled_by_name: handledByName.trim() || null,
        notes: notes.trim() || null,
      }
      if (createdAt.trim()) {
        payload.created_at = new Date(createdAt).toISOString()
      }
      const err = await updateRequestLog(supabase, log.id, payload)
      if (err) {
        alert(`履歴の更新に失敗しました: ${err}`)
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>進行履歴を編集</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="log-from">変更前ステータス</Label>
              <Input
                id="log-from"
                value={fromStatus}
                onChange={(e) => setFromStatus(e.target.value)}
                placeholder="空欄＝登録"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-to">変更後ステータス *</Label>
              <Input
                id="log-to"
                value={toStatus}
                onChange={(e) => setToStatus(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-handled">進行担当者</Label>
            <Input
              id="log-handled"
              value={handledByName}
              onChange={(e) => setHandledByName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-created">日時</Label>
            <Input
              id="log-created"
              type="datetime-local"
              value={createdAt}
              onChange={(e) => setCreatedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="log-notes">備考</Label>
            <Textarea
              id="log-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            キャンセル
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
