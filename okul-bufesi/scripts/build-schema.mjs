import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const databaseDir = join(root, '..', 'database')
const migrationsDir = join(databaseDir, 'migrations')

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b, 'en'))

if (files.length === 0) {
  throw new Error('database/migrations içinde SQL dosyası bulunamadı.')
}

const header = `-- =====================================================================
-- OKUL BÜFESİ — TAM ŞEMA (otomatik üretildi)
-- Kaynak: database/migrations/*.sql
-- Yeniden üretmek için: npm run schema:build
-- Hedef: Supabase PostgreSQL 15+ | Saat dilimi: Asia/Nicosia
-- =====================================================================

`

const body = files
  .map((name) => {
    const sql = readFileSync(join(migrationsDir, name), 'utf8').trimEnd()
    return `-- >>> ${name}\n\n${sql}\n`
  })
  .join('\n')

writeFileSync(join(databaseDir, 'schema.sql'), `${header}${body}`, 'utf8')
console.log(`schema.sql üretildi (${files.length} migration).`)
