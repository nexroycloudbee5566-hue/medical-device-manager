'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Device, MaintenanceModelMaster, MaintenanceRecord } from '@/lib/types'
import { DEVICE_STATUS_LABEL, normalizeDeviceStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DeviceRepairHistory } from '@/components/devices/device-repair-history'
import {
  matchMasterForDevice,
  mapMaintenanceModelMasterRow,
  describeMaintenanceChecklistLines,
  summarizeMaintenanceChecklistRaw,
} from '@/lib/maintenance-master'
import { intervalMonthsLabel } from '@/lib/inspection-interval'
import { format, isPast, parseISO, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ClipboardList, X, Wrench, Stethoscope } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  device: Device
  onClose?: () => void
  className?: string
}

export function DeviceKarte({ device, onClose, className }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const [masters, setMasters] = useState<MaintenanceModelMaster[]>([])
  const [recentRecords, setRecentRecords] = useState<MaintenanceRecord[]>([])

  useEffect(() => {
    void supabase.from('maintenance_model_masters').select('*').then(({ data }) => {
      setMasters(
        (data ?? []).map((row) => mapMaintenanceModelMasterRow(row as Record<string, unknown>)),
      )
    })
  }, [supabase])

  const loadRecent = useCallback(async () => {
    const { data } = await supabase
      .from('maintenance_records')
      .select('*, maintenance_model_masters(checklist_items)')
      .eq('device_id', device.id)
      .order('completed_date', { ascending: false })
      .limit(8)
    setRecentRecords((data as MaintenanceRecord[]) ?? [])
  }, [device.id, supabase])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const masterForDevice = matchMasterForDevice(
    masters,
    device.manufacturer,
    device.model,
    'periodic',
  )
  const status = normalizeDeviceStatus(device.status)
  const maintenanceDue = device.next_maintenance_due?.slice(0, 10) ?? null
  const overdue =
    maintenanceDue != null &&
    isPast(startOfDay(parseISO(maintenanceDue)))

  const maintenanceHref = device.barcode
    ? `/maintenance?barcode=${encodeURIComponent(device.barcode)}`
    : '/maintenance'
  const dailyHref = device.barcode
    ? `/maintenance/daily?barcode=${encodeURIComponent(device.barcode)}`
    : '/maintenance/daily'

  return (
    <Card className={cn('border-0 shadow-sm border-l-4 border-l-blue-500', className)}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-blue-600" />
          機器カルテ
        </CardTitle>
        {onClose && (
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4 text-sm max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="outline" className="font-mono">
            {device.barcode ?? 'コードなし'}
          </Badge>
          <Badge
            className={
              status === 'active'
                ? 'bg-green-100 text-green-800 border-0'
                : status === 'repair'
                  ? 'bg-orange-100 text-orange-800 border-0'
                  : 'bg-slate-100 text-slate-700 border-0'
            }
          >
            {DEVICE_STATUS_LABEL[status]}
          </Badge>
        </div>

        <dl className="grid grid-cols-1 gap-2">
          <KarteRow label="機器名" value={device.name} emphasize />
          <KarteRow
            label="メーカー / 型式"
            value={[device.manufacturer, device.model].filter(Boolean).join(' / ') || '—'}
          />
          <KarteRow label="機器区分" value={device.equipment_category ?? '—'} />
          <KarteRow label="管理区分" value={device.management_category ?? '—'} />
          <KarteRow label="シリアル" value={device.serial_number ?? '—'} />
          <KarteRow
            label="設置"
            value={[device.location].filter(Boolean).join(' ') || '—'}
          />
          <KarteRow
            label="購入日"
            value={
              device.purchase_date
                ? format(new Date(device.purchase_date), 'yyyy/MM/dd', { locale: ja })
                : '—'
            }
          />
          {masterForDevice && (
            <KarteRow
              label="点検期間（型式マスタ）"
              value={intervalMonthsLabel(masterForDevice.inspection_interval_months)}
              emphasize
            />
          )}
          <KarteRow
            label="次回点検予定"
            value={
              maintenanceDue ? (
                <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                  {format(new Date(maintenanceDue), 'yyyy/MM/dd', { locale: ja })}
                  {overdue ? '（期限切れ）' : ''}
                </span>
              ) : (
                '—'
              )
            }
          />
        </dl>

        {masterForDevice?.maintenance_method && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 p-3 text-slate-800">
            <p className="text-xs font-medium text-indigo-800 mb-1">メンテナンス方法（型式マスタ）</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {masterForDevice.maintenance_method}
            </p>
          </div>
        )}

        {device.notes && (
          <div className="rounded-lg bg-slate-50 p-3 text-slate-700">
            <p className="text-xs font-medium text-slate-500 mb-1">備考（台帳）</p>
            <p className="whitespace-pre-wrap">{device.notes}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            href={maintenanceHref}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs h-8')}
          >
            <Stethoscope className="h-3.5 w-3.5 mr-1" />
            定期点検へ
          </Link>
          <Link
            href={dailyHref}
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'text-xs h-8')}
          >
            <Stethoscope className="h-3.5 w-3.5 mr-1" />
            日常点検へ
          </Link>
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1">
            <Wrench className="h-3.5 w-3.5" />
            修理履歴
          </p>
          <DeviceRepairHistory deviceId={device.id} />
        </div>

        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">直近の点検記録</p>
          {recentRecords.length === 0 ? (
            <p className="text-xs text-slate-400">まだ記録がありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="text-xs w-20">種別</TableHead>
                  <TableHead className="text-xs w-24">実施日</TableHead>
                  <TableHead className="text-xs">点検内容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRecords.map((rec) => {
                  const lines = describeMaintenanceChecklistLines(
                    rec.checklist_results ?? {},
                    rec.maintenance_model_masters?.checklist_items,
                  )
                  const fallback = summarizeMaintenanceChecklistRaw(rec.checklist_results ?? undefined)
                  return (
                    <TableRow key={rec.id}>
                      <TableCell className="text-xs align-top">
                        <Badge variant="outline" className="text-[10px]">
                          {rec.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs align-top whitespace-nowrap">
                        {rec.completed_date
                          ? format(new Date(rec.completed_date), 'yyyy/MM/dd', { locale: ja })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-slate-600 max-w-[12rem]">
                        {lines.length > 0 ? (
                          <ul className="list-none space-y-0.5 max-h-20 overflow-y-auto">
                            {lines.slice(0, 6).map((line, i) => (
                              <li key={i} className="leading-snug">
                                {line}
                              </li>
                            ))}
                            {lines.length > 6 && (
                              <li className="text-slate-400">ほか {lines.length - 6} 件…</li>
                            )}
                          </ul>
                        ) : fallback ? (
                          fallback
                        ) : rec.notes?.trim() ? (
                          '備考のみ'
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function KarteRow({
  label,
  value,
  emphasize = false,
}: {
  label: string
  value: ReactNode
  emphasize?: boolean
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 pb-2">
      <dt className="text-slate-500 shrink-0">{label}</dt>
      <dd className={cn('text-right', emphasize && 'font-medium')}>{value}</dd>
    </div>
  )
}
