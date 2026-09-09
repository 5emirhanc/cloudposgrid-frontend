import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  AnomalyDto,
  CashflowForecastDto,
  ConsolidatedDto,
  HourlySalesCellDto,
  InventoryAnalyticsDto,
  MarketplaceCommissionDto,
  StaffSalesDto,
} from '../models';

/**
 * Analitik merkezi API istemcisi — salt-okuma içgörü uçları:
 * anomali tespiti, nakit akışı tahmini, envanter analitiği (ABC/ölü stok),
 * çok-şube konsolide panel, pazaryeri komisyon mutabakatı ve
 * saatlik/personel satış kırılımı.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  /** Güncel anomali / suistimal sinyalleri (en önemliden). */
  anomalies() {
    return this.http.get<AnomalyDto[]>(`${this.api}/anomalies`);
  }

  /** İleriye dönük nakit akışı tahmini (varsayılan 90 gün). */
  cashflow(days = 90) {
    return this.http.get<CashflowForecastDto>(`${this.api}/cashflow-forecast`, { params: { days } });
  }

  /** Envanter analitiği: değerleme + devir hızı + ABC + ölü stok (analiz penceresi gün). */
  inventory(days = 90) {
    return this.http.get<InventoryAnalyticsDto>(`${this.api}/inventory-analytics`, { params: { days } });
  }

  /** Çok-şube konsolide KPI. from/to (YYYY-MM-DD) verilmezse bu ay. */
  branches(from: string, to: string) {
    return this.http.get<ConsolidatedDto>(`${this.api}/branch-analytics`, { params: { from, to } });
  }

  /** Pazaryeri komisyon & hakediş mutabakatı. from/to (YYYY-MM-DD) verilmezse bu ay. */
  marketplaceCommissions(from: string, to: string) {
    return this.http.get<MarketplaceCommissionDto>(`${this.api}/marketplace-commissions`, { params: { from, to } });
  }

  /** Saatlik satış ısı haritası (yerel saate göre gün×saat). */
  hourlySales(from: string, to: string) {
    return this.http.get<HourlySalesCellDto[]>(`${this.api}/reports/hourly-sales`, { params: { from, to } });
  }

  /** Personel bazlı satış (ciro/adet/ort. sepet). */
  staffSales(from: string, to: string) {
    return this.http.get<StaffSalesDto[]>(`${this.api}/reports/staff-sales`, { params: { from, to } });
  }
}
