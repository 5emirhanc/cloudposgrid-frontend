import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { NgApexchartsModule } from 'ng-apexcharts';
import { forkJoin } from 'rxjs';
import { ReportsApi } from '../../core/api/reports.api';
import { AuthService } from '../../core/auth.service';
import { AgingReportDto, DailyCloseDto, FinancialReportDto, ProfitReportDto, SalesReportDto, WasteReportDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError, money, num } from '../../core/utils';

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-reports',
  imports: [LucideAngularModule, NgApexchartsModule, RouterLink, PageHelpComponent],
  template: `
    <app-page-help key="reports" title="Satışlarınızı, kârınızı ve gün sonu kasa özetinizi buradan görün">
      <li>Tarih aralığı seçin (Bugün, Bu Hafta, Bu Ay, Son 30 Gün)</li>
      <li>Gün Sonu (Z) Raporu ile günlük kasa özetini görün ve yazdırın</li>
      <li>En çok satan ürünleri, kategori ve ödeme dağılımını inceleyin</li>
      <li>Raporu Excel'e aktar ile CSV olarak indirin</li>
    </app-page-help>

    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Raporlar</h1>
        <p class="text-sm text-slate-500">{{ term().sale }} ve finansal analiz</p>
      </div>
      @if (canExport()) {
        <button class="btn-outline" [disabled]="!sales()" (click)="exportCsv()">
          <lucide-icon name="download" class="h-4 w-4"></lucide-icon> Excel'e aktar
        </button>
      } @else {
        <a routerLink="/yukselt" class="btn-outline text-brand-600" title="Kurumsal pakete özel">
          <lucide-icon name="crown" class="h-4 w-4"></lucide-icon> Excel'e aktar
        </a>
      }
    </div>

    <!-- Tarih aralığı -->
    <div class="card mb-4 flex flex-wrap items-end gap-3 p-3">
      <div class="flex flex-wrap gap-1">
        @for (p of presets; track p.key) {
          <button class="chip" [class.chip-active]="activePreset() === p.key" (click)="applyPreset(p.key)">{{ p.label }}</button>
        }
      </div>
      <div class="flex items-end gap-2">
        <div>
          <label class="label">Başlangıç</label>
          <input type="date" class="input" [value]="from()" (change)="from.set($any($event.target).value); activePreset.set('custom')" />
        </div>
        <div>
          <label class="label">Bitiş</label>
          <input type="date" class="input" [value]="to()" (change)="to.set($any($event.target).value); activePreset.set('custom')" />
        </div>
        <button class="btn-primary" (click)="load()"><lucide-icon name="filter" class="h-4 w-4"></lucide-icon> Uygula</button>
      </div>
    </div>

    <!-- Gün Sonu (Z) Raporu -->
    <div class="card mb-4 p-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-slate-800">Gün Sonu (Z) Raporu</h3>
          <p class="text-xs text-slate-500">Seçilen günün satış, tahsilat ve kasa özeti — vardiya kapanışında yazdırın</p>
        </div>
        <div class="flex items-end gap-2">
          <div>
            <label class="label">Gün</label>
            <input type="date" class="input" [value]="zDate()" (change)="zDate.set($any($event.target).value)" />
          </div>
          <button class="btn-primary" [disabled]="zLoading()" (click)="loadZ()">
            <lucide-icon name="clock" class="h-4 w-4"></lucide-icon> {{ zLoading() ? 'Yükleniyor...' : 'Getir' }}
          </button>
          @if (z()) {
            <button class="btn-outline" (click)="printZ()">
              <lucide-icon name="receipt-text" class="h-4 w-4"></lucide-icon> Yazdır
            </button>
          }
        </div>
      </div>

      @if (z(); as zr) {
        <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-xl bg-slate-50 p-4">
            <p class="text-xs text-slate-500">{{ term().sale }} Adedi</p>
            <p class="mt-1 text-xl font-black text-slate-800">{{ zr.salesCount }}</p>
          </div>
          <div class="rounded-xl bg-slate-50 p-4">
            <p class="text-xs text-slate-500">{{ term().sale }} Toplamı</p>
            <p class="mt-1 text-xl font-black text-brand-600">{{ money(zr.salesTotal) }}</p>
            <p class="text-xs text-slate-400">KDV: {{ money(zr.vatTotal) }}</p>
          </div>
          <div class="rounded-xl bg-slate-50 p-4">
            <p class="text-xs text-slate-500">Gelir / Gider</p>
            <p class="mt-1 text-sm font-bold"><span class="text-emerald-600">{{ money(zr.income) }}</span> · <span class="text-rose-600">{{ money(zr.expense) }}</span></p>
            <p class="text-xs text-slate-400">Net: {{ money(zr.net) }}</p>
          </div>
          <div class="rounded-xl p-4" [class]="zr.openOrdersCount > 0 ? 'bg-amber-50' : 'bg-slate-50'">
            <p class="text-xs" [class]="zr.openOrdersCount > 0 ? 'text-amber-700' : 'text-slate-500'">Açık Hesap</p>
            <p class="mt-1 text-xl font-black" [class]="zr.openOrdersCount > 0 ? 'text-amber-700' : 'text-slate-800'">{{ zr.openOrdersCount }}</p>
            @if (zr.openOrdersCount > 0) { <p class="text-xs text-amber-600">{{ money(zr.openOrdersTotal) }} tahsil edilmedi</p> }
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div class="overflow-hidden rounded-xl border border-slate-100">
            <p class="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-bold uppercase text-slate-500">Ödeme Yöntemi</p>
            @if (zr.byPaymentMethod.length) {
              <ul class="divide-y divide-slate-50">
                @for (p of zr.byPaymentMethod; track p.name) {
                  <li class="flex items-center justify-between px-4 py-2 text-sm">
                    <span class="text-slate-700">{{ p.name }} <span class="text-xs text-slate-400">({{ p.count }})</span></span>
                    <span class="font-semibold text-slate-800">{{ money(p.amount) }}</span>
                  </li>
                }
              </ul>
            } @else { <p class="py-6 text-center text-sm text-slate-400">Bu gün tahsilat yok.</p> }
          </div>
          <div class="overflow-hidden rounded-xl border border-slate-100">
            <p class="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-xs font-bold uppercase text-slate-500">Kasa Hareketleri</p>
            <table class="w-full text-sm">
              <thead><tr class="text-xs text-slate-400"><th class="px-4 py-1.5 text-left font-medium">Hesap</th><th class="px-2 py-1.5 text-right font-medium">Giriş</th><th class="px-2 py-1.5 text-right font-medium">Çıkış</th><th class="px-4 py-1.5 text-right font-medium">Bakiye</th></tr></thead>
              <tbody class="divide-y divide-slate-50">
                @for (a of zr.cashAccounts; track a.name) {
                  <tr>
                    <td class="px-4 py-2 text-slate-700">{{ a.name }}</td>
                    <td class="px-2 py-2 text-right text-emerald-600">{{ money(a.in) }}</td>
                    <td class="px-2 py-2 text-right text-rose-600">{{ money(a.out) }}</td>
                    <td class="px-4 py-2 text-right font-semibold text-slate-800">{{ money(a.balance) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>

    <!-- Cari Yaşlandırma (Aging) -->
    <div class="card mb-4 p-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-slate-800">Cari Yaşlandırma</h3>
          <p class="text-xs text-slate-500">Kim, ne kadar, kaç gündür borçlu — tahsilat önceliğini görün</p>
        </div>
        <button class="btn-primary" [disabled]="agingLoading()" (click)="loadAging()">
          <lucide-icon name="clock" class="h-4 w-4"></lucide-icon> {{ agingLoading() ? 'Yükleniyor...' : 'Getir' }}
        </button>
      </div>

      @if (aging(); as ag) {
        <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div class="rounded-xl bg-slate-50 p-3">
            <p class="text-xs text-slate-500">Toplam Alacak</p>
            <p class="mt-1 text-lg font-black text-brand-600">{{ money(ag.totalReceivable) }}</p>
          </div>
          <div class="rounded-xl bg-emerald-50 p-3">
            <p class="text-xs text-emerald-700">0–30 gün</p>
            <p class="mt-1 text-lg font-black text-emerald-700">{{ money(ag.current) }}</p>
          </div>
          <div class="rounded-xl bg-amber-50 p-3">
            <p class="text-xs text-amber-700">31–60 gün</p>
            <p class="mt-1 text-lg font-black text-amber-700">{{ money(ag.d31_60) }}</p>
          </div>
          <div class="rounded-xl bg-orange-50 p-3">
            <p class="text-xs text-orange-700">61–90 gün</p>
            <p class="mt-1 text-lg font-black text-orange-700">{{ money(ag.d61_90) }}</p>
          </div>
          <div class="rounded-xl bg-rose-50 p-3">
            <p class="text-xs text-rose-700">90+ gün</p>
            <p class="mt-1 text-lg font-black text-rose-700">{{ money(ag.over90) }}</p>
          </div>
        </div>

        @if (ag.receivables.length) {
          <div class="mt-4 overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full text-sm">
              <thead><tr class="text-xs text-slate-400">
                <th class="px-4 py-2 text-left font-medium">Cari</th>
                <th class="px-2 py-2 text-right font-medium">Bakiye</th>
                <th class="px-2 py-2 text-right font-medium">0–30</th>
                <th class="px-2 py-2 text-right font-medium">31–60</th>
                <th class="px-2 py-2 text-right font-medium">61–90</th>
                <th class="px-2 py-2 text-right font-medium">90+</th>
                <th class="px-4 py-2 text-right font-medium">En Eski</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                @for (r of ag.receivables; track r.contactId) {
                  <tr [class.bg-rose-50]="r.over90 > 0">
                    <td class="px-4 py-2 text-slate-700">{{ r.name }}@if (r.phone) { <span class="block text-xs text-slate-400">{{ r.phone }}</span> }</td>
                    <td class="px-2 py-2 text-right font-semibold text-slate-800">{{ money(r.balance) }}</td>
                    <td class="px-2 py-2 text-right text-slate-500">{{ r.current ? money(r.current) : '—' }}</td>
                    <td class="px-2 py-2 text-right text-amber-600">{{ r.d31_60 ? money(r.d31_60) : '—' }}</td>
                    <td class="px-2 py-2 text-right text-orange-600">{{ r.d61_90 ? money(r.d61_90) : '—' }}</td>
                    <td class="px-2 py-2 text-right font-semibold text-rose-600">{{ r.over90 ? money(r.over90) : '—' }}</td>
                    <td class="px-4 py-2 text-right text-slate-400">{{ r.oldestDays != null ? r.oldestDays + ' gün' : '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <p class="mt-4 py-6 text-center text-sm text-slate-400">Bekleyen alacak yok. 🎉</p> }

        @if (ag.payables.length) {
          <div class="mt-4">
            <p class="mb-2 text-xs font-bold uppercase text-slate-500">Borçlarımız (tedarikçi)</p>
            <div class="overflow-x-auto rounded-xl border border-slate-100">
              <table class="w-full text-sm">
                <tbody class="divide-y divide-slate-50">
                  @for (p of ag.payables; track p.contactId) {
                    <tr>
                      <td class="px-4 py-2 text-slate-700">{{ p.name }}</td>
                      <td class="px-4 py-2 text-right font-semibold text-rose-600">{{ money(-p.balance) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>

    <!-- Fire / Zayi -->
    <div class="card mb-4 p-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-base font-bold text-slate-800">Fire / Zayi</h3>
          <p class="text-xs text-slate-500">Bozulan, kırılan, SKT geçen ve ikram ürünlerin gizli maliyeti</p>
        </div>
        <button class="btn-primary" [disabled]="wasteLoading()" (click)="loadWaste()">
          <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon> {{ wasteLoading() ? 'Yükleniyor...' : 'Getir' }}
        </button>
      </div>

      @if (waste(); as w) {
        @if (w.totalQuantity > 0) {
          <div class="mt-4 grid grid-cols-2 gap-3">
            <div class="rounded-xl bg-rose-50 p-3">
              <p class="text-xs text-rose-700">Dönem Fire Maliyeti</p>
              <p class="mt-1 text-lg font-black text-rose-700">{{ money(w.totalCost) }}</p>
            </div>
            <div class="rounded-xl bg-slate-50 p-3">
              <p class="text-xs text-slate-500">Toplam Miktar</p>
              <p class="mt-1 text-lg font-black text-slate-700">{{ w.totalQuantity }}</p>
            </div>
          </div>

          <div class="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p class="mb-2 text-xs font-bold uppercase text-slate-500">Ürün bazında</p>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full text-sm">
                  <tbody class="divide-y divide-slate-50">
                    @for (i of w.items; track i.productId) {
                      <tr>
                        <td class="px-4 py-2 text-slate-700">{{ i.productName }}</td>
                        <td class="px-2 py-2 text-right text-slate-400">{{ i.quantity }}</td>
                        <td class="px-4 py-2 text-right font-semibold text-rose-600">{{ money(i.cost) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p class="mb-2 text-xs font-bold uppercase text-slate-500">Neden bazında</p>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full text-sm">
                  <tbody class="divide-y divide-slate-50">
                    @for (r of w.byReason; track r.name) {
                      <tr>
                        <td class="px-4 py-2 text-slate-700">{{ r.name }}</td>
                        <td class="px-2 py-2 text-right text-slate-400">{{ r.count }} kayıt</td>
                        <td class="px-4 py-2 text-right font-semibold text-rose-600">{{ money(r.amount) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        } @else {
          <p class="mt-4 py-6 text-center text-sm text-slate-400">Bu dönemde fire kaydı yok. 🎉</p>
        }
      }
    </div>

    @if (loading()) {
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        @for (i of [1,2,3,4]; track i) { <div class="h-28 animate-pulse rounded-2xl bg-slate-100"></div> }
      </div>
    } @else if (sales(); as s) {
      <!-- KPI -->
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div class="card p-5">
          <p class="text-sm text-slate-500">{{ term().sale }} Adedi</p>
          <p class="mt-1 text-2xl font-black text-slate-800">{{ s.salesCount }}</p>
          <p class="mt-2 text-xs text-slate-400">Ortalama sepet: {{ money(s.avgBasket) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">{{ term().sale }} Toplamı</p>
          <p class="mt-1 text-2xl font-black text-brand-600">{{ money(s.salesTotal) }}</p>
          <p class="mt-2 text-xs text-slate-400">KDV: {{ money(s.vatTotal) }}</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Tahmini Kâr</p>
          <p class="mt-1 text-2xl font-black text-emerald-600">{{ money(s.estimatedProfit) }}</p>
          <p class="mt-2 text-xs text-slate-400">Satış − maliyet (yaklaşık)</p>
        </div>
        <div class="card p-5">
          <p class="text-sm text-slate-500">Net Nakit Akışı</p>
          <p class="mt-1 text-2xl font-black" [class.text-emerald-600]="net() >= 0" [class.text-rose-600]="net() < 0">{{ money(net()) }}</p>
          <p class="mt-2 text-xs text-slate-400">Gelir {{ money(fin()?.income) }} · Gider {{ money(fin()?.expense) }}</p>
        </div>
      </div>

      <!-- Kâr-Zarar Analizi -->
      @if (profit(); as p) {
        <div class="mt-8">
          <h3 class="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
            <lucide-icon name="trending-up" class="h-5 w-5 text-emerald-500"></lucide-icon> Kâr-Zarar Analizi
          </h3>
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div class="card p-5">
              <p class="text-sm text-slate-500">Ciro (net)</p>
              <p class="mt-1 text-2xl font-black text-slate-800">{{ money(p.totalRevenue) }}</p>
              <p class="mt-2 text-xs text-slate-400">KDV hariç</p>
            </div>
            <div class="card p-5">
              <p class="text-sm text-slate-500">Maliyet</p>
              <p class="mt-1 text-2xl font-black text-slate-800">{{ money(p.totalCost) }}</p>
              <p class="mt-2 text-xs text-slate-400">Satılan ürünlerin alış maliyeti</p>
            </div>
            <div class="card p-5">
              <p class="text-sm text-slate-500">Brüt Kâr</p>
              <p class="mt-1 text-2xl font-black" [class.text-emerald-600]="p.grossProfit >= 0" [class.text-rose-600]="p.grossProfit < 0">{{ money(p.grossProfit) }}</p>
              <p class="mt-2 text-xs text-slate-400">Ciro − maliyet</p>
            </div>
            <div class="card p-5">
              <p class="text-sm text-slate-500">Kâr Marjı</p>
              <p class="mt-1 text-2xl font-black" [class.text-emerald-600]="p.grossMarginPercent >= 0" [class.text-rose-600]="p.grossMarginPercent < 0">%{{ p.grossMarginPercent }}</p>
              <p class="mt-2 text-xs text-slate-400">Brüt kâr / ciro</p>
            </div>
          </div>

          <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <!-- Kanala göre kâr (Mağaza vs Trendyol) -->
            <div class="card p-5">
              <h4 class="mb-3 font-bold text-slate-800">Kanala Göre Kâr</h4>
              @if (p.byChannel.length) {
                <table class="w-full text-sm">
                  <thead><tr class="text-left text-xs uppercase text-slate-400">
                    <th class="pb-2">Kanal</th><th class="pb-2 text-right">Ciro</th><th class="pb-2 text-right">Kâr</th><th class="pb-2 text-right">Marj</th>
                  </tr></thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (ch of p.byChannel; track ch.name) {
                      <tr>
                        <td class="py-2 font-medium text-slate-700">{{ ch.name }}</td>
                        <td class="py-2 text-right text-slate-600">{{ money(ch.revenue) }}</td>
                        <td class="py-2 text-right font-semibold" [class.text-emerald-600]="ch.profit >= 0" [class.text-rose-600]="ch.profit < 0">{{ money(ch.profit) }}</td>
                        <td class="py-2 text-right text-slate-500">%{{ ch.marginPercent }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="py-6 text-center text-sm text-slate-400">Bu aralıkta satış yok.</p>
              }
            </div>

            <!-- En kârlı kategoriler -->
            <div class="card p-5">
              <h4 class="mb-3 font-bold text-slate-800">En Kârlı Kategoriler</h4>
              @if (p.byCategory.length) {
                <table class="w-full text-sm">
                  <thead><tr class="text-left text-xs uppercase text-slate-400">
                    <th class="pb-2">Kategori</th><th class="pb-2 text-right">Kâr</th><th class="pb-2 text-right">Marj</th>
                  </tr></thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (cat of p.byCategory; track cat.name) {
                      <tr>
                        <td class="py-2 font-medium text-slate-700">{{ cat.name }}</td>
                        <td class="py-2 text-right font-semibold" [class.text-emerald-600]="cat.profit >= 0" [class.text-rose-600]="cat.profit < 0">{{ money(cat.profit) }}</td>
                        <td class="py-2 text-right text-slate-500">%{{ cat.marginPercent }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              } @else {
                <p class="py-6 text-center text-sm text-slate-400">Veri yok.</p>
              }
            </div>
          </div>
          <p class="mt-2 text-xs text-slate-400">Maliyet, satış anındaki alış fiyatından sabitlenir (yeni satışlardan itibaren kesin). Pazaryeri komisyon/kargo kesintileri hariç (brüt kâr).</p>
        </div>
      }

      <!-- Trend -->
      <div class="mt-6 card p-5">
        <h3 class="mb-4 text-base font-bold text-slate-800">Günlük {{ term().sale }} Trendi</h3>
        @if (hasTrend()) {
          <apx-chart [series]="trendChart().series" [chart]="trendChart().chart" [xaxis]="trendChart().xaxis"
            [colors]="trendChart().colors" [stroke]="trendChart().stroke" [fill]="trendChart().fill"
            [dataLabels]="trendChart().dataLabels" [grid]="trendChart().grid" [tooltip]="trendChart().tooltip"
            [yaxis]="trendChart().yaxis"></apx-chart>
        } @else {
          <p class="py-12 text-center text-sm text-slate-400">Bu aralıkta {{ term().sale.toLowerCase() }} verisi yok.</p>
        }
      </div>

      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <!-- Kategori kırılımı -->
        <div class="card p-5">
          <h3 class="mb-4 text-base font-bold text-slate-800">Kategori Dağılımı</h3>
          @if (s.byCategory.length) {
            <apx-chart [series]="catChart().series" [chart]="catChart().chart" [labels]="catChart().labels"
              [colors]="catChart().colors" [legend]="catChart().legend" [dataLabels]="catChart().dataLabels"
              [plotOptions]="catChart().plotOptions" [tooltip]="catChart().tooltip"></apx-chart>
          } @else {
            <p class="py-12 text-center text-sm text-slate-400">Veri yok.</p>
          }
        </div>
        <!-- Ödeme yöntemi -->
        <div class="card p-5">
          <h3 class="mb-4 text-base font-bold text-slate-800">Ödeme Yöntemi</h3>
          @if (s.byPaymentMethod.length) {
            <apx-chart [series]="payChart().series" [chart]="payChart().chart" [labels]="payChart().labels"
              [colors]="payChart().colors" [legend]="payChart().legend" [dataLabels]="payChart().dataLabels"
              [plotOptions]="payChart().plotOptions" [tooltip]="payChart().tooltip"></apx-chart>
          } @else {
            <p class="py-12 text-center text-sm text-slate-400">Tahsilat verisi yok.</p>
          }
        </div>
      </div>

      <!-- En çok satanlar -->
      <div class="mt-6 card overflow-hidden">
        <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">En Çok Satan Ürünler</h3>
        @if (s.topProducts.length) {
          <table class="w-full">
            <thead class="bg-slate-50/60 text-xs uppercase text-slate-500">
              <tr><th class="table-th">Ürün</th><th class="table-th text-right">Adet</th><th class="table-th text-right">Tutar</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (p of s.topProducts; track p.productId) {
                <tr>
                  <td class="table-td font-medium text-slate-800">{{ p.name }}</td>
                  <td class="table-td text-right text-slate-600">{{ num(p.quantity) }}</td>
                  <td class="table-td text-right font-semibold text-slate-800">{{ money(p.total) }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="py-10 text-center text-sm text-slate-400">Satış verisi yok.</p>
        }
      </div>

      <!-- Finansal kırılım -->
      <div class="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div class="card overflow-hidden">
          <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Gelir Kategorileri</h3>
          @if (fin()?.incomeByCategory?.length) {
            <ul class="divide-y divide-slate-50">
              @for (c of fin()!.incomeByCategory; track c.name) {
                <li class="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span class="text-slate-700">{{ c.name }} <span class="text-xs text-slate-400">({{ c.count }})</span></span>
                  <span class="font-semibold text-emerald-600">{{ money(c.amount) }}</span>
                </li>
              }
            </ul>
          } @else { <p class="py-8 text-center text-sm text-slate-400">Gelir kaydı yok.</p> }
        </div>
        <div class="card overflow-hidden">
          <h3 class="border-b border-slate-100 p-4 text-base font-bold text-slate-800">Gider Kategorileri</h3>
          @if (fin()?.expenseByCategory?.length) {
            <ul class="divide-y divide-slate-50">
              @for (c of fin()!.expenseByCategory; track c.name) {
                <li class="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span class="text-slate-700">{{ c.name }} <span class="text-xs text-slate-400">({{ c.count }})</span></span>
                  <span class="font-semibold text-rose-600">{{ money(c.amount) }}</span>
                </li>
              }
            </ul>
          } @else { <p class="py-8 text-center text-sm text-slate-400">Gider kaydı yok.</p> }
        </div>
      </div>
    }
  `,
})
export class ReportsComponent implements OnInit {
  private api = inject(ReportsApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  protected money = money;
  protected num = num;
  protected term = computed(() => this.auth.profile().terminology);

  protected loading = signal(true);
  protected sales = signal<SalesReportDto | null>(null);
  protected fin = signal<FinancialReportDto | null>(null);
  protected profit = signal<ProfitReportDto | null>(null);

  protected from = signal(ymd(this.addDays(new Date(), -29)));
  protected to = signal(ymd(new Date()));
  protected activePreset = signal<string>('30d');

  protected presets = [
    { key: 'today', label: 'Bugün' },
    { key: 'week', label: 'Bu Hafta' },
    { key: 'month', label: 'Bu Ay' },
    { key: '30d', label: 'Son 30 Gün' },
  ];

  protected net = computed(() => this.fin()?.net ?? 0);
  protected canExport = computed(() => this.auth.user()?.entitlements?.advancedReports ?? false);

  // ---- Gün Sonu (Z) Raporu ----
  protected zDate = signal(ymd(new Date()));
  protected z = signal<DailyCloseDto | null>(null);
  protected zLoading = signal(false);

  protected loadZ(): void {
    this.zLoading.set(true);
    this.api.dailyClose(this.zDate()).subscribe({
      next: (r) => {
        this.z.set(r);
        this.zLoading.set(false);
      },
      error: (e) => {
        this.zLoading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Cari Yaşlandırma (Aging) ----
  protected aging = signal<AgingReportDto | null>(null);
  protected agingLoading = signal(false);

  protected loadAging(): void {
    this.agingLoading.set(true);
    this.api.aging().subscribe({
      next: (r) => {
        this.aging.set(r);
        this.agingLoading.set(false);
      },
      error: (e) => {
        this.agingLoading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Fire / Zayi ----
  protected waste = signal<WasteReportDto | null>(null);
  protected wasteLoading = signal(false);

  protected loadWaste(): void {
    this.wasteLoading.set(true);
    this.api.waste(this.from(), this.to()).subscribe({
      next: (r) => {
        this.waste.set(r);
        this.wasteLoading.set(false);
      },
      error: (e) => {
        this.wasteLoading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** Z raporunu 80mm termal fiş formatında yeni pencerede yazdırır. */
  protected printZ(): void {
    const z = this.z();
    if (!z) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const row = (l: string, r: string, cls = '') => `<div class="row ${cls}"><span>${l}</span><span>${r}</span></div>`;

    let body = '';
    body += row('Satış Adedi', String(z.salesCount));
    body += row('Ara Toplam', money(z.salesSubtotal));
    body += row('KDV', money(z.vatTotal));
    body += row('SATIŞ TOPLAMI', money(z.salesTotal), 'bold big');
    body += '<div class="line"></div><div class="bold">Ödeme Yöntemleri</div>';
    body += z.byPaymentMethod.length
      ? z.byPaymentMethod.map((p) => row(`${esc(p.name)} (${p.count})`, money(p.amount))).join('')
      : '<div class="small">Tahsilat yok</div>';
    body += '<div class="line"></div><div class="bold">Kasalar</div>';
    body += z.cashAccounts.map((a) => row(esc(a.name), `+${money(a.in)} / -${money(a.out)}`)).join('');
    body += '<div class="line"></div>';
    body += row('Gelir', money(z.income));
    body += row('Gider', money(z.expense));
    body += row('NET', money(z.net), 'bold');
    if (z.openOrdersCount > 0) {
      body += `<div class="line"></div>${row('Açık hesap', `${z.openOrdersCount} adet · ${money(z.openOrdersTotal)}`)}`;
    }

    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) return;
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Gün Sonu</title><style>
      body { margin:0; display:flex; justify-content:center; background:#f1f5f9; }
      .receipt { width:80mm; background:#fff; padding:6mm 4mm; font-family:'Courier New',monospace; font-size:12px; line-height:1.5; color:#000; }
      .center { text-align:center; } .bold { font-weight:700; } .big { font-size:14px; } .small { font-size:11px; color:#333; }
      .row { display:flex; justify-content:space-between; gap:8px; }
      .line { border-top:1px dashed #000; margin:6px 0; }
      @media print { body { background:#fff; } @page { margin:4mm; } }
    </style></head><body><div class="receipt">
      <div class="center bold">${esc(this.auth.user()?.tenantName ?? 'CloudPosGrid')}</div>
      <div class="center bold">GÜN SONU (Z) RAPORU</div>
      <div class="center small">${z.date.slice(0, 10)}</div>
      <div class="line"></div>${body}<div class="line"></div>
      <div class="center small">CloudPosGrid ile oluşturuldu</div>
    </div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 350);
  }

  /** Raporu CSV (Excel uyumlu, UTF-8 BOM'lu) olarak indirir — Kurumsal pakete özel. */
  protected exportCsv(): void {
    const s = this.sales();
    if (!s) return;
    const f = this.fin();
    const lines: string[] = [
      'CloudPosGrid Satış Raporu',
      `Aralık;${this.from()} - ${this.to()}`,
      '',
      'Özet;Değer',
      `Satış adedi;${s.salesCount}`,
      `Satış toplamı;${s.salesTotal}`,
      `Ara toplam;${s.salesSubtotal}`,
      `KDV;${s.vatTotal}`,
      `Ortalama sepet;${s.avgBasket}`,
      `Tahmini kâr;${s.estimatedProfit}`,
    ];
    if (f) lines.push(`Gelir;${f.income}`, `Gider;${f.expense}`, `Net;${f.net}`);
    lines.push('', this.section('Ödeme yöntemine göre', s.byPaymentMethod));
    lines.push(this.section('Kategoriye göre', s.byCategory));
    lines.push(this.section('En çok satanlar', s.topProducts));
    lines.push(this.section('Günlük trend', s.dailyTrend));

    const csv = '﻿' + lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapor_${this.from()}_${this.to()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success('Rapor indirildi (CSV).');
  }

  private section(title: string, rows: readonly unknown[] | undefined): string {
    const list = (rows ?? []) as Record<string, unknown>[];
    if (!list.length) return '';
    const cols = Object.keys(list[0]);
    const cell = (v: unknown) => {
      const str = v == null ? '' : String(v);
      return /[;"\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const header = cols.join(';');
    const body = list.map((r) => cols.map((c) => cell(r[c])).join(';')).join('\n');
    return `${title}\n${header}\n${body}\n`;
  }
  protected hasTrend = computed(() => (this.sales()?.dailyTrend ?? []).some((d) => d.total > 0));

  ngOnInit(): void {
    localStorage.setItem('cpg_seen_reports', '1'); // onboarding "Raporlarını keşfet" adımı
    this.load();
  }

  private addDays(d: Date, n: number): Date {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  }

  protected applyPreset(key: string): void {
    this.activePreset.set(key);
    const now = new Date();
    let from = new Date();
    if (key === 'today') from = now;
    else if (key === 'week') {
      const dow = (now.getDay() + 6) % 7; // Pazartesi = 0
      from = this.addDays(now, -dow);
    } else if (key === 'month') from = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (key === '30d') from = this.addDays(now, -29);
    this.from.set(ymd(from));
    this.to.set(ymd(now));
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    forkJoin({
      sales: this.api.sales(this.from(), this.to()),
      fin: this.api.financial(this.from(), this.to()),
      profit: this.api.profit(this.from(), this.to()),
    }).subscribe({
      next: (r) => {
        this.sales.set(r.sales);
        this.fin.set(r.fin);
        this.profit.set(r.profit);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected trendChart = computed<any>(() => {
    const t = this.sales()?.dailyTrend ?? [];
    return {
      series: [{ name: this.term().sale, data: t.map((p) => Math.round(p.total)) }],
      chart: { type: 'area', height: 300, toolbar: { show: false }, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
      colors: ['#2563eb'],
      stroke: { curve: 'smooth', width: 2 },
      fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.05 } },
      dataLabels: { enabled: false },
      grid: { borderColor: '#f1f5f9', strokeDashArray: 4 },
      tooltip: { y: { formatter: (v: number) => num(v) + ' ₺' } },
      xaxis: {
        categories: t.map((p) => p.date.slice(5, 10)),
        labels: { rotate: -45, style: { fontSize: '10px', colors: '#94a3b8' } },
        tickAmount: 10,
      },
      yaxis: { labels: { style: { colors: '#94a3b8' }, formatter: (v: number) => num(v) } },
    };
  });

  protected catChart = computed<any>(() => {
    const c = this.sales()?.byCategory ?? [];
    return {
      series: c.map((x) => Math.round(x.total)),
      labels: c.map((x) => x.category),
      chart: { type: 'donut', height: 300, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
      colors: ['#2563eb', '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899'],
      legend: { position: 'bottom' },
      dataLabels: { enabled: true, formatter: (v: number) => Math.round(v) + '%' },
      plotOptions: { pie: { donut: { size: '60%' } } },
      tooltip: { y: { formatter: (v: number) => num(v) + ' ₺' } },
    };
  });

  protected payChart = computed<any>(() => {
    const p = this.sales()?.byPaymentMethod ?? [];
    return {
      series: p.map((x) => Math.round(x.amount)),
      labels: p.map((x) => x.name),
      chart: { type: 'donut', height: 300, fontFamily: 'Inter, sans-serif', animations: { enabled: false } },
      colors: ['#10b981', '#2563eb', '#f59e0b', '#8b5cf6'],
      legend: { position: 'bottom' },
      dataLabels: { enabled: true, formatter: (v: number) => Math.round(v) + '%' },
      plotOptions: { pie: { donut: { size: '60%' } } },
      tooltip: { y: { formatter: (v: number) => num(v) + ' ₺' } },
    };
  });
}
