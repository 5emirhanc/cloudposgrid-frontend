import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { StockApi } from '../../core/api/stock.api';
import { BranchStore } from '../../core/branch.store';
import { StockMovementDto } from '../../core/models';
import { formatDateTime, num } from '../../core/utils';

@Component({
  selector: 'app-movements',
  imports: [LucideAngularModule],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-black tracking-tight text-slate-900">Stok Hareketleri</h1>
      <p class="text-sm text-slate-500">Tüm giriş, çıkış ve düzeltmeler</p>
    </div>

    <!-- Hareketler seçili şubeye göre süzülür (şube izolasyonu). Çok şubede bunu söylemezsek kullanıcı
         eksilen satırları "kayıp" sanır; "Sonraki Stok" da şube bazlı olduğu için karışırdı. -->
    @if (branchHint(); as hint) {
      <div class="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        <lucide-icon name="info" class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"></lucide-icon>
        <span>{{ hint }}</span>
      </div>
    }

    <div class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      @for (f of filters; track f.value) {
        <button
          class="btn-sm rounded-lg px-3 py-1.5 text-sm font-medium transition"
          [class]="type() === f.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          (click)="setType(f.value)"
        >
          {{ f.label }}
        </button>
      }
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Tarih</th>
              <th class="table-th">Ürün</th>
              <th class="table-th">Tip</th>
              <th class="table-th text-right">Miktar</th>
              <th class="table-th text-right">Sonraki Stok</th>
              <th class="table-th">Not</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (!items().length) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Hareket bulunamadı.</td></tr>
            } @else {
              @for (m of items(); track m.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td whitespace-nowrap text-slate-500">{{ formatDateTime(m.createdAt) }}</td>
                  <td class="table-td font-medium text-slate-800">{{ m.productName }}</td>
                  <td class="table-td">
                    @switch (m.type) {
                      @case ('In') { <span class="badge-green">Giriş</span> }
                      @case ('Out') { <span class="badge-red">Çıkış</span> }
                      @default { <span class="badge-amber">Düzeltme</span> }
                    }
                  </td>
                  <td class="table-td text-right font-semibold" [class.text-emerald-600]="m.type === 'In'" [class.text-rose-600]="m.type === 'Out'">
                    {{ m.type === 'Out' ? '−' : (m.type === 'In' ? '+' : '') }}{{ num(m.quantity) }}
                  </td>
                  <td class="table-td text-right text-slate-600">{{ num(m.stockAfter) }}</td>
                  <td class="table-td text-slate-400">{{ m.note || '—' }}</td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (total() > pageSize) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>{{ total() }} hareket</span>
          <div class="flex items-center gap-2">
            <button class="btn-outline btn-sm" [disabled]="page() === 1" (click)="setPage(page() - 1)">Önceki</button>
            <span>{{ page() }} / {{ totalPages() }}</span>
            <button class="btn-outline btn-sm" [disabled]="page() >= totalPages()" (click)="setPage(page() + 1)">Sonraki</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class MovementsComponent implements OnInit {
  private api = inject(StockApi);
  private branchStore = inject(BranchStore);

  /** Çok şubede kapsamı açıkça söyle: seçili şube mi, birleşik liste mi (tek şubede hiç gösterme). */
  protected branchHint = computed(() => {
    if (!this.branchStore.multi()) return null;
    const b = this.branchStore.current();
    return b
      ? `Bu liste yalnız "${b.name}" şubesine ait hareketleri gösterir. Tümü için üstten "Tüm şubeler"i seçin.`
      : 'Tüm şubelerin hareketleri birlikte listeleniyor — "Sonraki Stok" her satırda kendi şubesinin bakiyesidir.';
  });

  protected formatDateTime = formatDateTime;
  protected num = num;
  protected readonly pageSize = 20;

  protected loading = signal(true);
  protected items = signal<StockMovementDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected type = signal<'' | 'In' | 'Out' | 'Adjustment'>('');
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  protected filters = [
    { label: 'Tümü', value: '' as const },
    { label: 'Giriş', value: 'In' as const },
    { label: 'Çıkış', value: 'Out' as const },
    { label: 'Düzeltme', value: 'Adjustment' as const },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getMovements({ page: this.page(), pageSize: this.pageSize, type: this.type() }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected setType(t: '' | 'In' | 'Out' | 'Adjustment'): void {
    this.type.set(t);
    this.page.set(1);
    this.load();
  }
  protected setPage(p: number): void {
    this.page.set(p);
    this.load();
  }
}
