import { useCallback, useState } from 'react'
import { ConfirmDialog, ReasonDialog } from '../../components/Dialogs'
import { EmptyState, ErrorAlert, LoadingBlock } from '../../components/Feedback'
import { AvailabilityBadge } from '../../components/StatusBadge'
import { staffAdminApi } from '../../lib/api'
import { toUserMessage } from '../../lib/errors'
import { formatMoney } from '../../lib/format'
import { usePolling } from '../../lib/polling'
import type { AdminCategory, AdminProduct } from '../../types/domain'
import { CategoryFormModal } from './catalog/CategoryFormModal'
import { ProductFormModal } from './catalog/ProductFormModal'

type CatalogDialog =
  | { kind: 'none' }
  | { kind: 'category-form'; category: AdminCategory | null }
  | { kind: 'product-form'; product: AdminProduct | null }
  | { kind: 'category-archive'; category: AdminCategory }
  | { kind: 'product-close'; product: AdminProduct }
  | { kind: 'product-open'; product: AdminProduct }
  | { kind: 'product-archive'; product: AdminProduct }
  | { kind: 'product-restore'; product: AdminProduct }

export function CatalogTab({ token }: { token: string }) {
  const loadCategories = useCallback(async () => {
    const data = await staffAdminApi.adminCategories(token)
    return data as AdminCategory[]
  }, [token])

  const loadProducts = useCallback(async () => {
    const data = await staffAdminApi.adminProducts(token)
    return data as AdminProduct[]
  }, [token])

  const categoriesPoll = usePolling<AdminCategory[]>(loadCategories, { enabled: Boolean(token) })
  const productsPoll = usePolling<AdminProduct[]>(loadProducts, { enabled: Boolean(token) })
  const refreshCategories = categoriesPoll.refresh
  const refreshProducts = productsPoll.refresh

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshCategories(), refreshProducts()])
  }, [refreshCategories, refreshProducts])

  const categories = categoriesPoll.data ?? []
  const products = productsPoll.data ?? []
  const activeCategories = categories.filter((category) => !category.isArchived)
  const canCreateProduct = activeCategories.length > 0

  const [search, setSearch] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState('')
  const [dialog, setDialog] = useState<CatalogDialog>({ kind: 'none' })
  const [dialogBusy, setDialogBusy] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [closeNotePublic, setCloseNotePublic] = useState(true)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const initialLoading =
    (categoriesPoll.loading && categoriesPoll.data === null) ||
    (productsPoll.loading && productsPoll.data === null)
  const pollingError = categoriesPoll.error ?? productsPoll.error

  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR')
  const visibleProducts = products.filter((product) => {
    if (filterCategoryId && product.categoryId !== filterCategoryId) return false
    if (!normalizedSearch) return true
    return `${product.name} ${product.categoryName}`
      .toLocaleLowerCase('tr-TR')
      .includes(normalizedSearch)
  })

  function openDialog(next: CatalogDialog) {
    setDialogError(null)
    setDialog(next)
  }

  function closeDialog() {
    if (dialogBusy) return
    setDialog({ kind: 'none' })
    setDialogError(null)
  }

  async function archiveCategory(category: AdminCategory) {
    setDialogBusy(true)
    setDialogError(null)
    try {
      await staffAdminApi.manageCategory(token, 'ARCHIVE', {
        id: category.id,
        name: category.name,
      })
      setDialog({ kind: 'none' })
      await refreshAll()
    } catch (cause) {
      setDialogError(toUserMessage(cause))
    } finally {
      setDialogBusy(false)
    }
  }

  async function changeAvailability(
    product: AdminProduct,
    status: 'ACTIVE' | 'CLOSED' | 'ARCHIVED',
    note?: string,
    notePublic = true,
  ) {
    setDialogBusy(true)
    setDialogError(null)
    try {
      await staffAdminApi.setProductAvailability(token, product.id, status, note, notePublic)
      setDialog({ kind: 'none' })
      await refreshAll()
    } catch (cause) {
      setDialogError(toUserMessage(cause))
    } finally {
      setDialogBusy(false)
    }
  }

  async function moveCategory(category: AdminCategory, direction: -1 | 1) {
    if (busyKey) return

    const index = categories.findIndex((item) => item.id === category.id)
    const neighbor = categories[index + direction]
    if (index < 0 || !neighbor) return

    setBusyKey(`category:${category.id}:${direction}`)
    setPageError(null)

    try {
      if (category.sortOrder === neighbor.sortOrder) {
        await staffAdminApi.manageCategory(token, 'REORDER', {
          id: category.id,
          name: category.name,
          sortOrder: neighbor.sortOrder + direction,
        })
      } else {
        await staffAdminApi.manageCategory(token, 'REORDER', {
          id: category.id,
          name: category.name,
          sortOrder: neighbor.sortOrder,
        })
        await staffAdminApi.manageCategory(token, 'REORDER', {
          id: neighbor.id,
          name: neighbor.name,
          sortOrder: category.sortOrder,
        })
      }
      await refreshAll()
    } catch (cause) {
      setPageError(toUserMessage(cause))
      await refreshAll()
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h2 className="h4 mb-1">Ürün ve Kategori Yönetimi</h2>
          <p className="text-body-secondary mb-0">
            Kategorileri düzenleyin, ürünleri yönetin ve görselleri yükleyin.
          </p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline-primary"
            onClick={() => openDialog({ kind: 'category-form', category: null })}
            disabled={initialLoading}
          >
            + Yeni kategori
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => openDialog({ kind: 'product-form', product: null })}
            disabled={initialLoading || !canCreateProduct}
            title={
              canCreateProduct
                ? undefined
                : 'Yeni ürün eklemek için önce arşivde olmayan bir kategori oluşturun.'
            }
          >
            + Yeni ürün
          </button>
        </div>
      </div>

      {pageError ? (
        <ErrorAlert
          message={pageError}
          onRetry={() => {
            setPageError(null)
            void refreshAll()
          }}
        />
      ) : null}

      {pollingError ? <ErrorAlert message={pollingError} onRetry={() => void refreshAll()} /> : null}

      {initialLoading ? (
        <LoadingBlock label="Katalog yükleniyor…" />
      ) : (
        <>
          <section className="surface-card p-3 p-md-4 mb-4" aria-labelledby="catalog-categories-title">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h2 id="catalog-categories-title" className="h5 mb-1">
                  Kategoriler
                </h2>
                <p className="text-body-secondary small mb-0">
                  Sıra değeri menüdeki görünüm sırasını belirler.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-outline-primary"
                onClick={() => openDialog({ kind: 'category-form', category: null })}
              >
                + Yeni kategori
              </button>
            </div>

            {categories.length === 0 ? (
              <EmptyState
                title="Henüz kategori yok"
                description="Ürün eklemek için önce bir kategori oluşturun."
              />
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <caption className="visually-hidden">Kategori listesi</caption>
                  <thead>
                    <tr>
                      <th scope="col">Kategori</th>
                      <th scope="col">Sıra</th>
                      <th scope="col">Ürün sayısı</th>
                      <th scope="col">Durum</th>
                      <th scope="col" className="text-end">
                        İşlemler
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((category, index) => {
                      const rowBusy = busyKey !== null
                      const movingUp = busyKey === `category:${category.id}:-1`
                      const movingDown = busyKey === `category:${category.id}:1`
                      return (
                        <tr
                          key={category.id}
                          className={category.isArchived ? 'text-body-secondary' : undefined}
                        >
                          <td>
                            <span className="fw-semibold">{category.name}</span>
                          </td>
                          <td className="text-tabular">{category.sortOrder}</td>
                          <td className="text-tabular">{category.productCount}</td>
                          <td>
                            {category.isArchived ? (
                              <span className="badge text-bg-secondary">Arşivde</span>
                            ) : (
                              <span className="badge text-bg-success">Kullanımda</span>
                            )}
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => void moveCategory(category, -1)}
                                disabled={rowBusy || category.isArchived || index === 0}
                                aria-label={`${category.name} kategorisini yukarı taşı`}
                                title="Yukarı taşı"
                              >
                                {movingUp ? (
                                  <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                ) : (
                                  '↑'
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => void moveCategory(category, 1)}
                                disabled={
                                  rowBusy || category.isArchived || index === categories.length - 1
                                }
                                aria-label={`${category.name} kategorisini aşağı taşı`}
                                title="Aşağı taşı"
                              >
                                {movingDown ? (
                                  <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                                ) : (
                                  '↓'
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => openDialog({ kind: 'category-form', category })}
                                disabled={rowBusy}
                              >
                                Düzenle
                              </button>
                              {category.isArchived ? null : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => openDialog({ kind: 'category-archive', category })}
                                  disabled={rowBusy}
                                >
                                  Arşivle
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="surface-card p-3 p-md-4" aria-labelledby="catalog-products-title">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
              <div>
                <h2 id="catalog-products-title" className="h5 mb-1">
                  Ürünler
                </h2>
                <p className="text-body-secondary small mb-0">
                  {products.length} ürün listeleniyor. Durum değişiklikleri menüye anında yansır.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openDialog({ kind: 'product-form', product: null })}
                disabled={!canCreateProduct}
                title={
                  canCreateProduct
                    ? undefined
                    : 'Yeni ürün eklemek için önce arşivde olmayan bir kategori oluşturun.'
                }
              >
                + Yeni ürün
              </button>
            </div>

            {!canCreateProduct && categories.length > 0 ? (
              <div className="alert alert-warning py-2 small" role="alert">
                Yeni ürün eklemek için arşivde olmayan bir kategori gerekir. Kategoriler bölümünden yeni
                bir kategori ekleyin.
              </div>
            ) : null}

            <div className="row g-2 mb-3">
              <div className="col-12 col-md-6">
                <label htmlFor="catalog-product-search" className="form-label small mb-1">
                  Ürün ara
                </label>
                <input
                  id="catalog-product-search"
                  type="search"
                  className="form-control"
                  placeholder="Ürün veya kategori adı"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="col-12 col-md-6">
                <label htmlFor="catalog-product-category" className="form-label small mb-1">
                  Kategori filtresi
                </label>
                <select
                  id="catalog-product-category"
                  className="form-select"
                  value={filterCategoryId}
                  onChange={(event) => setFilterCategoryId(event.target.value)}
                >
                  <option value="">Tüm kategoriler</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.isArchived ? ' (arşivde)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {products.length === 0 ? (
              <EmptyState
                title="Henüz ürün yok"
                description="Yeni ürün ekleyerek menüyü oluşturun."
              />
            ) : visibleProducts.length === 0 ? (
              <EmptyState
                title="Sonuç bulunamadı"
                description="Arama metnini veya kategori filtresini değiştirin."
              />
            ) : (
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <caption className="visually-hidden">Ürün listesi</caption>
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="visually-hidden">Görsel</span>
                      </th>
                      <th scope="col">Ürün</th>
                      <th scope="col">Kategori</th>
                      <th scope="col">Fiyat</th>
                      <th scope="col">Durum</th>
                      <th scope="col">Sıra</th>
                      <th scope="col" className="text-end">
                        İşlemler
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <tr
                        key={product.id}
                        className={
                          product.availabilityStatus === 'ARCHIVED' ? 'text-body-secondary' : undefined
                        }
                      >
                        <td style={{ width: 56 }}>
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt=""
                              className="rounded border"
                              style={{ width: 44, height: 44, objectFit: 'cover' }}
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="d-flex align-items-center justify-content-center rounded border"
                              style={{ width: 44, height: 44, background: '#eef4f8', fontSize: 20 }}
                              aria-hidden="true"
                            >
                              🍽️
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="fw-semibold">{product.name}</div>
                          {product.description ? (
                            <div
                              className="small text-body-secondary text-truncate"
                              style={{ maxWidth: 280 }}
                            >
                              {product.description}
                            </div>
                          ) : null}
                        </td>
                        <td>{product.categoryName}</td>
                        <td className="text-tabular text-nowrap">{formatMoney(product.price)}</td>
                        <td>
                          <AvailabilityBadge status={product.availabilityStatus} />
                        </td>
                        <td className="text-tabular">{product.sortOrder}</td>
                        <td className="text-end">
                          <div className="d-inline-flex flex-wrap gap-1 justify-content-end">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary"
                              onClick={() => openDialog({ kind: 'product-form', product })}
                            >
                              Düzenle
                            </button>
                            {product.availabilityStatus === 'ACTIVE' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-warning"
                                onClick={() => {
                                  setCloseNotePublic(true)
                                  openDialog({ kind: 'product-close', product })
                                }}
                              >
                                Kapat
                              </button>
                            ) : product.availabilityStatus === 'CLOSED' ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                onClick={() => openDialog({ kind: 'product-open', product })}
                              >
                                Aç
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                onClick={() => openDialog({ kind: 'product-restore', product })}
                              >
                                Arşivden çıkar
                              </button>
                            )}
                            {product.availabilityStatus === 'ARCHIVED' ? null : (
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => openDialog({ kind: 'product-archive', product })}
                              >
                                Arşivle
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialog.kind === 'category-form' ? (
        <CategoryFormModal
          key={dialog.category?.id ?? 'new-category'}
          token={token}
          category={dialog.category}
          categories={categories}
          onSaved={() => {
            setDialog({ kind: 'none' })
            void refreshAll()
          }}
          onClose={() => setDialog({ kind: 'none' })}
        />
      ) : null}

      {dialog.kind === 'product-form' ? (
        <ProductFormModal
          key={dialog.product?.id ?? 'new-product'}
          token={token}
          product={dialog.product}
          categories={categories}
          onSaved={() => {
            setDialog({ kind: 'none' })
            void refreshAll()
          }}
          onClose={() => setDialog({ kind: 'none' })}
        />
      ) : null}

      {dialog.kind === 'category-archive' ? (
        <ConfirmDialog
          open
          title="Kategoriyi arşivle"
          message={
            <div>
              <p className="mb-2">
                <strong>{dialog.category.name}</strong> kategorisi arşivlenecek.
              </p>
              <p className="mb-0 small text-body-secondary">
                Arşivlenen kategori menüde görünmez ve yeni ürünlerde seçilemez. Bu işlem geri
                alınamaz.
              </p>
            </div>
          }
          confirmLabel="Arşivle"
          variant="danger"
          busy={dialogBusy}
          onConfirm={() => void archiveCategory(dialog.category)}
          onCancel={closeDialog}
        >
          {dialogError ? (
            <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">
              {dialogError}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {dialog.kind === 'product-close' ? (
        <ReasonDialog
          open
          title="Ürünü geçici kapat"
          description={
            <p className="mb-0">
              <strong>{dialog.product.name}</strong> ürünü geçici olarak satışa kapatılacak. Kapatma
              nedeni zorunludur.
            </p>
          }
          confirmLabel="Ürünü kapat"
          variant="warning"
          busy={dialogBusy}
          placeholder="Örn. malzeme bitti"
          onConfirm={(reason) => {
            if (reason.trim().length < 3) return
            void changeAvailability(dialog.product, 'CLOSED', reason, closeNotePublic)
          }}
          onCancel={closeDialog}
        >
          {dialogError ? (
            <div className="alert alert-danger py-2" role="alert">
              {dialogError}
            </div>
          ) : null}
          <div className="form-check mb-3">
            <input
              id="product-close-note-public"
              type="checkbox"
              className="form-check-input"
              checked={closeNotePublic}
              onChange={(event) => setCloseNotePublic(event.target.checked)}
            />
            <label className="form-check-label" htmlFor="product-close-note-public">
              Müşteriye göster
            </label>
            <div className="form-text">Kapatma nedeni müşteri menüsünde görünür.</div>
          </div>
        </ReasonDialog>
      ) : null}

      {dialog.kind === 'product-open' ? (
        <ConfirmDialog
          open
          title="Ürünü satışa aç"
          message={
            <div>
              <p className="mb-2">
                <strong>{dialog.product.name}</strong> ürünü yeniden satışa açılacak.
              </p>
              <p className="mb-0 small text-body-secondary">
                Ürün müşteri menüsünde görünür ve sipariş edilebilir.
              </p>
            </div>
          }
          confirmLabel="Satışa aç"
          variant="success"
          busy={dialogBusy}
          onConfirm={() => void changeAvailability(dialog.product, 'ACTIVE')}
          onCancel={closeDialog}
        >
          {dialogError ? (
            <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">
              {dialogError}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {dialog.kind === 'product-archive' ? (
        <ConfirmDialog
          open
          title="Ürünü arşivle"
          message={
            <div>
              <p className="mb-2">
                <strong>{dialog.product.name}</strong> ürünü arşivlenecek.
              </p>
              <p className="mb-0 small text-body-secondary">
                Arşivlenen ürün menüde görünmez. Daha sonra arşivden çıkarabilirsiniz.
              </p>
            </div>
          }
          confirmLabel="Arşivle"
          variant="danger"
          busy={dialogBusy}
          onConfirm={() => void changeAvailability(dialog.product, 'ARCHIVED')}
          onCancel={closeDialog}
        >
          {dialogError ? (
            <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">
              {dialogError}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}

      {dialog.kind === 'product-restore' ? (
        <ConfirmDialog
          open
          title="Arşivden çıkar"
          message={
            <div>
              <p className="mb-2">
                <strong>{dialog.product.name}</strong> ürünü arşivden çıkarılıp satışa açılacak.
              </p>
              <p className="mb-0 small text-body-secondary">
                Ürün müşteri menüsünde yeniden görünür.
              </p>
            </div>
          }
          confirmLabel="Arşivden çıkar"
          variant="success"
          busy={dialogBusy}
          onConfirm={() => void changeAvailability(dialog.product, 'ACTIVE')}
          onCancel={closeDialog}
        >
          {dialogError ? (
            <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">
              {dialogError}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
