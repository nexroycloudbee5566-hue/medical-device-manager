'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
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
      setError(typeof data.error === 'string' ? data.error : 'ログインに失敗しました')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const pinLen = mode === 'admin' ? 8 : 6

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
              <CardDescription>
                {mode === 'admin'
                  ? '管理者モード — PIN は 8 桁の数字です'
                  : '一般用モード — PIN は 6 桁の数字です'}
              </CardDescription>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1" aria-label="ログイン種別">
              <a
                href="/auth/login"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors select-none touch-manipulation',
                  mode === 'staff'
                    ? 'bg-white text-slate-800 shadow'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <User className="h-4 w-4 shrink-0" aria-hidden />
                一般用
              </a>
              <a
                href="/auth/login?mode=admin"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors select-none touch-manipulation',
                  mode === 'admin'
                    ? 'bg-white text-slate-800 shadow'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                管理者
              </a>
            </div>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>ユーザー</Label>
                {profiles.length > 0 ? (
                  <div className="grid gap-2" role="listbox" aria-label="ユーザー">
                    {profiles.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProfileId(p.id)}
                        className={cn(
                          'w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                          profileId === p.id
                            ? 'border-blue-600 bg-blue-50 text-blue-900'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
                        )}
                      >
                        {p.name || '（名前未設定）'}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 px-3 py-2">
                    選択できるユーザーがありません
                  </p>
                )}
                {listError && <p className="text-xs text-destructive">{listError}</p>}
                {listHint && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    {listHint}
                  </p>
                )}
                {!listError && !listHint && profiles.length === 0 && (
                  <p className="text-xs text-amber-600">
                    {mode === 'admin'
                      ? 'PIN 設定済みの管理者がいません。/setup の③で管理者（8桁PIN）を作成してください。'
                      : 'PIN 設定済みの一般ユーザーがいません。'}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pin">PIN（{pinLen}桁）</Label>
                <Input
                  id="pin"
                  inputMode="numeric"
                  autoComplete="off"
                  type="password"
                  pattern="\d*"
                  maxLength={pinLen}
                  placeholder={mode === 'admin' ? '12345678' : '123456'}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, pinLen))}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !profileId || pin.length !== pinLen}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  'ログイン'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          PIN を忘れた場合は管理者にリセットを依頼してください
        </p>
      </div>
    </div>
  )
}
