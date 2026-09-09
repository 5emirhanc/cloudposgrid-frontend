import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { MarketplaceApi } from '../../core/api/marketplace.api';
import { ProductDto, TrendyolBrand, TrendyolCargoProvider, TrendyolCategory, TrendyolCategoryAttribute } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError, money } from '../../core/utils';

/**
 * Tek tuşla Trendyol ilan açma sihirbazı (modal). Adımlar: (1) kategori, (2) marka + kargo,
 * (3) zorunlu öznitelikler, (4) fiyat/stok/görsel onayı → Gönder (createProducts → Submitted).
 */
@Component({
  selector: 'app-listing-wizard',
  imports: [LucideAngularModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" (click)="close(false)">
      <div class="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl" (click)="$event.stopPropagation()">
        <!-- Başlık + adım göstergesi -->
        <div class="border-b border-slate-100 px-5 py-4">
          <div class="flex items-center justify-between">
            <h2 class="flex items-center gap-2 font-black text-slate-900">
              <lucide-icon name="store" class="h-5 w-5 text-brand-600"></lucide-icon> Trendyol'da İlan Aç
            </h2>
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" (click)="close(false)">
              <lucide-icon name="x" class="h-5 w-5"></lucide-icon>
            </button>
          </div>
          <p class="mt-0.5 truncate text-xs text-slate-500">{{ product.name }} · {{ product.barcode || 'barkod yok' }}</p>
          <div class="mt-3 flex items-center gap-1.5">
            @for (s of [1,2,3,4]; track s) {
              <div class="h-1.5 flex-1 rounded-full" [class]="step() >= s ? 'bg-brand-600' : 'bg-slate-200'"></div>
            }
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-5">
          @if (blocker(); as b) {
            <div class="mb-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
              <lucide-icon name="triangle-alert" class="mt-0.5 h-4 w-4 shrink-0"></lucide-icon><span>{{ b }}</span>
            </div>
          }

          <!-- 1) Kategori -->
          @if (step() === 1) {
            <label class="label">Trendyol Kategorisi</label>
            <input class="input mb-3" placeholder="Kategori ara…" [value]="categorySearch()"
                   (input)="categorySearch.set($any($event.target).value)" />
            @if (loadingRef()) { <p class="py-4 text-center text-sm text-slate-400">Kategoriler yükleniyor…</p> }
            <div class="max-h-64 space-y-1 overflow-y-auto">
              @for (cat of filteredCategories(); track cat.id) {
                <button class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                        [class]="selectedCategory()?.id === cat.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700'"
                        (click)="pickCategory(cat)">
                  {{ cat.name }}
                  @if (selectedCategory()?.id === cat.id) { <lucide-icon name="check" class="h-4 w-4"></lucide-icon> }
                </button>
              } @empty {
                @if (!loadingRef()) { <p class="py-4 text-center text-sm text-slate-400">Sonuç yok.</p> }
              }
            </div>
          }

          <!-- 2) Marka + Kargo -->
          @if (step() === 2) {
            <label class="label">Marka</label>
            <input class="input" placeholder="Marka ara (Trendyol'da kayıtlı olmalı)…" [value]="brandSearch()"
                   (input)="onBrandSearch($any($event.target).value)" />
            @if (searchingBrand()) { <p class="py-2 text-xs text-slate-400">Aranıyor…</p> }
            @if (brands().length) {
              <div class="mt-1 max-h-40 space-y-1 overflow-y-auto">
                @for (b of brands(); track b.id) {
                  <button class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                          [class]="selectedBrand()?.id === b.id ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-700'"
                          (click)="selectedBrand.set(b)">
                    {{ b.name }}
                    @if (selectedBrand()?.id === b.id) { <lucide-icon name="check" class="h-4 w-4"></lucide-icon> }
                  </button>
                }
              </div>
            }
            <label class="label mt-4">Kargo Firması</label>
            <select class="input" [value]="selectedCargoId() ?? ''" (change)="selectedCargoId.set(+$any($event.target).value || null)">
              <option value="">Seçin…</option>
              @for (cp of cargo(); track cp.id) { <option [value]="cp.id">{{ cp.name }}</option> }
            </select>
          }

          <!-- 3) Zorunlu öznitelikler -->
          @if (step() === 3) {
            @if (loadingAttrs()) { <p class="py-4 text-center text-sm text-slate-400">Öznitelikler yükleniyor…</p> }
            @if (!loadingAttrs() && !attributes().length) {
              <p class="py-4 text-center text-sm text-slate-400">Bu kategoride doldurulacak öznitelik yok.</p>
            }
            @for (a of attributes(); track a.id) {
              <div class="mb-3">
                <label class="label">{{ a.name }} @if (a.required) { <span class="text-rose-500">*</span> }</label>
                @if (a.values.length) {
                  <select class="input" [value]="attrValueId(a.id) ?? ''" (change)="setAttrValue(a.id, +$any($event.target).value || null)">
                    <option value="">Seçin…</option>
                    @for (v of a.values; track v.id) { <option [value]="v.id">{{ v.name }}</option> }
                  </select>
                } @else {
                  <input class="input" [value]="attrCustom(a.id)" (input)="setAttrCustom(a.id, $any($event.target).value)" placeholder="Değer girin" />
                }
              </div>
            }
          }

          <!-- 4) Onay -->
          @if (step() === 4) {
            <div class="space-y-2 text-sm">
              <div class="flex justify-between"><span class="text-slate-500">Ürün</span><span class="font-medium text-slate-800">{{ product.name }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Barkod</span><span class="font-medium">{{ product.barcode }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Kategori</span><span class="font-medium">{{ selectedCategory()?.name }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Marka</span><span class="font-medium">{{ selectedBrand()?.name }}</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Stok</span><span class="font-medium">{{ product.currentStock }} adet</span></div>
              <div class="flex justify-between"><span class="text-slate-500">Görsel sayısı</span><span class="font-medium">{{ imageCount() }}</span></div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500">Satış fiyatı</span>
                <span class="font-bold text-brand-600">{{ money(product.salePrice) }}</span>
              </div>
              <label class="label mt-2">Liste (üstü çizili) fiyatı — opsiyonel</label>
              <input class="input" type="number" [value]="listPrice() ?? ''" (input)="listPrice.set(+$any($event.target).value || null)"
                     [placeholder]="'Boş = ' + money(product.salePrice)" />
            </div>
            <p class="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
              İlan Trendyol'a gönderilecek ve <b>onay sürecine</b> girecek. Durumu "İlanlar" sekmesinden takip edebilirsiniz.
            </p>
          }
        </div>

        <!-- Alt butonlar -->
        <div class="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <button class="btn-ghost" [disabled]="submitting()" (click)="step() === 1 ? close(false) : step.set(step() - 1)">
            {{ step() === 1 ? 'Vazgeç' : 'Geri' }}
          </button>
          @if (step() < 4) {
            <button class="btn-primary" [disabled]="!canNext()" (click)="next()">İleri</button>
          } @else {
            <button class="btn-primary" [disabled]="submitting() || !!blocker()" (click)="submit()">
              <lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> {{ submitting() ? 'Gönderiliyor…' : 'İlanı Gönder' }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class ListingWizardComponent implements OnInit {
  @Input({ required: true }) product!: ProductDto;
  @Output() closed = new EventEmitter<boolean>();

  private api = inject(MarketplaceApi);
  private toast = inject(ToastService);
  protected money = money;

  protected step = signal(1);
  protected submitting = signal(false);
  protected loadingRef = signal(true);
  protected loadingAttrs = signal(false);
  protected searchingBrand = signal(false);

  protected categories = signal<TrendyolCategory[]>([]);
  protected cargo = signal<TrendyolCargoProvider[]>([]);
  protected attributes = signal<TrendyolCategoryAttribute[]>([]);
  protected brands = signal<TrendyolBrand[]>([]);

  protected categorySearch = signal('');
  protected brandSearch = signal('');
  protected selectedCategory = signal<TrendyolCategory | null>(null);
  protected selectedBrand = signal<TrendyolBrand | null>(null);
  protected selectedCargoId = signal<number | null>(null);
  protected listPrice = signal<number | null>(null);
  /** attributeId → { valueId?, custom? } */
  protected attrState = signal<Record<number, { valueId?: number | null; custom?: string }>>({});
  private brandTimer?: ReturnType<typeof setTimeout>;

  /** Sadece yaprak (leaf) kategoriler seçilebilir; arama ile süzülür. */
  protected filteredCategories = computed(() => {
    const q = this.categorySearch().trim().toLocaleLowerCase('tr');
    return this.categories().filter((c) => c.isLeaf && (!q || c.name.toLocaleLowerCase('tr').includes(q))).slice(0, 100);
  });

  protected imageCount = computed(() => (this.product.imageUrl ? 1 : 0) + (this.product.imageUrls?.length ?? 0));

  /** İlanı engelleyen durum (varsa metin döner). */
  protected blocker = computed(() => {
    if (!this.product.barcode) return 'Bu ürünün barkodu yok. İlan açmak için önce ürüne barkod ekleyin.';
    if (this.imageCount() === 0) return 'İlan için en az 1 ürün görseli gerekli. Ürüne fotoğraf ekleyin.';
    if (this.product.isService) return 'Hizmet kalemi pazaryerinde ilan olarak açılamaz.';
    return null;
  });

  ngOnInit(): void {
    this.api.getCategories().subscribe({
      next: (c) => { this.categories.set(c); this.loadingRef.set(false); },
      error: (e) => { this.loadingRef.set(false); this.toast.error(apiError(e)); },
    });
    this.api.getCargoProviders().subscribe({ next: (c) => this.cargo.set(c), error: () => {} });
  }

  protected canNext(): boolean {
    if (this.step() === 1) return !!this.selectedCategory();
    if (this.step() === 2) return !!this.selectedBrand() && !!this.selectedCargoId();
    if (this.step() === 3) return this.attributes().filter((a) => a.required).every((a) => this.hasValue(a.id));
    return true;
  }

  protected next(): void { if (this.canNext()) this.step.set(this.step() + 1); }

  protected pickCategory(cat: TrendyolCategory): void {
    if (this.selectedCategory()?.id === cat.id) return;
    this.selectedCategory.set(cat);
    this.attributes.set([]);
    this.attrState.set({});
    this.loadingAttrs.set(true);
    this.api.getCategoryAttributes(cat.id).subscribe({
      next: (a) => { this.attributes.set(a); this.loadingAttrs.set(false); },
      error: (e) => { this.loadingAttrs.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected onBrandSearch(v: string): void {
    this.brandSearch.set(v);
    this.selectedBrand.set(null);
    clearTimeout(this.brandTimer);
    const q = v.trim();
    if (q.length < 2) { this.brands.set([]); return; }
    this.searchingBrand.set(true);
    this.brandTimer = setTimeout(() => {
      this.api.searchBrands(q).subscribe({
        next: (b) => { this.brands.set(b); this.searchingBrand.set(false); },
        error: () => this.searchingBrand.set(false),
      });
    }, 350);
  }

  protected attrValueId(id: number): number | null { return this.attrState()[id]?.valueId ?? null; }
  protected attrCustom(id: number): string { return this.attrState()[id]?.custom ?? ''; }
  protected setAttrValue(id: number, valueId: number | null): void {
    this.attrState.update((s) => ({ ...s, [id]: { valueId } }));
  }
  protected setAttrCustom(id: number, custom: string): void {
    this.attrState.update((s) => ({ ...s, [id]: { custom } }));
  }
  private hasValue(id: number): boolean {
    const v = this.attrState()[id];
    return !!v && (v.valueId != null || !!v.custom?.trim());
  }

  protected submit(): void {
    if (this.blocker() || this.submitting()) return;
    const cat = this.selectedCategory(); const brand = this.selectedBrand(); const cargoId = this.selectedCargoId();
    if (!cat || !brand || !cargoId) return;
    const attributes = this.attributes()
      .filter((a) => this.hasValue(a.id))
      .map((a) => {
        const st = this.attrState()[a.id];
        return { attributeId: a.id, attributeValueId: st.valueId ?? null, customValue: st.custom?.trim() || null };
      });
    this.submitting.set(true);
    this.api.submitListing(this.product.id, {
      categoryId: cat.id, brandId: brand.id, cargoCompanyId: cargoId, listPrice: this.listPrice(), attributes,
    }).subscribe({
      next: () => { this.submitting.set(false); this.toast.success('İlan Trendyol\'a gönderildi (onay bekleniyor).'); this.close(true); },
      error: (e) => { this.submitting.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected close(submitted: boolean): void { this.closed.emit(submitted); }
}
