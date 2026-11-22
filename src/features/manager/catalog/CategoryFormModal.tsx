import { useState, type FormEvent } from 'react'
import { Modal } from '../../../components/Modal'
import { staffAdminApi } from '../../../lib/api'
import { toUserMessage } from '../../../lib/errors'
import type { AdminCategory, CategoryInput } from '../../../types/domain'
import { parseSortOrderInput } from './formUtils'

interface CategoryFormModalProps {
  token: string
  category: AdminCategory | null
  categories: AdminCategory[]
  onSaved: () => void
  onClose: () => void
}

interface CategoryFormErrors {
  name?: string
  sortOrder?: string
}

const PRESET_ICONS = ['🥪', '🥤', '☕', '🥐', '🍟', '🍰', '🍕', '🍲', '🥗', '🍫', '✨']

export function CategoryFormModal({
  token,
  category,
  categories,
  onSaved,
  onClose,
}: CategoryFormModalProps) {
  const suggestedSort = categories.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 10
  const [name, setName] = useState(category?.name ?? '')
  const [sortText, setSortText] = useState(String(category?.sortOrder ?? suggestedSort))
  const [icon, setIcon] = useState(category?.icon ?? '🥪')
  const [errors, setErrors] = useState<CategoryFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const trimmedName = name.trim()
    const nextErrors: CategoryFormErrors = {}

    if (trimmedName.length < 2 || trimmedName.length > 80) {
      nextErrors.name = 'Kategori adı 2 ile 80 karakter arasında olmalıdır.'
    }

    const sortOrder = parseSortOrderInput(sortText)
    if (sortOrder === null) {
      nextErrors.sortOrder = 'Sıra için 0 veya daha büyük bir tam sayı yazın.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || sortOrder === null) return

    setBusy(true)
    setServerError(null)
    try {
      const payload: CategoryInput = {
        name: trimmedName,
        sortOrder,
        icon: icon.trim() || null,
      }
      if (category) {
        payload.id = category.id
        await staffAdminApi.manageCategory(token, 'UPDATE', payload)
      } else {
        await staffAdminApi.manageCategory(token, 'CREATE', payload)
      }
      onSaved()
    } catch (cause) {
      setServerError(toUserMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title={category ? 'Kategoriyi düzenle' : 'Yeni kategori'}
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={!busy}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={busy}>
            Vazgeç
          </button>
          <button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>
            {busy ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            Kaydet
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit} noValidate>
        {serverError ? (
          <div className="alert alert-danger py-2" role="alert">
            {serverError}
          </div>
        ) : null}

        <div className="mb-3">
          <label htmlFor="category-name" className="form-label">
            Kategori adı
          </label>
          <input
            id="category-name"
            type="text"
            className={`form-control${errors.name ? ' is-invalid' : ''}`}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
          {errors.name ? (
            <div className="invalid-feedback d-block">{errors.name}</div>
          ) : (
            <div className="form-text">2 ile 80 karakter arasında.</div>
          )}
        </div>

        <div className="mb-3">
          <label className="form-label d-block">
            Kategori Simgesi (Emoji)
          </label>
          <div className="d-flex flex-wrap gap-2 mb-2">
            {PRESET_ICONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`btn btn-sm ${icon === emoji ? 'btn-primary' : 'btn-outline-secondary'}`}
                style={{ fontSize: '1.2rem', padding: '4px 10px' }}
                onClick={() => setIcon(emoji)}
                title={`Simge: ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="input-group" style={{ maxWidth: 200 }}>
            <span className="input-group-text">{icon || '🍴'}</span>
            <input
              type="text"
              className="form-control"
              value={icon}
              maxLength={8}
              placeholder="Örn: 🥪"
              onChange={(e) => setIcon(e.target.value)}
              title="Özel bir emoji veya simge yazabilirsiniz"
            />
          </div>
          <div className="form-text">Menü ve kasa sekmelerinde kategori adının yanında gösterilir.</div>
        </div>

        <div className="mb-0">
          <label htmlFor="category-sort" className="form-label">
            Sıra
          </label>
          <input
            id="category-sort"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            className={`form-control${errors.sortOrder ? ' is-invalid' : ''}`}
            value={sortText}
            onChange={(event) => setSortText(event.target.value)}
          />
          {errors.sortOrder ? (
            <div className="invalid-feedback d-block">{errors.sortOrder}</div>
          ) : (
            <div className="form-text">Küçük değer menüde daha üstte görünür.</div>
          )}
        </div>
      </form>
    </Modal>
  )
}
