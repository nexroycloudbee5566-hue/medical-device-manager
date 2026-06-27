import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DeviceStatus,
  ReceptionAssessment,
  RepairRoute,
  Request,
} from '@/lib/types'
import { RECEPTION_ASSESSMENT_LABEL, resolveRepairRoute } from '@/lib/types'

export function isInHouseRepair(request: Pick<Request, 'repair_route'>): boolean {
  return resolveRepairRoute(request.repair_route) === 'in_house'
}

export function deviceStatusForAssessment(assessment: ReceptionAssessment): DeviceStatus {
  if (assessment === 'dispose') return 'disposed'
  if (assessment === 'repair') return 'repair'
  return 'active'
}

export function advanceRequiresRepairNotes(
  request: Pick<Request, 'repair_route'>,
  nextStatus: string,
): boolean {
  return isInHouseRepair(request) && nextStatus === '修理中'
}

export function advanceRequiresCompletionFields(
  request: Pick<Request, 'repair_route'>,
  nextStatus: string,
): boolean {
  return isInHouseRepair(request) && nextStatus === '修理完了'
}

export function advanceRequiresCompletionAssessment(
  request: Pick<Request, 'repair_route'>,
  nextStatus: string,
): boolean {
  return isInHouseRepair(request) && nextStatus === '完了'
}

export function buildInHouseLogNotes(
  nextStatus: string,
  notes: string,
  repairContent: string,
  replacementParts: string,
  completionAssessment?: ReceptionAssessment | null,
): string | null {
  const parts: string[] = []
  const trimmedNotes = notes.trim()
  const trimmedContent = repairContent.trim()
  const trimmedParts = replacementParts.trim()

  if (advanceRequiresRepairNotes({ repair_route: 'in_house' }, nextStatus) && trimmedNotes) {
    parts.push(trimmedNotes)
  }
  if (advanceRequiresCompletionFields({ repair_route: 'in_house' }, nextStatus)) {
    if (trimmedContent) parts.push(`修理内容: ${trimmedContent}`)
    if (trimmedParts) parts.push(`交換パーツ: ${trimmedParts}`)
  }
  if (advanceRequiresCompletionAssessment({ repair_route: 'in_house' }, nextStatus) && completionAssessment) {
    parts.push(`完了時判定: ${RECEPTION_ASSESSMENT_LABEL[completionAssessment]}`)
  }
  if (
    !advanceRequiresCompletionFields({ repair_route: 'in_house' }, nextStatus) &&
    !advanceRequiresCompletionAssessment({ repair_route: 'in_house' }, nextStatus) &&
    trimmedNotes
  ) {
    parts.push(trimmedNotes)
  }
  return parts.length > 0 ? parts.join('／') : null
}

export async function syncDeviceStatusForRepair(
  supabase: SupabaseClient,
  deviceId: string | null | undefined,
  assessment: ReceptionAssessment | null | undefined,
  nextStatus: string,
  repairRoute: RepairRoute | null | undefined,
): Promise<string | null> {
  if (!deviceId || resolveRepairRoute(repairRoute) !== 'in_house') return null

  if (nextStatus === '修理中') {
    const { error } = await supabase.from('devices').update({ status: 'repair' }).eq('id', deviceId)
    return error?.message ?? null
  }

  if (nextStatus === '完了' && assessment) {
    const status = deviceStatusForAssessment(assessment)
    const { error } = await supabase.from('devices').update({ status }).eq('id', deviceId)
    return error?.message ?? null
  }

  return null
}

export function insertErrorHint(message: string): string {
  if (
    message.includes('reception_ce_name') ||
    message.includes('requested_equipment') ||
    message.includes('repair_route') ||
    message.includes('reception_assessment') ||
    message.includes('repair_content') ||
    message.includes('replacement_parts')
  ) {
    return (
      `${message}\n\n` +
      'Supabase で migration_repair_route.sql（および未実行なら migration_request_reception_fields.sql）を実行してください。'
    )
  }
  return message
}
