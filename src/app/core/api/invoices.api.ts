import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { InvoiceDto, InvoiceListItemDto, PagedResult, RefundRequest } from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getInvoices(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<InvoiceListItemDto>>(`${this.base}/invoices`, { params: cleanParams(query) });
  }
  getInvoice(id: string) {
    return this.http.get<InvoiceDto>(`${this.base}/invoices/${id}`);
  }
  /** Faturayı kurumsal PDF belge olarak indirir (arşiv/e-posta/WhatsApp). */
  downloadPdf(id: string) {
    return this.http.get(`${this.base}/invoices/${id}/pdf`, { responseType: 'blob' });
  }
  createInvoice(body: unknown) {
    return this.http.post<InvoiceDto>(`${this.base}/invoices`, body);
  }
  /** Faturayı iptal/iade eder: stok, kasa, cari ve ödeme etkileri ters kayıtla geri alınır. */
  voidInvoice(id: string) {
    return this.http.post<InvoiceDto>(`${this.base}/invoices/${id}/void`, {});
  }
  /** Faturadan seçili satır/miktarları kısmen iade eder. */
  refundInvoice(id: string, body: RefundRequest) {
    return this.http.post<InvoiceDto>(`${this.base}/invoices/${id}/refund`, body);
  }
}
