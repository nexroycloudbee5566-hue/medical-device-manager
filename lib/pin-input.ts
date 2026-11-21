/** PIN 入力用：全角数字を半角にして数字だけにする */
export function normalizePinInput(raw: string, maxLength: number): string {
  const halfWidth = raw.replace(/[０-９]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  )
  return halfWidth.replace(/\D/g, '').slice(0, maxLength)
}