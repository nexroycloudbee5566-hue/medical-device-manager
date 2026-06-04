import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { syntheticEmailForPinAuth } from '@/lib/pin-auth'

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10)
}

export async function verifyPin(pin: string, pinHash: string) {
  return bcrypt.compare(pin, pinHash)
}

export function generateLoginSecret() {
  return crypto.randomBytes(32).toString('base64url')
}

/**
 * PIN でログインするユーザー（管理者・一般用）を作成する。
 * Auth のメールは内部用、パスワードはランダム（サーバーのみ保持）。
 */
export async function createPinAuthUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  opts: {
    name: string
    role: 'admin' | 'staff'
    pin: string
    hospital_id?: string | null
  }
): Promise<string> {
  const admin = createClient(supabaseUrl.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const loginSecret = generateLoginSecret()
  const pinHash = await hashPin(opts.pin)
  const tempEmail = `${crypto.randomUUID()}@temp.pin.medical.internal`

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: tempEmail,
    password: loginSecret,
    email_confirm: true,
    user_metadata: { name: opts.name, role: opts.role },
  })

  if (createError) throw new Error(createError.message)
  const userId = created.user?.id
  if (!userId) throw new Error('ユーザーIDが取得できませんでした')

  const internalEmail = syntheticEmailForPinAuth(userId)
  const { error: emailError } = await admin.auth.admin.updateUserById(userId, {
    email: internalEmail,
  })
  if (emailError) throw new Error(emailError.message)

  const { error: secretError } = await admin.from('profile_auth_secrets').insert({
    user_id: userId,
    pin_hash: pinHash,
    login_secret: loginSecret,
  })
  if (secretError) throw new Error(secretError.message)

  const profileRow = {
    id: userId,
    name: opts.name,
    role: opts.role,
    hospital_id: opts.hospital_id ?? null,
    updated_at: new Date().toISOString(),
  }

  const { error: profileError } = await admin.from('profiles').upsert(profileRow, { onConflict: 'id' })
  if (profileError) throw new Error(profileError.message)

  const { data: verified, error: verifyErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  if (verifyErr || !verified) {
    throw new Error('プロフィールの保存確認に失敗しました')
  }
  if (verified.role !== opts.role) {
    throw new Error(`プロフィールの権限が ${opts.role} になりませんでした（現在: ${verified.role}）`)
  }

  return userId
}

/**
 * 既存の auth ユーザーに PIN ログイン用データを付与する（profile_auth_secrets が無い場合のみ）。
 */
export async function attachPinAuthToExistingUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  opts: {
    userId: string
    pin: string
    role: 'admin' | 'staff'
  }
): Promise<void> {
  const admin = createClient(supabaseUrl.replace(/\/$/, ''), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing } = await admin
    .from('profile_auth_secrets')
    .select('user_id')
    .eq('user_id', opts.userId)
    .maybeSingle()

  if (existing) {
    throw new Error('このユーザーには既に PIN ログインが設定されています')
  }

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', opts.userId)
    .single()

  if (profErr || !profile) {
    throw new Error('プロフィールが見つかりません')
  }

  if (profile.role !== opts.role) {
    throw new Error('権限がプロフィールと一致しません')
  }

  const loginSecret = generateLoginSecret()
  const pinHash = await hashPin(opts.pin)
  const internalEmail = syntheticEmailForPinAuth(opts.userId)

  const { error: secretError } = await admin.from('profile_auth_secrets').insert({
    user_id: opts.userId,
    pin_hash: pinHash,
    login_secret: loginSecret,
  })
  if (secretError) throw new Error(secretError.message)

  const { error: authError } = await admin.auth.admin.updateUserById(opts.userId, {
    email: internalEmail,
    password: loginSecret,
    email_confirm: true,
  })
  if (authError) throw new Error(authError.message)
}
