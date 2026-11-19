import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Modal } from '../../../components/Modal'
import { staffAdminApi, uploadProductImage } from '../../../lib/api'
import { toUserMessage } from '../../../lib/errors'
import type { AdminCategory, AdminProduct, ProductInput } from '../../../types/domain'
import { parsePriceInput, parseSortOrderInput } from './formUtils'

const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg']

interface ProductFormModalProps {
  token: string
  product: AdminProduct | null
  categories: AdminCategory[]
  onSaved: () => void
  onClose: () => void
}

interface ProductFormErrors {
  name?: string
  categoryId?: string
  description?: string
  price?: string
  sortOrder?: string
}

export function ProductFormModal({
  token,
  product,
  categories,
  onSaved,
  onClose,
}: ProductFormModalProps) {
  const activeCategories = categories.filter((category) => !category.isArchived)
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    product?.categoryId ?? activeCategories[0]?.id ?? '',
  )
  const [description, setDescription] = useState(product?.description ?? '')
  const [priceText, setPriceText] = useState(
    product ? product.price.toFixed(2).replace('.', ',') : '',
  )
  const [sortText, setSortText] = useState(String(product?.sortOrder ?? 0))
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [errors, setErrors] = useState<ProductFormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const selectedCategory = categories.find((category) => category.id === categoryId)
  const noCategoryAvailable = activeCategories.length === 0
  const submitDisabled = saving || imageUploading || noCategoryAvailable

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return

    setImageError(null)

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Yalnız PNG ve JPEG görseller yüklenebilir.')
      input.value = ''
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Görsel en fazla 3 MB olabilir.')
      input.value = ''
      return
    }

    setImageUploading(true)
    try {
      const url = await uploadProductImage(token, file)
      setImageUrl(url)
    } catch (cause) {
      setImageError(toUserMessage(cause))
    } finally {
      setImageUploading(false)
      input.value = ''
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || imageUploading) return

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    const nextErrors: ProductFormErrors = {}

    if (trimmedName.length < 2 || trimmedName.length > 120) {
      nextErrors.name = 'Ürün adı 2 ile 120 karakter arasında olmalıdır.'
    }

    if (!categoryId) {
      nextErrors.categoryId = 'Kategori seçmelisiniz.'
    } else if (!selectedCategory) {
      nextErrors.categoryId = 'Seçilen kategori bulunamadı. Lütfen yeniden seçin.'
    } else if (selectedCategory.isArchived) {
      nextErrors.categoryId = 'Arşivdeki kategori seçilemez. Lütfen başka bir kategori seçin.'
    }

    if (trimmedDescription.length > 1000) {
      nextErrors.description = 'Açıklama en fazla 1000 karakter olabilir.'
    }

    const price = parsePriceInput(priceText)
    if (price === null) {
      nextErrors.price = 'Fiyat 0 veya daha büyük bir tutar olmalıdır. Örnek: 12,50'
    }

    const sortOrder = parseSortOrderInput(sortText)
    if (sortOrder === null) {
      nextErrors.sortOrder = 'Sıra için 0 veya daha büyük bir tam sayı yazın.'
    }

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || price === null || sortOrder === null) return

    setSaving(true)
    setServerError(null)
    try {
      const payload: ProductInput = {
        categoryId,
        name: trimmedName,
        description: trimmedDescription ? trimmedDescription : undefined,
        price,
        imageUrl,
        sortOrder,
        availabilityStatus: product?.availabilityStatus ?? 'ACTIVE',
      }
      if (product) payload.id = product.id

      await staffAdminApi.saveProduct(token, payload)
      onSaved()
    } catch (cause) {
      setServerError(toUserMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={product ? 'Ürünü düzenle' : 'Yeni ürün'}
      onClose={saving ? () => undefined : onClose}
      closeOnBackdrop={!saving}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={saving}>
            Vazgeç
          </button>
          <button type="submit" form="product-form" className="btn btn-primary" disabled={submitDisabled}>
            {saving ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" /> : null}
            Kaydet
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} noValidate>
        {serverError ? (
          <div className="alert alert-danger py-2" role="alert">
            {serverError}
          </div>
        ) : null}

        {noCategoryAvailable ? (
          <div className="alert alert-warning py-2" role="alert">
            Kullanılabilir kategori yok. Ürün eklemeden önce arşivde olmayan bir kategori oluşturun.
          </div>
        ) : null}

        <div className="row g-3">
          <div className="col-12">
            <label htmlFor="product-name" className="form-label">
              Ürün adı
            </label>
            <input
              id="product-name"
              type="text"
              className={`form-control${errors.name ? ' is-invalid' : ''}`}
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              required
            />
            {errors.name ? (
              <div className="invalid-feedback d-block">{errors.name}</div>
            ) : (
              <div className="form-text">2 ile 120 karakter arasında.</div>
            )}
          </div>

          <div className="col-12 col-md-6">
            <label htmlFor="product-category" className="form-label">
              Kategori
            </label>
            <select
              id="product-category"
              className={`form-select${errors.categoryId ? ' is-invalid' : ''}`}
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              required
            >
              <option value="">Kategori seçin</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              {selectedCategory?.isArchived ? (
                <option value={selectedCategory.id}>
                  {selectedCategory.name} (arşivde — değiştirin)
                </option>
              ) : null}
              {categoryId && !selectedCategory ? (
                <option value={categoryId}>Kategori bulunamadı</option>
              ) : null}
            </select>
            {errors.categoryId ? <div className="invalid-feedback d-block">{errors.categoryId}</div> : null}
          </div>

          <div className="col-12 col-md-6">
            <label htmlFor="product-price" className="form-label">
              Fiyat (TL)
            </label>
            <div className="input-group">
              <input
                id="product-price"
                type="text"
                inputMode="decimal"
                className={`form-control${errors.price ? ' is-invalid' : ''}`}
                value={priceText}
                placeholder="0,00"
                onChange={(event) => setPriceText(event.target.value)}
              />
              <span className="input-group-text">TL</span>
            </div>
            {errors.price ? (
              <div className="invalid-feedback d-block">{errors.price}</div>
            ) : (
              <div className="form-text">Örnek: 12,50</div>
            )}
          </div>

          <div className="col-12">
            <label htmlFor="product-description" className="form-label">
              Açıklama
            </label>
            <textarea
              id="product-description"
              className={`form-control${errors.description ? ' is-invalid' : ''}`}
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <div className="d-flex justify-content-between gap-2">
              {errors.description ? (
                <div className="invalid-feedback d-block">{errors.description}</div>
              ) : (
                <div className="form-text">İsteğe bağlı, en fazla 1000 karakter.</div>
              )}
              <div className="form-text">{description.length}/1000</div>
            </div>
          </div>

          <div className="col-12 col-md-4">
            <label htmlFor="product-sort" className="form-label">
              Sıra
            </label>
            <input
              id="product-sort"
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
              <div className="form-text">Küçük değer üstte görünür.</div>
            )}
          </div>

          <div className="col-12">
            <span className="form-label d-block">Görsel</span>
            <div className="d-flex flex-wrap align-items-center gap-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Ürün görseli önizlemesi"
                  className="rounded border"
                  style={{ width: 88, height: 88, objectFit: 'cover' }}
                />
              ) : (
                <div
                  className="d-flex align-items-center justify-content-center rounded border"
                  style={{ width: 88, height: 88, background: '#eef4f8', fontSize: 32 }}
                  aria-hidden="true"
                >
                  🍽️
                </div>
              )}
              <div className="flex-grow-1" style={{ minWidth: 220 }}>
                <label htmlFor="product-image" className="form-label small mb-1">
                  Görsel dosyası
                </label>
                <input
                  id="product-image"
                  type="file"
                  accept="image/png,image/jpeg"
                  className="form-control"
                  onChange={(event) => {
                    void handleFileChange(event)
                  }}
                  disabled={saving || imageUploading}
                />
                <div className="form-text">PNG veya JPEG, en fazla 3 MB.</div>
              </div>
            </div>

            {imageUploading ? (
              <div className="d-flex align-items-center gap-2 text-body-secondary small mt-2">
                <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                Görsel yükleniyor…
              </div>
            ) : null}

            {imageError ? (
              <div className="alert alert-danger py-2 mt-2 mb-0" role="alert">
                {imageError}
              </div>
            ) : null}

            {imageUrl ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger mt-2"
                onClick={() => {
                  setImageUrl(null)
                  setImageError(null)
                }}
                disabled={saving || imageUploading}
              >
                Görseli kaldır
              </button>
            ) : null}
          </div>
        </div>
      </form>
    </Modal>
  )
}
