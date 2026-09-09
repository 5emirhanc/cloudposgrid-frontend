import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { InvoicesApi } from '../../core/api/invoices.api';
import { AuthService } from '../../core/auth.service';
import { InvoiceListItemDto } from '../../core/models';
import { formatDate, money } from '../../core/utils';

@Component({
  selector: 'app-invoices',
  imports: [RouterLink, LucideAngularModule, PageHelpComponent],
  template: `
    <app-page-help key="invoices" title="Satış ve alış faturalarınızı tek yerden görün ve yönetin">
      <li>"Yeni Fatura" ile satış veya alış faturası oluşturun</li>
      <li>Tümü, Satış, Alış sekmeleriyle listeyi hızlıca filtreleyin</li>
      <li>Bir faturaya tıklayıp detayını ve durumunu açın</li>
      <li>Ödendi, Açık, Taslak durumlarını listeden takip edin</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Faturalar</h1>
        <p class="text-sm text-slate-500">Satış ve alış faturaları</p>
      </div>
      <a routerLink="/faturalar/yeni" class="btn-primary"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Fatura</a>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      @for (f of typeFilters; track f.value) {
        <button class="chip" [class.chip-active]="typeFilter() === f.value" (click)="setType(f.value)">{{ f.label }}</button>
      }
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">No</th>
              <th class="table-th">Tip</th>
              <th class="table-th">{{ term().customerSingular }}</th>
              <th class="table-th">Tarih</th>
              <th class="table-th text-right">Tutar</th>
              <th class="table-th">Durum</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (!items().length) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Fatura bulunamadı.</td></tr>
            } @else {
              @for (i of items(); track i.id) {
                <tr class="cursor-pointer hover:bg-slate-50/60" [routerLink]="['/faturalar', i.id]">
                  <td class="table-td font-semibold text-brand-700">{{ i.number }}</td>
                  <td class="table-td">
                    @if (i.type === 'Sales') { <span class="badge-green">Satış</span> } @else { <span class="badge-amber">Alış</span> }
                  </td>
                  <td class="table-td text-slate-600">{{ i.contactName || '—' }}</td>
                  <td class="table-td whitespace-nowrap text-slate-500">{{ formatDate(i.date) }}</td>
                  <td class="table-td text-right font-medium text-slate-800">{{ money(i.grandTotal) }}</td>
                  <td class="table-td">
                    @switch (i.status) {
                      @case ('Paid') { <span class="badge-green">Ödendi</span> }
                      @case ('Issued') { <span class="badge-blue">Açık</span> }
                      @case ('Cancelled') { <span class="badge-red">İptal</span> }
                      @default { <span class="badge-gray">Taslak</span> }
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (total() > pageSize) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>{{ total() }} fatura</span>
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
export class InvoicesComponent implements OnInit {
  private api = inject(InvoicesApi);
  private auth = inject(AuthService);
  protected term = computed(() => this.auth.profile().terminology);

  protected money = money;
  protected formatDate = formatDate;
  protected readonly pageSize = 15;

  protected loading = signal(true);
  protected items = signal<InvoiceListItemDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected typeFilter = signal<'' | 'Sales' | 'Purchase'>('');
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  protected typeFilters = [
    { label: 'Tümü', value: '' as const },
    { label: 'Satış', value: 'Sales' as const },
    { label: 'Alış', value: 'Purchase' as const },
  ];

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getInvoices({ page: this.page(), pageSize: this.pageSize, type: this.typeFilter() }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected setType(t: '' | 'Sales' | 'Purchase'): void {
    this.typeFilter.set(t);
    this.page.set(1);
    this.load();
  }
  protected setPage(p: number): void {
    this.page.set(p);
    this.load();
  }
}
