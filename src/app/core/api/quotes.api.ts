import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { PagedResult, QuoteDto, QuoteListItemDto, QuoteStatus, SaveQuoteRequest } from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class QuotesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/quotes`;

  list(query: { page?: number; pageSize?: number; search?: string; status?: QuoteStatus | '' }) {
    return this.http.get<PagedResult<QuoteListItemDto>>(this.base, { params: cleanParams(query) });
  }
  getById(id: string) {
    return this.http.get<QuoteDto>(`${this.base}/${id}`);
  }
  create(body: SaveQuoteRequest) {
    return this.http.post<QuoteDto>(this.base, body);
  }
  update(id: string, body: SaveQuoteRequest) {
    return this.http.put<QuoteDto>(`${this.base}/${id}`, body);
  }
  setStatus(id: string, status: QuoteStatus) {
    return this.http.put<QuoteDto>(`${this.base}/${id}/status`, { status });
  }
  /** Satışa çevir: stok/cari/kasa etkisi burada oluşur. */
  convert(id: string, payment: { cashAccountId: string; amount: number; method: string } | null) {
    return this.http.post<QuoteDto>(`${this.base}/${id}/convert`, { payment });
  }
  remove(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }
}
