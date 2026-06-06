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

/** 自施設修理の進行ステータス */
export const IN_HOUSE_REPAIR_STATUSES = [
  '受付',
  '修理中',
  '修理完了',
  '完了',
] as const

export type RepairRoute = 'manufacturer' | 'in_house'

/** 自施設修理・受付時の機器状態判定 */
export type ReceptionAssessment = 'normal' | 'repair' | 'dispose'

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

export type RequestStatus =
  | typeof REPAIR_STATUSES[number]
  | typeof IN_HOUSE_REPAIR_STATUSES[number]
  | typeof PURCHASE_STATUSES[number]

export function resolveRepairRoute(route: RepairRoute | null | undefined): RepairRoute {
  return route === 'in_house' ? 'in_house' : 'manufacturer'
}

export function getStatusList(
  type: RequestType,
  repairRoute?: RepairRoute | null,
): readonly string[] {
  if (type === 'purchase') return PURCHASE_STATUSES
  if (resolveRepairRoute(repairRoute) === 'in_house') return IN_HOUSE_REPAIR_STATUSES
  return REPAIR_STATUSES
}

export function getNextStatus(
  type: RequestType,
  current: string,
  options?: {
    repairRoute?: RepairRoute | null
    receptionAssessment?: ReceptionAssessment | null
  },
): string | null {
  const repairRoute = resolveRepairRoute(options?.repairRoute)
  if (type === 'repair' && repairRoute === 'in_house') {
    if (current === '受付') {
      const assessment = options?.receptionAssessment
      if (assessment === 'normal' || assessment === 'dispose') return '完了'
      return '修理中'
    }
    const list = IN_HOUSE_REPAIR_STATUSES
    const idx = list.indexOf(current as (typeof IN_HOUSE_REPAIR_STATUSES)[number])
    if (idx === -1 || idx === list.length - 1) return null
    return list[idx + 1]
  }
  const list = getStatusList(type, repairRoute)
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
  /** 修理依頼の経路（メーカー修理 / 自施設修理） */
  repair_route?: RepairRoute | null
  /** 自施設修理・受付時の機器状態（正常 / 修理 / 破棄） */
  reception_assessment?: ReceptionAssessment | null
  /** 自施設修理・完了時の修理内容 */
  repair_content?: string | null
  /** 自施設修理・完了時の交換パーツ */
  replacement_parts?: string | null
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
  /** 点検実施者名（自由入力） */
  | 'inspector'
  /** 旧データ互換: 適・不適・対象外 */
  | 'legacy_okng'

/** 点検項目の実施頻度（日常点検マスタ用） */
export type ChecklistItemFrequency = 'daily' | 'periodic'

export interface MaintenanceChecklistItem {
  key: string
  label: string
  kind: MaintenanceChecklistItemKind
  /** kind が number のとき表示・記録用の単位（例: V, ℃） */
  unit?: string | null
  /** 日常点検マスタ: 毎日 / 定期点検時 */
  frequency?: ChecklistItemFrequency | null
}

/** メンテナンスマスタ種別 */
export type MaintenanceMasterType = 'periodic' | 'daily'

export const MAINTENANCE_MASTER_TYPE_LABEL: Record<MaintenanceMasterType, string> = {
  periodic: '定期点検',
  daily: '日常点検',
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
  | { mode: 'inspector'; value: string }

/** メーカー＋型式に紐づく点検チェック項目マスタ */
export interface MaintenanceModelMaster {
  id: string
  manufacturer: string
  model: string
  /** periodic=定期点検（ダッシュボード・年間計画対象） / daily=日常点検 */
  master_type: MaintenanceMasterType
  checklist_items: MaintenanceChecklistItem[]
  /** 型式ごとのメンテナンス方法・手順（自由記述） */
  maintenance_method: string | null
  /** 定期点検の周期（月）。型式ごとに設定 */
  inspection_interval_months: number
  created_at: string
  updated_at: string
}

/** 一括テンプレート（マスタ名＋点検項目。型式マスタへ適用） */
export interface MaintenanceChecklistTemplate {
  id: string
  name: string
  master_type: MaintenanceMasterType
  checklist_items: MaintenanceChecklistItem[]
  created_at: string
  updated_at: string
}

export interface DashboardMessage {
  id: string
  title: string | null
  body: string
  author_name: string
  created_by: string | null
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

/** DBに日本語ステータスが残っている場合を含め英語キーに正規化する */
const JAPANESE_TO_STATUS: Record<string, DeviceStatus> = {
  '利用中': 'active',
  '移動': 'moved',
  '廃棄': 'disposed',
  '破棄': 'disposed',
  '不明': 'unknown',
  '修理中': 'repair',
  'inactive': 'disposed',
}

export function normalizeDeviceStatus(raw: string | null | undefined): DeviceStatus {
  if (!raw) return 'unknown'
  if (raw in JAPANESE_TO_STATUS) return JAPANESE_TO_STATUS[raw]
  return raw as DeviceStatus
}

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  repair: '修理依頼',
  purchase: '購入依頼',
}

export const REPAIR_ROUTE_LABEL: Record<RepairRoute, string> = {
  manufacturer: 'メーカー修理',
  in_house: '自施設修理',
}

export const RECEPTION_ASSESSMENT_LABEL: Record<ReceptionAssessment, string> = {
  normal: '正常',
  repair: '修理',
  dispose: '破棄',
}
