import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  CreatePurchaseOrderRequest,
  PagedResult,
  PurchaseOrderDto,
  PurchaseOrderListItemDto,
  PurchaseOrderStatus,
  ReceivePurchaseOrderRequest,
  ReceivePurchaseOrderResultDto,
} from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class PurchasingApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/purchase-orders`;

  list(query: { page?: number; pageSize?: number; search?: string; status?: PurchaseOrderStatus | ''; openOnly?: boolean }) {
    return this.http.get<PagedResult<PurchaseOrderListItemDto>>(this.base, { params: cleanParams(query) });
  }
  getById(id: string) {
    return this.http.get<PurchaseOrderDto>(`${this.base}/${id}`);
  }
  create(body: CreatePurchaseOrderRequest) {
    return this.http.post<PurchaseOrderDto>(this.base, body);
  }
  update(id: string, body: CreatePurchaseOrderRequest) {
    return this.http.put<PurchaseOrderDto>(`${this.base}/${id}`, body);
  }
  send(id: string) {
    return this.http.post<PurchaseOrderDto>(`${this.base}/${id}/send`, {});
  }
  /** Mal kabul: gelen miktarlar + alış faturası kesilir (stok girer). */
  receive(id: string, body: ReceivePurchaseOrderRequest) {
    return this.http.post<ReceivePurchaseOrderResultDto>(`${this.base}/${id}/receive`, body);
  }
  cancel(id: string) {
    return this.http.post<PurchaseOrderDto>(`${this.base}/${id}/cancel`, {});
  }
}
