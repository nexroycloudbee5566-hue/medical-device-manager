/** 開発用ローカルサーバー: ブラウザタブ数（サーバー1プロセス内） */

const SHUTDOWN_DELAY_MS = 3_000
const TAB_STALE_MS = 18_000
const SWEEP_MS = 4_000

const activeTabIds = new Set<string>()
const lastSeenAt = new Map<string, number>()
let shutdownTimer: ReturnType<typeof setTimeout> | null = null
let sweeperStarted = false

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

function touchTab(tabId: string) {
  if (!tabId) return
  activeTabIds.add(tabId)
  lastSeenAt.set(tabId, Date.now())
  cancelShutdown()
}

function sweepStaleTabs() {
  if (!devLifecycleIsEnabled()) return
  const now = Date.now()
  for (const id of [...activeTabIds]) {
    const seen = lastSeenAt.get(id) ?? 0
    if (now - seen > TAB_STALE_MS) {
      activeTabIds.delete(id)
      lastSeenAt.delete(id)
    }
  }
  if (activeTabIds.size === 0) scheduleShutdown()
}

function ensureSweeper() {
  if (sweeperStarted || !devLifecycleIsEnabled()) return
  sweeperStarted = true
  setInterval(sweepStaleTabs, SWEEP_MS)
}

export function devLifecycleEnter(tabId: string) {
  ensureSweeper()
  touchTab(tabId)
}

export function devLifecycleLeave(tabId: string) {
  if (!tabId) return
  activeTabIds.delete(tabId)
  lastSeenAt.delete(tabId)
  scheduleShutdown()
}

export function devLifecycleHeartbeat(tabId: string) {
  ensureSweeper()
  touchTab(tabId)
}

export function devLifecycleIsEnabled() {
  if (process.env.NODE_ENV !== 'development') return false
  if (process.env.DEV_SHUTDOWN_WITH_BROWSER === 'false') return false
  return true
}