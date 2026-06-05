'use client'

import type { MaintenanceChecklistItem, ChecklistResultEntry } from '@/lib/types'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CHECKLIST_KIND_LABEL } from '@/lib/maintenance-master'

type ItemStatus = 'ok' | 'ng' | 'na'

const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  ok: '適',
  ng: '不適',
  na: '対象外',
}

export function MaintenanceChecklistRowInput({
  item,
  entry,
  onChange,
}: {
  item: MaintenanceChecklistItem
  entry: ChecklistResultEntry | undefined
  onChange: (next: ChecklistResultEntry) => void
}) {
  const kindLabel = CHECKLIST_KIND_LABEL[item.kind]

  if (item.kind === 'legacy_okng') {
    const r = entry?.mode === 'legacy' ? entry : { mode: 'legacy' as const, status: '' as const }
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{kindLabel}</span>
        <Select
          value={r.status || undefined}
          onValueChange={(v) => onChange({ mode: 'legacy', status: v as ItemStatus })}
        >
          <SelectTrigger className="w-full sm:w-36 h-9 text-sm bg-white">
            <SelectValue placeholder="選択" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ITEM_STATUS_LABEL) as ItemStatus[]).map((k) => (
              <SelectItem key={k} value={k}>
                {ITEM_STATUS_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (item.kind === 'checkbox') {
    const r = entry?.mode === 'checkbox' ? entry : { mode: 'checkbox' as const, checked: false }
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="text-xs text-slate-400 shrink-0">{kindLabel}</span>
        <input
          type="checkbox"
          checked={r.checked}
          onChange={(e) => onChange({ mode: 'checkbox', checked: e.target.checked })}
          className="h-4 w-4 rounded border-slate-300"
        />
      </label>
    )
  }

  if (item.kind === 'number') {
    const r = entry?.mode === 'number' ? entry : { mode: 'number' as const, value: null }
    const unit = item.unit?.trim()
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{kindLabel}</span>
        <Input
          type="number"
          className="w-28 h-9 text-sm bg-white"
          value={r.value === null || r.value === undefined ? '' : r.value}
          onChange={(e) => {
            const raw = e.target.value
            onChange({
              mode: 'number',
              value: raw === '' ? null : Number(raw),
            })
          }}
        />
        {unit && <span className="text-sm text-slate-600">{unit}</span>}
      </div>
    )
  }

  if (item.kind === 'yn') {
    const r = entry?.mode === 'yn' ? entry : { mode: 'yn' as const, value: '' as const }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{kindLabel}</span>
        <Select
          value={r.value === '' ? '__empty' : r.value}
          onValueChange={(v) =>
            onChange({ mode: 'yn', value: v === '__empty' ? '' : (v as 'Y' | 'N') })
          }
        >
          <SelectTrigger className="w-full sm:w-28 h-9 text-sm bg-white">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty">未入力</SelectItem>
            <SelectItem value="Y">Y</SelectItem>
            <SelectItem value="N">N</SelectItem>
          </SelectContent>
        </Select>
      </div>
    )
  }

  if (item.kind === 'date') {
    const r = entry?.mode === 'date' ? entry : { mode: 'date' as const, value: '' }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">{kindLabel}</span>
        <Input
          type="date"
          className="w-44 h-9 text-sm bg-white"
          value={r.value}
          onChange={(e) => onChange({ mode: 'date', value: e.target.value })}
        />
      </div>
    )
  }

  if (item.kind === 'remarks') {
    const r = entry?.mode === 'remarks' ? entry : { mode: 'remarks' as const, value: '' }
    return (
      <div className="space-y-1 w-full">
        <span className="text-xs text-slate-400">{kindLabel}</span>
        <Textarea
          className="text-sm bg-white min-h-[72px]"
          value={r.value}
          onChange={(e) => onChange({ mode: 'remarks', value: e.target.value })}
          placeholder="備考"
        />
      </div>
    )
  }

  if (item.kind === 'inspector') {
    const r = entry?.mode === 'inspector' ? entry : { mode: 'inspector' as const, value: '' }
    return (
      <div className="space-y-1 w-full">
        <span className="text-xs text-slate-400">{kindLabel}</span>
        <Input
          className="text-sm bg-white"
          value={r.value}
          onChange={(e) => onChange({ mode: 'inspector', value: e.target.value })}
          placeholder="点検者名を入力"
        />
      </div>
    )
  }

  const r = entry?.mode === 'text' ? entry : { mode: 'text' as const, value: '' }
  return (
    <div className="space-y-1 w-full">
      <span className="text-xs text-slate-400">{kindLabel}</span>
      <Input
        className="text-sm bg-white"
        value={r.value}
        onChange={(e) => onChange({ mode: 'text', value: e.target.value })}
        placeholder="入力"
      />
    </div>
  )
}
