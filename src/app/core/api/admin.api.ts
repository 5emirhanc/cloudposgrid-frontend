import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { cleanParams } from '../utils';
import { ActivateSubscriptionRequest, AdminStatsDto, CreateDealerRequest, DealerDto, PagedResult, SubscriptionRequestDto, TenantAdminDto } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin`;

  tenants(opts: { filter?: string; search?: string; page?: number; pageSize?: number } = {}) {
    return this.http.get<PagedResult<TenantAdminDto>>(`${this.base}/tenants`, {
      params: cleanParams({ filter: opts.filter, search: opts.search, page: opts.page ?? 1, pageSize: opts.pageSize ?? 20 }),
    });
  }
  stats() {
    return this.http.get<AdminStatsDto>(`${this.base}/stats`);
  }
  activate(id: string, body: ActivateSubscriptionRequest) {
    return this.http.post<TenantAdminDto>(`${this.base}/tenants/${id}/activate`, body);
  }
  extend(id: string, days: number) {
    return this.http.post<TenantAdminDto>(`${this.base}/tenants/${id}/extend`, { days });
  }
  suspend(id: string, note?: string) {
    return this.http.post<TenantAdminDto>(`${this.base}/tenants/${id}/suspend`, { note });
  }
  cancel(id: string, note?: string) {
    return this.http.post<TenantAdminDto>(`${this.base}/tenants/${id}/cancel`, { note });
  }
  requests(status?: string) {
    return this.http.get<SubscriptionRequestDto[]>(`${this.base}/requests`, { params: cleanParams({ status }) });
  }
  approve(id: string, note?: string) {
    return this.http.post<TenantAdminDto>(`${this.base}/requests/${id}/approve`, { note });
  }
  reject(id: string, note?: string) {
    return this.http.post<void>(`${this.base}/requests/${id}/reject`, { note });
  }

  // ---- Bayi (#25) yönetimi ----
  dealers() {
    return this.http.get<DealerDto[]>(`${this.base}/dealers`);
  }
  createDealer(body: CreateDealerRequest) {
    return this.http.post<DealerDto>(`${this.base}/dealers`, body);
  }
  setDealerActive(id: string, isActive: boolean) {
    return this.http.post<void>(`${this.base}/dealers/${id}/active`, { isActive });
  }
}
