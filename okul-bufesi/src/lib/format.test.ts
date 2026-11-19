import { describe, expect, it } from 'vitest'
import { businessDate, formatDuration, formatMoney, parseMoneyInput } from './format'

describe('para ve zaman biçimleme', () => {
  it('tutarı TL ekiyle biçimler', () => {
    expect(formatMoney(12.5)).toBe('12,50 TL')
  })

  it('Türkçe ondalık girişini sayıya çevirir', () => {
    expect(parseMoneyInput(' 42,75 ')).toBe(42.75)
    expect(parseMoneyInput('geçersiz')).toBe(0)
  })

  it('süreyi okunabilir biçime çevirir', () => {
    expect(formatDuration(0)).toBe('0 dk')
    expect(formatDuration(65)).toBe('1 sa 5 dk')
  })

  it('işletme tarihini YYYY-MM-DD biçiminde döndürür', () => {
    expect(businessDate(new Date('2026-11-19T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
