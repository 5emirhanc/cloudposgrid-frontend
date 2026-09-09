import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { MarketplaceApi } from '../../core/api/marketplace.api';
import { AuthService } from '../../core/auth.service';
import { MarketplaceOrderDto, MarketplaceSyncStatus } from '../../core/models';
import { formatDate, money } from '../../core/utils';

@Component({
  selector: 'app-marketplace-orders',
  imports: [LucideAngularModule, RouterLink],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-black tracking-tight text-slate-900">Pazaryeri Siparişleri</h1>
      <p class="text-sm text-slate-500">Trendyol'dan çekilen siparişler otomatik satışa ve stok düşümüne dönüşür</p>
    </div>

    @if (!enabled()) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <lucide-icon name="shopping-cart" class="h-7 w-7"></lucide-icon>
        </span>
        <h2 class="text-lg font-black text-slate-900">Pazaryeri entegrasyonu Zincir pakete özel</h2>
        <p class="max-w-md text-sm text-slate-500">Trendyol siparişlerinin uygulamaya akması <b>Zincir</b> pakette açılır.</p>
        <a routerLink="/yukselt" class="btn-primary mt-1"><lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> Zincir'e Yükselt</a>
      </div>
    } @else {

    <div class="mb-4 flex flex-wrap gap-2">
      @for (f of filters; track f.value) {
        <button class="rounded-lg px-3 py-1.5 text-sm font-medium"
                [class.bg-brand-600]="status() === f.value" [class.text-white]="status() === f.value"
                [class.bg-slate-100]="status() !== f.value" [class.text-slate-600]="status() !== f.value"
                (click)="setStatus(f.value)">{{ f.label }}</button>
      }
    </div>

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor...</p>
      } @else if (!items().length) {
        <p class="py-10 text-center text-sm text-slate-400">Sipariş bulunamadı.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Sipariş No</th><th class="table-th">Müşteri</th><th class="table-th">Kanal</th>
                <th class="table-th text-right">Tutar</th><th class="table-th">Tarih</th><th class="table-th">Durum</th><th class="table-th"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (o of items(); track o.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td font-medium text-slate-800">{{ o.marketplaceOrderNumber }}</td>
                  <td class="table-td">{{ o.buyerName || '—' }}</td>
                  <td class="table-td text-slate-500">{{ o.channel }}</td>
                  <td class="table-td text-right font-medium">{{ money(o.grandTotal) }}</td>
                  <td class="table-td text-slate-500">{{ formatDate(o.orderDate) }}</td>
                  <td class="table-td">
                    @switch (o.syncStatus) {
                      @case ('Imported') { <span class="badge-green">İçe alındı</span> }
                      @case ('NeedsMapping') { <span class="badge-amber" [title]="o.syncError || ''">Eşleşme gerekiyor</span> }
                      @case ('Error') { <span class="badge-red" [title]="o.syncError || ''">Hata</span> }
                      @case ('Pending') { <span class="badge-gray">İşleniyor</span> }
                      @case ('Cancelled') { <span class="badge-gray">İptal/İade</span> }
                    }
                  </td>
                  <td class="table-td text-right">
                    @if (o.invoiceId) {
                      <a [routerLink]="['/faturalar', o.invoiceId]" class="text-sm font-medium text-brand-600 hover:underline">Fatura</a>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
            <button class="btn-ghost" [disabled]="page() <= 1" (click)="go(page() - 1)">Önceki</button>
            <span class="text-slate-500">{{ page() }} / {{ totalPages() }}</span>
            <button class="btn-ghost" [disabled]="page() >= totalPages()" (click)="go(page() + 1)">Sonraki</button>
          </div>
        }
      }
    </div>
    }
  `,
})
export class MarketplaceOrdersComponent implements OnInit {
  private api = inject(MarketplaceApi);
  private auth = inject(AuthService);
  protected enabled = computed(() => this.auth.user()?.entitlements?.marketplaceIntegration ?? false);
  protected money = money;
  protected formatDate = formatDate;

  protected readonly filters: { label: string; value: '' | MarketplaceSyncStatus }[] = [
    { label: 'Tümü', value: '' },
    { label: 'İçe alınan', value: 'Imported' },
    { label: 'Eşleşme gerekiyor', value: 'NeedsMapping' },
    { label: 'Hata', value: 'Error' },
    { label: 'İptal/İade', value: 'Cancelled' },
  ];
  private readonly pageSize = 20;
  protected loading = signal(true);
  protected items = signal<MarketplaceOrderDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected status = signal<'' | MarketplaceSyncStatus>('');
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  ngOnInit(): void { if (this.enabled()) this.load(); else this.loading.set(false); }

  private load(): void {
    this.loading.set(true);
    this.api.getOrders({ page: this.page(), pageSize: this.pageSize, syncStatus: this.status() }).subscribe({
      next: (r) => { this.items.set(r.items); this.total.set(r.total); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  protected setStatus(s: '' | MarketplaceSyncStatus): void { this.status.set(s); this.page.set(1); this.load(); }
  protected go(p: number): void { this.page.set(p); this.load(); }
}
