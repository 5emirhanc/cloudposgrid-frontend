import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { StockApi } from '../../core/api/stock.api';
import { ReplenishmentItemDto } from '../../core/models';
import { money } from '../../core/utils';

/**
 * Akıllı stok tahminleme ekranı ("Sipariş Önerisi"): satış hızına göre yakında tükenecek ürünleri,
 * kaç gün kaldığını ve önerilen sipariş miktarını listeler.
 */
@Component({
  selector: 'app-replenishment',
  imports: [LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Sipariş Önerisi</h1>
        <p class="text-sm text-slate-500">Son {{ windowDays }} günlük satış hızına göre tükenme riski taşıyan ürünler.</p>
      </div>
      <div class="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        @for (h of horizons; track h) {
          <button class="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
                  [class]="horizon() === h ? 'bg-brand-600 text-white' : 'text-slate-600'"
                  (click)="setHorizon(h)">{{ h }} gün</button>
        }
      </div>
    </div>

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Hesaplanıyor…</p>
      } @else if (!items().length) {
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <lucide-icon name="check" class="h-6 w-6"></lucide-icon>
          </span>
          <p class="text-sm font-medium text-slate-600">Önümüzdeki {{ horizon() }} günde tükenme riski taşıyan ürün yok 👍</p>
          <p class="text-xs text-slate-400">Satış geçmişi biriktikçe öneriler burada belirir.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Ürün</th>
                <th class="table-th text-right">Mevcut Stok</th>
                <th class="table-th text-right">Günlük Satış</th>
                <th class="table-th text-center">Kalan Süre</th>
                <th class="table-th text-right">Önerilen Sipariş</th>
                <th class="table-th text-right">Satış Fiyatı</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (r of items(); track r.productId) {
                <tr class="cursor-pointer hover:bg-slate-50/60" (click)="goProduct(r)">
                  <td class="table-td">
                    <span class="block font-medium text-slate-800">{{ r.productName }}</span>
                    @if (r.categoryName) { <span class="block text-xs text-slate-400">{{ r.categoryName }}</span> }
                  </td>
                  <td class="table-td text-right text-slate-600">{{ r.currentStock }} {{ r.unit }}</td>
                  <td class="table-td text-right text-slate-600">{{ r.dailyVelocity }} {{ r.unit }}/gün</td>
                  <td class="table-td text-center">
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="daysClass(r.daysUntilStockout)">
                      {{ r.daysUntilStockout }} gün
                    </span>
                  </td>
                  <td class="table-td text-right font-bold text-brand-600">{{ r.suggestedReorderQty }} {{ r.unit }}</td>
                  <td class="table-td text-right text-slate-500">{{ money(r.salePrice) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class ReplenishmentComponent implements OnInit {
  private api = inject(StockApi);
  private router = inject(Router);
  protected money = money;
  protected readonly windowDays = 30;
  protected readonly horizons = [7, 14, 30];

  protected loading = signal(true);
  protected items = signal<ReplenishmentItemDto[]>([]);
  protected horizon = signal(7);

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.api.getReplenishment({ windowDays: this.windowDays, horizonDays: this.horizon() }).subscribe({
      next: (r) => { this.items.set(r ?? []); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected setHorizon(h: number): void { this.horizon.set(h); this.load(); }

  protected daysClass(days: number): string {
    if (days <= 3) return 'bg-rose-100 text-rose-700';
    if (days <= 7) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  }

  protected goProduct(r: ReplenishmentItemDto): void {
    this.router.navigate(['/stok/urunler'], { queryParams: { q: r.productName } });
  }
}
