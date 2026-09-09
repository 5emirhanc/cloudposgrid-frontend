import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { Observable, forkJoin, of } from 'rxjs';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { StaffApi } from '../../core/api/staff.api';
import { AuthService } from '../../core/auth.service';
import {
  AnomalyDto,
  CashflowForecastDto,
  ConsolidatedDto,
  HourlySalesCellDto,
  InventoryAnalyticsDto,
  MarketplaceCommissionDto,
  StaffSalesDto,
} from '../../core/models';
import { apiError, formatDate, money, num } from '../../core/utils';

type TabKey = 'anomalies' | 'cashflow' | 'inventory' | 'branches' | 'marketplace' | 'reports';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Analitik merkezi: altı salt-okuma içgörü bölümünü sekmelerle toplar. Her sekme
 * verisini yalnızca ilk açıldığında (veya filtre değişince) tembel yükler.
 *  - Anomaliler       : /api/anomalies
 *  - Nakit Akışı       : /api/cashflow-forecast?days=
 *  - Envanter          : /api/inventory-analytics?days=
 *  - Şubeler           : /api/branch-analytics?from=&to=
 *  - Pazaryeri         : /api/marketplace-commissions?from=&to=
 *  - Saatlik & Personel: /api/reports/hourly-sales + /api/reports/staff-sales
 */
@Component({
  selector: 'app-analytics',
  imports: [LucideAngularModule],
  template: `
    <div class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Analitik</h1>
        <p class="text-sm text-slate-500">Anomali, nakit akışı, envanter, şube, pazaryeri ve satış içgörüleri tek yerde.</p>
      </div>
    </div>

    <!-- Sekme çubuğu -->
    <div class="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
      @for (t of tabs(); track t.key) {
        <button
          class="flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-semibold transition"
          [class]="selectedTab() === t.key ? 'border-b-2 border-brand-600 text-brand-600' : 'text-slate-500 hover:text-slate-700'"
          (click)="selectTab(t.key)">
          <lucide-icon [name]="t.icon" class="h-4 w-4"></lucide-icon> {{ t.label }}
        </button>
      }
    </div>

    <!-- Filtre çubuğu: gün sayısı (nakit/envanter) veya tarih aralığı (şube/pazaryeri/rapor) -->
    @if (usesDays()) {
      <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <span class="text-xs font-semibold uppercase text-slate-400">Analiz penceresi</span>
        <div class="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          @for (d of dayOptions; track d) {
            <button class="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
                    [class]="days() === d ? 'bg-brand-600 text-white' : 'text-slate-600'"
                    (click)="setDays(d)">{{ d }} gün</button>
          }
        </div>
      </div>
    } @else if (usesRange()) {
      <div class="card mb-4 flex flex-wrap items-end gap-3 p-3">
        <div>
          <label class="label">Başlangıç</label>
          <input type="date" class="input" [value]="from()" (change)="from.set($any($event.target).value)" />
        </div>
        <div>
          <label class="label">Bitiş</label>
          <input type="date" class="input" [value]="to()" (change)="to.set($any($event.target).value)" />
        </div>
        <button class="btn-primary" (click)="applyRange()">
          <lucide-icon name="filter" class="h-4 w-4"></lucide-icon> Uygula
        </button>
      </div>
    }

    @if (loading()) {
      <div class="card p-10 text-center text-sm text-slate-400">Yükleniyor…</div>
    } @else if (error()) {
      <div class="card p-8 text-center">
        <p class="text-sm font-medium text-rose-600">{{ error() }}</p>
        <button class="btn-outline mt-3" (click)="reload()">Tekrar dene</button>
      </div>
    } @else {

      <!-- ============ ANOMALİLER ============ -->
      @if (selectedTab() === 'anomalies') {
        @if (!anomalies().length) {
          <div class="card flex flex-col items-center gap-2 py-12 text-center">
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <lucide-icon name="shield" class="h-6 w-6"></lucide-icon>
            </span>
            <p class="text-sm font-medium text-slate-600">Şu an dikkat gerektiren bir anomali yok 👍</p>
            <p class="text-xs text-slate-400">Aşırı gider, olağandışı nakit, çok iptal/indirim veya ciro düşüşü tespit edilirse burada belirir.</p>
          </div>
        } @else {
          <div class="space-y-3">
            @for (a of anomalies(); track a.type) {
              <div class="card flex items-start gap-3 p-4" [class]="sevBorder(a.severity)">
                <span class="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl" [class]="sevChip(a.severity)">
                  <lucide-icon [name]="sevIcon(a.severity)" class="h-5 w-5"></lucide-icon>
                </span>
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-bold text-slate-800">{{ a.title }}</p>
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="sevChip(a.severity)">{{ sevLabel(a.severity) }}</span>
                  </div>
                  <p class="mt-1 text-sm text-slate-600">{{ a.detail }}</p>
                </div>
              </div>
            }
          </div>
        }
      }

      <!-- ============ NAKİT AKIŞI ============ -->
      @if (selectedTab() === 'cashflow') {
        @if (cashflow(); as c) {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="card p-4">
              <p class="text-xs text-slate-500">Açılış Bakiyesi</p>
              <p class="mt-1 text-xl font-black text-slate-800">{{ money(c.openingBalance) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Beklenen Giriş</p>
              <p class="mt-1 text-xl font-black text-emerald-600">{{ money(c.totalInflow) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Beklenen Çıkış</p>
              <p class="mt-1 text-xl font-black text-rose-600">{{ money(c.totalOutflow) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Dönem Sonu (tahmini)</p>
              <p class="mt-1 text-xl font-black" [class]="c.projectedEndBalance >= 0 ? 'text-slate-800' : 'text-rose-600'">{{ money(c.projectedEndBalance) }}</p>
              <p class="mt-1 text-xs text-slate-400">Net {{ money(c.netChange) }}</p>
            </div>
          </div>

          @if (c.lowestBalance < 0) {
            <div class="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <lucide-icon name="triangle-alert" class="mr-1 inline h-4 w-4"></lucide-icon>
              Nakit sıkışması riski: en düşük tahmini bakiye {{ money(c.lowestBalance) }}@if (c.lowestBalanceDate) { ({{ formatDate(c.lowestBalanceDate) }}) }.
            </div>
          }

          <div class="mt-4 card overflow-hidden">
            <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Haftalık Projeksiyon</h3>
            @if (c.points.length) {
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                    <tr>
                      <th class="table-th">Hafta</th>
                      <th class="table-th text-right">Giriş</th>
                      <th class="table-th text-right">Çıkış</th>
                      <th class="table-th text-right">Tahmini Bakiye</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (p of c.points; track p.date) {
                      <tr>
                        <td class="table-td text-slate-600">{{ formatDate(p.date) }}</td>
                        <td class="table-td text-right text-emerald-600">{{ p.inflow ? money(p.inflow) : '—' }}</td>
                        <td class="table-td text-right text-rose-600">{{ p.outflow ? money(p.outflow) : '—' }}</td>
                        <td class="table-td text-right font-semibold" [class]="p.projectedBalance >= 0 ? 'text-slate-800' : 'text-rose-600'">{{ money(p.projectedBalance) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="py-8 text-center text-sm text-slate-400">Bu ufukta planlı nakit hareketi yok.</p>
            }
          </div>

          <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div class="card overflow-hidden">
              <h4 class="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">Girişler</h4>
              @if (c.inflows.length) {
                <ul class="divide-y divide-slate-50">
                  @for (s of c.inflows; track s.source) {
                    <li class="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span class="text-slate-700">{{ s.source }} <span class="text-xs text-slate-400">({{ s.count }})</span></span>
                      <span class="font-semibold text-emerald-600">{{ money(s.amount) }}</span>
                    </li>
                  }
                </ul>
              } @else { <p class="py-6 text-center text-sm text-slate-400">Beklenen giriş yok.</p> }
            </div>
            <div class="card overflow-hidden">
              <h4 class="border-b border-slate-100 p-3 text-sm font-bold text-slate-700">Çıkışlar</h4>
              @if (c.outflows.length) {
                <ul class="divide-y divide-slate-50">
                  @for (s of c.outflows; track s.source) {
                    <li class="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span class="text-slate-700">{{ s.source }} <span class="text-xs text-slate-400">({{ s.count }})</span></span>
                      <span class="font-semibold text-rose-600">{{ money(s.amount) }}</span>
                    </li>
                  }
                </ul>
              } @else { <p class="py-6 text-center text-sm text-slate-400">Beklenen çıkış yok.</p> }
            </div>
          </div>
        }
      }

      <!-- ============ ENVANTER ============ -->
      @if (selectedTab() === 'inventory') {
        @if (inventory(); as inv) {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="card p-4">
              <p class="text-xs text-slate-500">Stok Değeri</p>
              <p class="mt-1 text-xl font-black text-brand-600">{{ money(inv.valuation.totalValue) }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ num(inv.valuation.productCount) }} ürün · {{ num(inv.valuation.totalUnits) }} adet</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Dönem COGS</p>
              <p class="mt-1 text-xl font-black text-slate-800">{{ money(inv.valuation.periodCogs) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Devir Hızı</p>
              <p class="mt-1 text-xl font-black text-slate-800">{{ num(inv.valuation.turnoverRate) }}×</p>
              <p class="mt-1 text-xs text-slate-400">Ort. {{ num(inv.valuation.daysOfInventory) }} gün rafta</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Ölü Stok Değeri</p>
              <p class="mt-1 text-xl font-black text-rose-600">{{ money(inv.deadStockValue) }}</p>
              <p class="mt-1 text-xs text-slate-400">{{ num(inv.deadStock.length) }} ürün</p>
            </div>
          </div>

          <div class="mt-4 card overflow-hidden">
            <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">ABC (Pareto) Analizi</h3>
            @if (inv.abc.length) {
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                    <tr>
                      <th class="table-th">Ürün</th>
                      <th class="table-th text-center">Sınıf</th>
                      <th class="table-th text-right">Ciro (net)</th>
                      <th class="table-th text-right">Kümülatif</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (i of inv.abc; track i.productId) {
                      <tr>
                        <td class="table-td font-medium text-slate-800">{{ i.name }}</td>
                        <td class="table-td text-center">
                          <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="abcChip(i.class)">{{ i.class }}</span>
                        </td>
                        <td class="table-td text-right font-semibold text-slate-800">{{ money(i.revenue) }}</td>
                        <td class="table-td text-right text-slate-500">%{{ num(i.cumulativePercent) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="py-8 text-center text-sm text-slate-400">Bu dönemde satış cirosu olan ürün yok.</p>
            }
          </div>

          <div class="mt-4 card overflow-hidden">
            <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Ölü Stok</h3>
            @if (inv.deadStock.length) {
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                    <tr>
                      <th class="table-th">Ürün</th>
                      <th class="table-th text-right">Eldeki Stok</th>
                      <th class="table-th text-right">Bağlı Sermaye</th>
                      <th class="table-th text-right">Son Satış</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (d of inv.deadStock; track d.productId) {
                      <tr>
                        <td class="table-td font-medium text-slate-800">{{ d.name }}</td>
                        <td class="table-td text-right text-slate-600">{{ num(d.currentStock) }}</td>
                        <td class="table-td text-right font-semibold text-rose-600">{{ money(d.tiedCapital) }}</td>
                        <td class="table-td text-right text-slate-400">{{ d.daysSinceLastSale != null ? d.daysSinceLastSale + ' gün önce' : 'Hiç' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="py-8 text-center text-sm text-slate-400">Ölü stok yok — tüm ürünler dönem içinde döndü. 🎉</p>
            }
          </div>
        }
      }

      <!-- ============ ŞUBELER ============ -->
      @if (selectedTab() === 'branches') {
        @if (branches(); as b) {
          <div class="grid grid-cols-2 gap-3">
            <div class="card p-4">
              <p class="text-xs text-slate-500">Toplam Ciro</p>
              <p class="mt-1 text-xl font-black text-brand-600">{{ money(b.totalRevenue) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Toplam Net</p>
              <p class="mt-1 text-xl font-black" [class]="b.totalNet >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ money(b.totalNet) }}</p>
            </div>
          </div>

          <div class="mt-4 card overflow-hidden">
            <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Şube Kıyaslama</h3>
            @if (b.branches.length) {
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                    <tr>
                      <th class="table-th">Şube</th>
                      <th class="table-th text-right">Ciro</th>
                      <th class="table-th text-right">Satış Adedi</th>
                      <th class="table-th text-right">Gider</th>
                      <th class="table-th text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (r of b.branches; track r.branchName) {
                      <tr>
                        <td class="table-td font-medium text-slate-800">{{ r.branchName }}</td>
                        <td class="table-td text-right text-slate-700">{{ money(r.revenue) }}</td>
                        <td class="table-td text-right text-slate-500">{{ num(r.salesCount) }}</td>
                        <td class="table-td text-right text-rose-600">{{ money(r.expense) }}</td>
                        <td class="table-td text-right font-semibold" [class]="r.net >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ money(r.net) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="py-8 text-center text-sm text-slate-400">Bu aralıkta şube verisi yok.</p>
            }
          </div>
        }
      }

      <!-- ============ PAZARYERİ ============ -->
      @if (selectedTab() === 'marketplace') {
        @if (marketplace(); as m) {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="card p-4">
              <p class="text-xs text-slate-500">Brüt Ciro</p>
              <p class="mt-1 text-xl font-black text-slate-800">{{ money(m.totalGross) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Komisyon</p>
              <p class="mt-1 text-xl font-black text-rose-600">{{ money(m.totalCommission) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Kargo</p>
              <p class="mt-1 text-xl font-black text-rose-600">{{ money(m.totalShipping) }}</p>
            </div>
            <div class="card p-4">
              <p class="text-xs text-slate-500">Gerçek Net</p>
              <p class="mt-1 text-xl font-black text-emerald-600">{{ money(m.totalNet) }}</p>
            </div>
          </div>

          <div class="mt-4 card overflow-hidden">
            <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Kanal Bazında Hakediş</h3>
            @if (m.rows.length) {
              <div class="overflow-x-auto">
                <table class="w-full">
                  <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                    <tr>
                      <th class="table-th">Kanal</th>
                      <th class="table-th text-right">Sipariş</th>
                      <th class="table-th text-right">Brüt</th>
                      <th class="table-th text-right">Komisyon</th>
                      <th class="table-th text-right">Kargo</th>
                      <th class="table-th text-right">Net</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (r of m.rows; track r.channel) {
                      <tr>
                        <td class="table-td font-medium text-slate-800">{{ r.channel }}</td>
                        <td class="table-td text-right text-slate-500">{{ num(r.orderCount) }}</td>
                        <td class="table-td text-right text-slate-700">{{ money(r.gross) }}</td>
                        <td class="table-td text-right text-rose-600">{{ money(r.commission) }} <span class="text-xs text-slate-400">(%{{ num(r.commissionRate) }})</span></td>
                        <td class="table-td text-right text-rose-600">{{ money(r.shipping) }}</td>
                        <td class="table-td text-right font-semibold text-emerald-600">{{ money(r.net) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="py-8 text-center text-sm text-slate-400">Bu aralıkta pazaryeri siparişi yok.</p>
            }
          </div>
        }
      }

      <!-- ============ SAATLİK & PERSONEL ============ -->
      @if (selectedTab() === 'reports') {
        <div class="card overflow-hidden">
          <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Saatlik Satış Isı Haritası</h3>
          @if (hourly().length) {
            <div class="overflow-x-auto p-3">
              <table class="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th class="p-1 text-left font-medium text-slate-400"></th>
                    @for (h of hours; track h) {
                      <th class="p-1 text-center font-medium text-slate-400">{{ h }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (wd of weekdays; track wd) {
                    <tr>
                      <td class="p-1 pr-2 text-right font-semibold text-slate-500">{{ weekdayLabels[wd] }}</td>
                      @for (h of hours; track h) {
                        <td class="p-0.5">
                          <div class="mx-auto flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold"
                               [style.background]="heatBg(cellCount(wd, h))"
                               [class]="cellCount(wd, h) > maxHourly() * 0.5 ? 'text-white' : 'text-slate-500'"
                               [title]="weekdayLabels[wd] + ' ' + h + ':00 — ' + money(cellRevenue(wd, h))">
                            {{ cellCount(wd, h) || '' }}
                          </div>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
              <p class="mt-2 text-xs text-slate-400">Hücrelerdeki sayı satış adedidir; renk yoğunluğu göreli yoğunluğu gösterir. Fareyle üzerine gelince ciro görünür.</p>
            </div>
          } @else {
            <p class="py-8 text-center text-sm text-slate-400">Bu aralıkta satış verisi yok.</p>
          }
        </div>

        <div class="mt-4 card overflow-hidden">
          <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Personel Bazlı Satış</h3>
          @if (staff().length) {
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
                  <tr>
                    <th class="table-th">Personel</th>
                    <th class="table-th text-right">Satış Adedi</th>
                    <th class="table-th text-right">Ciro</th>
                    <th class="table-th text-right">Ort. Sepet</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  @for (s of staff(); track s.sellerUserId) {
                    <tr>
                      <td class="table-td font-medium text-slate-800">{{ staffName(s.sellerUserId) }}</td>
                      <td class="table-td text-right text-slate-500">{{ num(s.salesCount) }}</td>
                      <td class="table-td text-right font-semibold text-slate-800">{{ money(s.revenue) }}</td>
                      <td class="table-td text-right text-slate-500">{{ money(s.avgBasket) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="py-8 text-center text-sm text-slate-400">Bu aralıkta personel satışı yok.</p>
          }
        </div>
      }
    }
  `,
})
export class AnalyticsComponent implements OnInit {
  private api = inject(AnalyticsApi);
  private staffApi = inject(StaffApi);
  private auth = inject(AuthService);

  protected money = money;
  protected num = num;
  protected formatDate = formatDate;

  private readonly allTabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'anomalies', label: 'Anomaliler', icon: 'shield' },
    { key: 'cashflow', label: 'Nakit Akışı', icon: 'wallet' },
    { key: 'inventory', label: 'Envanter', icon: 'boxes' },
    { key: 'branches', label: 'Şubeler', icon: 'building-2' },
    { key: 'marketplace', label: 'Pazaryeri', icon: 'store' },
    { key: 'reports', label: 'Saatlik & Personel', icon: 'clock' },
  ];
  /**
   * "Şubeler" (branch-analytics) backend'de yalnız Owner/Admin; Muhasebe rolüne göstermeyiz (yoksa 403 çıkmazı).
   * "Pazaryeri" (marketplace-commissions) yalnız Zincir paketinde (marketplaceIntegration); Kurumsal analitiği
   * açsa da bu sekme 403 döndürürdü — o yüzden entitlement yoksa sekmeyi hiç göstermeyiz.
   */
  protected tabs = computed(() => {
    const isAdmin = ['Owner', 'Admin'].includes(this.auth.role() ?? '');
    const hasMarketplace = this.auth.user()?.entitlements?.marketplaceIntegration ?? false;
    return this.allTabs.filter((t) => {
      if (t.key === 'branches' && !isAdmin) return false;
      if (t.key === 'marketplace' && !hasMarketplace) return false;
      return true;
    });
  });

  protected selectedTab = signal<TabKey>('anomalies');
  protected loading = signal(false);
  protected error = signal<string | null>(null);

  // Filtreler
  protected readonly dayOptions = [30, 90, 180, 365];
  protected days = signal(90);
  protected from = signal(ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  protected to = signal(ymd(new Date()));

  // Isı haritası eksenleri
  protected readonly weekdays = [0, 1, 2, 3, 4, 5, 6];
  protected readonly weekdayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  protected readonly hours = Array.from({ length: 24 }, (_, i) => i);

  // Veri sinyalleri
  protected anomalies = signal<AnomalyDto[]>([]);
  protected cashflow = signal<CashflowForecastDto | null>(null);
  protected inventory = signal<InventoryAnalyticsDto | null>(null);
  protected branches = signal<ConsolidatedDto | null>(null);
  protected marketplace = signal<MarketplaceCommissionDto | null>(null);
  protected hourly = signal<HourlySalesCellDto[]>([]);
  protected staff = signal<StaffSalesDto[]>([]);

  // Hangi sekmeler (mevcut filtre altında) yüklendi — gereksiz tekrar isteği önler.
  private loaded = new Set<TabKey>();
  private staffNames = new Map<string, string>();
  private hourlyIndex = new Map<number, HourlySalesCellDto>();

  protected usesDays = computed(() => this.selectedTab() === 'cashflow' || this.selectedTab() === 'inventory');
  protected usesRange = computed(() =>
    this.selectedTab() === 'branches' || this.selectedTab() === 'marketplace' || this.selectedTab() === 'reports',
  );
  protected maxHourly = computed(() => this.hourly().reduce((m, c) => Math.max(m, c.count), 0));

  ngOnInit(): void {
    this.ensure('anomalies');
  }

  protected selectTab(tab: TabKey): void {
    this.selectedTab.set(tab);
    this.error.set(null);
    this.ensure(tab);
  }

  /** Gün penceresi değişti — gün-tabanlı sekmelerin önbelleğini boşalt, aktif sekmeyi yeniden yükle. */
  protected setDays(d: number): void {
    if (this.days() === d) return;
    this.days.set(d);
    this.loaded.delete('cashflow');
    this.loaded.delete('inventory');
    this.ensure(this.selectedTab(), true);
  }

  /** Tarih aralığı uygulandı — aralık-tabanlı sekmelerin önbelleğini boşalt, aktif sekmeyi yeniden yükle. */
  protected applyRange(): void {
    this.loaded.delete('branches');
    this.loaded.delete('marketplace');
    this.loaded.delete('reports');
    this.ensure(this.selectedTab(), true);
  }

  protected reload(): void {
    this.loaded.delete(this.selectedTab());
    this.ensure(this.selectedTab(), true);
  }

  private ensure(tab: TabKey, force = false): void {
    if (!force && this.loaded.has(tab)) return;
    this.error.set(null);

    switch (tab) {
      case 'anomalies':
        this.run(this.api.anomalies(), (r) => this.anomalies.set(r ?? []), tab);
        break;
      case 'cashflow':
        this.run(this.api.cashflow(this.days()), (r) => this.cashflow.set(r), tab);
        break;
      case 'inventory':
        this.run(this.api.inventory(this.days()), (r) => this.inventory.set(r), tab);
        break;
      case 'branches':
        this.run(this.api.branches(this.from(), this.to()), (r) => this.branches.set(r), tab);
        break;
      case 'marketplace':
        this.run(this.api.marketplaceCommissions(this.from(), this.to()), (r) => this.marketplace.set(r), tab);
        break;
      case 'reports':
        this.loadReports();
        break;
    }
  }

  private run<T>(obs: Observable<T>, apply: (r: T) => void, tab: TabKey): void {
    this.loading.set(true);
    obs.subscribe({
      next: (r) => {
        apply(r);
        this.loaded.add(tab);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiError(e));
        this.loading.set(false);
      },
    });
  }

  /** Saatlik + personel + (bir kez) personel adları PARALEL yüklenir — 3 sıralı tur yerine 1 (forkJoin). */
  private loadReports(): void {
    this.loading.set(true);
    const needNames = this.staffNames.size === 0;
    forkJoin({
      hourly: this.api.hourlySales(this.from(), this.to()),
      staff: this.api.staffSales(this.from(), this.to()),
      // Personel adları yalnız bir kez çekilir; zaten varsa boş akış.
      names: needNames ? this.staffApi.list() : of(null),
    }).subscribe({
      next: ({ hourly, staff, names }) => {
        const list = hourly ?? [];
        this.hourly.set(list);
        this.hourlyIndex = new Map(list.map((c) => [c.weekday * 24 + c.hour, c]));
        this.staff.set(staff ?? []);
        if (names) this.staffNames = new Map(names.map((s) => [s.id, s.fullName]));
        this.loaded.add('reports');
        this.loading.set(false);
      },
      error: (e) => { this.error.set(apiError(e)); this.loading.set(false); },
    });
  }

  protected staffName(id: string | null): string {
    if (!id) return 'Atanmamış';
    return this.staffNames.get(id) ?? 'Personel #' + id.slice(0, 8);
  }

  protected cellCount(wd: number, h: number): number {
    return this.hourlyIndex.get(wd * 24 + h)?.count ?? 0;
  }
  protected cellRevenue(wd: number, h: number): number {
    return this.hourlyIndex.get(wd * 24 + h)?.revenue ?? 0;
  }
  protected heatBg(count: number): string {
    const max = this.maxHourly();
    if (count <= 0 || max <= 0) return '#f1f5f9';
    const alpha = 0.15 + 0.85 * (count / max);
    return `rgba(37, 99, 235, ${alpha.toFixed(2)})`;
  }

  // ---- Anomali önem (severity) sunumu ----
  protected sevLabel(s: string): string {
    return s === 'critical' ? 'Kritik' : s === 'warning' ? 'Uyarı' : 'Bilgi';
  }
  protected sevIcon(s: string): string {
    return s === 'critical' ? 'ban' : s === 'warning' ? 'triangle-alert' : 'info';
  }
  protected sevChip(s: string): string {
    if (s === 'critical') return 'bg-rose-100 text-rose-700';
    if (s === 'warning') return 'bg-amber-100 text-amber-700';
    return 'bg-sky-100 text-sky-700';
  }
  protected sevBorder(s: string): string {
    if (s === 'critical') return 'border-l-4 border-l-rose-400';
    if (s === 'warning') return 'border-l-4 border-l-amber-400';
    return 'border-l-4 border-l-sky-400';
  }

  protected abcChip(cls: string): string {
    if (cls === 'A') return 'bg-emerald-100 text-emerald-700';
    if (cls === 'B') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  }
}
