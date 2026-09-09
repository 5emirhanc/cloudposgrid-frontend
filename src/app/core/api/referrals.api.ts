import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CreateReferralRequest, ReferralDto } from '../models';

/**
 * Referans (tavsiye) programı API'si — controller [Route("api/referrals")].
 * Erişim finansal rollerle sınırlı (Owner/Admin/Accountant).
 */
@Injectable({ providedIn: 'root' })
export class ReferralsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/referrals`;

  /** Tüm referans kayıtları (en yeni önce). */
  list() {
    return this.http.get<ReferralDto[]>(this.base);
  }

  /** Yeni referans oluşturur (benzersiz kod otomatik üretilir). */
  create(body: CreateReferralRequest) {
    return this.http.post<ReferralDto>(this.base, body);
  }

  /** Ödülü "verildi" olarak işaretler (durum → Rewarded). Gövde gerektirmez. */
  markRewarded(id: string) {
    return this.http.put<ReferralDto>(`${this.base}/${id}/reward`, {});
  }

  /** Referans kaydını siler. */
  delete(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }
}
