import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AccountTransactionDto, Contact360Dto, ContactDto, ContactLedgerDto, PagedResult } from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class ContactsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getContacts(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<ContactDto>>(`${this.base}/contacts`, { params: cleanParams(query) });
  }
  getContact(id: string) {
    return this.http.get<ContactDto>(`${this.base}/contacts/${id}`);
  }
  getLedger(id: string) {
    return this.http.get<ContactLedgerDto>(`${this.base}/contacts/${id}/ledger`);
  }
  /** Müşteri 360: LTV + sık alınan ürünler + son faturalar + randevu/teklif özeti. */
  getOverview(id: string) {
    return this.http.get<Contact360Dto>(`${this.base}/contacts/${id}/overview`);
  }
  createContact(body: unknown) {
    return this.http.post<ContactDto>(`${this.base}/contacts`, body);
  }
  updateContact(id: string, body: unknown) {
    return this.http.put<ContactDto>(`${this.base}/contacts/${id}`, body);
  }
  deleteContact(id: string) {
    return this.http.delete(`${this.base}/contacts/${id}`);
  }
  addTransaction(id: string, body: unknown) {
    return this.http.post<AccountTransactionDto>(`${this.base}/contacts/${id}/transactions`, body);
  }
}
