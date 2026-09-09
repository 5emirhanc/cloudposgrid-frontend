import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DiningTableDto, OrderDto, OrderListItemDto, ServiceAreaDto } from '../models';

@Injectable({ providedIn: 'root' })
export class OrdersApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // --- Adisyon ---
  getOpen() {
    return this.http.get<OrderListItemDto[]>(`${this.base}/orders/open`);
  }
  getOrder(id: string) {
    return this.http.get<OrderDto>(`${this.base}/orders/${id}`);
  }
  open(body: {
    type: string;
    tableId?: string | null;
    contactId?: string | null;
    label?: string | null;
    note?: string | null;
    assetInfo?: string | null;
  }) {
    return this.http.post<OrderDto>(`${this.base}/orders`, body);
  }
  setWorkStatus(id: string, status: string) {
    return this.http.put<OrderDto>(`${this.base}/orders/${id}/work-status`, { status });
  }
  addLine(id: string, body: { productId: string; quantity: number; note?: string | null }) {
    return this.http.post<OrderDto>(`${this.base}/orders/${id}/lines`, body);
  }
  updateLine(id: string, lineId: string, quantity: number) {
    return this.http.put<OrderDto>(`${this.base}/orders/${id}/lines/${lineId}`, { quantity });
  }
  removeLine(id: string, lineId: string) {
    return this.http.delete<OrderDto>(`${this.base}/orders/${id}/lines/${lineId}`);
  }
  close(
    id: string,
    body: {
      payment?: { cashAccountId: string; amount: number; method: string } | null;
      contactId?: string | null;
      tip?: number;
    }
  ) {
    return this.http.post<OrderDto>(`${this.base}/orders/${id}/close`, body);
  }
  splitClose(
    id: string,
    body: {
      items: { lineId: string; quantity: number }[];
      payment?: { cashAccountId: string; amount: number; method: string } | null;
      contactId?: string | null;
    }
  ) {
    return this.http.post<OrderDto>(`${this.base}/orders/${id}/split-close`, body);
  }

  /** Adisyonu başka masaya taşı. Hedef doluysa merge=true ile birleştirilir (dönen DTO hedef adisyondur). */
  move(id: string, body: { targetTableId: string; merge: boolean }) {
    return this.http.post<OrderDto>(`${this.base}/orders/${id}/move`, body);
  }

  cancel(id: string) {
    return this.http.post(`${this.base}/orders/${id}/cancel`, {});
  }

  // --- Masalar / Bölgeler ---
  getTables() {
    return this.http.get<DiningTableDto[]>(`${this.base}/tables`);
  }
  createTable(body: { name: string; areaId?: string | null; sortOrder: number }) {
    return this.http.post<DiningTableDto>(`${this.base}/tables`, body);
  }
  updateTable(id: string, body: { name: string; areaId?: string | null; sortOrder: number; isActive: boolean }) {
    return this.http.put<DiningTableDto>(`${this.base}/tables/${id}`, body);
  }
  deleteTable(id: string) {
    return this.http.delete(`${this.base}/tables/${id}`);
  }
  getAreas() {
    return this.http.get<ServiceAreaDto[]>(`${this.base}/service-areas`);
  }
  createArea(body: { name: string; sortOrder: number }) {
    return this.http.post<ServiceAreaDto>(`${this.base}/service-areas`, body);
  }
}
