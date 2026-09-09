import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MenuDto } from '../models';
import { skipErrorToast } from '../http-context';

/** Kimlik doğrulaması gerektirmeyen public QR menü uçları (slug ile). */
@Injectable({ providedIn: 'root' })
export class MenuApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getMenu(slug: string) {
    return this.http.get<MenuDto>(`${this.base}/public/${slug}/menu`, skipErrorToast());
  }

  placeOrder(
    slug: string,
    body: {
      type: string;
      tableId?: string | null;
      label?: string | null;
      items: { productId: string; quantity: number; note?: string | null }[];
    }
  ) {
    return this.http.post(`${this.base}/public/${slug}/orders`, body, skipErrorToast());
  }
}
