const EXTENSION_CLASS = 'bpac-extension-installed'

/** Brother b-PAC Extension が body に付与するクラス */
export function isBpacExtensionInstalled(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.classList.contains(EXTENSION_CLASS)
}

/** 拡張機能のクラス注入を待つ（最大 timeoutMs） */
export function waitForBpacExtension(timeoutMs = 8000): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false)
  if (isBpacExtensionInstalled()) return Promise.resolve(true)

  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      observer.disconnect()
      clearTimeout(timer)
      resolve(ok)
    }

    const observer = new MutationObserver(() => {
      if (isBpacExtensionInstalled()) done(true)
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })

    const timer = setTimeout(() => {
      done(isBpacExtensionInstalled())
    }, timeoutMs)
  })
}

export type BpacDetectStatus = {
  extensionInstalled: boolean
  browserHint: string
}

export function getBpacDetectStatus(): BpacDetectStatus {
  const extensionInstalled = isBpacExtensionInstalled()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : ''
  const isEdge = ua.includes('edg/')
  const isChrome = ua.includes('chrome') && !isEdge

  let browserHint = 'Chrome または Edge で Brother b-PAC Extension を有効にしてください。'
  if (isChrome) {
    browserHint =
      'Chrome: Brother b-PAC Extension をインストールし、このサイトで拡張機能を「オン」にしてください。'
  } else if (isEdge) {
    browserHint =
      'Edge: Brother b-PAC Extension をインストールし、このサイトで拡張機能を「オン」にしてください。'
  }

  return { extensionInstalled, browserHint }
}

export const BPAC_CHROME_EXTENSION_URL =
  'https://chromewebstore.google.com/detail/ilpghlfadkjifilabejhhijpfphfcfhb'

export const BPAC_EDGE_EXTENSION_URL =
  'https://microsoftedge.microsoft.com/addons/detail/brother-bpac-extension/kmopihekhjobijiipnloimfdgjddbnhg'
