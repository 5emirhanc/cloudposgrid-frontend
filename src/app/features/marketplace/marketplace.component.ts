import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { MarketplaceApi } from '../../core/api/marketplace.api';
import { StockApi } from '../../core/api/stock.api';
import { MarketplaceConnectionDto, MarketplaceListingDto, ProductDto } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { ListingWizardComponent } from './listing-wizard.component';
import { apiError, formatDate } from '../../core/utils';

@Component({
  selector: 'app-marketplace',
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink, ListingWizardComponent],
  template: `
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Pazaryeri Bağlantıları</h1>
        <p class="text-sm text-slate-500">Trendyol ile stok ve sipariş senkronizasyonu</p>
      </div>
    </div>

    @if (!enabled()) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <lucide-icon name="shopping-cart" class="h-7 w-7"></lucide-icon>
        </span>
        <h2 class="text-lg font-black text-slate-900">Pazaryeri entegrasyonu Zincir pakete özel</h2>
        <p class="max-w-md text-sm text-slate-500">
          Trendyol ile <b>tek stok</b> (aşırı satış önleme) ve pazaryeri siparişlerinin uygulamaya akması
          <b>Zincir</b> pakette açılır.
        </p>
        <a routerLink="/yukselt" class="btn-primary mt-1">
          <lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> Zincir'e Yükselt
        </a>
      </div>
    } @else {

    <div class="mb-4 flex gap-2 border-b border-slate-100">
      <button class="px-3 py-2 text-sm font-semibold" [class.text-brand-600]="tab() === 'conn'"
              [class.border-b-2]="tab() === 'conn'" [class.border-brand-600]="tab() === 'conn'"
              [class.text-slate-500]="tab() !== 'conn'" (click)="tab.set('conn')">Bağlantılar</button>
      <button class="px-3 py-2 text-sm font-semibold" [class.text-brand-600]="tab() === 'map'"
              [class.border-b-2]="tab() === 'map'" [class.border-brand-600]="tab() === 'map'"
              [class.text-slate-500]="tab() !== 'map'" (click)="tab.set('map')">Ürün Eşleştirme</button>
      <button class="px-3 py-2 text-sm font-semibold" [class.text-brand-600]="tab() === 'listing'"
              [class.border-b-2]="tab() === 'listing'" [class.border-brand-600]="tab() === 'listing'"
              [class.text-slate-500]="tab() !== 'listing'" (click)="tab.set('listing')">İlanlar</button>
    </div>

    @if (tab() === 'conn') {
      <!-- Yeni bağlantı formu -->
      @if (!connections().length || formOpen()) {
        <div class="card mb-4 p-4">
          <h2 class="mb-3 font-semibold text-slate-700">Pazaryeri Bağlantısı</h2>
          <form [formGroup]="form" (ngSubmit)="saveConnection()" class="grid gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Pazaryeri</label>
              <select class="select" formControlName="channel">
                <option value="Trendyol">Trendyol</option>
                <option value="Hepsiburada">Hepsiburada</option>
              </select>
            </div>
            <div>
              <label class="label">Satıcı ID {{ form.controls.channel.value === 'Hepsiburada' ? '(Merchant ID)' : '' }}</label>
              <input class="input" formControlName="supplierId" placeholder="Satıcı / Merchant ID" />
            </div>
            <div>
              <label class="label">API Key</label>
              <input class="input" formControlName="apiKey" placeholder="API anahtarı" />
            </div>
            <div>
              <label class="label">API Secret</label>
              <input class="input" formControlName="apiSecret" type="password" placeholder="API gizli anahtarı" />
            </div>
            <div>
              <label class="label">Komisyon (%)</label>
              <input class="input" type="number" step="0.1" min="0" max="100" formControlName="commissionRate" placeholder="Ör. 18" />
            </div>
            <div>
              <label class="label">Kargo (₺ / sipariş)</label>
              <input class="input" type="number" step="0.01" min="0" formControlName="shippingCost" placeholder="Ör. 45" />
            </div>
            <p class="text-xs text-slate-400 sm:col-span-2">
              Komisyon ve kargo, Kâr-Zarar raporunda bu kanalın kârından düşülür → <b>net kâr</b> görürsünüz. Sonradan değiştirilebilir.
            </p>
            <div class="flex items-end gap-2">
              <button class="btn-primary" [disabled]="saving()">
                <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Kaydet
              </button>
              @if (connections().length) { <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button> }
            </div>
          </form>
        </div>
      }

      <div class="card overflow-hidden">
        @if (loading()) {
          <p class="py-10 text-center text-sm text-slate-400">Yükleniyor...</p>
        } @else if (!connections().length) {
          <p class="py-10 text-center text-sm text-slate-400">Henüz bağlantı yok. Yukarıdan Trendyol kimliğinizi girin.</p>
        } @else {
          <ul class="divide-y divide-slate-50">
            @for (con of connections(); track con.id) {
              <li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p class="font-semibold text-slate-800">{{ con.channel }} <span class="text-xs text-slate-400">· {{ con.supplierId }}</span></p>
                  <p class="text-xs text-slate-400">
                    @if (con.lastStatus === 'error') { <span class="text-rose-600">Hata: {{ con.lastMessage }}</span> }
                    @else if (con.lastOrderSyncAt) { Son senkron: {{ formatDate(con.lastOrderSyncAt) }} · {{ con.lastMessage }} }
                    @else { Henüz senkronize edilmedi }
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500">
                    Kesinti: komisyon %{{ con.commissionRate }} · kargo ₺{{ con.shippingCost }} / sipariş
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  @if (con.isActive) { <span class="badge-green">Aktif</span> } @else { <span class="badge-gray">Pasif</span> }
                  <button class="btn-outline" [disabled]="busy()" (click)="openFees(con)">
                    <lucide-icon name="circle-dollar-sign" class="h-4 w-4"></lucide-icon> Kesintiler
                  </button>
                  <button class="btn-outline" [disabled]="busy()" (click)="test(con)">
                    <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Test
                  </button>
                  <button class="btn-primary" [disabled]="busy()" (click)="sync(con)">
                    <lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon> Şimdi Senkronize Et
                  </button>
                  <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="removeConnection(con)">
                    <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                  </button>
                </div>

                @if (feeEditId() === con.id) {
                  <div class="w-full border-t border-slate-100 pt-3">
                    <div class="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label class="label">Komisyon (%)</label>
                        <input type="number" step="0.1" min="0" max="100" class="input"
                               [value]="feeRate()" (input)="feeRate.set(+$any($event.target).value)" />
                      </div>
                      <div>
                        <label class="label">Kargo (₺ / sipariş)</label>
                        <input type="number" step="0.01" min="0" class="input"
                               [value]="feeShipping()" (input)="feeShipping.set(+$any($event.target).value)" />
                      </div>
                      <div class="flex items-end gap-2">
                        <button type="button" class="btn-primary" [disabled]="busy()" (click)="saveFees(con)">Kaydet</button>
                        <button type="button" class="btn-ghost" (click)="feeEditId.set(null)">Vazgeç</button>
                      </div>
                    </div>
                    <p class="mt-2 text-xs text-slate-400">
                      Kâr-Zarar raporunda bu kanalın kârından düşülür (komisyon ciro üzerinden, kargo sipariş başına) → net kâr.
                    </p>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </div>
    }

    @if (tab() === 'map') {
      <div class="mb-4 flex items-center justify-between gap-3">
        <p class="text-sm text-slate-500">Barkodu olan ürünler Trendyol ilanınızla barkoddan eşleşir.</p>
        <button class="btn-primary" [disabled]="busy()" (click)="autoMatch()">
          <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Otomatik Eşleştir
        </button>
      </div>
      <div class="card overflow-hidden">
        @if (!listings().length) {
          <p class="py-10 text-center text-sm text-slate-400">Henüz eşleştirme yok. "Otomatik Eşleştir" ile başlayın.</p>
        } @else {
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr><th class="table-th">Ürün</th><th class="table-th">Ürün Barkodu</th><th class="table-th">Pazaryeri Barkodu</th><th class="table-th"></th></tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (l of listings(); track l.id) {
                <tr [class.opacity-50]="!l.isActive">
                  <td class="table-td font-medium text-slate-800">{{ l.productName }}</td>
                  <td class="table-td text-slate-500">{{ l.productBarcode || '—' }}</td>
                  <td class="table-td">
                    <input class="input h-8 w-40" [value]="l.marketplaceBarcode" (blur)="editBarcode(l, $any($event.target).value)" />
                  </td>
                  <td class="table-td text-right">
                    <button class="icon-btn" [title]="l.isActive ? 'Pasifleştir' : 'Aktifleştir'" (click)="toggleListing(l)">
                      <lucide-icon [name]="l.isActive ? 'eye' : 'eye-off'" class="h-4 w-4"></lucide-icon>
                    </button>
                    <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="removeListing(l)">
                      <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }

    @if (tab() === 'listing') {
      <div class="mb-4 flex items-center justify-between gap-3">
        <p class="text-sm text-slate-500">Ürünleri tek tuşla Trendyol'da ilan aç; durum burada güncellenir (onay Trendyol'da).</p>
        <button class="btn-outline" (click)="load()"><lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon> Yenile</button>
      </div>
      <div class="card overflow-hidden">
        @if (!listings().length) {
          <p class="py-10 text-center text-sm text-slate-400">Henüz eşleştirme/ilan yok. "Ürün Eşleştirme" veya Ürünler ekranından başlayın.</p>
        } @else {
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr><th class="table-th">Ürün</th><th class="table-th">Barkod</th><th class="table-th">İlan Durumu</th><th class="table-th"></th></tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (l of listings(); track l.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td font-medium text-slate-800">{{ l.productName }}</td>
                  <td class="table-td text-slate-500">{{ l.marketplaceBarcode }}</td>
                  <td class="table-td">
                    @switch (l.listingStatus) {
                      @case ('Approved') { <span class="badge-green">Yayında</span> }
                      @case ('Submitted') { <span class="badge-amber">Onay bekleniyor</span> }
                      @case ('Rejected') { <span class="badge-red" [title]="l.listingError || ''">Reddedildi</span> }
                      @case ('Failed') { <span class="badge-red" [title]="l.listingError || ''">Hata</span> }
                      @default { <span class="badge-gray">İlan açılmadı</span> }
                    }
                  </td>
                  <td class="table-td text-right">
                    @if (l.listingStatus === 'Submitted' || l.listingStatus === 'Approved') {
                      <span class="text-xs text-slate-400">—</span>
                    } @else {
                      <button class="btn-primary btn-sm" [disabled]="opening()" (click)="openListing(l.productId)">
                        <lucide-icon name="store" class="h-4 w-4"></lucide-icon>
                        {{ l.listingStatus === 'External' ? 'İlan Aç' : 'Tekrar Gönder' }}
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    }

    @if (listingProduct(); as lp) {
      <app-listing-wizard [product]="lp" (closed)="onListingClosed($event)" />
    }

    }
  `,
  styles: [`.icon-btn { border-radius:.5rem; padding:.5rem; color:#94a3b8; } .icon-btn:hover { background:#f1f5f9; color:#334155; }`],
})
export class MarketplaceComponent implements OnInit {
  private api = inject(MarketplaceApi);
  private stockApi = inject(StockApi);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected formatDate = formatDate;
  protected enabled = computed(() => this.auth.user()?.entitlements?.marketplaceIntegration ?? false);
  protected tab = signal<'conn' | 'map' | 'listing'>('conn');
  protected loading = signal(true);
  protected saving = signal(false);
  protected busy = signal(false);
  protected formOpen = signal(false);
  protected connections = signal<MarketplaceConnectionDto[]>([]);
  protected listings = signal<MarketplaceListingDto[]>([]);
  protected opening = signal(false);
  protected listingProduct = signal<ProductDto | null>(null);

  protected form = this.fb.nonNullable.group({
    channel: ['Trendyol', Validators.required],
    supplierId: ['', Validators.required],
    apiKey: ['', Validators.required],
    apiSecret: ['', Validators.required],
    commissionRate: [0],
    shippingCost: [0],
  });

  // Mevcut bağlantının kesintilerini (komisyon/kargo) satır içinde düzenleme.
  protected feeEditId = signal<string | null>(null);
  protected feeRate = signal(0);
  protected feeShipping = signal(0);

  ngOnInit(): void {
    if (this.enabled()) this.load();
    else this.loading.set(false);
  }

  protected load(): void {
    this.loading.set(true);
    this.api.listConnections().subscribe({
      next: (c) => { this.connections.set(c); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.api.listListings().subscribe({ next: (l) => this.listings.set(l), error: () => {} });
  }

  protected saveConnection(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api.createConnection({
      channel: v.channel, supplierId: v.supplierId, apiKey: v.apiKey, apiSecret: v.apiSecret,
      commissionRate: +v.commissionRate || 0, shippingCost: +v.shippingCost || 0,
    }).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.form.reset({ channel: 'Trendyol' }); this.toast.success('Bağlantı eklendi.'); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.error(apiError(e)); },
    });
  }

  /** Satır içi kesinti düzenleyiciyi açar (mevcut değerlerle doldurur). */
  protected openFees(con: MarketplaceConnectionDto): void {
    this.feeRate.set(con.commissionRate ?? 0);
    this.feeShipping.set(con.shippingCost ?? 0);
    this.feeEditId.set(con.id);
  }

  /** Komisyon/kargo günceller. ApiKey/ApiSecret null gönderilir → sunucu mevcut kimliği korur. */
  protected saveFees(con: MarketplaceConnectionDto): void {
    this.busy.set(true);
    this.api.updateConnection(con.id, {
      supplierId: con.supplierId,
      apiKey: null,
      apiSecret: null,
      isActive: con.isActive,
      commissionRate: +this.feeRate() || 0,
      shippingCost: +this.feeShipping() || 0,
    }).subscribe({
      next: () => { this.busy.set(false); this.feeEditId.set(null); this.toast.success('Kesintiler güncellendi.'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected test(con: MarketplaceConnectionDto): void {
    this.busy.set(true);
    this.api.testConnection(con.id).subscribe({
      next: (r) => { this.busy.set(false); r.success ? this.toast.success(r.message) : this.toast.error(r.message); },
      error: (e) => { this.busy.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected sync(con: MarketplaceConnectionDto): void {
    this.busy.set(true);
    this.api.syncNow(con.id).subscribe({
      next: (r) => { this.busy.set(false); this.toast.success(r.message); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected async removeConnection(con: MarketplaceConnectionDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `${con.channel} bağlantısı silinsin mi? Eşleştirmeler de silinir.`, danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteConnection(con.id).subscribe({ next: () => { this.toast.success('Silindi.'); this.load(); }, error: (e) => this.toast.error(apiError(e)) });
  }

  protected autoMatch(): void {
    this.busy.set(true);
    this.api.autoMatch().subscribe({
      next: (r) => { this.busy.set(false); this.toast.success(`${r.matched} ürün otomatik eşleştirildi.`); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected editBarcode(l: MarketplaceListingDto, value: string): void {
    const barcode = (value ?? '').trim();
    if (!barcode || barcode === l.marketplaceBarcode) return;
    this.api.updateListing(l.id, { marketplaceBarcode: barcode, isActive: l.isActive }).subscribe({
      next: () => { this.toast.success('Barkod güncellendi.'); this.load(); },
      error: (e) => { this.toast.error(apiError(e)); this.load(); },
    });
  }

  protected toggleListing(l: MarketplaceListingDto): void {
    this.api.updateListing(l.id, { marketplaceBarcode: l.marketplaceBarcode, isActive: !l.isActive }).subscribe({
      next: () => this.load(), error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected async removeListing(l: MarketplaceListingDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${l.productName}" eşleştirmesi silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteListing(l.id).subscribe({ next: () => this.load(), error: (e) => this.toast.error(apiError(e)) });
  }

  // ---- İlan açma sihirbazı ----
  protected openListing(productId: string): void {
    this.opening.set(true);
    this.stockApi.getProduct(productId).subscribe({
      next: (p) => { this.opening.set(false); this.listingProduct.set(p); },
      error: (e) => { this.opening.set(false); this.toast.error(apiError(e)); },
    });
  }
  protected onListingClosed(submitted: boolean): void {
    this.listingProduct.set(null);
    if (submitted) this.load();
  }
}
