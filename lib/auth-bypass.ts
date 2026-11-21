/** ローカル開発時: ログイン画面・PIN をスキップ */
export function isAuthBypassEnabled(): boolean {
  if (process.env.ALLOW_PIN_LOGIN_BYPASS === 'true') return true
  if (process.env.ALLOW_PIN_LOGIN_BYPASS === 'false') return false
  return process.env.NODE_ENV === 'development'
}

export const isPinLoginBypassEnabled = isAuthBypassEnabled