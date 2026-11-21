'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { isPinLoginBypassEnabled } from '@/lib/pin-login-bypass'
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
  const bypassPin = isPinLoginBypassEnabled()
  const current = mode === 'admin' ? admin : staff
  const profiles = current.profiles
  const listError = current.error
  const [profileId, setProfileId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pinLen = mode === 'admin' ? 8 : 6
  const effectiveProfileId =
    profileId && profiles.some((p) => p.id === profileId) ? profileId : (profiles[0]?.id ?? '')

  useEffect(() => {
    if (profiles.length === 0) {
      setProfileId('')
      return
    }
    setProfileId((cur) =>
      cur && profiles.some((p) => p.id === cur) ? cur : (profiles[0]?.id ?? ''),
    )
  }, [profiles])

  async function doLogin(opts?: { profileOverride?: string }) {
    const id = opts?.profileOverride ?? effectiveProfileId
    if (!id) {
      setError('ユーザーが選択されていません')
      return
    }

    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/pin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId: id,
        pin: bypassPin ? '00000000' : '',
        mode,
      }),
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
            <CardTitle className="text-lg">ログイン</CardTitle>
            <CardDescription>
              {bypassPin ? (
                <span className="text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 block text-xs">
                  ローカル開発モード：名前を選んで「ログイン」で PIN なしで入れます（本番では無効）
                </span>
              ) : mode === 'admin' ? (
                '管理者 — PIN は 8 桁'
              ) : (
                '一般用 — PIN は 6 桁'
              )}
            </CardDescription>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
              <a
                href="/auth/login"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium',
                  mode === 'staff' ? 'bg-white shadow' : 'text-slate-500',
                )}
              >
                <User className="h-4 w-4" /> 一般用
              </a>
              <a
                href="/auth/login?mode=admin"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium',
                  mode === 'admin' ? 'bg-white shadow' : 'text-slate-500',
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
            {listError && <p className="text-xs text-destructive">{listError}</p>}

            <div className="space-y-2">
              <Label>ユーザー（クリックで選択）</Label>
              {profiles.length === 0 ? (
                <p className="text-sm text-slate-500">選択できるユーザーがありません</p>
              ) : (
                profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setProfileId(p.id)
                      setError(null)
                      if (bypassPin) void doLogin({ profileOverride: p.id })
                    }}
                    className={cn(
                      'w-full rounded-lg border px-3 py-3 text-left text-sm font-medium',
                      effectiveProfileId === p.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    {p.name}
                    {bypassPin && (
                      <span className="block text-xs text-slate-500 mt-0.5">タップでログイン</span>
                    )}
                  </button>
                ))
              )}
            </div>

            {!bypassPin && (
              <PinLoginFields pinLen={pinLen} mode={mode} profileId={effectiveProfileId} setError={setError} />
            )}

            {bypassPin ? (
              <button
                type="button"
                className="h-10 w-full rounded-lg bg-slate-900 text-sm font-medium text-white disabled:opacity-50"
                disabled={loading || !effectiveProfileId}
                onClick={() => void doLogin()}
              >
                {loading ? 'ログイン中…' : 'ログイン（PIN不要）'}
              </button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function PinLoginFields({
  pinLen,
  mode,
  profileId,
  setError,
}: {
  pinLen: number
  mode: LoginMode
  profileId: string
  setError: (msg: string | null) => void
}) {
  const router = useRouter()
  const [pinDigits, setPinDigits] = useState(0)
  const [loading, setLoading] = useState(false)

  async function submit(pin: string) {
    if (!profileId) {
      setError('ユーザーを選択してください')
      return
    }
    if (pin.length !== pinLen) {
      setError(`PIN は ${pinLen} 桁です`)
      return
    }
    setLoading(true)
    setError(null)
    const res = await fetch('/api/auth/pin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, pin, mode }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError(typeof data.error === 'string' ? data.error : 'ログイン失敗')
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <>
      <Label htmlFor="login-pin">PIN（{pinLen}桁）</Label>
      <input
        id="login-pin"
        type="tel"
        inputMode="numeric"
        maxLength={pinLen}
        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-center font-mono text-lg"
        onInput={(e) => {
          const el = e.currentTarget
          const next = normalizePinInput(el.value, pinLen)
          if (el.value !== next) el.value = next
          setPinDigits(next.length)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void submit(normalizePinInput(e.currentTarget.value, pinLen))
          }
        }}
      />
      <p className="text-xs text-slate-500">
        現在 {pinDigits} / {pinLen} 桁
      </p>
      <button
        type="button"
        disabled={loading || !profileId || pinDigits !== pinLen}
        className="h-10 w-full rounded-lg bg-slate-900 text-sm text-white disabled:opacity-50"
        onClick={() => {
          const el = document.getElementById('login-pin') as HTMLInputElement | null
          void submit(normalizePinInput(el?.value ?? '', pinLen))
        }}
      >
        {loading ? 'ログイン中…' : 'ログイン'}
      </button>
    </>
  )
}