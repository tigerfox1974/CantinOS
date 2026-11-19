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
      const payload: CategoryInput = { name: trimmedName, sortOrder }
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
