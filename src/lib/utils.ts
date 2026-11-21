export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function getCategoryIcon(name: string): string {
  const lower = name.toLocaleLowerCase('tr-TR')
  if (lower.includes('tost') || lower.includes('sandviç') || lower.includes('ekmek') || lower.includes('burger')) return '🥪'
  if (lower.includes('içecek') || lower.includes('kahve') || lower.includes('çay') || lower.includes('su') || lower.includes('kola') || lower.includes('soda') || lower.includes('ayran')) return '🥤'
  if (lower.includes('atıştırmalık') || lower.includes('cips') || lower.includes('kraker') || lower.includes('bisküvi') || lower.includes('kuruyemiş')) return '🍟'
  if (lower.includes('tatlı') || lower.includes('çikolata') || lower.includes('kek') || lower.includes('pasta') || lower.includes('waffle')) return '🍰'
  if (lower.includes('dondurma')) return '🍦'
  if (lower.includes('poğaça') || lower.includes('börek') || lower.includes('simit') || lower.includes('açma') || lower.includes('unlu')) return '🥐'
  if (lower.includes('sıcak') || lower.includes('yemek') || lower.includes('çorba')) return '🍲'
  if (lower.includes('salata') || lower.includes('meyve')) return '🥗'
  if (lower.includes('döner') || lower.includes('dürüm')) return '🌯'
  if (lower.includes('pizza')) return '🍕'
  return '🍴'
}
