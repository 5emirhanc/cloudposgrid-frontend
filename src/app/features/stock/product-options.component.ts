import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ModalComponent } from '../../shared/modal.component';
import { ProductOptionsApi } from '../../core/api/product-options.api';
import { ProductOptionDto, ProductOptionItem } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError } from '../../core/utils';

/** Düzenlenebilir satır (yeni satırların DB kimliği yok; yerel `key` ile takip edilir). */
interface OptionRow {
  key: number;
  groupName: string;
  name: string;
  priceDelta: number;
  sortOrder: number | null;
}

/**
 * Ürün Seçenekleri editörü (#29). Boy/Ekstra gibi seçenek gruplarını yönetir.
 * Satırlar düz bir tabloda düzenlenir; Kaydet tüm listeyi PUT eder (replace-all).
 */
@Component({
  selector: 'app-product-options-modal',
  imports: [FormsModule, LucideAngularModule, ModalComponent],
  template: `
    <app-modal [title]="modalTitle()" maxWidth="46rem" (dismiss)="close.emit()">
      <div class="space-y-4">
        <p class="text-sm text-slate-500">
          Ürüne satış sırasında sunulacak seçenekler ekleyin. <b>Grup</b> aynı türü toplar (ör. "Boy"),
          <b>Seçenek</b> tekil değeri belirtir (ör. "Büyük"). <b>Fiyat farkı</b> ürün fiyatına eklenir
          (indirim için eksi girin). Boş kaydetmek seçenekleri temizler.
        </p>

        @if (loading()) {
          <div class="h-40 animate-pulse rounded-xl bg-slate-100"></div>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full min-w-[34rem]">
              <thead class="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th class="table-th">Grup</th>
                  <th class="table-th">Seçenek</th>
                  <th class="table-th text-right">Fiyat Farkı (₺)</th>
                  <th class="table-th text-right">Sıra</th>
                  <th class="table-th w-10"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                @for (r of rows(); track r.key) {
                  <tr>
                    <td class="table-td">
                      <input class="input" [(ngModel)]="r.groupName" placeholder="Boy" />
                    </td>
                    <td class="table-td">
                      <input class="input" [(ngModel)]="r.name" placeholder="Büyük" />
                    </td>
                    <td class="table-td">
                      <input type="number" step="0.01" class="input text-right" [(ngModel)]="r.priceDelta" placeholder="0" />
                    </td>
                    <td class="table-td">
                      <input type="number" step="1" min="0" class="input w-20 text-right" [(ngModel)]="r.sortOrder" placeholder="—" />
                    </td>
                    <td class="table-td text-right">
                      <button type="button" (click)="removeRow(r.key)" aria-label="Satırı sil"
                              class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="table-td py-8 text-center text-sm text-slate-400">
                      Henüz seçenek yok. "Satır ekle" ile başlayın.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <button type="button" class="btn-outline" (click)="addRow()">
            <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Satır ekle
          </button>
        }

        <div class="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" class="btn-outline" (click)="close.emit()">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="loading() || saving()" (click)="save()">
            <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
            {{ saving() ? 'Kaydediliyor…' : 'Kaydet' }}
          </button>
        </div>
      </div>
    </app-modal>
  `,
})
export class ProductOptionsModalComponent implements OnInit {
  private api = inject(ProductOptionsApi);
  private toast = inject(ToastService);

  productId = input.required<string>();
  productName = input<string>('');
  close = output<void>();

  protected loading = signal(true);
  protected saving = signal(false);
  protected rows = signal<OptionRow[]>([]);
  private seq = 0;

  protected modalTitle = () => 'Ürün Seçenekleri' + (this.productName() ? ' — ' + this.productName() : '');

  ngOnInit(): void {
    this.api.getOptions(this.productId()).subscribe({
      next: (list) => {
        this.rows.set(
          [...list]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((o: ProductOptionDto) => ({
              key: ++this.seq,
              groupName: o.groupName,
              name: o.name,
              priceDelta: o.priceDelta,
              sortOrder: o.sortOrder,
            })),
        );
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected addRow(): void {
    // Yeni satırın grup adını son satırdan miras al (aynı gruba peş peşe seçenek eklemeyi kolaylaştırır).
    const last = this.rows()[this.rows().length - 1];
    this.rows.update((rs) => [
      ...rs,
      { key: ++this.seq, groupName: last?.groupName ?? '', name: '', priceDelta: 0, sortOrder: null },
    ]);
  }

  protected removeRow(key: number): void {
    this.rows.update((rs) => rs.filter((r) => r.key !== key));
  }

  protected save(): void {
    // Tamamen boş satırları (kaza eseri eklenen) at.
    const filled = this.rows()
      .map((r) => ({ ...r, groupName: (r.groupName ?? '').trim(), name: (r.name ?? '').trim() }))
      .filter((r) => r.groupName || r.name);

    // Kalan satırların hem grubu hem adı dolu olmalı.
    if (filled.some((r) => !r.groupName || !r.name)) {
      this.toast.error('Her satır için grup ve seçenek adı gerekli.');
      return;
    }

    // Kullanıcı sıra girmediyse satır indeksini ata.
    const items: ProductOptionItem[] = filled.map((r, i) => ({
      groupName: r.groupName,
      name: r.name,
      priceDelta: Number(r.priceDelta) || 0,
      sortOrder: r.sortOrder === null || r.sortOrder === undefined ? i : Number(r.sortOrder),
    }));

    this.saving.set(true);
    this.api.saveOptions(this.productId(), items).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(items.length ? 'Seçenekler kaydedildi.' : 'Seçenekler temizlendi.');
        this.close.emit();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
