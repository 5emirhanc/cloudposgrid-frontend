import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { StockApi } from '../../core/api/stock.api';
import { ProductDto, StockCountHistoryDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AuthService } from '../../core/auth.service';
import { BranchStore } from '../../core/branch.store';
import { BarcodeScannerService } from '../../core/barcode-scanner.service';
import { BarcodeCameraComponent, barcodeCameraSupported } from '../../shared/barcode-camera.component';
import { PageHelpComponent } from '../../shared/page-help.component';
import { apiError, num, stockOf } from '../../core/utils';

interface CountRow {
  product: ProductDto;
  counted: number;
}

/**
 * Stok Sayımı: barkod okutarak (kamera / el okuyucu / manuel) veya arayarak ürün ekle,
 * sayılan miktarı gir, sistem-vs-sayılan farkını gör, tek tuşla uygula → fark için Adjustment hareketi.
 * Kısmi sayım: yalnız listedeki ürünler düzeltilir. Taslak SUNUCUDA tutulur (cihaz/kullanıcı arası devam) +
 * localStorage'a da yazılır (anında yerel dayanıklılık / çevrimdışı yedek). Uygulanınca geçmiş kaydı olur.
 */
@Component({
  selector: 'app-stock-count',
  imports: [LucideAngularModule, BarcodeCameraComponent, PageHelpComponent],
  template: `
    <app-page-help key="stock-count" title="Fiziksel stoğu okutarak sayın, sistemle farkı otomatik düzeltin">
      <li>Barkodu okutun (kamera/el okuyucu) ya da arayıp ekleyin</li>
      <li>Aynı ürünü tekrar okutmak sayılan adedi +1 artırır</li>
      <li>"Sayımı Uygula" ile fark olan ürünlerin stoğu sayılan değere ayarlanır</li>
      <li>Listede olmayan ürünlere dokunulmaz (kısmi sayım)</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Stok Sayımı</h1>
        <p class="text-sm text-slate-500">Barkod okutarak envanter — sistemle farkı düzeltir</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-outline" (click)="toggleHistory()">
          <lucide-icon name="clipboard-list" class="h-4 w-4"></lucide-icon> Geçmiş
        </button>
        @if (rows().length) {
          <button class="btn-outline" (click)="clearAll()">
            <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon> Temizle
          </button>
        }
        <button class="btn-primary" [disabled]="!rows().length || applying() || mustPickBranch()" (click)="apply()">
          <lucide-icon name="clipboard-list" class="h-4 w-4"></lucide-icon>
          {{ applying() ? 'Uygulanıyor…' : 'Sayımı Uygula' }}
        </button>
      </div>
    </div>

    @if (mustPickBranch()) {
      <div class="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
        Çok şubeli işletmede stok sayımı bir şubeye özeldir. Üstten sayacağınız şubeyi seçin.
      </div>
    }

    <!-- Okut / ara -->
    <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
      <div class="relative min-w-[180px] flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-10" placeholder="Ürün adı / SKU ile ara ve ekle..." [value]="searchTerm()" (input)="onSearch($any($event.target).value)" />
      </div>
      <div class="relative min-w-[180px] flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-10" placeholder="Barkod okut / yaz (Enter)" [value]="barcodeInput()" (input)="barcodeInput.set($any($event.target).value)" (keyup.enter)="onManualBarcode()" />
      </div>
      @if (cameraSupported) {
        <button class="btn-outline shrink-0" (click)="cameraOpen.set(true)" title="Kamerayla okut">
          <lucide-icon name="camera" class="h-4 w-4"></lucide-icon> Kamera
        </button>
      }
    </div>

    <!-- Arama sonuçları -->
    @if (availableResults().length) {
      <div class="card mb-4 max-h-52 divide-y divide-slate-50 overflow-auto p-0">
        @for (p of availableResults(); track p.id) {
          <button type="button" class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50" (click)="addFromSearch(p)">
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-slate-800">{{ p.name }}</span>
              <span class="block truncate text-xs text-slate-400"><span class="font-mono">{{ p.sku }}</span> · stok {{ num(stockOf(p)) }} {{ p.unit }}</span>
            </span>
            <lucide-icon name="plus" class="h-4 w-4 shrink-0 text-brand-600"></lucide-icon>
          </button>
        }
      </div>
    }

    <!-- Sayım tablosu -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Ürün</th>
              <th class="table-th text-right">Sistem</th>
              <th class="table-th text-right">Sayılan</th>
              <th class="table-th text-right">Fark</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (!rows().length) {
              <tr><td colspan="5" class="py-10 text-center text-sm text-slate-400">Henüz ürün okutulmadı. Barkod okutun ya da arayıp ekleyin.</td></tr>
            } @else {
              @for (r of rows(); track r.product.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td">
                    <p class="font-semibold text-slate-900">{{ r.product.name }}</p>
                    <p class="text-xs text-slate-400"><span class="font-mono">{{ r.product.sku }}</span>@if (r.product.barcode) { · <span class="font-mono">{{ r.product.barcode }}</span> }</p>
                  </td>
                  <td class="table-td text-right text-slate-600">{{ num(stockOf(r.product)) }} {{ r.product.unit }}</td>
                  <td class="table-td text-right">
                    <input type="number" min="0" step="1" class="input w-24 text-right" [value]="r.counted" (input)="setCounted(r.product.id, +$any($event.target).value)" />
                  </td>
                  <td class="table-td text-right font-semibold" [class]="diffClass(r)">{{ diffLabel(r) }}</td>
                  <td class="table-td text-right">
                    <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Kaldır" (click)="removeRow(r.product.id)">
                      <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (rows().length) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>{{ rows().length }} ürün sayıldı</span>
          <span>@if (diffCount()) { <b class="text-amber-600">{{ diffCount() }}</b> üründe fark var } @else { <span class="text-emerald-600">Fark yok</span> }</span>
        </div>
      }
    </div>

    @if (historyOpen()) {
      <div class="card mt-4 p-5">
        <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
          <lucide-icon name="clipboard-list" class="h-4 w-4 text-brand-600"></lucide-icon> Geçmiş Sayımlar
        </h2>
        @if (!history().length) {
          <p class="py-4 text-center text-sm text-slate-400">Henüz uygulanmış sayım yok.</p>
        } @else {
          <ul class="divide-y divide-slate-50">
            @for (h of history(); track h.id) {
              <li class="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p class="font-medium text-slate-800">
                    {{ fmtWhen(h.appliedAt || h.createdAt) }}
                    @if (h.status === 'Cancelled') { <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">İptal</span> }
                  </p>
                  <p class="text-xs text-slate-400">{{ h.createdByName || 'bilinmiyor' }}</p>
                </div>
                <div class="text-right text-xs">
                  <span class="text-slate-500">{{ h.countedCount }} sayıldı</span>
                  @if (h.status === 'Applied') { · <b class="text-amber-600">{{ h.adjustedCount }}</b> düzeltildi }
                </div>
              </li>
            }
          </ul>
        }
      </div>
    }

    @if (cameraOpen()) {
      <app-barcode-camera (scanned)="onCameraScan($event)" (closed)="cameraOpen.set(false)" />
    }
  `,
})
export class StockCountComponent implements OnInit, OnDestroy {
  private api = inject(StockApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);
  private branchStore = inject(BranchStore);
  private router = inject(Router);
  private scanner = inject(BarcodeScannerService);

  /** Çok-şubede "Tüm şubeler" görünümündeyken sayım varsayılan şubeye uygulanır ama "sistem" toplam görünürdü →
   * yanıltıcı. Somut şube seçilmeli (tek-şubede sorun yok). */
  protected mustPickBranch = computed(() => this.branchStore.multi() && !this.branchStore.currentBranchId());

  protected num = num;
  protected stockOf = stockOf;
  protected cameraSupported = barcodeCameraSupported();
  protected cameraOpen = signal(false);
  protected barcodeInput = signal('');
  protected searchTerm = signal('');
  protected searchResults = signal<ProductDto[]>([]);
  protected rows = signal<CountRow[]>([]);
  protected applying = signal(false);

  // Geçmiş sayımlar (uygulanan/iptal edilen)
  protected historyOpen = signal(false);
  protected history = signal<StockCountHistoryDto[]>([]);

  private searchTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private saveSub?: Subscription; // uçuştaki sunucu-kaydı (clearAll/apply'da iptal edilir ki oturumu diriltmesin)
  private scanSub?: Subscription;

  private chosenIds = computed(() => new Set(this.rows().map((r) => r.product.id)));
  protected availableResults = computed(() => {
    const chosen = this.chosenIds();
    return this.searchResults().filter((p) => !chosen.has(p.id) && !p.isService);
  });
  /** Fark olan (düzeltilecek) ürün sayısı — önizleme. */
  protected diffCount = computed(() => this.rows().filter((r) => r.counted !== stockOf(r.product)).length);

  private get storageKey(): string {
    // Şube-özel taslak: şube değişince başka şubenin sayımı karışmasın (çok-şube TAM stok).
    return `stok-sayim:${this.auth.user()?.tenantId ?? 'anon'}:${this.branchStore.currentBranchId() ?? 'all'}`;
  }

  ngOnInit(): void {
    this.restore();
    this.scanner.start();
    this.scanSub = this.scanner.scans.subscribe((code) => this.onScan(code));
  }

  ngOnDestroy(): void {
    this.scanSub?.unsubscribe();
    this.saveSub?.unsubscribe();
    clearTimeout(this.saveTimer);
  }

  /** Bekleyen VE uçuştaki sunucu-kaydını iptal et — clear/apply sonrası oturumu diriltmesin. */
  private cancelPendingSave(): void {
    clearTimeout(this.saveTimer);
    this.saveSub?.unsubscribe();
    this.saveSub = undefined;
  }

  // ---- Tarama / ekleme ----
  private onScan(code: string): void {
    const c = (code ?? '').trim();
    if (!c) return;
    this.api.getByBarcode(c).subscribe({
      next: (p) => this.add(p, true),
      error: () => this.toast.error(`Barkod bulunamadı: ${c}`),
    });
  }

  protected onManualBarcode(): void {
    const c = this.barcodeInput().trim();
    if (!c) return;
    this.onScan(c);
    this.barcodeInput.set('');
  }

  protected onCameraScan(code: string): void {
    this.cameraOpen.set(false);
    this.onScan(code);
  }

  protected addFromSearch(p: ProductDto): void {
    this.add(p, false);
    this.searchTerm.set('');
    this.searchResults.set([]);
  }

  /** Ürünü listeye ekler; scan ise ve zaten varsa sayılanı +1 yapar (okut-say). */
  private add(p: ProductDto, scan: boolean): void {
    if (p.isService) {
      this.toast.error('Hizmet kalemi sayılmaz (stok takip edilmez).');
      return;
    }
    const existing = this.rows().find((r) => r.product.id === p.id);
    if (existing) {
      if (scan) this.setCounted(p.id, existing.counted + 1);
      return;
    }
    this.rows.update((rs) => [...rs, { product: p, counted: scan ? 1 : 0 }]);
    this.persist();
  }

  protected setCounted(id: string, n: number): void {
    const v = Math.max(0, Number.isFinite(n) ? n : 0);
    this.rows.update((rs) => rs.map((r) => (r.product.id === id ? { ...r, counted: v } : r)));
    this.persist();
  }

  protected removeRow(id: string): void {
    this.rows.update((rs) => rs.filter((r) => r.product.id !== id));
    this.persist();
  }

  protected async clearAll(): Promise<void> {
    if (!(await this.confirm.confirm({ message: 'Sayım listesi temizlensin mi?', danger: true, confirmText: 'Temizle' }))) return;
    this.cancelPendingSave(); // bekleyen VE uçuştaki sunucu-kaydı vazgeçtiğimiz oturumu diriltmesin
    this.rows.set([]);
    this.persistLocal();
    this.api.discardCountSession().subscribe({ error: () => {} }); // sunucudaki açık taslağı iptal et
  }

  // ---- Arama ----
  protected onSearch(v: string): void {
    this.searchTerm.set(v);
    clearTimeout(this.searchTimer);
    const q = (v ?? '').trim();
    if (!q) {
      this.searchResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.api.getProducts({ page: 1, pageSize: 50, search: q }).subscribe({
        next: (r) => this.searchResults.set(r.items),
        error: () => this.searchResults.set([]),
      });
    }, 300);
  }

  // ---- Fark gösterimi ----
  private diff(r: CountRow): number {
    return r.counted - stockOf(r.product);
  }
  protected diffLabel(r: CountRow): string {
    const d = this.diff(r);
    return d > 0 ? `+${this.num(d)}` : this.num(d);
  }
  protected diffClass(r: CountRow): string {
    const d = this.diff(r);
    return d < 0 ? 'text-rose-600' : d > 0 ? 'text-amber-600' : 'text-slate-400';
  }

  // ---- Uygula ----
  protected async apply(): Promise<void> {
    const rows = this.rows();
    if (!rows.length || this.applying()) return;
    if (this.mustPickBranch()) {
      this.toast.error('Sayım için üstten bir şube seçin — çok şubede stok şubeye göre tutulur.');
      return;
    }
    const diffs = this.diffCount();
    if (diffs === 0) {
      this.toast.info('Fark yok — uygulanacak düzeltme bulunamadı.');
      return;
    }
    if (!(await this.confirm.confirm({
      message: `${rows.length} üründen ${diffs} tanesinde fark var. Stok, sayılan değerlere göre düzeltilecek. Devam edilsin mi?`,
      danger: true,
      confirmText: 'Sayımı Uygula',
    }))) return;

    this.cancelPendingSave(); // uygulama sonrası bekleyen/uçuştaki kayıt yeni oturum açmasın
    this.applying.set(true);
    const items = rows.map((r) => ({ productId: r.product.id, countedQuantity: r.counted }));
    this.api.applyCount(items, `Sayım ${new Date().toLocaleDateString('tr-TR')}`).subscribe({
      next: (res) => {
        this.applying.set(false);
        this.clearLocalDraft(); // sunucudaki oturumu backend zaten "uygulandı" olarak kapattı
        this.rows.set([]);
        this.toast.success(`Sayım uygulandı: ${res.adjustedCount} üründe stok düzeltildi.`);
        this.router.navigate(['/stok/urunler']);
      },
      error: (e) => {
        this.applying.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Geçmiş sayımlar ----
  protected toggleHistory(): void {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) this.api.getCountHistory(30).subscribe({ next: (h) => this.history.set(h), error: () => {} });
  }
  protected fmtWhen(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  }

  // ---- Taslak: sunucu oturumu (birincil) + localStorage (anında yerel yedek) ----
  private persist(): void {
    this.persistLocal();
    // Sunucuya gecikmeli kaydet (yazarken her tuşta istek atma) — cihaz-arası devam sağlar.
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveToServer(), 1200);
  }

  private saveToServer(): void {
    const items = this.rows().map((r) => ({ productId: r.product.id, countedQuantity: r.counted }));
    this.saveSub?.unsubscribe();
    this.saveSub = this.api.saveCountSession(items).subscribe({ error: () => {} });
  }

  private persistLocal(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.rows()));
    } catch {
      /* kota/gizli mod — sessiz geç */
    }
  }

  private restore(): void {
    // YEREL ÖNCELİK: bu cihazda kaydedilmiş taslak varsa onu koru — sunucu-kaydı sessizce başarısız olmuş
    // olabilir (çevrimdışı) ve BAYAT bir sunucu oturumu, cihazın DAHA YENİ yerel taslağını ezmemeli.
    const local = this.readLocalDraft();
    if (local && local.length) {
      this.rows.set(local);
      return;
    }
    // Yerelde taslak yok → SUNUCUDAKİ açık oturum (başka cihazda başlanmış olabilir) → cihaz-arası devam.
    this.api.getCountSession().subscribe({
      next: (session) => {
        if (session && session.items.length) {
          this.rows.set(session.items.map((it) => ({
            product: {
              id: it.productId, name: it.productName, currentStock: it.currentStock,
              sku: '', unit: 'adet', barcode: undefined,
            } as unknown as ProductDto,
            counted: it.countedQuantity,
          })));
          this.persistLocal();
        }
      },
      error: () => {},
    });
  }

  private readLocalDraft(): CountRow[] | null {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CountRow[];
      return Array.isArray(parsed) && parsed.every((r) => r?.product?.id) ? parsed : null;
    } catch {
      return null;
    }
  }

  private clearLocalDraft(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* sessiz */
    }
  }
}
