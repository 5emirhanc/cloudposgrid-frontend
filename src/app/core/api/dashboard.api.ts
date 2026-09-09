import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DashboardSummaryDto, FinanceTrendPointDto, PeriodKpiDto, TopProductDto } from '../models';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getSummary() {
    return this.http.get<DashboardSummaryDto>(`${this.base}/dashboard/summary`);
  }
  getFinanceTrend(days = 30) {
    return this.http.get<FinanceTrendPointDto[]>(`${this.base}/dashboard/finance-trend`, { params: { days } });
  }
  getTopProducts(limit = 5) {
    return this.http.get<TopProductDto[]>(`${this.base}/dashboard/top-products`, { params: { limit } });
  }
  /** Dönem KPI + önceki döneme göre karşılaştırma (today/week/month/year). */
  getPeriodKpi(period: 'today' | 'week' | 'month' | 'year' = 'today') {
    return this.http.get<PeriodKpiDto>(`${this.base}/dashboard/period-kpi`, { params: { period } });
  }
}
