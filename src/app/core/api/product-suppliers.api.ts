import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ProductSupplierDto, ProductSupplierItem } from '../models';

/** Ürün–tedarikçi eşleme (#37): ürünün tedarik kaynakları ve alım koşulları. */
@Injectable({ providedIn: 'root' })
export class ProductSuppliersApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /** Ürünün tedarikçi listesi. */
  list(productId: string) {
    return this.http.get<ProductSupplierDto[]>(`${this.base}/product-suppliers`, { params: { productId } });
  }

  /** Tümünü değiştir (replace-all): gönderilen liste ürünün tedarikçi setinin yenisi olur. */
  upsert(productId: string, suppliers: ProductSupplierItem[]) {
    return this.http.put<ProductSupplierDto[]>(`${this.base}/product-suppliers`, { suppliers }, { params: { productId } });
  }

  /** Tek satır sil. */
  remove(id: string) {
    return this.http.delete(`${this.base}/product-suppliers/${id}`);
  }
}
