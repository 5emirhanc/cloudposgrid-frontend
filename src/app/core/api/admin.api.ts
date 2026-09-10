import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { cleanParams } from '../utils';
import { ActivateSubscriptionRequest, AdminStatsDto, CreateDealerRequest, DealerDetailDto, DealerDto, DealerPayoutDto, PagedResult, SubscriptionRequestDto, TenantAdminDto } from '../models';

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
  /** Bayinin tüm tablosu: para durumu + getirdiği müşteriler + ödeme geçmişi. */
  dealerDetail(id: string) {
    return this.http.get<DealerDetailDto>(`${this.base}/dealers/${id}`);
  }
  /** Bayiye yapılan ödemeyi (hakediş mahsuplaşması) kaydeder. */
  createDealerPayout(id: string, amount: number, note?: string) {
    return this.http.post<DealerPayoutDto>(`${this.base}/dealers/${id}/payouts`, { amount, note });
  }
  resetDealerPassword(id: string, newPassword: string) {
    return this.http.post<void>(`${this.base}/dealers/${id}/password`, { newPassword });
  }
  /** Bayiyi siler. Ad birebir yazılmalı; kapatılmamış hakediş varsa sunucu reddeder. */
  deleteDealer(id: string, confirmName: string) {
    return this.http.request<void>('delete', `${this.base}/dealers/${id}`, { body: { confirmName } });
  }

  /**
   * İşletmeyi KALICI siler. Ad birebir eşleşmezse sunucu reddeder — tek tıkla veri kaybını
   * önleyen asıl koruma burada değil sunucuda; istemci yalnız onayı topluyor.
   */
  deleteTenant(id: string, confirmName: string) {
    return this.http.request<void>('delete', `${this.base}/tenants/${id}`, { body: { confirmName } });
  }
}
