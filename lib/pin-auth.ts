/** 一般用ログイン: 6桁の数字 */
export const STAFF_PIN_REGEX = /^\d{6}$/

/** 管理者ログイン: 8桁の数字 */
export const ADMIN_PIN_REGEX = /^\d{8}$/

export function syntheticEmailForPinAuth(userId: string) {
  return `${userId}@pin.medical.internal`
}

export function isSyntheticPinEmail(email: string | undefined | null) {
  return !!email?.endsWith('@pin.medical.internal')
}

export function validateStaffPin(pin: string) {
  return STAFF_PIN_REGEX.test(pin)
}

export function validateAdminPin(pin: string) {
  return ADMIN_PIN_REGEX.test(pin)
}
