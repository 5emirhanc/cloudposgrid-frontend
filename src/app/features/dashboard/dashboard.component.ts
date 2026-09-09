import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import { OrdersApi } from '../../core/api/orders.api';
import { AppointmentsApi } from '../../core/api/appointments.api';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { NgApexchartsModule } from 'ng-apexcharts';
import { environment } from '../../../environments/environment';
import { AssistantInsight, DashboardSummaryDto, FinanceTrendPointDto, InvoiceListItemDto, PagedResult, PeriodKpiDto, ProductDto, ReplenishmentItemDto, TopProductDto } from '../../core/models';
import { AssistantApi } from '../../core/api/assistant.api';
import { formatDate, money, num } from '../../core/utils';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, LucideAngularModule, NgApexchartsModule, PageHelpComponent],
  template: `
    <app-page-help key="dashboard" title="İşletmenizin günlük durumunu tek ekranda görün">
      <li>Kasa toplamı, gelir, gider ve net alacağı anında görün</li>
      <li>Kısayollardan ürün ekleyin, cari açın, fatura kesin</li>
      <li>Düşük stoktaki ürünleri ve son satışları takip edin</li>
      <li>Sağ üstteki Hızlı Satış ile satışa başlayın</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Panel</h1>
        <p class="text-sm text-slate-500">İşletmenizin genel durumu</p>
      </div>
      <a routerLink="/hizli-satis" class="btn-primary btn-sm">
        <lucide-icon name="shopping-cart" class="h-4 w-4"></lucide-icon> Hızlı Satış
      </a>
    </div>

    <!-- Dönem KPI + önceki döneme göre karşılaştırma (delta oku) -->
    <div class="card mb-6 p-5">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 class="font-bold text-slate-900">Satış Özeti</h3>
        <div class="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-sm">
          @for (p of periods; track p.key) {
            <button type="button" (click)="period.set(p.key)"
                    class="rounded-md px-3 py-1 font-medium transition"
                    [class]="period() === p.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'">
              {{ p.label }}
            </button>
          }
        </div>
      </div>
      @if (periodKpi(); as k) {
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p class="text-xs font-medium uppercase text-slate-400">Ciro</p>
            <p class="text-xl font-black text-slate-900">{{ money(k.revenue) }}</p>
            <p class="mt-0.5 flex items-center gap-1 text-xs font-semibold"
               [class]="k.revenueDeltaPct > 0 ? 'text-emerald-600' : k.revenueDeltaPct < 0 ? 'text-rose-600' : 'text-slate-400'">
              <lucide-icon [name]="k.revenueDeltaPct > 0 ? 'trending-up' : k.revenueDeltaPct < 0 ? 'trending-down' : 'minus'" class="h-3.5 w-3.5"></lucide-icon>
              %{{ absPct(k.revenueDeltaPct) }} <span class="font-normal text-slate-400">{{ prevLabel() }} göre</span>
            </p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase text-slate-400">Satış Adedi</p>
            <p class="text-xl font-black text-slate-900">{{ k.salesCount }}</p>
            <p class="mt-0.5 text-xs text-slate-400">önceki: {{ k.prevSalesCount }}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase text-slate-400">Ort. Sepet</p>
            <p class="text-xl font-black text-slate-900">{{ money(k.avgBasket) }}</p>
          </div>
          <div>
            <p class="text-xs font-medium uppercase text-slate-400">Net (ciro − gider)</p>
            <p class="text-xl font-black" [class]="k.net >= 0 ? 'text-emerald-600' : 'text-rose-600'">{{ money(k.net) }}</p>
            <p class="mt-0.5 text-xs text-slate-400">gider: {{ money(k.expense) }}</p>
          </div>
        </div>
      } @else {
        <p class="text-sm text-slate-400">Yükleniyor…</p>
      }
    </div>

    <!-- Deneme süresi uyarı bandı: deneme boyunca kalan gün sayısını gösterir -->
    @if (trial(); as t) {
      <div class="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border p-4 sm:px-5"
           [class]="t.urgent ? 'border-amber-300 bg-amber-50' : 'border-brand-200 bg-gradient-to-r from-brand-50 to-cyan-50'">
        <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
              [class]="t.urgent ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'">
          <lucide-icon [name]="t.urgent ? 'triangle-alert' : 'clock'" class="h-5 w-5"></lucide-icon>
        </span>
        <div class="min-w-[200px] flex-1">
          <p class="font-bold text-slate-900">{{ t.title }}</p>
          <p class="text-sm text-slate-500">{{ t.subtitle }}</p>
        </div>
        <a routerLink="/yukselt" class="btn-primary btn-sm shrink-0">
          <lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> Paketi Yükselt
        </a>
      </div>
    }

    <!-- Onboarding: yeni işletmeye 3 adımlık başlangıç rehberi (tamamlanınca/kapatılınca gizlenir) -->
    @if (onboarding(); as ob) {
      <div class="card mb-6 p-5">
        <div class="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 class="font-bold text-slate-900">Hoş geldin! 3 adımda hazırsın 👋</h3>
            <p class="text-sm text-slate-500">Sistemi tanımanın en hızlı yolu:</p>
          </div>
          <button type="button" class="text-slate-400 hover:text-slate-600" (click)="hideOnboarding()" title="Gizle">
            <lucide-icon name="x" class="h-4 w-4"></lucide-icon>
          </button>
        </div>
        <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
          @for (s of ob.steps; track s.no) {
            <a [routerLink]="s.link" class="flex items-center gap-3 rounded-xl border p-3 transition"
               [class]="s.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50'">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    [class]="s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'">
                @if (s.done) { <lucide-icon name="check" class="h-4 w-4"></lucide-icon> } @else { {{ s.no }} }
              </span>
              <span class="text-sm font-semibold" [class]="s.done ? 'text-emerald-700' : 'text-slate-700'">{{ s.label }}</span>
            </a>
          }
        </div>
      </div>
    }

    @if (loading()) {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="h-28 animate-pulse rounded-2xl bg-slate-100"></div>
        }
      </div>
    } @else {
      <!-- AI Asistan proaktif özeti — "bugün dikkat edilecekler" (yalnız Zincir + finansal rol) -->
      @if (aiInsights().length) {
        <div class="mb-6 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-50/40 p-4 sm:p-5">
          <div class="mb-3 flex items-center gap-2.5">
            <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
              <lucide-icon name="sparkles" class="h-5 w-5"></lucide-icon>
            </span>
            <div>
              <h2 class="font-bold text-slate-900">Bugün dikkat edilecekler</h2>
              <p class="text-xs text-slate-500">AI Asistan'ın işletmenize dair önerileri</p>
            </div>
          </div>
          <div class="grid gap-2 sm:grid-cols-2">
            @for (i of aiInsights(); track i.title) {
              <div class="flex items-start gap-2.5 rounded-xl border bg-white/80 px-3 py-2.5" [class]="insightClass(i.severity)">
                <span class="text-lg leading-none">{{ i.icon }}</span>
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-slate-800">{{ i.title }}</p>
                  <p class="text-xs leading-snug text-slate-500">{{ i.detail }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      }
      <!-- KPI kartları -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @if (feat().appointments) {
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><lucide-icon name="calendar-days" class="h-5 w-5"></lucide-icon></span>
              <span class="badge-gray">Bugün</span>
            </div>
            <p class="text-sm font-medium text-slate-500">Bugünkü Randevu</p>
            <p class="text-2xl font-black text-slate-900">{{ todayAppts()?.count ?? 0 }}</p>
          </div>
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><lucide-icon name="wallet" class="h-5 w-5"></lucide-icon></span>
            </div>
            <p class="text-sm font-medium text-slate-500">Bekleyen Ödeme</p>
            <p class="text-2xl font-black text-amber-600">{{ money(todayAppts()?.pending ?? 0) }}</p>
          </div>
        } @else if (feat().adisyon || feat().services) {
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><lucide-icon [name]="feat().services ? 'wrench' : 'layout-grid'" class="h-5 w-5"></lucide-icon></span>
            </div>
            <p class="text-sm font-medium text-slate-500">{{ feat().services ? 'Açık İş Emri' : 'Açık Adisyon' }}</p>
            <p class="text-2xl font-black text-slate-900">{{ openOrders() ?? 0 }}</p>
          </div>
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><lucide-icon name="package" class="h-5 w-5"></lucide-icon></span>
              @if ((summary()?.lowStockCount ?? 0) > 0) { <span class="badge-red">{{ summary()?.lowStockCount }} kritik</span> }
            </div>
            <p class="text-sm font-medium text-slate-500">Stok Değeri</p>
            <p class="text-2xl font-black text-slate-900">{{ money(summary()?.totalStockValue) }}</p>
          </div>
        } @else {
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><lucide-icon name="package" class="h-5 w-5"></lucide-icon></span>
              <span class="badge-gray">{{ summary()?.totalProducts ?? 0 }} ürün</span>
            </div>
            <p class="text-sm font-medium text-slate-500">Stok Değeri</p>
            <p class="text-2xl font-black text-slate-900">{{ money(summary()?.totalStockValue) }}</p>
          </div>
          <div class="kpi-card">
            <div class="mb-3 flex items-center justify-between">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><lucide-icon name="triangle-alert" class="h-5 w-5"></lucide-icon></span>
              @if ((summary()?.lowStockCount ?? 0) > 0) { <span class="badge-red">Dikkat</span> }
            </div>
            <p class="text-sm font-medium text-slate-500">Kritik Stok</p>
            <p class="text-2xl font-black text-slate-900">{{ summary()?.lowStockCount ?? 0 }}</p>
          </div>
        }

        <div class="kpi-card">
          <div class="mb-3 flex items-center justify-between">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><lucide-icon name="wallet" class="h-5 w-5"></lucide-icon></span>
          </div>
          <p class="text-sm font-medium text-slate-500">Kasa Toplamı</p>
          <p class="text-2xl font-black" [class.text-rose-600]="(summary()?.cashTotal ?? 0) < 0" [class.text-slate-900]="(summary()?.cashTotal ?? 0) >= 0">{{ money(summary()?.cashTotal) }}</p>
        </div>

        <div class="kpi-card">
          <div class="mb-3 flex items-center justify-between">
            <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><lucide-icon name="users" class="h-5 w-5"></lucide-icon></span>
            @if ((summary()?.totalPayable ?? 0) > 0) { <span class="badge-amber">Borç {{ money(summary()?.totalPayable) }}</span> }
          </div>
          <p class="text-sm font-medium text-slate-500">Net Alacak</p>
          <p class="text-2xl font-black text-slate-900">{{ money(summary()?.totalReceivable) }}</p>
        </div>
      </div>

      <!-- Bugün gelir/gider -->
      <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="card flex items-center gap-4 p-5">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <lucide-icon name="trending-up" class="h-6 w-6"></lucide-icon>
          </span>
          <div>
            <p class="text-sm text-slate-500">Bugünkü Gelir</p>
            <p class="text-xl font-bold text-emerald-600">{{ money(summary()?.todayIncome) }}</p>
          </div>
        </div>
        <div class="card flex items-center gap-4 p-5">
          <span class="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
            <lucide-icon name="trending-down" class="h-6 w-6"></lucide-icon>
          </span>
          <div>
            <p class="text-sm text-slate-500">Bugünkü Gider</p>
            <p class="text-xl font-bold text-rose-600">{{ money(summary()?.todayExpense) }}</p>
          </div>
        </div>
      </div>

      <!-- Grafikler -->
      <!-- Grafik + sağ sütun (Kısayollar + Düşük Stok) -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="card p-5 lg:col-span-2">
          <h3 class="mb-4 text-base font-bold text-slate-800">Gelir / Gider Trendi (30 gün)</h3>
          <apx-chart
            [series]="area().series" [chart]="area().chart" [xaxis]="area().xaxis" [colors]="area().colors"
            [stroke]="area().stroke" [fill]="area().fill" [dataLabels]="area().dataLabels" [grid]="area().grid"
            [legend]="area().legend" [tooltip]="area().tooltip" [yaxis]="area().yaxis"
          ></apx-chart>
        </div>

        <div class="space-y-4">
          <!-- Kısayollar -->
          <div class="card p-5">
            <h3 class="mb-3 font-bold text-slate-900">Kısayollar</h3>
            <div class="grid grid-cols-2 gap-2.5">
              <a routerLink="/stok/urunler" class="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"><lucide-icon name="plus" class="h-5 w-5"></lucide-icon> {{ term().productSingular }} Ekle</a>
              <a routerLink="/cariler" class="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"><lucide-icon name="users" class="h-5 w-5"></lucide-icon> {{ term().customerSingular }} Ekle</a>
              <a routerLink="/kasa" class="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"><lucide-icon name="wallet" class="h-5 w-5"></lucide-icon> Kasa Girişi</a>
              <a routerLink="/faturalar/yeni" class="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 p-3 text-xs font-semibold text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"><lucide-icon name="receipt-text" class="h-5 w-5"></lucide-icon> Fatura Kes</a>
            </div>
          </div>
          <!-- Düşük Stok -->
          <div class="card p-5">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="font-bold text-slate-900">Düşük Stok</h3>
              @if (lowStock().length) { <span class="badge-red">{{ lowStock().length }} ürün</span> }
            </div>
            @if (lowStock().length) {
              <ul class="space-y-2.5 text-sm">
                @for (p of lowStock().slice(0, 5); track p.id) {
                  <li class="flex items-center justify-between gap-2">
                    <span class="truncate text-slate-700">{{ p.name }}</span>
                    <span [class]="p.currentStock <= 0 ? 'badge-red' : 'badge-amber'">{{ p.currentStock }} {{ p.unit }}</span>
                  </li>
                }
              </ul>
            } @else {
              <p class="py-4 text-center text-sm text-slate-400">Kritik stok yok 👍</p>
            }
          </div>
          <!-- Tükenme Riski (akıllı sipariş önerisi) — yalnız Zincir pakette -->
          @if (smartReplenishment()) {
          <div class="card p-5">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="flex items-center gap-1.5 font-bold text-slate-900">
                <lucide-icon name="trending-down" class="h-4 w-4 text-amber-500"></lucide-icon> Tükenme Riski
              </h3>
              @if (replenishment().length) { <span class="badge-amber">{{ replenishment().length }} ürün</span> }
            </div>
            @if (replenishment().length) {
              <ul class="space-y-2.5 text-sm">
                @for (r of replenishment().slice(0, 5); track r.productId) {
                  <li class="flex items-center justify-between gap-2">
                    <span class="truncate text-slate-700">{{ r.productName }}</span>
                    <span class="badge-amber">~{{ r.daysUntilStockout }} gün</span>
                  </li>
                }
              </ul>
              <a routerLink="/siparis-onerisi" class="mt-3 block text-center text-xs font-semibold text-brand-600 hover:underline">Tümünü gör →</a>
            } @else {
              <p class="py-4 text-center text-sm text-slate-400">Tükenme riski yok 👍</p>
            }
          </div>
          }
        </div>
      </div>

      <!-- Son Satışlar + En Çok Satanlar -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div class="card overflow-hidden lg:col-span-2">
          <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h3 class="font-bold text-slate-900">Son Satışlar</h3>
            <a routerLink="/faturalar" class="text-sm font-semibold text-brand-600 hover:underline">Tümü</a>
          </div>
          @if (recentSales().length) {
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="border-b border-slate-100 bg-slate-50/60"><tr>
                  <th class="table-th">Fiş</th><th class="table-th">Tarih</th><th class="table-th">{{ term().customerSingular }}</th><th class="table-th">Durum</th><th class="table-th text-right">Tutar</th>
                </tr></thead>
                <tbody class="divide-y divide-slate-50">
                  @for (s of recentSales(); track s.id) {
                    <tr class="cursor-pointer hover:bg-slate-50/60" [routerLink]="['/faturalar', s.id]">
                      <td class="table-td font-semibold text-brand-700">{{ s.number }}</td>
                      <td class="table-td whitespace-nowrap text-slate-500">{{ formatDate(s.date) }}</td>
                      <td class="table-td text-slate-600">{{ s.contactName || '—' }}</td>
                      <td class="table-td">
                        @switch (s.status) {
                          @case ('Paid') { <span class="badge-green">Ödendi</span> }
                          @case ('Issued') { <span class="badge-blue">Açık</span> }
                          @default { <span class="badge-gray">—</span> }
                        }
                      </td>
                      <td class="table-td text-right font-bold text-slate-900">{{ money(s.grandTotal) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="py-10 text-center text-sm text-slate-400">Henüz satış yok.</p>
          }
        </div>

        <div class="card p-5">
          <h3 class="mb-4 text-base font-bold text-slate-800">En Çok Satanlar</h3>
          @if (topProducts().length) {
            <apx-chart
              [series]="donut().series" [chart]="donut().chart" [labels]="donut().labels" [colors]="donut().colors"
              [legend]="donut().legend" [dataLabels]="donut().dataLabels" [plotOptions]="donut().plotOptions"
            ></apx-chart>
          } @else {
            <p class="py-12 text-center text-sm text-slate-400">Henüz satış verisi yok.</p>
          }
        </div>
      </div>
    }
  `,
})
export class DashboardComponent implements OnInit {
  private base = environment.apiUrl;
  private auth = inject(AuthService);
  private ordersApi = inject(OrdersApi);
  private apptsApi = inject(AppointmentsApi);
  private assistantApi = inject(AssistantApi);
  protected term = computed(() => this.auth.profile().terminology);
  protected feat = computed(() => this.auth.profile().features);
  protected smartReplenishment = computed(() => this.auth.user()?.entitlements?.smartReplenishment ?? false);

  // ---- AI Asistan proaktif özeti (Zincir + finansal rol) ----
  protected aiInsights = signal<AssistantInsight[]>([]);
  private canSeeInsights(): boolean {
    const r = this.auth.user()?.role;
    return (this.auth.user()?.entitlements?.aiAssistant ?? false) && (r === 'Owner' || r === 'Admin' || r === 'Accountant');
  }
  protected insightClass(severity: string): string {
    switch (severity) {
      case 'critical': return 'border-rose-200';
      case 'warning': return 'border-amber-200';
      case 'good': return 'border-emerald-200';
      default: return 'border-slate-200';
    }
  }

  // ---- Onboarding: 3 adımlık başlangıç rehberi ----
  private onboardHidden = signal(localStorage.getItem('cpg_onboard_hide') === '1');
  private seenReports = localStorage.getItem('cpg_seen_reports') === '1';

  protected onboarding = computed(() => {
    if (this.onboardHidden()) return null;
    const s = this.summary();
    if (!s) return null; // veri gelmeden karar verme
    const steps = [
      { no: 1, label: 'Ürünlerini ekle', link: '/stok/urunler', done: (s.totalProducts ?? 0) > 0 },
      { no: 2, label: 'İlk satışını yap', link: '/hizli-satis', done: this.recentSales().length > 0 },
      { no: 3, label: 'Raporlarını keşfet', link: '/raporlar', done: this.seenReports },
    ];
    return steps.every((x) => x.done) ? null : { steps };
  });

  protected hideOnboarding(): void {
    localStorage.setItem('cpg_onboard_hide', '1');
    this.onboardHidden.set(true);
  }

  /** Deneme sürümündeyse kalan gün sayısını ve uyarı metnini hesaplar (Active/ücretli hesapta null). */
  protected trial = computed(() => {
    const u = this.auth.user();
    if (!u || u.status !== 'Trial' || !u.trialEndsAt) return null;
    const days = Math.ceil((new Date(u.trialEndsAt).getTime() - Date.now()) / 86400000);
    if (days <= 0) {
      return { days: 0, urgent: true, title: 'Deneme süreniz doldu', subtitle: 'Kaldığınız yerden devam etmek için bir paket seçin.' };
    }
    return {
      days,
      urgent: days <= 3,
      title: `Deneme sürümü — ${days} gün kaldı`,
      subtitle: days <= 3
        ? 'Süreniz dolmak üzere. Kesintisiz devam için paketinizi seçin.'
        : 'Tüm özellikleri ücretsiz deniyorsunuz. Dilediğiniz zaman yükseltebilirsiniz.',
    };
  });

  // Sektöre özel metrikler (mevcut uçlardan çekilir, yalnızca ilgili sektörde).
  protected openOrders = signal<number | null>(null);
  protected todayAppts = signal<{ count: number; pending: number } | null>(null);

  ngOnInit(): void {
    const f = this.auth.profile().features;
    // AI Asistan proaktif özeti — yalnız Zincir + finansal rolde çek (yoksa 403; sessiz geç).
    if (this.canSeeInsights()) {
      this.assistantApi.insights().subscribe({ next: (i) => this.aiInsights.set(i), error: () => {} });
    }
    if (f.adisyon || f.services) {
      this.ordersApi.getOpen().subscribe((o) => this.openOrders.set(o.length));
    }
    if (f.appointments) {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      this.apptsApi.getRange(`${day}T00:00:00`, `${day}T23:59:59`).subscribe((list) => {
        const pending = list.filter((a) => a.status === 'Scheduled').reduce((s, a) => s + a.price, 0);
        this.todayAppts.set({ count: list.length, pending });
      });
    }
  }

  // Salt-okunur veriler için deklaratif httpResource (manuel load/loading/subscribe yok).
  private summaryRes = httpResource<DashboardSummaryDto>(() => `${this.base}/dashboard/summary`);
  private trendRes = httpResource<FinanceTrendPointDto[]>(() => `${this.base}/dashboard/finance-trend?days=30`);
  private topRes = httpResource<TopProductDto[]>(() => `${this.base}/dashboard/top-products?limit=5`);
  private lowStockRes = httpResource<ProductDto[]>(() => `${this.base}/products/low-stock`);
  // Akıllı sipariş önerisi yalnız Zincir'de — yetkisiz planda çekme (403 → /yukselt yönlendirmesini önler).
  private replenishmentRes = httpResource<ReplenishmentItemDto[]>(() =>
    this.smartReplenishment() ? `${this.base}/products/replenishment?horizonDays=7` : undefined);
  private recentRes = httpResource<PagedResult<InvoiceListItemDto>>(() => `${this.base}/invoices?type=Sales&page=1&pageSize=5`);

  // Dönem KPI (today/week/month/year) — seçim değişince httpResource kendini yeniler.
  protected period = signal<'today' | 'week' | 'month' | 'year'>('today');
  private periodKpiRes = httpResource<PeriodKpiDto>(() => `${this.base}/dashboard/period-kpi?period=${this.period()}`);
  protected periodKpi = this.periodKpiRes.value;
  protected readonly periods: { key: 'today' | 'week' | 'month' | 'year'; label: string }[] = [
    { key: 'today', label: 'Bugün' }, { key: 'week', label: 'Bu hafta' },
    { key: 'month', label: 'Bu ay' }, { key: 'year', label: 'Bu yıl' },
  ];
  protected prevLabel = computed(() => ({ today: 'düne', week: 'geçen haftaya', month: 'geçen aya', year: 'geçen yıla' }[this.period()]));

  protected summary = this.summaryRes.value;
  protected trend = computed(() => this.trendRes.value() ?? []);
  protected topProducts = computed(() => this.topRes.value() ?? []);
  protected lowStock = computed(() => this.lowStockRes.value() ?? []);
  protected replenishment = computed(() => this.replenishmentRes.value() ?? []);
  protected recentSales = computed(() => this.recentRes.value()?.items ?? []);
  protected loading = computed(() => this.summaryRes.isLoading() || this.trendRes.isLoading() || this.topRes.isLoading());

  protected money = money;
  protected formatDate = formatDate;
  protected absPct = (v: number) => Math.abs(v).toFixed(1);

  protected area = computed<any>(() => {
    const t = this.trend();
    return {
      series: [
        { name: 'Gelir', data: t.map((p) => Math.round(p.income)) },
        { name: 'Gider', data: t.map((p) => Math.round(p.expense)) },
      ],
      chart: { type: 'area', height: 300, toolbar: { show: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
      colors: ['#10b981', '#f43f5e'],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05 } },
      dataLabels: { enabled: false },
      grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
      legend: { position: 'top', horizontalAlign: 'right' },
      tooltip: { y: { formatter: (v: number) => num(v) + ' ₺' } },
      xaxis: {
        categories: t.map((p) => formatDate(p.date).slice(0, 5)),
        labels: { rotate: -45, style: { fontSize: '10px', colors: '#94a3b8' } },
        tickAmount: 8,
      },
      yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: (v: number) => num(v) } },
    };
  });

  protected donut = computed<any>(() => {
    const top = this.topProducts();
    return {
      series: top.map((p) => Math.round(p.quantity)),
      labels: top.map((p) => p.name),
      chart: { type: 'donut', height: 300, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
      colors: ['#2563eb', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981'],
      legend: { position: 'bottom' },
      dataLabels: { enabled: true, formatter: (val: number) => Math.round(val) + '%' },
      plotOptions: { pie: { donut: { size: '62%' } } },
    };
  });
}
