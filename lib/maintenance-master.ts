import type {
  MaintenanceChecklistItem,
  MaintenanceChecklistItemKind,
  ChecklistResultEntry,
  MaintenanceModelMaster,
} from '@/lib/types'

export function normalizeModelKeyPart(s: string | null | undefined): string {
  try {
    return (s ?? '').normalize('NFKC').trim().toLowerCase()
  } catch {
    return (s ?? '').trim().toLowerCase()
  }
}

/**
 * メーカー＋型式でマスタを特定。一致しない場合は型式のみで一意ならそれを採用（台帳側メーカー未入力など）。
 */
/** 定期点検マスタが紐づき、点検項目が1件以上ある機器か */
export function deviceHasInspectionMaster(
  masters: MaintenanceModelMaster[],
  dev: Pick<{ manufacturer?: string | null; model?: string | null }, 'manufacturer' | 'model'>,
): boolean {
  const m = matchMasterForDevice(masters, dev.manufacturer, dev.model)
  return m != null && m.checklist_items.length > 0
}

export function matchMasterForDevice(
  masters: MaintenanceModelMaster[],
  manufacturer: string | null | undefined,
  model: string | null | undefined,
): MaintenanceModelMaster | null {
  const m = normalizeModelKeyPart(manufacturer)
  const mo = normalizeModelKeyPart(model)
  if (!mo) return null

  const exact =
    masters.find(
      (x) =>
        normalizeModelKeyPart(x.manufacturer) === m &&
        normalizeModelKeyPart(x.model) === mo,
    ) ?? null
  if (exact) return exact

  const byModel = masters.filter((x) => normalizeModelKeyPart(x.model) === mo)
  if (byModel.length === 1) return byModel[0]

  if (!m && byModel.length > 1) {
    const onlyBlankMfr = byModel.filter((x) => !normalizeModelKeyPart(x.manufacturer))
    if (onlyBlankMfr.length === 1) return onlyBlankMfr[0]
  }

  if (m && byModel.length > 1) {
    const sameMfr = byModel.filter((x) => normalizeModelKeyPart(x.manufacturer) === m)
    if (sameMfr.length === 1) return sameMfr[0]
  }

  return null
}

export function generateChecklistItemKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `k_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

const KIND_SET = new Set<MaintenanceChecklistItemKind>([
  'checkbox',
  'number',
  'yn',
  'date',
  'text',
  'remarks',
  'legacy_okng',
])

function parseKind(raw: unknown): MaintenanceChecklistItemKind {
  if (typeof raw === 'string' && KIND_SET.has(raw as MaintenanceChecklistItemKind)) {
    return raw as MaintenanceChecklistItemKind
  }
  return 'legacy_okng'
}

export function parseChecklistItems(raw: unknown): MaintenanceChecklistItem[] {
  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  const out: MaintenanceChecklistItem[] = []
  for (const row of data) {
    if (row && typeof row === 'object' && 'label' in row && typeof (row as { label: unknown }).label === 'string') {
      const label = (row as { label: string }).label.trim()
      if (!label) continue
      const key =
        'key' in row && typeof (row as { key: unknown }).key === 'string' && (row as { key: string }).key.trim()
          ? (row as { key: string }).key.trim()
          : generateChecklistItemKey()
      const kind = parseKind((row as { kind?: unknown }).kind)
      const unitRaw = (row as { unit?: unknown }).unit
      const unit = typeof unitRaw === 'string' ? unitRaw.trim() || null : null
      out.push({
        key,
        label,
        kind,
        ...(kind === 'number' && unit ? { unit } : {}),
      })
    }
  }
  return out
}

/** DB保存用: マスタ項目を JSON 配列へ（単位は number のときのみ） */
export function serializeChecklistTemplate(items: MaintenanceChecklistItem[]): unknown[] {
  return items.map((i) => {
    const base: Record<string, unknown> = {
      key: i.key,
      label: i.label.trim(),
      kind: i.kind,
    }
    if (i.kind === 'number' && i.unit) base.unit = i.unit
    return base
  })
}

export function defaultResultForItem(item: MaintenanceChecklistItem): ChecklistResultEntry {
  switch (item.kind) {
    case 'checkbox':
      return { mode: 'checkbox', checked: false }
    case 'number':
      return { mode: 'number', value: null }
    case 'yn':
      return { mode: 'yn', value: '' }
    case 'date':
      return { mode: 'date', value: '' }
    case 'text':
      return { mode: 'text', value: '' }
    case 'remarks':
      return { mode: 'remarks', value: '' }
    default:
      return { mode: 'legacy', status: '' }
  }
}

export function defaultResultsForItems(items: MaintenanceChecklistItem[]): Record<string, ChecklistResultEntry> {
  const out: Record<string, ChecklistResultEntry> = {}
  for (const i of items) {
    out[i.key] = defaultResultForItem(i)
  }
  return out
}

/** DB の checklist_results を編集用ステートへ（文字列レガシー対応） */
export function parseChecklistResultsFromDb(raw: unknown): Record<string, ChecklistResultEntry> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, ChecklistResultEntry> = {}
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string') {
      if (val === 'ok' || val === 'ng' || val === 'na') {
        out[key] = { mode: 'legacy', status: val }
      }
      continue
    }
    if (!val || typeof val !== 'object') continue
    const v = val as Record<string, unknown>
    const mode = v.mode
    if (mode === 'legacy' && typeof v.status === 'string') {
      const s = v.status
      if (s === 'ok' || s === 'ng' || s === 'na' || s === '') out[key] = { mode: 'legacy', status: s }
      continue
    }
    if (mode === 'checkbox' && typeof v.checked === 'boolean') {
      out[key] = { mode: 'checkbox', checked: v.checked }
      continue
    }
    if (mode === 'number') {
      const n = v.value
      let num: number | null = null
      if (typeof n === 'number' && !Number.isNaN(n)) num = n
      else if (typeof n === 'string' && n.trim() !== '') {
        const x = Number(n)
        num = Number.isNaN(x) ? null : x
      } else if (n === null) num = null
      out[key] = { mode: 'number', value: num }
      continue
    }
    if (mode === 'yn') {
      const y = v.value
      if (y === 'Y' || y === 'N' || y === '') out[key] = { mode: 'yn', value: y }
      continue
    }
    if (mode === 'date' && typeof v.value === 'string') {
      out[key] = { mode: 'date', value: v.value }
      continue
    }
    if (mode === 'text' && typeof v.value === 'string') {
      out[key] = { mode: 'text', value: v.value }
      continue
    }
    if (mode === 'remarks' && typeof v.value === 'string') {
      out[key] = { mode: 'remarks', value: v.value }
      continue
    }
  }
  return out
}

/** Y/N は Y、チェックボックスはオンへ（その他の項目は変更しない） */
export function applyBulkOk(
  items: MaintenanceChecklistItem[],
  prev: Record<string, ChecklistResultEntry>,
): Record<string, ChecklistResultEntry> {
  const next = { ...prev }
  for (const item of items) {
    if (item.kind === 'checkbox') {
      next[item.key] = { mode: 'checkbox', checked: true }
    } else if (item.kind === 'yn') {
      next[item.key] = { mode: 'yn', value: 'Y' }
    }
  }
  return next
}

export function legacyItemsIncomplete(
  items: MaintenanceChecklistItem[],
  results: Record<string, ChecklistResultEntry>,
): MaintenanceChecklistItem[] {
  return items.filter((i) => {
    if (i.kind !== 'legacy_okng') return false
    const r = results[i.key]
    return !r || r.mode !== 'legacy' || !r.status
  })
}

export function serializeResultsForDb(results: Record<string, ChecklistResultEntry>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(results)) {
    out[k] = v
  }
  return out
}

export const CHECKLIST_KIND_LABEL: Record<MaintenanceChecklistItemKind, string> = {
  checkbox: 'チェックボックス',
  number: '数値＋単位',
  yn: 'Y/N',
  date: '日付',
  text: '自由記入',
  remarks: '備考（自由記入）',
  legacy_okng: '適／不適／対象外（旧形式）',
}

const LEGACY_SHORT: Record<'ok' | 'ng' | 'na', string> = {
  ok: '適',
  ng: '不適',
  na: '対象外',
}

/** 1項目の結果を一覧・詳細表示用文字に整形 */
export function checklistEntryToDisplay(
  entry: ChecklistResultEntry,
  item?: MaintenanceChecklistItem,
): string {
  switch (entry.mode) {
    case 'legacy':
      return entry.status && entry.status in LEGACY_SHORT
        ? LEGACY_SHORT[entry.status as 'ok' | 'ng' | 'na']
        : entry.status || '—'
    case 'checkbox':
      return entry.checked ? 'チェック済' : '未チェック'
    case 'number':
      if (entry.value === null || entry.value === undefined || Number.isNaN(entry.value))
        return '—'
      {
        const u = item?.unit?.trim()
        return u ? `${entry.value} ${u}` : String(entry.value)
      }
    case 'yn':
      return entry.value === 'Y' ? 'Y' : entry.value === 'N' ? 'N' : '未入力'
    case 'date':
      return entry.value
        ? entry.value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1/$2/$3')
        : '—'
    case 'text':
      return entry.value.trim() || '—'
    case 'remarks':
      return entry.value.trim() || '—'
    default:
      return '—'
  }
}

/** テーブル用・一覧の短文サマリ（総合結果廃止後も一覧で概要を見せる） */
export function summarizeMaintenanceChecklistRaw(
  cr: Record<string, unknown> | null | undefined,
): string | null {
  if (!cr || typeof cr !== 'object') return null
  const parsed = parseChecklistResultsFromDb(cr)
  const parts: string[] = []

  let ok = 0
  let ng = 0
  let na = 0
  let ynY = 0
  let ynN = 0
  let chkOn = 0
  let chkOff = 0

  if (Object.keys(parsed).length === 0) {
    for (const v of Object.values(cr)) {
      if (v === 'ok') ok++
      else if (v === 'ng') ng++
      else if (v === 'na') na++
    }
  } else {
    for (const e of Object.values(parsed)) {
      if (e.mode === 'legacy') {
        if (e.status === 'ok') ok++
        else if (e.status === 'ng') ng++
        else if (e.status === 'na') na++
      } else if (e.mode === 'yn') {
        if (e.value === 'Y') ynY++
        else if (e.value === 'N') ynN++
      } else if (e.mode === 'checkbox') {
        if (e.checked) chkOn++
        else chkOff++
      }
    }
  }

  if (ok) parts.push(`適${ok}`)
  if (ng) parts.push(`不適${ng}`)
  if (na) parts.push(`対象外${na}`)
  if (ynY || ynN) parts.push(`Y/N Y${ynY}・N${ynN}`)
  if (chkOn || chkOff) parts.push(`チェック ☑${chkOn}/□${chkOff}`)
  if (!parts.length) return null
  return parts.join('・')
}

/**
 * 保存済み checklist_results をマスタの項目名付きで改行テキスト化。
 * マスタ未取得時はキーのみ。
 */
export function describeMaintenanceChecklistLines(
  checklistResultsRaw: Record<string, unknown> | null | undefined,
  templateItemsUnknown: unknown,
): string[] {
  const parsed = parseChecklistResultsFromDb(checklistResultsRaw)
  const templateItems = parseChecklistItems(templateItemsUnknown ?? [])
  const labelOf = new Map(templateItems.map((i) => [i.key, i]))

  const orderedKeys = templateItems.map((i) => i.key).filter((k) => parsed[k])
  const orphanKeys = Object.keys(parsed).filter((k) => !labelOf.has(k)).sort()
  const keys = [...orderedKeys, ...orphanKeys]

  const lines: string[] = []
  for (const key of keys) {
    const entry = parsed[key]
    if (!entry) continue
    const item = labelOf.get(key)
    const label = item?.label ?? key
    lines.push(`${label}: ${checklistEntryToDisplay(entry, item)}`)
  }
  return lines
}
