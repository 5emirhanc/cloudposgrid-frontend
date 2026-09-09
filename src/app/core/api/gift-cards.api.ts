import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { GiftCardDto, IssueGiftCardRequest, RedeemGiftCardRequest } from '../models';

/**
 * Hediye çeki API istemcisi — kesim (issue), listeleme, koda göre bakiye sorgu,
 * manuel harcama (redeem) ve iptal. Controller: [Route("api/gift-cards")].
 */
@Injectable({ providedIn: 'root' })
export class GiftCardsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/gift-cards`;

  /** Tüm hediye çeklerini (en yeni önce) listeler. */
  list() {
    return this.http.get<GiftCardDto[]>(this.base);
  }

  /** Koda göre bakiye/durum sorgular (yoksa 404). */
  getByCode(code: string) {
    return this.http.get<GiftCardDto>(`${this.base}/${encodeURIComponent(code)}`);
  }

  /** Yeni hediye çeki keser. */
  issue(body: IssueGiftCardRequest) {
    return this.http.post<GiftCardDto>(this.base, body);
  }

  /** Koddan manuel tutar düşer; bakiye 0 olursa çek "Used" olur. */
  redeem(code: string, body: RedeemGiftCardRequest) {
    return this.http.post<GiftCardDto>(`${this.base}/${encodeURIComponent(code)}/redeem`, body);
  }

  /** Çeki iptal eder (durum "Cancelled"). */
  cancel(id: string) {
    return this.http.post<GiftCardDto>(`${this.base}/${id}/cancel`, {});
  }
}
