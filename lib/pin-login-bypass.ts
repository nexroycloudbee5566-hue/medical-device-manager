/** ローカル開発時のみ PIN 検証を省略（npm run dev） */
export function isPinLoginBypassEnabled(): boolean {
  if (process.env.ALLOW_PIN_LOGIN_BYPASS === 'true') return true
  if (process.env.ALLOW_PIN_LOGIN_BYPASS === 'false') return false
  return process.env.NODE_ENV === 'development'
}