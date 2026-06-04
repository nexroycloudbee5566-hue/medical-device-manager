import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { Device, Request, MaintenanceRecord } from '@/lib/types'
import { DEVICE_STATUS_LABEL, REQUEST_TYPE_LABEL } from '@/lib/types'
import { rowsToCsv } from '@/lib/csv-export'
import {
  describeMaintenanceChecklistLines,
  summarizeMaintenanceChecklistRaw,
} from '@/lib/maintenance-master'

function formatDateYmd(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'yyyy/MM/dd', { locale: ja })
  } catch {
    return iso
  }
}

function formatYearMonth(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return format(new Date(iso), 'yyyy/MM', { locale: ja })
  } catch {
    return iso
  }
}

/** 機器台帳（Excel台帳列に準拠） */
export function buildDevicesCsv(devices: Device[]): string {
  const headers = [
    'ME No.',
    '設置場所',
    '機器区分',
    '特定保守',
    '管理区分',
    '機種名',
    '型式',
    '製造元メーカー',
    '製造番号',
    '製造年月',
    '購入年月',
    '販売ディーラー',
    '備考',
    'ステータス',
    '次回点検日',
  ]
  const rows = devices.map((d) => [
    d.barcode ?? '',
    d.location ?? '',
    d.equipment_category ?? '',
    d.specific_maintenance ?? '',
    d.management_category ?? '',
    d.name,
    d.model ?? '',
    d.manufacturer ?? '',
    d.serial_number ?? '',
    d.manufacture_year_month ?? '',
    formatYearMonth(d.purchase_date),
    d.dealer ?? '',
    d.notes ?? '',
    DEVICE_STATUS_LABEL[d.status] ?? d.status,
    formatDateYmd(d.next_maintenance_due),
  ])
  return rowsToCsv(headers, rows)
}

/** 完了済み依頼履歴 */
export function buildRequestsHistoryCsv(requests: Request[]): string {
  const headers = [
    '種別',
    '依頼内容',
    '備考',
    '依頼者',
    '部署',
    '対象機器',
    'ME No.',
    '受付CE',
    '見積金額',
    '完了日',
    '登録日',
  ]
  const rows = requests.map((r) => {
    const dev = r.devices as { name?: string; barcode?: string } | undefined
    const deviceName = dev?.name?.trim() || r.requested_equipment?.trim() || ''
    return [
      REQUEST_TYPE_LABEL[r.type],
      r.description,
      r.notes ?? '',
      r.requester_name,
      r.requester_dept ?? '',
      deviceName,
      dev?.barcode ?? '',
      r.reception_ce_name ?? '',
      r.estimate_amount != null && r.estimate_amount !== '' ? String(r.estimate_amount) : '',
      formatDateYmd(r.updated_at),
      formatDateYmd(r.created_at),
    ]
  })
  return rowsToCsv(headers, rows)
}

/** 点検履歴 */
export function buildMaintenanceHistoryCsv(records: MaintenanceRecord[]): string {
  const headers = [
    '機器名',
    'ME No.',
    '点検種別',
    '実施日',
    '点検項目・結果',
    '備考',
    '登録日',
  ]
  const rows = records.map((rec) => {
    const dev = rec.devices as { name?: string; barcode?: string } | undefined
    const detailLines = describeMaintenanceChecklistLines(
      rec.checklist_results ?? {},
      rec.maintenance_model_masters?.checklist_items,
    )
    const checklistText =
      detailLines.length > 0
        ? detailLines.join(' / ')
        : summarizeMaintenanceChecklistRaw(rec.checklist_results ?? undefined) ?? ''
    return [
      dev?.name ?? '',
      dev?.barcode ?? '',
      rec.type,
      formatDateYmd(rec.completed_date),
      checklistText,
      rec.notes?.trim() ?? '',
      formatDateYmd(rec.created_at),
    ]
  })
  return rowsToCsv(headers, rows)
}
