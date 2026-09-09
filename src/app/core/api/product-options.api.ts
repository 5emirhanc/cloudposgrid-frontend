import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ProductOptionDto, ProductOptionItem } from '../models';

/**
 * Ürün seçenekleri (ör. "Boy: Küçük/Orta/Büyük" veya "Ekstra: Shot +₺5").
 * PUT tüm listeyi değiştirir (replace-all); boş liste seçenekleri temizler.
 */
@Injectable({ providedIn: 'root' })
export class ProductOptionsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getOptions(productId: string) {
    return this.http.get<ProductOptionDto[]>(`${this.base}/products/${productId}/options`);
  }

  saveOptions(productId: string, items: ProductOptionItem[]) {
    return this.http.put<ProductOptionDto[]>(`${this.base}/products/${productId}/options`, { options: items });
  }
}
