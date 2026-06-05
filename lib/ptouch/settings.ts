export const PTOUCH_SETTINGS_KEY = 'mdmgr_ptouch_settings'

export type PtouchPrintSettings = {
  /** P-touch Editor で作成した .lbx の絶対パス（例: C:\Labels\me-label.lbx） */
  templatePath: string
  /** テンプレート内のバーコードオブジェクト名 */
  barcodeObjectName: string
  /** テンプレート内のテキストオブジェクト名（任意） */
  nameObjectName: string
}

export const DEFAULT_PTOUCH_SETTINGS: PtouchPrintSettings = {
  templatePath: '',
  barcodeObjectName: 'Barcode',
  nameObjectName: 'txtName',
}

export function loadPtouchSettings(): PtouchPrintSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_PTOUCH_SETTINGS }
  try {
    const raw = localStorage.getItem(PTOUCH_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_PTOUCH_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<PtouchPrintSettings>
    return {
      templatePath: parsed.templatePath ?? '',
      barcodeObjectName: parsed.barcodeObjectName?.trim() || DEFAULT_PTOUCH_SETTINGS.barcodeObjectName,
      nameObjectName: parsed.nameObjectName?.trim() || DEFAULT_PTOUCH_SETTINGS.nameObjectName,
    }
  } catch {
    return { ...DEFAULT_PTOUCH_SETTINGS }
  }
}

export function savePtouchSettings(settings: PtouchPrintSettings): void {
  localStorage.setItem(PTOUCH_SETTINGS_KEY, JSON.stringify(settings))
}
