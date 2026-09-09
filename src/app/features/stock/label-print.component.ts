import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { StockApi } from '../../core/api/stock.api';
import { SettingsApi } from '../../core/api/settings.api';
import { ProductDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError, money } from '../../core/utils';
import { BarcodeDirective } from '../../shared/barcode.directive';

interface LabelRow {
  product: ProductDto;
  copies: number;
}

/**
 * Barkod etiketi yazdırma (tam sayfa, layout DIŞINDA — fiş yazdırma deseni gibi).
 * Ürün ara/ekle → her ürüne adet ver → 80mm termal tek sütun etiket bas.
 * Ürün ekranından toplu (/etiket) ya da tek ürün (/etiket?id=...) açılır.
 */
@Component({
  selector: 'app-label-print',
  imports: [LucideAngularModule, BarcodeDirective],
  template: `
    <div class="label-page">
      <!-- Kontrol paneli (yazdırmada gizli) -->
      <div class="panel no-print">
        <div class="panel-head">
          <div>
            <h1 class="text-lg font-black tracking-tight text-slate-900">Barkod Etiketi</h1>
            <p class="text-xs text-slate-500">Ürün seç, adet ver, 80mm termal etiket bas.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-outline" (click)="close()">
              <lucide-icon name="arrow-left" class="h-4 w-4"></lucide-icon> Kapat
            </button>
            <button class="btn-primary" [disabled]="!labels().length" (click)="print()">
              <lucide-icon name="printer" class="h-4 w-4"></lucide-icon> Yazdır
            </button>
          </div>
        </div>

        <!-- Arama -->
        <div class="relative mt-3">
          <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
          <input class="input pl-10" placeholder="Ürün adı, SKU veya barkod ara..." (input)="onSearch($any($event.target).value)" />
        </div>

        <!-- Arama sonuçları -->
        @if (loadingSearch()) {
          <p class="mt-2 text-sm text-slate-400">Aranıyor...</p>
        } @else if (searched() && !availableResults().length) {
          <p class="mt-2 text-sm text-slate-400">Sonuç yok.</p>
        } @else if (availableResults().length) {
          <div class="mt-2 max-h-52 divide-y divide-slate-50 overflow-auto rounded-xl border border-slate-100">
            @for (p of availableResults(); track p.id) {
              <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50" (click)="addProduct(p)">
                <span class="min-w-0">
                  <span class="block truncate text-sm font-medium text-slate-800">{{ p.name }}</span>
                  <span class="block truncate text-xs text-slate-400">
                    <span class="font-mono">{{ p.sku }}</span>@if (p.barcode) { · <span class="font-mono">{{ p.barcode }}</span> } @else { · <span class="text-amber-600">barkod yok</span> }
                  </span>
                </span>
                <lucide-icon name="plus" class="h-4 w-4 shrink-0 text-brand-600"></lucide-icon>
              </button>
            }
          </div>
        }

        <!-- Seçilen ürünler -->
        @if (rows().length) {
          <div class="mt-4">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-semibold text-slate-700">Seçilenler ({{ rows().length }})</span>
              <button type="button" class="text-xs text-rose-600 hover:underline" (click)="clearAll()">Tümünü temizle</button>
            </div>
            <div class="space-y-2">
              @for (r of rows(); track r.product.id) {
                <div class="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2">
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-sm font-medium text-slate-800">{{ r.product.name }}</span>
                    <span class="block truncate text-xs text-slate-400">
                      @if (r.product.barcode) { <span class="font-mono">{{ r.product.barcode }}</span> } @else {
                        <span class="text-amber-600">barkodsuz — </span>
                        <button type="button" class="font-semibold text-brand-600 hover:underline disabled:opacity-50" [disabled]="generatingId() === r.product.id" (click)="generateBarcodeFor(r)">{{ generatingId() === r.product.id ? 'üretiliyor…' : 'barkod üret' }}</button>
                      }
                    </span>
                  </span>
                  <input type="number" min="1" [max]="MAX_LABELS" class="input w-20 text-center" [value]="r.copies" (input)="setCopies(r.product.id, +$any($event.target).value)" />
                  <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Kaldır" (click)="removeRow(r.product.id)">
                    <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          </div>
        } @else {
          <p class="mt-4 rounded-xl bg-slate-50 px-3 py-3 text-center text-sm text-slate-400">Henüz ürün eklenmedi. Yukarıdan arayıp ekleyin.</p>
        }

        <!-- Etiket seçenekleri -->
        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" [checked]="showName()" (change)="showName.set($any($event.target).checked)" class="rounded text-brand-600" /> Ürün adı
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" [checked]="showPrice()" (change)="showPrice.set($any($event.target).checked)" class="rounded text-brand-600" /> Fiyat
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" [checked]="showStoreName()" (change)="showStoreName.set($any($event.target).checked)" class="rounded text-brand-600" /> İşletme adı
          </label>
        </div>

        <!-- Toplam sayaç + tavan uyarısı -->
        <div class="mt-3 text-sm" [class.text-rose-600]="overCap()" [class.text-slate-500]="!overCap()">
          Toplam <b>{{ totalLabels() }}</b> etiket.
          @if (overCap()) { <span>— en fazla {{ MAX_LABELS }} basılabilir, adetleri azaltın.</span> }
        </div>
      </div>

      <!-- Baskı alanı: her etiket 80mm, alt alta -->
      <div class="print-area">
        @for (p of labels(); track $index) {
          <div class="label">
            @if (showStoreName()) { <div class="store">{{ storeName() }}</div> }
            @if (showName()) { <div class="pname">{{ p.name }}</div> }
            @if (p.barcode) { <svg [appBarcode]="p.barcode!"></svg> }
            @if (showPrice()) { <div class="price">{{ money(p.salePrice) }}</div> }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .label-page { display:flex; flex-direction:column; align-items:center; gap:1rem; padding:1.5rem 1rem; background:#f1f5f9; min-height:100vh; }
    .panel { width:100%; max-width:32rem; background:#fff; border:1px solid #e2e8f0; border-radius:1rem; padding:1rem; box-shadow:0 1px 8px rgba(0,0,0,.06); }
    .panel-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
    .print-area { display:flex; flex-direction:column; align-items:center; gap:6px; width:100%; }
    .label { width:80mm; max-width:100%; background:#fff; padding:3mm; text-align:center; box-shadow:0 1px 6px rgba(0,0,0,.12); page-break-inside:avoid; }
    .label .store { font-size:11px; font-weight:600; color:#000; margin-bottom:1px; }
    .label .pname { font-size:13px; font-weight:700; color:#000; margin:1px 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .label svg { display:block; margin:2px auto 0; max-width:100%; height:auto; }
    .label .price { font-size:16px; font-weight:800; color:#000; margin-top:2px; }
    @media print {
      .no-print { display:none !important; }
      .label-page { background:#fff; padding:0; gap:0; min-height:0; display:block; }
      .print-area { display:block; gap:0; }
      .label { box-shadow:none; margin:0 auto; padding:2mm 3mm; }
      @page { margin:3mm; }
    }
  `],
})
export class LabelPrintComponent implements OnInit {
  private api = inject(StockApi);
  private settingsApi = inject(SettingsApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected money = money;
  protected readonly MAX_LABELS = 200;

  protected rows = signal<LabelRow[]>([]);
  protected searchResults = signal<ProductDto[]>([]);
  protected loadingSearch = signal(false);
  protected searched = signal(false);
  protected showPrice = signal(true);
  protected showName = signal(true);
  protected showStoreName = signal(false);
  protected storeName = signal('');
  protected generatingId = signal<string | null>(null);

  private searchTimer?: ReturnType<typeof setTimeout>;

  /** İstenen toplam adet (tavandan bağımsız — uyarı için). */
  protected totalLabels = computed(() => this.rows().reduce((n, r) => n + Math.max(0, r.copies), 0));
  protected overCap = computed(() => this.totalLabels() > this.MAX_LABELS);

  /** Basılacak düz etiket listesi: her ürün adet kadar, toplam MAX_LABELS ile sınırlı. */
  protected labels = computed<ProductDto[]>(() => {
    const out: ProductDto[] = [];
    for (const r of this.rows()) {
      const n = Math.min(Math.max(0, Math.floor(r.copies || 0)), this.MAX_LABELS);
      for (let i = 0; i < n && out.length < this.MAX_LABELS; i++) out.push(r.product);
    }
    return out;
  });

  private chosenIds = computed(() => new Set(this.rows().map((r) => r.product.id)));
  /** Arama sonuçlarından zaten eklenmiş olanları çıkar. */
  protected availableResults = computed(() => {
    const chosen = this.chosenIds();
    return this.searchResults().filter((p) => !chosen.has(p.id));
  });

  ngOnInit(): void {
    this.settingsApi.get().subscribe({
      next: (s) => this.storeName.set(s.companyName || 'CloudPosGrid'),
      error: () => this.storeName.set('CloudPosGrid'),
    });
    // Ürün satırından hızlı giriş: /etiket?id=... → o ürünü önceden seç (otomatik yazdırma YOK).
    const id = this.route.snapshot.queryParamMap.get('id');
    if (id) {
      this.api.getProduct(id).subscribe({
        next: (p) => this.rows.set([{ product: p, copies: 1 }]),
        error: () => {},
      });
    }
  }

  protected onSearch(v: string): void {
    clearTimeout(this.searchTimer);
    const q = (v ?? '').trim();
    if (!q) {
      this.searchResults.set([]);
      this.searched.set(false);
      return;
    }
    this.searchTimer = setTimeout(() => this.doSearch(q), 300);
  }

  private doSearch(q: string): void {
    this.loadingSearch.set(true);
    this.api.getProducts({ page: 1, pageSize: 100, search: q }).subscribe({
      next: (r) => {
        this.searchResults.set(r.items);
        this.loadingSearch.set(false);
        this.searched.set(true);
      },
      error: () => {
        this.loadingSearch.set(false);
        this.searched.set(true);
      },
    });
  }

  protected addProduct(p: ProductDto): void {
    if (this.rows().some((r) => r.product.id === p.id)) return; // çift ekleme yok
    this.rows.update((rs) => [...rs, { product: p, copies: 1 }]);
  }

  protected setCopies(id: string, n: number): void {
    const clamped = Math.max(1, Math.min(this.MAX_LABELS, Math.floor(n || 1)));
    this.rows.update((rs) => rs.map((r) => (r.product.id === id ? { ...r, copies: clamped } : r)));
  }

  protected removeRow(id: string): void {
    this.rows.update((rs) => rs.filter((r) => r.product.id !== id));
  }

  protected clearAll(): void {
    this.rows.set([]);
  }

  /** Barkodsuz satır için dahili barkod üret (backend, benzersiz) → satırı güncelle; etiket svg'si otomatik çizilir. */
  protected generateBarcodeFor(row: LabelRow): void {
    const id = row.product.id;
    if (this.generatingId()) return;
    this.generatingId.set(id);
    this.api.generateBarcode(id).subscribe({
      next: (updated) => {
        this.generatingId.set(null);
        this.rows.update((rs) => rs.map((r) => (r.product.id === id ? { ...r, product: updated } : r)));
        this.toast.success('Barkod üretildi: ' + updated.barcode);
      },
      error: (e) => {
        this.generatingId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }

  protected print(): void {
    if (!this.labels().length) {
      this.toast.error('Yazdırılacak etiket yok. Önce ürün ekleyin.');
      return;
    }
    if (this.overCap()) {
      this.toast.error(`En fazla ${this.MAX_LABELS} etiket yazdırabilirsiniz. Adetleri azaltın.`);
      return;
    }
    window.print();
  }

  protected close(): void {
    this.router.navigate(['/stok/urunler']);
  }
}
