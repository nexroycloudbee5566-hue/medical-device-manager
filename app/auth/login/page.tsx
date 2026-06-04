'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Stethoscope, AlertCircle, Loader2, ShieldCheck, User } from 'lucide-react'
import { cn } from '@/lib/utils'

type LoginMode = 'staff' | 'admin'

interface ProfileOption {
  id: string
  name: string
}

export default function LoginPage() {
  const router = useRouter()
  const modeGroupId = useId()
  const [mode, setMode] = useState<LoginMode>('staff')
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [profileId, setProfileId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingList, setLoadingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [listHint, setListHint] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function switchMode(next: LoginMode) {
    setMode(next)
    setProfileId('')
    setPin('')
    setError(null)
    setListError(null)
    setListHint(null)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingList(true)
      const res = await fetch(`/api/auth/profile-options?role=${mode}`)
      const data = await res.json().catch(() => ({}))
      if (!cancelled) {
        if (!res.ok) {
          setListError(typeof data.error === 'string' ? data.error : 'ユーザー一覧の取得に失敗しました')
          setListHint(null)
          setProfiles([])
        } else {
          setListError(null)
          setListHint(typeof data.hint === 'string' ? data.hint : null)
          setProfiles(data.profiles ?? [])
        }
        setLoadingList(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [mode])

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

            {/* ネイティブ radio でタブ切替（Select のオーバーレイの影響を受けない） */}
            <div
              className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1"
              role="radiogroup"
              aria-label="ログイン種別"
            >
              <label
                htmlFor={`${modeGroupId}-staff`}
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors select-none touch-manipulation',
                  mode === 'staff'
                    ? 'bg-white text-slate-800 shadow'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <input
                  id={`${modeGroupId}-staff`}
                  type="radio"
                  name={modeGroupId}
                  value="staff"
                  checked={mode === 'staff'}
                  onChange={() => switchMode('staff')}
                  className="sr-only"
                />
                <User className="h-4 w-4 shrink-0" aria-hidden />
                一般用
              </label>
              <label
                htmlFor={`${modeGroupId}-admin`}
                className={cn(
                  'flex cursor-pointer items-center justify-center gap-2 rounded-md py-2.5 text-sm font-medium transition-colors select-none touch-manipulation',
                  mode === 'admin'
                    ? 'bg-white text-slate-800 shadow'
                    : 'text-slate-500 hover:text-slate-700',
                )}
              >
                <input
                  id={`${modeGroupId}-admin`}
                  type="radio"
                  name={modeGroupId}
                  value="admin"
                  checked={mode === 'admin'}
                  onChange={() => switchMode('admin')}
                  className="sr-only"
                />
                <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
                管理者
              </label>
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
                <Label htmlFor="login-profile">ユーザー</Label>
                <select
                  id="login-profile"
                  value={profileId}
                  onChange={(e) => setProfileId(e.target.value)}
                  disabled={loadingList}
                  className={cn(
                    'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-xs',
                    'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                  )}
                >
                  <option value="">
                    {loadingList ? '読み込み中…' : '名前を選択'}
                  </option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || '（名前未設定）'}
                    </option>
                  ))}
                </select>
                {listError && (
                  <p className="text-xs text-destructive">{listError}</p>
                )}
                {listHint && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    {listHint}
                  </p>
                )}
                {!loadingList && !listError && !listHint && profiles.length === 0 && (
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
