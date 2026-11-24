/** 開発用ローカルサーバー: ブラウザタブ数（サーバー1プロセス内） */

const SHUTDOWN_DELAY_MS = 3_000

const activeTabIds = new Set<string>()
let shutdownTimer: ReturnType<typeof setTimeout> | null = null

function cancelShutdown() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer)
    shutdownTimer = null
  }
}

function requestProcessExit() {
  // eslint-disable-next-line no-console
  console.log('[dev] ブラウザが閉じられたためローカルサーバーを停止します。')
  setTimeout(() => {
    try {
      process.kill(process.pid, 'SIGINT')
    } catch {
      process.exit(0)
    }
  }, 200)
}

function scheduleShutdown() {
  if (process.env.NODE_ENV !== 'development') return
  if (process.env.DEV_SHUTDOWN_WITH_BROWSER === 'false') return
  if (activeTabIds.size > 0) return
  cancelShutdown()
  shutdownTimer = setTimeout(() => {
    if (activeTabIds.size > 0) return
    requestProcessExit()
  }, SHUTDOWN_DELAY_MS)
}

export function devLifecycleEnter(tabId: string) {
  if (!tabId) return
  activeTabIds.add(tabId)
  cancelShutdown()
}

export function devLifecycleLeave(tabId: string) {
  if (!tabId) return
  activeTabIds.delete(tabId)
  scheduleShutdown()
}

/** タブが生存している印（操作不要・時間経過ではサーバーを止めない） */
export function devLifecycleHeartbeat(tabId: string) {
  if (!tabId) return
  activeTabIds.add(tabId)
  cancelShutdown()
}

export function devLifecycleIsEnabled() {
  if (process.env.NODE_ENV !== 'development') return false
  if (process.env.DEV_SHUTDOWN_WITH_BROWSER === 'false') return false
  return true
}