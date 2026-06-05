function inspectionHref(
  basePath: string,
  device: { id: string; barcode?: string | null },
): string {
  const barcode = device.barcode?.trim()
  if (barcode) {
    return `${basePath}?barcode=${encodeURIComponent(barcode)}`
  }
  return `${basePath}?device=${encodeURIComponent(device.id)}`
}

/** 定期点検画面へ（機器を自動読み込み） */
export function maintenanceInspectionHref(device: {
  id: string
  barcode?: string | null
}): string {
  return inspectionHref('/maintenance', device)
}

/** 日常点検画面へ（機器を自動読み込み） */
export function dailyInspectionHref(device: {
  id: string
  barcode?: string | null
}): string {
  return inspectionHref('/maintenance/daily', device)
}
