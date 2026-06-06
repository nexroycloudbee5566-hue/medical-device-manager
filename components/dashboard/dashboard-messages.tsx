'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AdminInboxMessage, DashboardMessage } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  Loader2,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardMessages() {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<DashboardMessage[]>([])
  const [inbox, setInbox] = useState<AdminInboxMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [inboxLoading, setInboxLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [inboxTableMissing, setInboxTableMissing] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [authorName, setAuthorName] = useState('')

  const [staffDialogOpen, setStaffDialogOpen] = useState(false)
  const [staffSenderName, setStaffSenderName] = useState('')
  const [staffBody, setStaffBody] = useState('')
  const [staffSending, setStaffSending] = useState(false)

  const [inboxDeletingId, setInboxDeletingId] = useState<string | null>(null)

  const unreadCount = inbox.filter((m) => !m.is_read).length

  const fetchMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from('dashboard_messages')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(10)

    if (error) {
      if (error.message.includes('dashboard_messages')) {
        setTableMissing(true)
      }
      console.error('[お知らせ] 取得エラー:', error.message)
      setMessages([])
      setLoading(false)
      return
    }
    setTableMissing(false)
    setMessages((data as DashboardMessage[]) ?? [])
    setLoading(false)
  }, [supabase])

  const fetchInbox = useCallback(async () => {
    if (!isAdmin) return
    setInboxLoading(true)
    const { data, error } = await supabase
      .from('admin_inbox_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      if (error.message.includes('admin_inbox_messages')) {
        setInboxTableMissing(true)
      }
      console.error('[受信箱] 取得エラー:', error.message)
      setInbox([])
      setInboxLoading(false)
      return
    }
    setInboxTableMissing(false)
    setInbox((data as AdminInboxMessage[]) ?? [])
    setInboxLoading(false)
  }, [isAdmin, supabase])

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, name')
        .eq('id', user.id)
        .maybeSingle()
      const name = profile?.name?.trim() || ''
      setIsAdmin(profile?.role === 'admin')
      setAuthorName(name)
      setStaffSenderName(name)
    })
    void fetchMessages()

    const channel = supabase
      .channel('dashboard-messages')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dashboard_messages' },
        () => void fetchMessages(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchMessages, supabase])

  useEffect(() => {
    if (!isAdmin) return
    void fetchInbox()

    const channel = supabase
      .channel('admin-inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_inbox_messages' },
        () => void fetchInbox(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchInbox, isAdmin, supabase])

  function resetComposer() {
    setComposerOpen(false)
    setEditingId(null)
    setTitle('')
    setBody('')
  }

  function startEdit(msg: DashboardMessage) {
    setEditingId(msg.id)
    setTitle(msg.title?.trim() ?? '')
    setBody(msg.body)
    setComposerOpen(true)
  }

  async function handleSave() {
    const text = body.trim()
    if (!text) {
      alert('メッセージ本文を入力してください。')
      return
    }
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const now = new Date().toISOString()
      const payload = {
        title: title.trim() || null,
        body: text,
        author_name: authorName || '管理者',
        updated_at: now,
      }

      if (editingId) {
        const { error } = await supabase
          .from('dashboard_messages')
          .update(payload)
          .eq('id', editingId)
        if (error) {
          alert(`更新に失敗しました: ${error.message}`)
          return
        }
      } else {
        const { error } = await supabase.from('dashboard_messages').insert({
          ...payload,
          created_by: user?.id ?? null,
        })
        if (error) {
          alert(
            `投稿に失敗しました: ${error.message}\n\n` +
              'Supabase で migration_dashboard_messages.sql を実行してください。',
          )
          return
        }
      }
      resetComposer()
      await fetchMessages()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('このお知らせを削除しますか？')) return
    setDeletingId(id)
    try {
      const { error } = await supabase.from('dashboard_messages').delete().eq('id', id)
      if (error) {
        alert(`削除に失敗しました: ${error.message}`)
        return
      }
      if (editingId === id) resetComposer()
      await fetchMessages()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleStaffSend() {
    const sender = staffSenderName.trim()
    const text = staffBody.trim()
    if (!sender) {
      alert('入力者名を入力してください。')
      return
    }
    if (!text) {
      alert('メッセージを入力してください。')
      return
    }
    setStaffSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('admin_inbox_messages').insert({
        sender_name: sender,
        body: text,
        created_by: user?.id ?? null,
      })
      if (error) {
        alert(
          `送信に失敗しました: ${error.message}\n\n` +
            'Supabase で migration_admin_inbox_messages.sql を実行してください。',
        )
        return
      }
      setStaffDialogOpen(false)
      setStaffBody('')
      alert('管理者にメッセージを送信しました。')
    } finally {
      setStaffSending(false)
    }
  }

  async function markInboxRead(msg: AdminInboxMessage) {
    if (msg.is_read) return
    const { error } = await supabase
      .from('admin_inbox_messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', msg.id)
    if (error) {
      console.error('[受信箱] 既読更新エラー:', error.message)
      return
    }
    await fetchInbox()
  }

  async function deleteInboxMessage(id: string) {
    if (!confirm('このメッセージを削除しますか？')) return
    setInboxDeletingId(id)
    try {
      const { error } = await supabase.from('admin_inbox_messages').delete().eq('id', id)
      if (error) {
        alert(`削除に失敗しました: ${error.message}`)
        return
      }
      await fetchInbox()
    } finally {
      setInboxDeletingId(null)
    }
  }

  if (tableMissing) {
    return (
      <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-medium">お知らせ機能を使うには DB マイグレーションが必要です。</p>
        <p className="text-xs mt-1 text-amber-800">
          Supabase SQL Editor で{' '}
          <code className="bg-amber-100 px-1 rounded">migration_dashboard_messages.sql</code> を実行してください。
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="shrink-0 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50/80 to-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-violet-100 bg-violet-50/60">
          <span className="flex items-center gap-2 text-sm font-semibold text-violet-950">
            <Megaphone className="h-4 w-4 text-violet-600" />
            管理者からのお知らせ
          </span>
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-violet-200 text-violet-800 hover:bg-violet-100"
                onClick={() => setStaffDialogOpen(true)}
              >
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
                管理者へメッセージ
              </Button>
            )}
            {isAdmin && !composerOpen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs border-violet-200 text-violet-800 hover:bg-violet-100"
                onClick={() => setComposerOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                新規投稿
              </Button>
            )}
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 max-h-40 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-slate-400 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              読み込み中…
            </p>
          ) : messages.length === 0 && !composerOpen ? (
            <p className="text-sm text-slate-500">
              {isAdmin
                ? 'お知らせはまだありません。「新規投稿」からメッセージを送れます。'
                : 'お知らせはありません。'}
            </p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm',
                  editingId === msg.id
                    ? 'border-violet-300 bg-violet-50/50'
                    : 'border-slate-100 bg-white',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {msg.title?.trim() && (
                      <p className="font-semibold text-slate-800">{msg.title.trim()}</p>
                    )}
                    <p className="text-slate-700 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.body}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {msg.author_name || '管理者'}
                      {' · '}
                      {format(new Date(msg.updated_at), 'yyyy/M/d HH:mm', { locale: ja })}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-violet-700"
                        onClick={() => startEdit(msg)}
                        aria-label="編集"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                        disabled={deletingId === msg.id}
                        onClick={() => void handleDelete(msg.id)}
                        aria-label="削除"
                      >
                        {deletingId === msg.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {isAdmin && composerOpen && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-violet-900">
                  {editingId ? 'お知らせを編集' : '新しいお知らせ'}
                </p>
                <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={resetComposer}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-title" className="text-xs">タイトル（任意）</Label>
                <Input
                  id="msg-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="例: 点検スケジュールの変更について"
                  className="h-9 text-sm bg-white"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-body" className="text-xs">メッセージ *</Label>
                <Textarea
                  id="msg-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="スタッフ全員に伝えたい内容を入力してください"
                  rows={3}
                  className="text-sm bg-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={resetComposer} disabled={saving}>
                  キャンセル
                </Button>
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                  {editingId ? '更新する' : '投稿する'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="border-t border-violet-100 bg-slate-50/50">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-violet-100/80">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Mail className="h-4 w-4 text-blue-600" />
                スタッフからのメッセージ
                {unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white border-0 text-[10px] h-5 px-1.5">
                    未読 {unreadCount}
                  </Badge>
                )}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2 max-h-44 overflow-y-auto">
              {inboxTableMissing ? (
                <p className="text-xs text-amber-800">
                  <code className="bg-amber-100 px-1 rounded">migration_admin_inbox_messages.sql</code>{' '}
                  を実行すると受信できます。
                </p>
              ) : inboxLoading ? (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  読み込み中…
                </p>
              ) : inbox.length === 0 ? (
                <p className="text-sm text-slate-500">受信メッセージはありません。</p>
              ) : (
                inbox.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors',
                      msg.is_read
                        ? 'border-slate-100 bg-white'
                        : 'border-blue-200 bg-blue-50/60',
                    )}
                    onClick={() => void markInboxRead(msg)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-slate-800">{msg.sender_name}</p>
                          {!msg.is_read && (
                            <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-700">
                              未読
                            </Badge>
                          )}
                        </div>
                        <p className="text-slate-700 whitespace-pre-wrap break-words leading-relaxed mt-1">
                          {msg.body}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          {format(new Date(msg.created_at), 'yyyy/M/d HH:mm', { locale: ja })}
                          {msg.is_read && msg.read_at && (
                            <span>
                              {' · 既読 '}
                              {format(new Date(msg.read_at), 'M/d HH:mm', { locale: ja })}
                            </span>
                          )}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0 text-slate-400 hover:text-red-600"
                        disabled={inboxDeletingId === msg.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          void deleteInboxMessage(msg.id)
                        }}
                        aria-label="削除"
                      >
                        {inboxDeletingId === msg.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>管理者へメッセージ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="staff-sender">入力者 *</Label>
              <Input
                id="staff-sender"
                value={staffSenderName}
                onChange={(e) => setStaffSenderName(e.target.value)}
                placeholder="氏名"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-body">メッセージ *</Label>
              <Textarea
                id="staff-body"
                value={staffBody}
                onChange={(e) => setStaffBody(e.target.value)}
                placeholder="管理者に伝えたい内容を入力してください"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setStaffDialogOpen(false)}
              disabled={staffSending}
            >
              キャンセル
            </Button>
            <Button type="button" onClick={() => void handleStaffSend()} disabled={staffSending}>
              {staffSending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              送信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
