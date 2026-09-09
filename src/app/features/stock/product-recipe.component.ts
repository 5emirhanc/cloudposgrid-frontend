import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ProductRecipeApi } from '../../core/api/product-recipe.api';
import { StockApi } from '../../core/api/stock.api';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { ProductDto } from '../../core/models';
import { apiError, money } from '../../core/utils';

/** Düzenlenebilir reçete satırı (istemci tarafı — key sadece @for izleme için). */
interface RecipeRow {
  key: number;
  componentProductId: string;
  quantity: number;
}

/**
 * Reçete / BOM editörü — bir ürünün hangi bileşen ürünlerden yapıldığını düzenler.
 * Ör. 1 Latte = 30 süt + 1 shot + 1 bardak. Kaydedince tüm liste tek seferde yazılır.
 */
@Component({
  selector: 'app-product-recipe-modal',
  imports: [LucideAngularModule, ModalComponent],
  template: `
    <app-modal [title]="'Reçete' + (productName() ? ' — ' + productName() : '')" maxWidth="46rem" (dismiss)="close.emit()">
      @if (loading()) {
        <div class="h-40 animate-pulse rounded-xl bg-slate-100"></div>
      } @else {
        <div class="space-y-4">
          <p class="text-sm text-slate-500">
            Bu ürün satıldığında stoktan düşecek bileşenleri girin. Her satır bir bileşen ürün ve miktarıdır.
          </p>

          @if (rows().length === 0) {
            <div class="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Henüz bileşen yok. "Bileşen ekle" ile başlayın.
            </div>
          } @else {
            <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full min-w-[40rem]">
              <thead class="border-b border-slate-100">
                <tr>
                  <th class="table-th">Bileşen ürün</th>
                  <th class="table-th text-right">Miktar</th>
                  <th class="table-th text-right">Birim</th>
                  <th class="table-th text-right">Birim maliyet</th>
                  <th class="table-th text-right">Satır maliyeti</th>
                  <th class="table-th w-10"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                @for (r of rows(); track r.key) {
                  <tr>
                    <td class="table-td">
                      <select class="select w-full" [value]="r.componentProductId" (change)="setProduct(r.key, $any($event.target).value)">
                        <option value="">Seçin…</option>
                        @if (r.componentProductId && !isInOptions(r.componentProductId)) {
                          <option [value]="r.componentProductId">{{ nameOf(r.componentProductId) }} (pasif)</option>
                        }
                        @for (p of componentOptions(); track p.id) {
                          <option [value]="p.id">{{ p.name }}</option>
                        }
                      </select>
                    </td>
                    <td class="table-td text-right">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        class="input w-24 text-right"
                        [value]="r.quantity"
                        (input)="setQty(r.key, $any($event.target).value)"
                      />
                    </td>
                    <td class="table-td text-right text-slate-500">{{ unitOf(r.componentProductId) || '—' }}</td>
                    <td class="table-td text-right text-slate-500">{{ money(unitCostOf(r.componentProductId)) }}</td>
                    <td class="table-td text-right font-medium">{{ money(lineCost(r)) }}</td>
                    <td class="table-td text-right">
                      <button
                        type="button"
                        (click)="removeRow(r.key)"
                        aria-label="Bileşeni sil"
                        class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            </div>
          }

          <button type="button" class="btn-outline" (click)="addRow()">
            <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Bileşen ekle
          </button>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <span class="text-sm text-slate-500">
              Toplam maliyet: <b class="text-slate-800">{{ money(totalCost()) }}</b>
            </span>
            <div class="flex gap-2">
              <button type="button" class="btn-outline" (click)="close.emit()">Vazgeç</button>
              <button type="button" class="btn-primary" [disabled]="saving()" (click)="save()">
                <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
                {{ saving() ? 'Kaydediliyor…' : 'Kaydet' }}
              </button>
            </div>
          </div>
        </div>
      }
    </app-modal>
  `,
})
export class ProductRecipeModalComponent implements OnInit {
  private api = inject(ProductRecipeApi);
  private stock = inject(StockApi);
  private toast = inject(ToastService);

  /** Reçetesi düzenlenen ürün. */
  productId = input.required<string>();
  productName = input<string>('');

  close = output<void>();

  protected money = money;

  protected loading = signal(true);
  protected saving = signal(false);
  protected products = signal<ProductDto[]>([]);
  protected rows = signal<RecipeRow[]>([]);
  /** Reçetenin YETKİLİ görüntü verisi (backend'den): pasif ya da 500-dışı bileşenler aktif ürün
   * listesinde olmasa bile ad/birim/maliyeti buradan çözülür → boş '—' / ₺0 hatası olmaz. */
  private meta = signal<Map<string, { name: string; unit: string; unitCost: number }>>(new Map());
  private nextKey = 0;

  /** Dropdown seçenekleri — kendine referansı önlemek için mevcut ürünü hariç tut. */
  protected componentOptions = computed(() => {
    const self = this.productId();
    return this.products().filter((p) => p.id !== self);
  });

  private productMap = computed(() => {
    const m = new Map<string, ProductDto>();
    for (const p of this.products()) m.set(p.id, p);
    return m;
  });

  /** Satırların toplam maliyeti (bileşen alış fiyatı × miktar; pasif bileşenlerde meta yedeği). */
  protected totalCost = computed(() =>
    this.rows().reduce((sum, r) => sum + this.unitCostOf(r.componentProductId) * (r.quantity || 0), 0));

  ngOnInit(): void {
    // Bileşen dropdown'u için ürünleri yükle.
    this.stock.getProducts({ pageSize: 500, isActive: true }).subscribe({
      next: (res) => this.products.set(res.items),
      error: (e) => this.toast.error(apiError(e)),
    });
    // Mevcut reçeteyi yükle.
    this.api.getRecipe(this.productId()).subscribe({
      next: (recipe) => {
        // Backend'in döndürdüğü yetkili ad/birim/maliyeti sakla (pasif/500-dışı bileşenler için yedek).
        const m = new Map<string, { name: string; unit: string; unitCost: number }>();
        for (const c of recipe.components) m.set(c.componentProductId, { name: c.componentName, unit: c.unit, unitCost: c.unitCost });
        this.meta.set(m);
        this.rows.set(recipe.components.map((c) => ({ key: this.nextKey++, componentProductId: c.componentProductId, quantity: c.quantity })));
        this.loading.set(false);
      },
      error: () => {
        // Reçete yoksa boş başla.
        this.rows.set([]);
        this.loading.set(false);
      },
    });
  }

  /** Bileşen adı: önce aktif ürün listesi, yoksa reçetenin döndürdüğü ad (pasif/500-dışı için). */
  protected nameOf(id: string): string {
    return this.productMap().get(id)?.name ?? this.meta().get(id)?.name ?? '—';
  }
  protected unitOf(id: string): string {
    return this.productMap().get(id)?.unit ?? this.meta().get(id)?.unit ?? '';
  }
  protected unitCostOf(id: string): number {
    return this.productMap().get(id)?.purchasePrice ?? this.meta().get(id)?.unitCost ?? 0;
  }
  /** Bileşen aktif ürün dropdown'unda var mı (yoksa satırda "pasif" seçeneği gösterilir). */
  protected isInOptions(id: string): boolean {
    return this.componentOptions().some((p) => p.id === id);
  }
  protected lineCost(r: RecipeRow): number {
    return this.unitCostOf(r.componentProductId) * (r.quantity || 0);
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, { key: this.nextKey++, componentProductId: '', quantity: 1 }]);
  }
  protected removeRow(key: number): void {
    this.rows.update((rows) => rows.filter((r) => r.key !== key));
  }
  protected setProduct(key: number, componentProductId: string): void {
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, componentProductId } : r)));
  }
  protected setQty(key: number, value: string): void {
    const quantity = Math.max(0, +value || 0);
    this.rows.update((rows) => rows.map((r) => (r.key === key ? { ...r, quantity } : r)));
  }

  protected save(): void {
    const components = this.rows()
      .filter((r) => r.componentProductId && r.quantity > 0)
      .map((r) => ({ componentProductId: r.componentProductId, quantity: r.quantity }));
    this.saving.set(true);
    this.api.setRecipe(this.productId(), components).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Reçete kaydedildi.');
        this.close.emit();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
