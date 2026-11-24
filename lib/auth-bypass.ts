/** ローカル開発時: ログイン画面・PIN をスキップ */

function parseBypassEnv(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined
  const v = raw.trim().toLowerCase().replace(/^["']|["']$/g, '')
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return undefined
}

/** サーバー・クライアント両方で参照（クライアントは NEXT_PUBLIC_* のみ読める） */
export function isAuthBypassEnabled(): boolean {
  const explicit =
    parseBypassEnv(process.env.ALLOW_PIN_LOGIN_BYPASS) ??
    parseBypassEnv(process.env.NEXT_PUBLIC_ALLOW_PIN_LOGIN_BYPASS)
  if (explicit !== undefined) return explicit
  return process.env.NODE_ENV === 'development'
}

export const isPinLoginBypassEnabled = isAuthBypassEnabled