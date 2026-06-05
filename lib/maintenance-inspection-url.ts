/** 定期点検画面へ（機器を自動読み込み） */
export function maintenanceInspectionHref(device: {
  id: string
  barcode?: string | null
}): string {
  const barcode = device.barcode?.trim()
  if (barcode) {
    return `/maintenance?barcode=${encodeURIComponent(barcode)}`
  }
  return `/maintenance?device=${encodeURIComponent(device.id)}`
}
