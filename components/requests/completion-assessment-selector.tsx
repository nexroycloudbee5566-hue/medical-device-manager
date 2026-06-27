'use client'

import { cn } from '@/lib/utils'
import {
  ReceptionAssessment,
  RECEPTION_ASSESSMENT_LABEL,
} from '@/lib/types'
import { Label } from '@/components/ui/label'

export const COMPLETION_ASSESSMENT_LABEL = '完了時判定'

interface Props {
  value: ReceptionAssessment
  onChange: (value: ReceptionAssessment) => void
  required?: boolean
}

export function CompletionAssessmentSelector({ value, onChange, required = true }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
      <Label className="text-amber-900">
        {COMPLETION_ASSESSMENT_LABEL}{required ? ' *' : ''}
      </Label>
      <p className="text-xs text-amber-800/80 -mt-1">
        修理完了後の機器状態を選択してください。「破棄」の場合、機器台帳のステータスも破棄になります。
      </p>
      <div className="grid grid-cols-3 gap-2">
        {(['normal', 'repair', 'dispose'] as ReceptionAssessment[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-lg border px-2 py-2 text-sm font-medium transition-colors',
              value === option
                ? option === 'dispose'
                  ? 'border-red-400 bg-red-50 text-red-900'
                  : option === 'repair'
                    ? 'border-orange-400 bg-orange-50 text-orange-900'
                    : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {RECEPTION_ASSESSMENT_LABEL[option]}
          </button>
        ))}
      </div>
    </div>
  )
}
