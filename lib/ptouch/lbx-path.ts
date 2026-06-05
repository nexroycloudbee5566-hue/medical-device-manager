/** Windows 向け .lbx パスの候補（b-PAC Open 用） */
export function lbxPathVariants(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  const set = new Set<string>()
  set.add(trimmed)

  const backslash = trimmed.replace(/\//g, '\\')
  set.add(backslash)

  const forward = trimmed.replace(/\\/g, '/')
  set.add(forward)

  const halfSpace = backslash.replace(/\u3000/g, ' ')
  set.add(halfSpace)

  const asciiHint = halfSpace.replace(/[\u0080-\uFFFF]/g, '')
  if (asciiHint.length > 4 && asciiHint.includes('.lbx')) {
    set.add(asciiHint)
  }

  return [...set]
}

export function lbxPathHasNonAscii(path: string): boolean {
  return /[^\x00-\x7F]/.test(path)
}

export const RECOMMENDED_LBX_DIR = 'C:\\Labels\\me-device.lbx'
