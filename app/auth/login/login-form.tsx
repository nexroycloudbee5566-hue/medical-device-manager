'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [pinLength, setPinLength] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const pinInputRef = useRef<HTMLInputElement>(null)
  const pinCounterRef = useRef<HTMLParagraphElement>(null)
  const isComposingRef = useRef(false)

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

  const readPinFromField = useCallback(() => {
    const raw = pinInputRef.current?.value ?? ''
    return normalizePinInput(raw, pinLen)
  }, [pinLen])

  const updatePinCounterText = useCallback(
    (length: number) => {
      const text =
        length === pinLen
          ? `PIN ${pinLen} 桁入力済み — ログインできます`
          : `${pinLen} 桁の半角数字を入力（現在 ${length} / ${pinLen} 桁）`
      const node = pinCounterRef.current
      if (node) {
        node.textContent = text
        node.className = cn(
          'text-xs',
          length === pinLen ? 'text-green-700 font-medium' : 'text-slate-500',
        )
      }
    },
    [pinLen],
  )

  const syncPinField = useCallback(() => {
    const el = pinInputRef.current
    if (!el) return
    const next = normalizePinInput(el.value, pinLen)
    if (el.value !== next) el.value = next
    setPinLength(next.length)
    updatePinCounterText(next.length)
  }, [pinLen, updatePinCounterText])

  const pinInputMount = useCallback(
    (el: HTMLInputElement | null) => {
      pinInputRef.current = el
      if (!el) return
      const onNative = () => syncPinField()
      el.addEventListener('input', onNative)
      el.addEventListener('change', onNative)
      el.addEventListener('keyup', onNative)
    },
    [syncPinField],
  )

  async function doLogin() {
    syncPinField()
    const pin = readPinFromField()

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

  const pinReady = pinLength === pinLen
  const canSubmit = Boolean(effectiveProfileId) && !loading

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
                <span className="block text-[10px] text-slate-400">ログイン画面 2026-03-22版</span>
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
            <div className="space-y-4">
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
                    {profiles.map((p) => {
                      const selected = effectiveProfileId === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setProfileId(p.id)
                            setError(null)
                          }}
                          className={cn(
                            'w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors',
                            selected
                              ? 'border-blue-600 bg-blue-50 text-blue-900 ring-2 ring-blue-600/30'
                              : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300',
                          )}
                        >
                          {p.name || '（名前未設定）'}
                          {selected && (
                            <span className="ml-2 text-xs font-normal text-blue-700">選択中</span>
                          )}
                        </button>
                      )
                    })}
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
                <input
                  ref={pinInputMount}
                  id="pin"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  type="tel"
                  pattern="[0-9]*"
                  maxLength={pinLen}
                  placeholder={mode === 'admin' ? '12345678' : '123456'}
                  className={cn(
                    'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-1',
                    'text-center text-xl font-mono tracking-[0.35em] text-slate-900 shadow-xs',
                    'outline-none focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/30',
                  )}
                  onCompositionStart={() => {
                    isComposingRef.current = true
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false
                    syncPinField()
                  }}
                  onInput={() => {
                    if (!isComposingRef.current) syncPinField()
                  }}
                  onChange={() => syncPinField()}
                  onKeyUp={() => syncPinField()}
                  onPaste={() => {
                    window.setTimeout(() => syncPinField(), 0)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void doLogin()
                    }
                  }}
                />
                <p
                  ref={pinCounterRef}
                  className={cn('text-xs', pinReady ? 'text-green-700 font-medium' : 'text-slate-500')}
                  aria-live="polite"
                >
                  {pinReady
                    ? `PIN ${pinLen} 桁入力済み — ログインできます`
                    : `${pinLen} 桁の半角数字を入力（現在 ${pinLength} / ${pinLen} 桁）`}
                </p>
              </div>
              <button
                type="button"
                className={cn(
                  'inline-flex w-full h-10 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:pointer-events-none disabled:opacity-50',
                )}
                disabled={!canSubmit}
                onClick={() => void doLogin()}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ログイン中...
                  </>
                ) : (
                  'ログイン'
                )}
              </button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          PIN を忘れた場合は管理者にリセットを依頼してください
        </p>
      </div>
    </div>
  )
}