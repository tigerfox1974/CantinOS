import { parseMoneyInput } from '../../../lib/format'

/** "12,50", "12.50", "12" gibi girdileri geçerli bir TL tutarına çevirir. */
export function parsePriceInput(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null

  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null

  const numeric = parseMoneyInput(trimmed)
  if (!Number.isFinite(numeric) || numeric < 0) return null

  return Math.round(numeric * 100) / 100
}

/** Boş bırakılırsa 0 döner; geçersiz girdide null. */
export function parseSortOrderInput(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return 0
  if (!/^\d+$/.test(trimmed)) return null

  const numeric = Number(trimmed)
  if (!Number.isSafeInteger(numeric) || numeric < 0) return null

  return numeric
}
