import {
  bpfacCloseTemplate,
  bpfacEndPrint,
  bpfacGetBarcodeIndex,
  bpfacGetObjectPointer,
  bpfacGetTextIndex,
  bpfacOpenTemplate,
  bpfacPrintOut,
  bpfacSetBarcodeData,
  bpfacSetObjectText,
  bpfacSetText,
  bpfacStartPrint,
} from '@/lib/ptouch/bpac-bridge'
import {
  getBpacDetectStatus,
  isBpacExtensionInstalled,
  waitForBpacExtension,
} from '@/lib/ptouch/bpac-detect'
import {
  lbxPathHasNonAscii,
  lbxPathVariants,
  RECOMMENDED_LBX_DIR,
} from '@/lib/ptouch/lbx-path'

export { isBpacExtensionInstalled, waitForBpacExtension, getBpacDetectStatus }

/** @deprecated 互換用 */
export function isBpacAvailable(): boolean {
  return isBpacExtensionInstalled()
}

export type BpacPrintInput = {
  templatePath: string
  meNo: string
  /** 台帳の機種名（devices.name） */
  deviceName?: string
  copies?: number
  barcodeObjectName: string
  nameObjectName: string
}

const MODEL_NAME_OBJECT_FALLBACKS = ['txtName', 'objName', 'Text', 'Text1'] as const

async function setTemplateModelName(objectNames: string[], modelName: string): Promise<boolean> {
  const text = modelName.trim()
  if (!text) return false

  for (const name of objectNames) {
    const key = name.trim()
    if (!key) continue

    const textIndex = await bpfacGetTextIndex(key)
    if (textIndex != null) {
      await bpfacSetText(textIndex, text)
      return true
    }

    const ptr = await bpfacGetObjectPointer(key)
    if (ptr != null) {
      await bpfacSetObjectText(ptr, text)
      return true
    }
  }

  return false
}

async function openTemplateWithVariants(paths: string[]): Promise<string | null> {
  for (const p of paths) {
    const ok = await bpfacOpenTemplate(p)
    if (ok) return p
    await bpfacCloseTemplate()
  }
  return null
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

  const rawPath = input.templatePath.trim()
  if (!rawPath) {
    return { ok: false, error: 'P-touch テンプレート（.lbx）のパスを設定してください。' }
  }

  const meNo = input.meNo.trim()
  if (!meNo) {
    return { ok: false, error: 'ME No. が空です。' }
  }

  const paths = lbxPathVariants(rawPath)
  let openedPath: string | null = null

  try {
    openedPath = await openTemplateWithVariants(paths)
    if (!openedPath) {
      const nonAscii = lbxPathHasNonAscii(rawPath)
      return {
        ok: false,
        error:
          `テンプレートを開けませんでした。\n${rawPath}\n\n` +
          (nonAscii
            ? `フォルダ名に日本語が含まれていると b-PAC が失敗することがあります。\n` +
              `P-touch Editor でテンプレートを英数字のみのパスに保存し直してください。\n` +
              `例: ${RECOMMENDED_LBX_DIR}\n\n`
            : '') +
          '・ファイルが存在するか（エクスプローラーで開けるか）\n' +
          '・P-touch Editor で一度「印刷テスト」できるか\n' +
          '・パスは絶対パス（C:\\...）か',
      }
    }

    const barcodeName = input.barcodeObjectName.trim() || 'Barcode'
    const barcodeIndex = await bpfacGetBarcodeIndex(barcodeName)
    if (barcodeIndex != null) {
      await bpfacSetBarcodeData(barcodeIndex, meNo)
    } else {
      const ptr = await bpfacGetObjectPointer(barcodeName)
      if (ptr != null) {
        await bpfacSetObjectText(ptr, meNo)
      } else {
        return {
          ok: false,
          error: `テンプレート内にバーコードオブジェクト「${barcodeName}」が見つかりません。P-touch Editor でオブジェクト名を確認してください。`,
        }
      }
    }

    const modelName = input.deviceName?.trim()
    if (modelName) {
      const objectNames = [
        input.nameObjectName.trim(),
        ...MODEL_NAME_OBJECT_FALLBACKS,
      ].filter((name, index, arr) => name && arr.indexOf(name) === index)
      await setTemplateModelName(objectNames, modelName)
    }

    await bpfacStartPrint('', 0)
    await bpfacPrintOut(Math.max(1, input.copies ?? 1), 0)
    await bpfacEndPrint()

    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("Can't connect to b-PAC")) {
      return {
        ok: false,
        error:
          'b-PAC クライアントに接続できません。SDK / クライアントのインストール後、ブラウザを再起動してください。',
      }
    }
    return {
      ok: false,
      error: `P-touch 印刷中にエラー: ${msg}`,
    }
  } finally {
    await bpfacCloseTemplate()
  }
}
