/** Brother b-PAC（P-touch ブラウザ拡張）の最小型 */
type BpacDocument = {
  Open: (path: string) => Promise<boolean>
  GetObject: (name: string) => Promise<{ Text: string }>
  GetBarcodeIndex?: (name: string) => Promise<number>
  SetBarcodeData?: (index: number, data: string) => Promise<void>
  StartPrint: (printName: string, option: number) => Promise<void>
  PrintOut: (copies: number, option: number) => Promise<void>
  EndPrint: () => Promise<void>
  Close: () => Promise<void>
}

type BpacApi = {
  IDocument: BpacDocument
}

function getBpac(): BpacApi | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & { bpac?: BpacApi }
  return w.bpac?.IDocument ? w.bpac : null
}

export function isBpacAvailable(): boolean {
  return getBpac() != null
}

export type BpacPrintInput = {
  templatePath: string
  meNo: string
  deviceName?: string
  copies?: number
  barcodeObjectName: string
  nameObjectName: string
}

export async function printMeLabelViaBpac(
  input: BpacPrintInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const bpac = getBpac()
  if (!bpac) {
    return {
      ok: false,
      error:
        'Brother b-PAC が利用できません。Windows PC に b-PAC SDK をインストールし、Chrome / Edge で「Brother b-PAC Extension」を有効にしてください。',
    }
  }

  const path = input.templatePath.trim()
  if (!path) {
    return { ok: false, error: 'P-touch テンプレート（.lbx）のパスを設定してください。' }
  }

  const meNo = input.meNo.trim()
  if (!meNo) {
    return { ok: false, error: 'ME No. が空です。' }
  }

  const doc = bpac.IDocument
  const opened = await doc.Open(path)
  if (!opened) {
    return {
      ok: false,
      error: `テンプレートを開けませんでした: ${path}\nP-touch Editor で保存した .lbx の絶対パスか確認してください。`,
    }
  }

  try {
    const barcodeName = input.barcodeObjectName.trim() || 'Barcode'
    if (doc.GetBarcodeIndex && doc.SetBarcodeData) {
      try {
        const idx = await doc.GetBarcodeIndex(barcodeName)
        await doc.SetBarcodeData(idx, meNo)
      } catch {
        const obj = await doc.GetObject(barcodeName)
        obj.Text = meNo
      }
    } else {
      const obj = await doc.GetObject(barcodeName)
      obj.Text = meNo
    }

    const nameKey = input.nameObjectName.trim()
    if (nameKey && input.deviceName?.trim()) {
      try {
        const nameObj = await doc.GetObject(nameKey)
        nameObj.Text = input.deviceName.trim()
      } catch {
        /* テキストオブジェクトが無いテンプレートは無視 */
      }
    }

    await doc.StartPrint('', 0)
    await doc.PrintOut(Math.max(1, input.copies ?? 1), 0)
    await doc.EndPrint()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `印刷中にエラーが発生しました: ${msg}` }
  } finally {
    try {
      await doc.Close()
    } catch {
      /* ignore */
    }
  }

  return { ok: true }
}
