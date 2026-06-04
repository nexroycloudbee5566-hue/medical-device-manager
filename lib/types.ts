export type UserRole = 'admin' | 'staff'

export type DeviceStatus = 'active' | 'moved' | 'disposed' | 'unknown' | 'repair'

export type RequestType = 'repair' | 'purchase'

export const REPAIR_STATUSES = [
  '依頼受付',
  '確認中',
  '選定',
  '業者見積依頼',
  '見積受取',
  '院内決済',
  '業者報告',
  '修理',
  '完了',
] as const

export const PURCHASE_STATUSES = [
  '依頼受付',
  '確認中',
  '選定',
  '業者見積依頼',
  '見積受取',
  '院内決済',
  '業者報告',
  '購入',
  '完了',
] as const

export type RequestStatus = typeof REPAIR_STATUSES[number] | typeof PURCHASE_STATUSES[number]

export function getStatusList(type: RequestType): readonly string[] {
  return type === 'repair' ? REPAIR_STATUSES : PURCHASE_STATUSES
}

export function getNextStatus(type: RequestType, current: string): string | null {
  const list = getStatusList(type)
  const idx = list.indexOf(current as never)
  if (idx === -1 || idx === list.length - 1) return null
  return list[idx + 1]
}

export interface Hospital {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  hospital_id: string | null
  name: string
  role: UserRole
  created_at: string
  updated_at: string
  hospitals?: Hospital
}

export interface Device {
  id: string
  hospital_id: string | null
  barcode: string | null
  name: string
  model: string | null
  manufacturer: string | null
  serial_number: string | null
  location: string | null
  department: string | null
  purchase_date: string | null
  status: DeviceStatus
  next_maintenance_due: string | null
  notes: string | null
  /** Excel機器台帳との同期項目 */
  equipment_category?: string | null
  specific_maintenance?: string | null
  management_category?: string | null
  manufacture_year_month?: string | null
  dealer?: string | null
  maintenance_contract?: string | null
  ownership_type?: string | null
  inventory_confirmation?: string | null
  created_at: string
  updated_at: string
  hospitals?: Hospital
}

export interface Request {
  id: string
  type: RequestType
  status: string
  hospital_id: string | null
  device_id: string | null
  requester_name: string
  requester_dept: string | null
  description: string
  notes: string | null
  /** 見積受取で登録する見積金額（円） */
  estimate_amount?: number | string | null
  /** 依頼機器（購入はテキスト、修理は補足または台帳連携なしのとき） */
  requested_equipment?: string | null
  /** 受付したCEの氏名 */
  reception_ce_name?: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  hospitals?: Hospital
  devices?: Device
  profiles?: Profile
}

export interface RequestLog {
  id: string
  request_id: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  notes: string | null
  /** このステップを進めた／対応した人の記名 */
  handled_by_name?: string | null
  created_at: string
  profiles?: Profile
}

/** マスタ上の点検項目タイプ（定期点検入力UIと対応） */
export type MaintenanceChecklistItemKind =
  | 'checkbox'
  | 'number'
  | 'yn'
  | 'date'
  | 'text'
  | 'remarks'
  /** 旧データ互換: 適・不適・対象外 */
  | 'legacy_okng'

export interface MaintenanceChecklistItem {
  key: string
  label: string
  kind: MaintenanceChecklistItemKind
  /** kind が number のとき表示・記録用の単位（例: V, ℃） */
  unit?: string | null
}

/** 点検記録に保存する各項目の値 */
export type ChecklistResultEntry =
  | { mode: 'legacy'; status: 'ok' | 'ng' | 'na' | '' }
  | { mode: 'checkbox'; checked: boolean }
  | { mode: 'number'; value: number | null }
  | { mode: 'yn'; value: 'Y' | 'N' | '' }
  | { mode: 'date'; value: string }
  | { mode: 'text'; value: string }
  | { mode: 'remarks'; value: string }

/** メーカー＋型式に紐づく定期点検チェック項目マスタ */
export interface MaintenanceModelMaster {
  id: string
  manufacturer: string
  model: string
  checklist_items: MaintenanceChecklistItem[]
  created_at: string
  updated_at: string
}

/** 一括テンプレート（マスタ名＋点検項目。型式マスタへ適用） */
export interface MaintenanceChecklistTemplate {
  id: string
  name: string
  checklist_items: MaintenanceChecklistItem[]
  created_at: string
  updated_at: string
}

export interface MaintenanceRecord {
  id: string
  device_id: string
  type: string
  scheduled_date: string | null
  completed_date: string | null
  result: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  maintenance_model_master_id?: string | null
  /** 旧: Record<key, 'ok'|'ng'|'na'> / 新: ChecklistResultEntry オブジェクト */
  checklist_results?: Record<string, unknown> | null
  devices?: Device
  profiles?: Profile
  maintenance_model_masters?: MaintenanceModelMaster
}

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  active: '利用中',
  moved: '移動',
  disposed: '破棄',
  unknown: '不明',
  repair: '修理中',
}

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  repair: '修理依頼',
  purchase: '購入依頼',
}
