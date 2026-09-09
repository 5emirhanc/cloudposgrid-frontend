import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AgingReportDto, DailyCloseDto, FinancialReportDto, ProfitReportDto, SalesReportDto, WasteReportDto } from '../models';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/reports`;

  sales(from: string, to: string) {
    return this.http.get<SalesReportDto>(`${this.base}/sales`, { params: { from, to } });
  }
  financial(from: string, to: string) {
    return this.http.get<FinancialReportDto>(`${this.base}/financial`, { params: { from, to } });
  }
  profit(from: string, to: string) {
    return this.http.get<ProfitReportDto>(`${this.base}/profit`, { params: { from, to } });
  }
  /** Gün sonu (Z) raporu — tek günün satış/tahsilat/kasa özeti. */
  dailyClose(date: string) {
    return this.http.get<DailyCloseDto>(`${this.base}/daily-close`, { params: { date } });
  }
  /** Cari yaşlandırma (aging): alacak/borç bakiyeleri yaşa göre kovalanır. */
  aging() {
    return this.http.get<AgingReportDto>(`${this.base}/aging`);
  }
  /** Dönemsel fire/zayi maliyeti — ürün ve neden kırılımı. */
  waste(from: string, to: string) {
    return this.http.get<WasteReportDto>(`${this.base}/waste`, { params: { from, to } });
  }
}
