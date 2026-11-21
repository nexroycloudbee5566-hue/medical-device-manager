'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ensureBrowserSession } from '@/lib/ensure-browser-session'
import { Loader2 } from 'lucide-react'

/** 開発バイパス時: サーバーセッションをブラウザの Supabase クライアントへ同期してから描画 */
export function DevSessionProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [ready, setReady] = useState(!enabled)

  useEffect(() => {
    if (!enabled) return

    const supabase = createClient()

    void (async () => {
      await ensureBrowserSession(supabase)
      setReady(true)
    })()
  }, [enabled])

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        データベースに接続しています…
      </div>
    )
  }

  return children
}