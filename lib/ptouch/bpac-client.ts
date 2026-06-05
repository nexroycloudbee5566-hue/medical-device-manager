import {
  BPAC_OBJECT_TYPE_TEXT,
  bpfacCloseTemplate,
  bpfacEndPrint,
  bpfacGetBarcodeIndex,
  bpfacGetObjectPointer,
  bpfacGetObjectsCollectionPointer,
  bpfacGetTextIndex,
  bpfacGetTextLineCount,
  bpfacObjectGetName,
  bpfacObjectGetType,
  bpfacObjectsGetCount,
  bpfacObjectsGetItemPointer,
  bpfacOpenTemplate,
  bpfacPrintOut,
  bpfacSetBarcodeData,
  bpfacSetObjectTextFire,
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

export type BpacPrintResult =
  | { ok: true; modelNameSet: boolean; textObjectName?: string }
  | { ok: false; error: string }

const MODEL_NAME_OBJECT_FALLBACKS = [
  'txtName',
  'objName',
  'Text',
  'Text1',
  'テキスト1',
  'テキスト2',
] as const

function uniqueNames(names: string[]): string[] {
  return names.filter((name, index, arr) => name && arr.indexOf(name) === index)
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

async function trySetTextOnObject(
  objectPointer: number,
  modelName: string,
): Promise<void> {
  bpfacSetObjectTextFire(objectPointer, modelName)
  await new Promise((resolve) => setTimeout(resolve, 30))
}

async function setModelNameByObjectName(
  objectNames: string[],
  modelName: string,
): Promise<{ set: boolean; textObjectName?: string }> {
  for (const name of objectNames) {
    const key = name.trim()
    if (!key) continue

    const textIndex = await bpfacGetTextIndex(key)
    if (textIndex != null) {
      await bpfacSetText(textIndex, modelName)
      return { set: true, textObjectName: key }
    }

    const ptr = await bpfacGetObjectPointer(key)
    if (ptr != null) {
      await trySetTextOnObject(ptr, modelName)
      return { set: true, textObjectName: key }
    }
  }

  return { set: false }
}

async function setModelNameOnFirstTextObject(
  modelName: string,
  barcodeObjectName: string,
  preferredNames: string[],
): Promise<{ set: boolean; textObjectName?: string }> {
  const objectsPtr = await bpfacGetObjectsCollectionPointer()
  if (objectsPtr == null) return { set: false }

  const count = await bpfacObjectsGetCount(objectsPtr)
  const textObjects: { pointer: number; name: string }[] = []

  for (let i = 0; i < count; i++) {
    const ptr = await bpfacObjectsGetItemPointer(objectsPtr, i)
    if (ptr == null) continue

    const type = await bpfacObjectGetType(ptr)
    if (type !== BPAC_OBJECT_TYPE_TEXT) continue

    const name = (await bpfacObjectGetName(ptr)) ?? ''
    if (name && namesMatch(name, barcodeObjectName)) continue

    textObjects.push({ pointer: ptr, name })
  }

  for (const preferred of preferredNames) {
    const key = preferred.trim()
    if (!key) continue
    const hit = textObjects.find((obj) => namesMatch(obj.name, key))
    if (hit) {
      await trySetTextOnObject(hit.pointer, modelName)
      return { set: true, textObjectName: hit.name }
    }
  }

  if (textObjects.length > 0) {
    const first = textObjects[0]
    await trySetTextOnObject(first.pointer, modelName)
    return { set: true, textObjectName: first.name || '(無名テキスト)' }
  }

  return { set: false }
}

async function setModelNameOnTextLines(modelName: string): Promise<boolean> {
  const lineCount = await bpfacGetTextLineCount()
  if (lineCount <= 0) return false

  await bpfacSetText(0, modelName)
  return true
}

async function setTemplateModelName(
  objectNames: string[],
  modelName: string,
  barcodeObjectName: string,
): Promise<{ set: boolean; textObjectName?: string }> {
  const text = modelName.trim()
  if (!text) return { set: false }

  const byName = await setModelNameByObjectName(objectNames, text)
  if (byName.set) return byName

  const byScan = await setModelNameOnFirstTextObject(text, barcodeObjectName, objectNames)
  if (byScan.set) return byScan

  const byLine = await setModelNameOnTextLines(text)
  if (byLine) return { set: true, textObjectName: 'テキスト行0' }

  return { set: false }
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
): Promise<BpacPrintResult> {
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
  let modelNameSet = false
  let textObjectName: string | undefined

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
        await trySetTextOnObject(ptr, meNo)
      } else {
        return {
          ok: false,
          error: `テンプレート内にバーコードオブジェクト「${barcodeName}」が見つかりません。P-touch Editor でオブジェクト名を確認してください。`,
        }
      }
    }

    const modelName = input.deviceName?.trim()
    if (modelName) {
      const objectNames = uniqueNames([
        input.nameObjectName.trim(),
        ...MODEL_NAME_OBJECT_FALLBACKS,
      ])
      const result = await setTemplateModelName(objectNames, modelName, barcodeName)
      modelNameSet = result.set
      textObjectName = result.textObjectName
    } else {
      modelNameSet = true
    }

    await bpfacStartPrint('', 0)
    await bpfacPrintOut(Math.max(1, input.copies ?? 1), 0)
    await bpfacEndPrint()

    return { ok: true, modelNameSet, textObjectName }
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
