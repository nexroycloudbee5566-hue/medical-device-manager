'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Request, MaintenanceRecord, REQUEST_TYPE_LABEL } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  RefreshCw,
  Search,
  History,
  Wrench,
  ShoppingCart,
  CheckCircle,
  Loader2,
  Trash2,
} from 'lucide-react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { summarizeMaintenanceChecklistRaw, describeMaintenanceChecklistLines } from '@/lib/maintenance-master'

export default function HistoryPage() {
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<'requests' | 'maintenance'>('requests')
  const [completedRequests, setCompletedRequests] = useState<Request[]>([])
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deletingMaintenanceId, setDeletingMaintenanceId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [reqRes, mainRes] = await Promise.all([
      supabase.from('requests').select('*, devices(name, barcode)').eq('status', '完了').order('updated_at', { ascending: false }),
      supabase.from('maintenance_records').select('*, devices(name, barcode), maintenance_model_masters(checklist_items)').order('created_at', { ascending: false }),
    ])
    setCompletedRequests((reqRes.data as Request[]) ?? [])
    setMaintenanceRecords((mainRes.data as MaintenanceRecord[]) ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filteredRequests = completedRequests.filter((r) => {
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (dateFrom && r.updated_at < dateFrom) return false
    if (dateTo && r.updated_at > dateTo + 'T23:59:59') return false
    if (search) {
      const q = search.toLowerCase()
      return r.description.toLowerCase().includes(q) ||
        r.requester_name.toLowerCase().includes(q) ||
        (r.requester_dept?.toLowerCase().includes(q) ?? false) ||
        (r.requested_equipment?.toLowerCase().includes(q) ?? false) ||
        (r.reception_ce_name?.toLowerCase().includes(q) ?? false)
    }
    return true
  })

  async function deleteCompletedRequest(req: Request) {
    if (
      !confirm(
        `この完了済み依頼を削除しますか？\n「${req.description.slice(0, 40)}${req.description.length > 40 ? '…' : ''}」\n変更履歴も削除されます。取り消せません。`,
      )
    ) {
      return
    }
    setDeletingId(req.id)
    try {
      const { error } = await supabase.from('requests').delete().eq('id', req.id)
      if (error) {
        alert('削除に失敗しました。')
        return
      }
      await fetchAll()
    } finally {
      setDeletingId(null)
    }
  }

  async function deleteMaintenanceRecord(rec: MaintenanceRecord) {
    const devName = (rec.devices as { name?: string } | undefined)?.name ?? 'この機器'
    if (
      !confirm(
        `この点検記録を削除しますか？\n${devName}（実施日: ${rec.completed_date ?? '—'}）\n取り消せません。`,
      )
    ) {
      return
    }
    setDeletingMaintenanceId(rec.id)
    try {
      const { error } = await supabase.from('maintenance_records').delete().eq('id', rec.id)
      if (error) {
        alert('削除に失敗しました。')
        return
      }
      await fetchAll()
    } finally {
      setDeletingMaintenanceId(null)
    }
  }

  const filteredMaintenance = maintenanceRecords.filter((m) => {
    if (dateFrom && m.created_at < dateFrom) return false
    if (dateTo && m.created_at > dateTo + 'T23:59:59') return false
    if (search) {
      const q = search.toLowerCase()
      return (m.devices as any)?.name?.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">履歴管理</h1>
          <p className="text-slate-500 text-sm mt-0.5">完了済み依頼・点検履歴の検索・閲覧・削除</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll}>
          <RefreshCw className="h-4 w-4 mr-1.5" />更新
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">完了済み依頼</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{completedRequests.length}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">点検記録</p>
                <p className="text-3xl font-bold text-slate-800 mt-1">{maintenanceRecords.length}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl">
                <History className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'requests' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('requests')}
        >
          依頼履歴 ({completedRequests.length})
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'maintenance' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          onClick={() => setActiveTab('maintenance')}
        >
          点検履歴 ({maintenanceRecords.length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="キーワード検索" className="pl-9 bg-white" />
        </div>
        {activeTab === 'requests' && (
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-36 bg-white">
            <SelectValue placeholder="種別" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">すべての種別</SelectItem>
            <SelectItem value="repair">修理依頼</SelectItem>
            <SelectItem value="purchase">購入依頼</SelectItem>
          </SelectContent>
        </Select>
        )}
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 bg-white" />
          <span>〜</span>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 bg-white" />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />読み込み中...
        </div>
      ) : activeTab === 'requests' ? (
        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-24">種別</TableHead>
                <TableHead>依頼内容</TableHead>
                <TableHead>依頼者</TableHead>
                <TableHead>対象機器</TableHead>
                <TableHead>完了日</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRequests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    完了済み依頼がありません
                  </TableCell>
                </TableRow>
              ) : filteredRequests.map((req) => (
                <TableRow key={req.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {req.type === 'repair'
                        ? <Wrench className="h-3.5 w-3.5 text-orange-500" />
                        : <ShoppingCart className="h-3.5 w-3.5 text-green-500" />}
                      <span className="text-xs text-slate-600">{REQUEST_TYPE_LABEL[req.type]}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium max-w-xs">
                    <p className="truncate">{req.description}</p>
                    {req.notes && <p className="text-xs text-slate-400 truncate">{req.notes}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {req.requester_name}
                    {req.requester_dept && <span className="text-slate-400"> ({req.requester_dept})</span>}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 max-w-[14rem]">
                    {((): string => {
                      const dn = (req.devices as { name?: string } | undefined)?.name?.trim()
                      const rq = req.requested_equipment?.trim()
                      return dn || rq || '—'
                    })()}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {format(new Date(req.updated_at), 'yyyy/MM/dd', { locale: ja })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                      disabled={deletingId === req.id}
                      onClick={() => deleteCompletedRequest(req)}
                      aria-label="依頼を削除"
                    >
                      {deletingId === req.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="border-0 shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>機器名</TableHead>
                <TableHead>点検種別</TableHead>
                <TableHead>実施日</TableHead>
                <TableHead className="min-w-[14rem]">点検項目・結果</TableHead>
                <TableHead>備考</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaintenance.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-slate-400">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    点検記録がありません
                  </TableCell>
                </TableRow>
              ) : filteredMaintenance.map((rec) => {
                  const detailLines = describeMaintenanceChecklistLines(
                    rec.checklist_results ?? {},
                    rec.maintenance_model_masters?.checklist_items,
                  )
                  const summaryFallback = summarizeMaintenanceChecklistRaw(rec.checklist_results ?? undefined)

                  return (
                    <TableRow key={rec.id} className="hover:bg-slate-50">
                      <TableCell className="font-medium align-top">
                        {(rec.devices as any)?.name ?? '-'}
                        {(rec.devices as any)?.barcode && (
                          <span className="text-xs text-slate-400 ml-1">[{(rec.devices as any).barcode}]</span>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant="outline">{rec.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm align-top whitespace-nowrap">
                        {rec.completed_date
                          ? format(new Date(rec.completed_date), 'yyyy/MM/dd', { locale: ja })
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-700 align-top max-w-md">
                        {detailLines.length > 0 ? (
                          <ul className="list-none space-y-1">
                            {detailLines.map((line, i) => (
                              <li key={i} className="leading-snug">
                                {line}
                              </li>
                            ))}
                          </ul>
                        ) : summaryFallback ? (
                          <span>{summaryFallback}</span>
                        ) : (
                          <span className="text-slate-400">（チェック結果なし）</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 align-top max-w-[12rem] break-words">
                        {rec.notes?.trim() ? rec.notes : '—'}
                      </TableCell>
                      <TableCell className="text-right align-top">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                          disabled={deletingMaintenanceId === rec.id}
                          onClick={() => void deleteMaintenanceRecord(rec)}
                          aria-label="点検記録を削除"
                        >
                          {deletingMaintenanceId === rec.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
