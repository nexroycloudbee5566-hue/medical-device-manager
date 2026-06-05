'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Request, RequestType } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NewRequestDialog } from '@/components/requests/new-request-dialog'
import { StatusUpdateDialog } from '@/components/requests/status-update-dialog'
import { RequestCard } from '@/components/requests/request-card'
import { Plus, RefreshCw, ArrowLeft, Hammer, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

const meta: Record<
  RequestType,
  { title: string; description: string; icon: typeof Hammer; backHref: string }
> = {
  repair: {
    title: '修理依頼',
    description: '進行中の修理依頼の一覧・ステータス更新',
    icon: Hammer,
    backHref: '/dashboard',
  },
  purchase: {
    title: '購入依頼',
    description: '進行中の購入依頼の一覧・ステータス更新',
    icon: ShoppingCart,
    backHref: '/dashboard',
  },
}

export function RequestsTypePage({ requestType }: { requestType: RequestType }) {
  const supabase = createClient()
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [newRequestOpen, setNewRequestOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null)

  const m = meta[requestType]
  const Icon = m.icon

  const fetchRequests = useCallback(async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*, devices(name, barcode)')
      .eq('type', requestType)
      .neq('status', '完了')
      .order('created_at', { ascending: false })
    if (error) {
      console.error(`[${requestType}依頼] 取得エラー:`, error)
      alert(`依頼一覧の取得に失敗しました: ${error.message}`)
      setLoading(false)
      return
    }
    setRequests((data as Request[]) ?? [])
    setLoading(false)
  }, [supabase, requestType])

  useEffect(() => {
    fetchRequests()
    const channel = supabase
      .channel(`requests-${requestType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, fetchRequests)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchRequests, supabase, requestType])

  const allStatuses = Array.from(new Set(requests.map((r) => r.status)))
  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === statusFilter)

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Link
          href={m.backHref}
          className={cn(
            'inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900',
            'px-2 py-1 -ml-2 rounded-lg hover:bg-slate-100'
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          ダッシュボード
        </Link>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-xl shrink-0 ${requestType === 'repair' ? 'bg-orange-50' : 'bg-green-50'}`}>
            <Icon className={`h-6 w-6 ${requestType === 'repair' ? 'text-orange-600' : 'text-green-600'}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{m.title}</h1>
            <p className="text-slate-500 text-sm mt-0.5">{m.description}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchRequests}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            更新
          </Button>
          <Button size="sm" onClick={() => setNewRequestOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            新規依頼登録
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-44 bg-white">
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべてのステータス</SelectItem>
            {allStatuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
          読み込み中...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <p className="text-lg font-medium">進行中の依頼はありません</p>
          <p className="text-sm mt-1">新規依頼を登録してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onSelect={() => setSelectedRequest(req)}
              onStatusUpdate={fetchRequests}
            />
          ))}
        </div>
      )}

      <NewRequestDialog
        open={newRequestOpen}
        fixedType={requestType}
        onClose={() => setNewRequestOpen(false)}
        onCreated={fetchRequests}
      />

      {selectedRequest && (
        <StatusUpdateDialog
          request={selectedRequest}
          open={true}
          onClose={() => setSelectedRequest(null)}
          onUpdated={() => { setSelectedRequest(null); fetchRequests() }}
        />
      )}
    </div>
  )
}
