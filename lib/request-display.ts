import type { Request } from '@/lib/types'

type DeviceBrief = { name?: string | null; barcode?: string | null } | undefined

export function getRequestDeviceBrief(
  request: Pick<Request, 'devices'>,
): DeviceBrief {
  return request.devices as DeviceBrief
}

/** 台帳連携時の ME No.（バーコード） */
export function getRequestMeNo(request: Pick<Request, 'devices'>): string | null {
  const barcode = getRequestDeviceBrief(request)?.barcode?.trim()
  return barcode || null
}

export function getRequestEquipmentName(
  request: Pick<Request, 'devices' | 'requested_equipment'>,
): string | null {
  const name = getRequestDeviceBrief(request)?.name?.trim()
  if (name) return name
  const text = request.requested_equipment?.trim()
  return text || null
}

/** 機器名と ME No. をまとめた表示用ラベル */
export function formatRequestEquipmentWithMeNo(
  request: Pick<Request, 'devices' | 'requested_equipment'>,
): string {
  const name = getRequestEquipmentName(request) ?? '機器未設定'
  const meNo = getRequestMeNo(request)
  if (meNo) return `${name}（ME No. ${meNo}）`
  return name
}
