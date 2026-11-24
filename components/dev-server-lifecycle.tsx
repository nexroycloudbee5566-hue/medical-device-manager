'use client'

import { useEffect } from 'react'

/** バックグラウンドタブでも生存確認用（サーバー停止判定には使わない） */
const HEARTBEAT_MS = 60_000

function getTabId() {
  const key = 'mdm-dev-tab-id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

function postLifecycle(action: string, tabId: string) {
  const payload = JSON.stringify({ action, tabId })
  if (action === 'leave' && typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(
      '/api/dev/lifecycle',
      new Blob([payload], { type: 'application/json' }),
    )
    return
  }
  void fetch('/api/dev/lifecycle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: action === 'leave',
  }).catch(() => {})
}

/** 開発時: ブラウザを閉じたら npm run dev を止める */
export function DevServerLifecycle() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const tabId = getTabId()

    postLifecycle('enter', tabId)

    const beat = setInterval(() => postLifecycle('heartbeat', tabId), HEARTBEAT_MS)

    const onLeave = () => postLifecycle('leave', tabId)
    window.addEventListener('pagehide', onLeave)
    const onVisible = () => {
      if (document.visibilityState === 'visible') postLifecycle('heartbeat', tabId)
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(beat)
      window.removeEventListener('pagehide', onLeave)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return null
}