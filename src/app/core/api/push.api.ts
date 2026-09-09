import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/** Web Push (#6) abonelik API'si — VAPID public anahtarı + abone/çık. */
@Injectable({ providedIn: 'root' })
export class PushApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/push`;

  /** Sunucunun VAPID public anahtarı (enabled=false → push kapalı). */
  getPublicKey() {
    return this.http.get<{ publicKey: string; enabled: boolean }>(`${this.base}/public-key`);
  }

  subscribe(body: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }) {
    return this.http.post<void>(`${this.base}/subscribe`, body);
  }

  unsubscribe(endpoint: string) {
    return this.http.post<void>(`${this.base}/unsubscribe`, { endpoint });
  }
}
