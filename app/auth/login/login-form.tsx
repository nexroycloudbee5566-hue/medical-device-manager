'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { normalizePinInput } from '@/lib/pin-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Stethoscope, AlertCircle, Loader2, ShieldCheck, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProfileOptionsResult } from '@/lib/profile-options'

type LoginMode = 'staff' | 'admin'

type Props = {
  mode: LoginMode
  staff: ProfileOptionsResult
  admin: ProfileOptionsResult
}

export function LoginForm({ mode, staff, admin }: Props) {
  const router = useRouter()
  const current = mode === 'admin' ? admin : staff
  const profiles = current.profiles
  const listError = current.error
  const listHint = current.hint
  const [profileId, setProfileId] = useState('')
  const [pinDigits, setPinDigits] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pinRef = useRef<HTMLInputElement>(null)

  const pinLen = mode === 'admin' ? 8 : 6

  const effectiveProfileId =
    profileId && profiles.some((p) => p.id === profileId) ? profileId : (profiles[0]?.id ?? '')

  useEffect(() => {
    if (profiles.length === 0) {
      setProfileId('')
      return
    }
    setProfileId((current) =>
      current && profiles.some((p) => p.id === current) ? current : (profiles[0]?.id ?? ''),
    )
  }, [profiles])

  function syncPinFromInput(el: HTMLInputElement) {
    const next = normalizePinInput(el.value, pinLen)
    if (el.value !== next) el.value = next
    setPinDigits(next.length)
  }

  async function doLogin() {
    const el = pinRef.current
    if (el) syncPinFromInput(el)
    const pin = normalizePinInput(el?.value ?? '', pinLen)

    if (!effectiveProfileId) {
      setError('ユーザーを選択してください（名前のボタンをクリック）')
      return
    }
    if (pin.length !== pinLen) {
      setError(`PIN は ${pinLen} 桁の数字です（現在 ${pin.length} 桁）`)
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/pin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: effectiveProfileId, pin, mode }),
    })

    const data = await res.json().catch(() => ({}))
    setLoading(false)

    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'ログインに失敗しました')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const pinOk = pinDigits === pinLen

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <div className="p-3 bg-blue-600 rounded-2xl shadow-lg">
              <Stethoscope className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">医療機器管理システム</h1>
          <p className="text-slate-500 text-sm">臨床工学技士専用ポータル</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4 space-y-4">
            <div className="space-y-1">
              <CardTitle className="text-lg">PIN でログイン</CardTitle>
              <CardDescription className="space-y-1">
                <span>
                  {mode === 'admin'
                    ? '管理者モード — PIN は 8 桁の数字です'
                    : '一般用モード — PIN は 6 桁の数字です'}
                </span>
                <span className="block text-[10px] text-slate-400">ログイン画面 2026-03-22c</span>
              </CardDescription>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <a
                href="/auth/login"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium',
                  mode === 'staff' ? 'bg-white text-slate-800 shadow' : 'text-slate-500',
                )}
              >
                <User className="h-4 w-4" /> 一般用
              </a>
              <a
                href="/auth/login?mode=admin"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium',
                  mode === 'admin' ? 'bg-white text-slate-800 shadow' : 'text-slate-500',
                )}
              >
                <ShieldCheck className="h-4 w-4" /> 管理者
              </a>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label>ユーザー</Label>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProfileId(p.id)
                    setError(null)
                  }}
                  className={cn(
                    'w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium',
                    effectiveProfileId === p.id
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white',
                  )}
                >
                  {p.name}
                  {effectiveProfileId === p.id && (
                    <span className="ml-2 text-xs text-blue-700">選択中</span>
                  )}
                </button>
              ))}
              {listError && <p className="text-xs text-destructive">{listError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-pin">PIN（{pinLen}桁）</Label>
              <input
                ref={pinRef}
                id="login-pin"
                type="tel"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={pinLen}
                defaultValue=""
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-center text-lg font-mono"
                onInput={(e) => syncPinFromInput(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void doLogin()
                }}
              />
              <p className={cn('text-xs', pinOk ? 'text-green-700 font-medium' : 'text-slate-500')}>
                {pinOk
                  ? `PIN ${pinLen} 桁入力済み`
                  : `${pinLen} 桁の半角数字（現在 ${pinDigits} / ${pinLen}）`}
              </p>
            </div>

            <button
              type="button"
              className="h-10 w-full rounded-lg bg-slate-900 text-sm font-medium text-white disabled:opacity-50"
              disabled={loading || !effectiveProfileId}
              onClick={() => void doLogin()}
            >
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}