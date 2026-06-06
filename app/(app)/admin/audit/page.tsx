'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuditLogEntry, LoginHistoryEntry, Profile } from '@/lib/types'
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL } from '@/lib/audit-log'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  LogIn,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = 'login' | 'audit'

const LIMIT = 100

export default function AdminAuditPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('login')
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])

  const isAdmin = currentUser?.role === 'admin'

  const fetchLoginHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from('login_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    if (error) {
      if (error.message.includes('login_history')) {
        setTableMissing(true)
      }
      console.error('[ログイン履歴] 取得エラー:', error.message)
      setLoginHistory([])
      return
    }
    setLoginHistory((data as LoginHistoryEntry[]) ?? [])
  }, [supabase])

  const fetchAuditLogs = useCallback(async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIMIT)

    if (error) {
      if (error.message.includes('audit_logs')) {
        setTableMissing(true)
      }
      console.error('[操作ログ] 取得エラー:', error.message)
      setAuditLogs([])
      return
    }
    setAuditLogs((data as AuditLogEntry[]) ?? [])
  }, [supabase])

  const fetchAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      setCurrentUser(profile as Profile | null)
    }
    await Promise.all([fetchLoginHistory(), fetchAuditLogs()])
    setLoading(false)
    setRefreshing(false)
  }, [fetchAuditLogs, fetchLoginHistory, supabase])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  function handleRefresh() {
    setRefreshing(true)
    void fetchAll()
  }

  if (!isAdmin && !loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert className="border-red-200 bg-red-50 max-w-md">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">
            このページは管理者（admin）のみアクセスできます。
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-blue-600" />
            ログ・監査
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ログイン履歴と主要操作の記録を確認できます（直近 {LIMIT} 件）。
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing || loading}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          更新
        </Button>
      </div>

      {tableMissing && (
        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <AlertDescription className="text-amber-900">
            ログ機能を使うには Supabase SQL Editor で{' '}
            <code className="bg-amber-100 px-1 rounded">migration_audit_logs.sql</code>{' '}
            を実行してください。
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          variant={tab === 'login' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('login')}
          className={cn(tab === 'login' && 'bg-blue-600 hover:bg-blue-700')}
        >
          <LogIn className="h-4 w-4 mr-1.5" />
          ログイン履歴
        </Button>
        <Button
          variant={tab === 'audit' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('audit')}
          className={cn(tab === 'audit' && 'bg-blue-600 hover:bg-blue-700')}
        >
          <ClipboardList className="h-4 w-4 mr-1.5" />
          操作ログ
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          読み込み中…
        </div>
      ) : tab === 'login' ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">日時</TableHead>
                <TableHead>ユーザー</TableHead>
                <TableHead className="w-20">権限</TableHead>
                <TableHead className="w-20">結果</TableHead>
                <TableHead>詳細</TableHead>
                <TableHead className="w-28">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loginHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                    ログイン履歴はありません。
                  </TableCell>
                </TableRow>
              ) : (
                loginHistory.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {format(new Date(row.created_at), 'yyyy/M/d HH:mm:ss', { locale: ja })}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800">
                      {row.user_name || '—'}
                    </TableCell>
                    <TableCell>
                      {row.role === 'admin' ? (
                        <Badge variant="outline" className="text-[10px] border-violet-300 text-violet-700">
                          管理者
                        </Badge>
                      ) : row.role === 'staff' ? (
                        <Badge variant="outline" className="text-[10px]">
                          一般
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {row.success ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100">
                          成功
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100">
                          失敗
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {row.success ? 'ログイン成功' : row.failure_reason || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-400 font-mono">
                      {row.ip_address || '—'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">日時</TableHead>
                <TableHead className="w-28">操作者</TableHead>
                <TableHead className="w-24">操作</TableHead>
                <TableHead className="w-28">対象</TableHead>
                <TableHead>内容</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    操作ログはありません。
                  </TableCell>
                </TableRow>
              ) : (
                auditLogs.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {format(new Date(row.created_at), 'yyyy/M/d HH:mm:ss', { locale: ja })}
                    </TableCell>
                    <TableCell className="font-medium text-slate-800 text-sm">
                      {row.user_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">
                        {AUDIT_ACTION_LABEL[row.action as keyof typeof AUDIT_ACTION_LABEL] ?? row.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {AUDIT_ENTITY_LABEL[row.entity_type as keyof typeof AUDIT_ENTITY_LABEL] ?? row.entity_type}
                    </TableCell>
                    <TableCell className="text-sm text-slate-700">{row.summary}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
