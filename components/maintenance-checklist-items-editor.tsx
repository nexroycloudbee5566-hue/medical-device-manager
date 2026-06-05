'use client'

import type { MaintenanceChecklistItem, MaintenanceChecklistItemKind } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Trash2 } from 'lucide-react'
import type { ChecklistItemFrequency } from '@/lib/types'
import {
  generateChecklistItemKey,
  CHECKLIST_KIND_LABEL,
  CHECKLIST_FREQUENCY_LABEL,
} from '@/lib/maintenance-master'

const FREQUENCY_OPTIONS: ChecklistItemFrequency[] = ['daily', 'periodic']

const ADDABLE_KINDS: MaintenanceChecklistItemKind[] = [
  'checkbox',
  'number',
  'yn',
  'date',
  'text',
  'remarks',
  'inspector',
  'legacy_okng',
]

export function MaintenanceChecklistItemsEditor({
  items,
  onChange,
  emptyMessage = '項目がありません。上のメニューから種類を選んで追加してください。',
  showItemFrequency = false,
  defaultItemFrequency = 'daily',
}: {
  items: MaintenanceChecklistItem[]
  onChange: (items: MaintenanceChecklistItem[]) => void
  emptyMessage?: string
  /** 日常点検マスタ: 項目ごとに実施頻度（毎日など） */
  showItemFrequency?: boolean
  defaultItemFrequency?: ChecklistItemFrequency
}) {
  function addItem(kind: MaintenanceChecklistItemKind) {
    onChange([
      ...items,
      {
        key: generateChecklistItemKey(),
        label: kind === 'inspector' ? '点検者' : '',
        kind,
        ...(kind === 'number' ? { unit: '' } : {}),
        ...(showItemFrequency ? { frequency: defaultItemFrequency } : {}),
      },
    ])
  }

  function removeItem(key: string) {
    onChange(items.filter((i) => i.key !== key))
  }

  function updateItem(key: string, patch: Partial<MaintenanceChecklistItem>) {
    onChange(
      items.map((i) => {
        if (i.key !== key) return i
        const next = { ...i, ...patch }
        if (next.kind !== 'number') {
          const { unit: _, ...rest } = next
          return rest as MaintenanceChecklistItem
        }
        return next
      }),
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="text-base">点検項目</Label>
        <Select
          onValueChange={(v) => {
            if (v && ADDABLE_KINDS.includes(v as MaintenanceChecklistItemKind)) {
              addItem(v as MaintenanceChecklistItemKind)
            }
          }}
        >
          <SelectTrigger className="w-[220px] h-9 bg-white text-sm">
            <SelectValue placeholder="項目の種類を選んで追加" />
          </SelectTrigger>
          <SelectContent>
            {ADDABLE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                追加: {CHECKLIST_KIND_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">{emptyMessage}</p>
      ) : (
        <div className="space-y-3">
          {items.map((row, idx) => (
            <div
              key={row.key}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3 sm:flex-row sm:items-start"
            >
              <span className="text-xs text-slate-400 shrink-0 pt-2 w-6">{idx + 1}.</span>
              <div className="flex-1 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">点検名</span>
                  <Input
                    value={row.label}
                    onChange={(e) => updateItem(row.key, { label: e.target.value })}
                    placeholder="点検内容の名称"
                    className="bg-white text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">入力タイプ</span>
                  <Select
                    value={row.kind}
                    onValueChange={(v) =>
                      updateItem(row.key, {
                        kind: v as MaintenanceChecklistItemKind,
                        ...(v !== 'number' ? { unit: undefined } : { unit: row.unit ?? '' }),
                      })
                    }
                  >
                    <SelectTrigger className="bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADDABLE_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {CHECKLIST_KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {row.kind === 'number' && (
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">単位</span>
                    <Input
                      value={row.unit ?? ''}
                      onChange={(e) => updateItem(row.key, { unit: e.target.value })}
                      placeholder="例: V、℃、h"
                      className="bg-white text-sm max-w-xs"
                    />
                  </div>
                )}
                {showItemFrequency && (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">実施頻度</span>
                    <Select
                      value={row.frequency ?? defaultItemFrequency}
                      onValueChange={(v) =>
                        updateItem(row.key, {
                          frequency: (v as ChecklistItemFrequency) ?? defaultItemFrequency,
                        })
                      }
                    >
                      <SelectTrigger className="bg-white text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCY_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {CHECKLIST_FREQUENCY_LABEL[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 h-9 w-9 p-0 text-slate-400 hover:text-red-600 self-end sm:self-start"
                onClick={() => removeItem(row.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
