import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BulkPriceResultDto, CategoryDto, ImportProductRow, ImportResultDto, PagedResult, ProductDto, ReplenishmentItemDto, StockCountResultDto, StockCountSessionDto, StockCountHistoryDto, StockMovementDto, ScanResultDto, WasteReason } from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class StockApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // --- Kategoriler ---
  getCategories() {
    return this.http.get<CategoryDto[]>(`${this.base}/categories`);
  }
  createCategory(body: { name: string }) {
    return this.http.post<CategoryDto>(`${this.base}/categories`, body);
  }
  updateCategory(id: string, body: { name: string; isActive: boolean }) {
    return this.http.put<CategoryDto>(`${this.base}/categories/${id}`, body);
  }
  deleteCategory(id: string) {
    return this.http.delete(`${this.base}/categories/${id}`);
  }

  // --- Ürünler ---
  getProducts(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<ProductDto>>(`${this.base}/products`, { params: cleanParams(query) });
  }
  getProduct(id: string) {
    return this.http.get<ProductDto>(`${this.base}/products/${id}`);
  }
  getByBarcode(barcode: string) {
    return this.http.get<ProductDto>(`${this.base}/products/barcode/${encodeURIComponent(barcode)}`);
  }
  getLowStock() {
    return this.http.get<ProductDto[]>(`${this.base}/products/low-stock`);
  }
  getReplenishment(query: Record<string, unknown> = {}) {
    return this.http.get<ReplenishmentItemDto[]>(`${this.base}/products/replenishment`, { params: cleanParams(query) });
  }
  getProductMovements(id: string) {
    return this.http.get<StockMovementDto[]>(`${this.base}/products/${id}/movements`);
  }
  createProduct(body: unknown) {
    return this.http.post<ProductDto>(`${this.base}/products`, body);
  }
  createProductWithVariants(body: unknown) {
    return this.http.post<{ parent: ProductDto; variants: ProductDto[] }>(`${this.base}/products/with-variants`, body);
  }
  transferStock(body: unknown) {
    return this.http.post<{ itemCount: number; totalQuantity: number; fromBranchName: string; toBranchName: string }>(`${this.base}/stock/transfer`, body);
  }
  /** POS okutma: terazi barkodunu çözer (ondalık miktar / gömülü fiyat), değilse normal ürün döner. */
  scan(code: string) {
    return this.http.get<ScanResultDto>(`${this.base}/products/scan/${encodeURIComponent(code)}`);
  }
  /** Fire/zayi kaydı — stoktan düşer, maliyeti fire raporunda görünür. */
  recordWaste(body: { productId: string; quantity: number; reason: WasteReason; note?: string | null }) {
    return this.http.post<StockMovementDto>(`${this.base}/stock/waste`, body);
  }
  /** Toplu fiyat güncelleme (zam/indirim). preview=true ise kaydetmez, etkilenecekleri döner. */
  bulkPrice(body: {
    target: 'Sale' | 'Purchase';
    mode: 'Percent' | 'Amount';
    value: number;
    categoryId?: string | null;
    rounding?: string | null;
    preview?: boolean;
  }) {
    return this.http.post<BulkPriceResultDto>(`${this.base}/products/bulk-price`, body);
  }
  importProducts(rows: ImportProductRow[]) {
    return this.http.post<ImportResultDto>(`${this.base}/products/import`, { rows });
  }
  updateProduct(id: string, body: unknown) {
    return this.http.put<ProductDto>(`${this.base}/products/${id}`, body);
  }
  generateBarcode(id: string) {
    return this.http.post<ProductDto>(`${this.base}/products/${id}/generate-barcode`, {});
  }
  /** Ürün reçetesi (BOM) — bileşik ürün satışında bileşenler stoktan düşer. */
  getRecipe(id: string) {
    return this.http.get<import('../models').RecipeDto>(`${this.base}/products/${id}/recipe`);
  }
  setRecipe(id: string, components: { componentProductId: string; quantity: number }[]) {
    return this.http.put<import('../models').RecipeDto>(`${this.base}/products/${id}/recipe`, { components });
  }
  deleteProduct(id: string) {
    return this.http.delete(`${this.base}/products/${id}`);
  }

  // --- Görsel yükleme ---
  uploadImage(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ url: string }>(`${this.base}/uploads/image`, form);
  }

  // --- Stok hareketleri ---
  createMovement(body: unknown) {
    return this.http.post<StockMovementDto>(`${this.base}/stock/movements`, body);
  }
  applyCount(items: { productId: string; countedQuantity: number }[], note?: string | null) {
    return this.http.post<StockCountResultDto>(`${this.base}/stock/count`, { items, note: note ?? null });
  }
  // --- Kalıcı stok sayım oturumu (sunucu-tarafı taslak + geçmiş) ---
  getCountSession() {
    return this.http.get<StockCountSessionDto | null>(`${this.base}/stock/count/session`);
  }
  saveCountSession(items: { productId: string; countedQuantity: number }[]) {
    return this.http.put<StockCountSessionDto>(`${this.base}/stock/count/session`, { items });
  }
  discardCountSession() {
    return this.http.delete<void>(`${this.base}/stock/count/session`);
  }
  getCountHistory(limit = 30) {
    return this.http.get<StockCountHistoryDto[]>(`${this.base}/stock/count/history`, { params: { limit } });
  }
  getMovements(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<StockMovementDto>>(`${this.base}/stock/movements`, { params: cleanParams(query) });
  }
}
