/**
 * Brother b-PAC Extension との通信（bpac.js 相当の最小実装）。
 * bpac_send イベント経由で拡張機能とやり取りする。
 */

const BPAC_ERR = "Can't connect to b-PAC"

type BpacDetail = {
  method: string
  connect?: boolean
  ret?: boolean
  p?: number
  index?: number
  [key: string]: unknown
}

function bpfacSend(detail: BpacDetail): Promise<BpacDetail> {
  const method = detail.method
  return new Promise((resolve, reject) => {
    const onReply = (ev: Event) => {
      const d = (ev as CustomEvent<BpacDetail>).detail
      document.removeEventListener(method, onReply)
      if (d.connect === false) {
        reject(new Error(BPAC_ERR))
        return
      }
      resolve(d)
    }
    document.addEventListener(method, onReply)
    document.dispatchEvent(new CustomEvent('bpac_send', { detail }))
  })
}

export async function bpfacOpenTemplate(filePath: string): Promise<boolean> {
  const d = await bpfacSend({ method: 'IDocument::Open', filePath })
  return d.ret === true
}

export async function bpfacCloseTemplate(): Promise<void> {
  try {
    await bpfacSend({ method: 'IDocument::Close' })
  } catch {
    /* ignore */
  }
}

export async function bpfacGetBarcodeIndex(name: string): Promise<number | null> {
  const d = await bpfacSend({ method: 'IDocument::GetBarcodeIndex', name })
  if (d.ret === false) return null
  return typeof d.index === 'number' ? d.index : null
}

export async function bpfacSetBarcodeData(index: number, text: string): Promise<void> {
  await bpfacSend({ method: 'IDocument::SetBarcodeData', index, text })
}

export async function bpfacGetTextIndex(name: string): Promise<number | null> {
  const d = await bpfacSend({ method: 'IDocument::GetTextIndex', name })
  if (d.ret === false) return null
  return typeof d.index === 'number' ? d.index : null
}

export async function bpfacSetText(index: number, text: string): Promise<void> {
  await bpfacSend({ method: 'IDocument::SetText', index, text })
}

export async function bpfacGetObjectPointer(name: string): Promise<number | null> {
  const d = await bpfacSend({ method: 'IDocument::GetObject', name })
  if (d.ret === false) return null
  return typeof d.p === 'number' && d.p >= 0 ? d.p : null
}

/** 公式 bpac.js と同様（IObject::SetText は応答イベントがない） */
export function bpfacSetObjectTextFire(pointer: number, text: string): void {
  document.dispatchEvent(
    new CustomEvent('bpac_send', {
      detail: { method: 'IObject::SetText', p: pointer, text },
    }),
  )
}

export const BPAC_OBJECT_TYPE_TEXT = 0
export const BPAC_OBJECT_TYPE_BARCODE = 1

export async function bpfacGetObjectsCollectionPointer(): Promise<number | null> {
  const d = await bpfacSend({ method: 'IDocument::GetObjects', name: '' })
  if (d.ret === false || typeof d.p !== 'number' || d.p < 0) return null
  return d.p
}

export async function bpfacObjectsGetCount(objectsPointer: number): Promise<number> {
  const d = await bpfacSend({ method: 'IObjects::GetCount', p: objectsPointer })
  if (d.ret === false || typeof d.count !== 'number') return 0
  return d.count
}

export async function bpfacObjectsGetItemPointer(
  objectsPointer: number,
  index: number,
): Promise<number | null> {
  const d = await bpfacSend({ method: 'IObjects::GetItem', p: objectsPointer, index })
  if (d.ret === false || typeof d.p !== 'number' || d.p < 0) return null
  return d.p
}

export async function bpfacObjectGetType(objectPointer: number): Promise<number | null> {
  const d = await bpfacSend({ method: 'IObject::GetType', p: objectPointer })
  if (d.ret === false || typeof d.type !== 'number') return null
  return d.type
}

export async function bpfacObjectGetName(objectPointer: number): Promise<string | null> {
  const d = await bpfacSend({ method: 'IObject::GetName', p: objectPointer })
  if (d.ret === false || typeof d.name !== 'string') return null
  return d.name
}

export async function bpfacGetTextLineCount(): Promise<number> {
  const d = await bpfacSend({ method: 'IDocument::GetTextCount' })
  if (d.ret === false || typeof d.count !== 'number') return 0
  return d.count
}

export async function bpfacStartPrint(docName = '', option = 0): Promise<void> {
  await bpfacSend({ method: 'IDocument::StartPrint', docName, option })
}

export async function bpfacPrintOut(copies: number, option = 0): Promise<void> {
  await bpfacSend({ method: 'IDocument::PrintOut', copyCount: copies, option })
}

export async function bpfacEndPrint(): Promise<void> {
  await bpfacSend({ method: 'IDocument::EndPrint' })
}
