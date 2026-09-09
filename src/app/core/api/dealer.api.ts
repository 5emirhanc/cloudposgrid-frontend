import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DealerDto, DealerSummaryDto, DealerTenantDto, OnboardResultDto, OnboardTenantRequest } from '../models';

/** Bayi (#25) paneli API'si — istekler interceptor'ın bayi kolundan dealer token'ı ile korunur. */
@Injectable({ providedIn: 'root' })
export class DealerApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/dealer`;

  me() {
    return this.http.get<DealerDto>(`${this.base}/me`);
  }
  summary() {
    return this.http.get<DealerSummaryDto>(`${this.base}/summary`);
  }
  tenants() {
    return this.http.get<DealerTenantDto[]>(`${this.base}/tenants`);
  }
  /** Yeni müşteri işletmesi onboard eder (Tenant bu bayiye atanır). */
  onboard(body: OnboardTenantRequest) {
    return this.http.post<OnboardResultDto>(`${this.base}/tenants`, body);
  }
}
