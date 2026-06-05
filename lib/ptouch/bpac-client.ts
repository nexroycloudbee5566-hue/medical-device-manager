import {
  getBpacDetectStatus,
  isBpacExtensionInstalled,
  waitForBpacExtension,
} from '@/lib/ptouch/bpac-detect'

export { isBpacExtensionInstalled, waitForBpacExtension, getBpacDetectStatus }

/** @deprecated 互換用。拡張機能クラスの有無を返す */
export function isBpacAvailable(): boolean {
  return isBpacExtensionInstalled()
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
  const ready = await waitForBpacExtension()
  if (!ready) {
    const { browserHint } = getBpacDetectStatus()
    return {
      ok: false,
      error:
        `Brother b-PAC Extension が検出されません。\n\n` +
        `1. Windows に b-PAC SDK（32bit）と b-PAC クライアントをインストール\n` +
        `2. Chrome / Edge に Brother b-PAC Extension を追加し、このサイトで有効化\n` +
        `3. ページを再読み込みして「再検出」を押す\n\n` +
        browserHint,
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

  try {
    const { default: BrotherSDK } = await import('bpac-js')
    const sdk = new BrotherSDK({ templatePath: path })

    const barcodeKey = input.barcodeObjectName.trim() || 'Barcode'
    const labelData: Record<string, string> = {
      [barcodeKey]: meNo,
    }

    const nameKey = input.nameObjectName.trim()
    if (nameKey && input.deviceName?.trim()) {
      labelData[nameKey] = input.deviceName.trim()
    }

    await sdk.print(labelData, {
      copies: Math.max(1, input.copies ?? 1),
      ignoreMissingKeys: true,
    })

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error:
        `P-touch 印刷に失敗しました: ${msg}\n\n` +
        'テンプレートの .lbx パス、オブジェクト名（Barcode / txtName）、プリンター接続を確認してください。',
    }
  }
}
