import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { RecipeDto } from '../models';

/** PUT gövdesindeki tek bileşen — kaydederken yalnız ürün + miktar gönderilir. */
export interface SetRecipeComponent {
  componentProductId: string;
  quantity: number;
}

/** Ürün reçetesi (BOM) API'si — bir ürünün bileşen ürünlerini yönetir. */
@Injectable({ providedIn: 'root' })
export class ProductRecipeApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  /** Ürünün mevcut reçetesini (bileşenler + toplam maliyet) getirir. */
  getRecipe(productId: string) {
    return this.http.get<RecipeDto>(`${this.base}/products/${productId}/recipe`);
  }

  /** Reçeteyi tümüyle değiştirir (replace-all). Boş liste reçeteyi kaldırır. */
  setRecipe(productId: string, components: SetRecipeComponent[]) {
    return this.http.put<RecipeDto>(`${this.base}/products/${productId}/recipe`, { components });
  }
}
