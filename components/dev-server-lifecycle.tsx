'use client'

import { useEffect } from 'react'

const HEARTBEAT_MS = 12_000

function getTabId() {
  const key = 'mdm-dev-tab-id'
  let id = sessionStorage.getItem(key)
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, id)
  }
  return id
}

/** 開発時: ブラウザを閉じたら npm run dev を止める */
export function DevServerLifecycle() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return

    const tabId = getTabId()

    const post = (action: string) => {
      void fetch('/api/dev/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tabId }),
        keepalive: action === 'leave',
      }).catch(() => {})
    }

    post('enter')

    const beat = setInterval(() => post('heartbeat'), HEARTBEAT_MS)

    const onLeave = () => post('leave')
    window.addEventListener('pagehide', onLeave)

    return () => {
      clearInterval(beat)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [])

  return null
}