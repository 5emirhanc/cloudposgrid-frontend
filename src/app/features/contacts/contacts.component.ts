import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { ContactsApi } from '../../core/api/contacts.api';
import { AccountTransactionDto, Contact360Dto, ContactDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AuthService } from '../../core/auth.service';
import { ModalComponent } from '../../shared/modal.component';
import { FieldErrorComponent } from '../../shared/field-error.component';
import { apiError, formatDate, money } from '../../core/utils';

@Component({
  selector: 'app-contacts',
  imports: [ReactiveFormsModule, LucideAngularModule, ModalComponent, FieldErrorComponent, PageHelpComponent],
  template: `
    <app-page-help key="contacts" title="Müşteri ve tedarikçilerinizi, bakiyeleriyle birlikte buradan takip edin">
      <li>Yeni müşteri veya tedarikçi ekleyin, telefon ve bilgilerini girin</li>
      <li>Ekstre penceresinde borç veya alacak hareketi ekleyin</li>
      <li>Arama ve tip filtresiyle carilerinizi hızlıca bulun</li>
      <li>Dışa Aktar ile listeyi Excel'e uygun CSV olarak indirin</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">{{ term().customers }}</h1>
        <p class="text-sm text-slate-500">Hesap, bakiye ve borç/alacak takibi</p>
      </div>
      <div class="flex items-center gap-2">
        @if (canExport()) {
          <button class="btn-outline" [disabled]="!items().length" (click)="exportCsv()">
            <lucide-icon name="download" class="h-4 w-4"></lucide-icon> Dışa Aktar
          </button>
        }
        <button class="btn-primary" (click)="openCreate()"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni {{ term().customerSingular }}</button>
      </div>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
      <div class="relative min-w-[200px] flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-10" [placeholder]="term().customerSingular + ' ara...'" [value]="search()" (input)="onSearch($any($event.target).value)" />
      </div>
      @if (cfg().type) {
        <div class="flex flex-wrap gap-2">
          @for (t of typeFilters; track t.value) {
            <button class="chip" [class.chip-active]="typeFilter() === t.value" (click)="setType(t.value)">{{ t.label }}</button>
          }
        </div>
      }
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">{{ term().customerSingular }}</th>
              @if (cfg().type) { <th class="table-th">Tip</th> }
              <th class="table-th hidden sm:table-cell">Telefon</th>
              <th class="table-th text-right">Bakiye</th>
              <th class="table-th text-right">İşlem</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td [attr.colspan]="cfg().type ? 5 : 4" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (!items().length) {
              <tr><td [attr.colspan]="cfg().type ? 5 : 4" class="py-10 text-center text-sm text-slate-400">{{ term().customerSingular }} bulunamadı.</td></tr>
            } @else {
              @for (c of items(); track c.id) {
                <tr class="cursor-pointer hover:bg-slate-50/60" (click)="openLedger(c)">
                  <td class="table-td">
                    <div class="flex items-center gap-3">
                      <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">{{ initials(c.name) }}</span>
                      <span class="font-semibold text-slate-800">{{ c.name }}</span>
                    </div>
                  </td>
                  @if (cfg().type) {
                    <td class="table-td">
                      @switch (c.type) {
                        @case ('Customer') { <span class="badge-blue">Müşteri</span> }
                        @case ('Supplier') { <span class="badge-amber">Tedarikçi</span> }
                        @default { <span class="badge-gray">Her ikisi</span> }
                      }
                    </td>
                  }
                  <td class="table-td hidden sm:table-cell text-slate-500">{{ c.phone || '—' }}</td>
                  <td class="table-td text-right font-semibold" [class.text-emerald-600]="c.balance > 0" [class.text-rose-600]="c.balance < 0" [class.text-slate-600]="c.balance === 0">
                    {{ money(c.balance) }}
                  </td>
                  <td class="table-td" (click)="$event.stopPropagation()">
                    <div class="flex items-center justify-end gap-1">
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Ekstre" (click)="openLedger(c)"><lucide-icon name="book-text" class="h-4 w-4"></lucide-icon></button>
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Düzenle" (click)="openEdit(c)"><lucide-icon name="pencil" class="h-4 w-4"></lucide-icon></button>
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(c)"><lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon></button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (total() > pageSize) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>{{ total() }} kayıt</span>
          <div class="flex items-center gap-2">
            <button class="btn-outline btn-sm" [disabled]="page() === 1" (click)="setPage(page() - 1)">Önceki</button>
            <span>{{ page() }} / {{ totalPages() }}</span>
            <button class="btn-outline btn-sm" [disabled]="page() >= totalPages()" (click)="setPage(page() + 1)">Sonraki</button>
          </div>
        </div>
      }
    </div>

    <!-- Form modal -->
    @if (formOpen()) {
      <app-modal [title]="(editingId() ? term().customerSingular + ' Düzenle' : 'Yeni ' + term().customerSingular)" (dismiss)="formOpen.set(false)">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">{{ term().customerSingular }} Adı *</label>
              <input class="input" formControlName="name" />
              <field-error [control]="form.controls.name" [label]="term().customerSingular + ' adı'" />
            </div>
            @if (cfg().type) {
              <div>
                <label class="label">Tip</label>
                <select class="select" formControlName="type">
                  <option value="Customer">Müşteri</option>
                  <option value="Supplier">Tedarikçi</option>
                  <option value="Both">Her ikisi</option>
                </select>
              </div>
            }
            <div [class.sm:col-span-2]="!cfg().type">
              <label class="label">Telefon</label>
              <input class="input" formControlName="phone" />
            </div>
            @if (cfg().taxFields) {
              <div>
                <label class="label">Vergi Dairesi</label>
                <input class="input" formControlName="taxOffice" />
              </div>
              <div>
                <label class="label">Vergi / TC No</label>
                <input class="input" formControlName="taxNo" />
              </div>
            }
            @if (cfg().email) {
              <div class="sm:col-span-2">
                <label class="label">E-posta</label>
                <input class="input" formControlName="email" />
              </div>
            }
            @if (cfg().address) {
              <div class="sm:col-span-2">
                <label class="label">Adres</label>
                <input class="input" formControlName="address" />
              </div>
            }
            <div>
              <label class="label">Müşteri İndirimi (%)</label>
              <input type="number" step="1" min="0" max="100" class="input" formControlName="discountRate" />
            </div>
            @if (!editingId() && cfg().openingBalance) {
              <div class="sm:col-span-2">
                <label class="label">Açılış Bakiyesi (+ alacak / − borç)</label>
                <input type="number" step="0.01" class="input" formControlName="openingBalance" />
              </div>
            }
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="formOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Kaydet</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Ekstre modal -->
    @if (ledgerContact(); as lc) {
      <app-modal [title]="lc.name + ' · Ekstre'" maxWidth="44rem" (dismiss)="ledgerContact.set(null)">
        <div class="mb-4 flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span class="text-sm text-slate-500">Güncel bakiye</span>
          <span class="text-lg font-bold" [class.text-emerald-600]="lc.balance > 0" [class.text-rose-600]="lc.balance < 0">{{ money(lc.balance) }}</span>
        </div>
        @if (lc.pointsBalance > 0) {
          <div class="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3">
            <span class="flex items-center gap-1.5 text-sm text-amber-700"><lucide-icon name="sparkles" class="h-4 w-4"></lucide-icon> Sadakat Puanı</span>
            <span class="text-lg font-bold text-amber-700">{{ lc.pointsBalance }} puan</span>
          </div>
        }

        <!-- Müşteri 360 -->
        @if (overview(); as o) {
          <div class="mb-4 rounded-xl border border-slate-200 p-4">
            <div class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p class="text-xs uppercase text-slate-400">Toplam alışveriş</p>
                <p class="text-base font-bold text-slate-900">{{ money(o.totalPurchases) }}</p>
              </div>
              <div>
                <p class="text-xs uppercase text-slate-400">Fatura / Ort. sepet</p>
                <p class="text-base font-bold text-slate-900">{{ o.invoiceCount }} · {{ money(o.avgBasket) }}</p>
              </div>
              <div>
                <p class="text-xs uppercase text-slate-400">Son alışveriş</p>
                <p class="text-base font-bold text-slate-900">{{ o.lastPurchaseAt ? formatDate(o.lastPurchaseAt) : '—' }}</p>
              </div>
              <div>
                <p class="text-xs uppercase text-slate-400">Randevu / Teklif</p>
                <p class="text-base font-bold text-slate-900">{{ o.appointmentCount }} · {{ o.quoteCount }}</p>
              </div>
            </div>
            @if (o.topProducts.length) {
              <p class="mb-1 text-xs font-bold uppercase text-slate-500">Sık aldıkları</p>
              <div class="flex flex-wrap gap-1.5">
                @for (p of o.topProducts.slice(0, 6); track p.productId) {
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{{ p.productName }} <span class="text-slate-400">×{{ p.quantity }}</span></span>
                }
              </div>
            }
          </div>
        }

        <form [formGroup]="txnForm" (ngSubmit)="addTxn()" class="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3">
          <div class="w-32">
            <label class="label">Tip</label>
            <select class="select" formControlName="direction">
              <option value="Debit">Borç (+)</option>
              <option value="Credit">Alacak (−)</option>
            </select>
          </div>
          <div class="w-32">
            <label class="label">Tutar</label>
            <input type="number" step="0.01" class="input" formControlName="amount" />
          </div>
          <div class="min-w-[120px] flex-1">
            <label class="label">Açıklama</label>
            <input class="input" formControlName="description" />
          </div>
          <button class="btn-primary" [disabled]="saving()">Ekle</button>
        </form>

        <div class="max-h-72 overflow-y-auto">
          @if (!ledgerTxns().length) {
            <p class="py-8 text-center text-sm text-slate-400">Hareket yok.</p>
          } @else {
            <table class="w-full">
              <tbody class="divide-y divide-slate-50">
                @for (t of ledgerTxns(); track t.id) {
                  <tr>
                    <td class="table-td whitespace-nowrap text-xs text-slate-400">{{ formatDate(t.date) }}</td>
                    <td class="table-td">{{ t.description || (t.direction === 'Debit' ? 'Borç' : 'Alacak') }}</td>
                    <td class="table-td text-right font-medium" [class.text-emerald-600]="t.direction === 'Debit'" [class.text-rose-600]="t.direction === 'Credit'">
                      {{ t.direction === 'Credit' ? '−' : '+' }}{{ money(t.amount) }}
                    </td>
                    <td class="table-td text-right text-xs text-slate-400">{{ money(t.balanceAfter) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </app-modal>
    }
  `,
})
export class ContactsComponent implements OnInit {
  private api = inject(ContactsApi);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  protected term = computed(() => this.auth.profile().terminology);
  protected cfg = computed(() => this.auth.profile().contactFields);

  protected money = money;
  protected formatDate = formatDate;
  protected initials = (name: string) => (name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  protected readonly pageSize = 15;

  protected loading = signal(true);
  protected saving = signal(false);
  protected items = signal<ContactDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected search = signal('');
  protected typeFilter = signal<'' | 'Customer' | 'Supplier'>('');
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  /** Dışa aktarma Kurumsal pakete özel (gelişmiş rapor & dışa aktarma yetkisi). */
  protected canExport = computed(() => this.auth.user()?.entitlements?.advancedReports ?? false);

  /** Mevcut filtreyle TÜM carileri (sayfa sayfa, en çok 2000) CSV olarak indirir — TR Excel uyumlu (BOM + ;). */
  protected exportCsv(): void {
    const q: Record<string, unknown> = {
      page: 1,
      pageSize: 200,
      search: this.search() || undefined,
      type: this.typeFilter() || undefined,
    };
    this.api.getContacts(q).subscribe({
      next: (first) => {
        const pages = Math.min(Math.ceil(first.total / 200), 10);
        const rest = [];
        for (let p = 2; p <= pages; p++) rest.push(this.api.getContacts({ ...q, page: p }));
        (rest.length ? forkJoin(rest) : of([])).subscribe({
          next: (others) => this.downloadCsv([...first.items, ...others.flatMap((r) => r.items)]),
          error: (e) => this.toast.error(apiError(e)),
        });
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  private downloadCsv(rows: ContactDto[]): void {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const tip = (t: string) => (t === 'Supplier' ? 'Tedarikçi' : t === 'Both' ? 'Müşteri+Tedarikçi' : 'Müşteri');
    const header = 'Ad;Tip;Telefon;E-posta;Vergi No;Bakiye;İndirim %;Aktif';
    const lines = rows.map((c) =>
      [c.name, tip(c.type), c.phone, c.email, c.taxNo, c.balance, c.discountRate, c.isActive ? 'Evet' : 'Hayır']
        .map(esc)
        .join(';'));
    const csv = '﻿' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cariler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success(`${rows.length} kayıt dışa aktarıldı.`);
  }

  protected formOpen = signal(false);
  protected editingId = signal<string | null>(null);
  protected ledgerContact = signal<ContactDto | null>(null);
  protected ledgerTxns = signal<AccountTransactionDto[]>([]);
  protected overview = signal<Contact360Dto | null>(null);

  private searchTimer?: ReturnType<typeof setTimeout>;

  protected typeFilters = [
    { label: 'Tümü', value: '' as const },
    { label: 'Müşteri', value: 'Customer' as const },
    { label: 'Tedarikçi', value: 'Supplier' as const },
  ];

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['Customer'],
    phone: [''],
    taxOffice: [''],
    taxNo: [''],
    email: [''],
    address: [''],
    openingBalance: [0],
    discountRate: [0],
  });

  protected txnForm = this.fb.nonNullable.group({
    direction: ['Debit'],
    amount: [0, Validators.min(0.01)],
    description: [''],
  });

  ngOnInit(): void {
    // Global aramadan gelen ön filtre (?q=)
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) this.search.set(q);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getContacts({ page: this.page(), pageSize: this.pageSize, search: this.search(), type: this.typeFilter() }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }
  protected setType(t: '' | 'Customer' | 'Supplier'): void {
    this.typeFilter.set(t);
    this.page.set(1);
    this.load();
  }
  protected setPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', type: 'Customer', phone: '', taxOffice: '', taxNo: '', email: '', address: '', openingBalance: 0, discountRate: 0 });
    this.formOpen.set(true);
  }
  protected openEdit(c: ContactDto): void {
    this.editingId.set(c.id);
    this.form.reset({
      name: c.name, type: c.type, phone: c.phone ?? '', taxOffice: c.taxOffice ?? '',
      taxNo: c.taxNo ?? '', email: c.email ?? '', address: c.address ?? '', openingBalance: 0,
      discountRate: c.discountRate,
    });
    this.formOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    const id = this.editingId();
    const body = { ...v, openingBalance: +v.openingBalance, discountRate: +v.discountRate };
    const req = id ? this.api.updateContact(id, { ...body, isActive: true }) : this.api.createContact(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(id ? 'Cari güncellendi.' : 'Cari eklendi.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(c: ContactDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${c.name}" pasife alınacak. Devam edilsin mi?`, danger: true, confirmText: 'Pasife Al' }))) return;
    this.api.deleteContact(c.id).subscribe({
      next: () => {
        this.toast.success('Cari pasife alındı.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected openLedger(c: ContactDto): void {
    this.ledgerContact.set(c);
    this.ledgerTxns.set([]);
    this.overview.set(null);
    this.txnForm.reset({ direction: 'Debit', amount: 0, description: '' });
    this.api.getLedger(c.id).subscribe((l) => {
      this.ledgerContact.set(l.contact);
      this.ledgerTxns.set(l.transactions);
    });
    // Müşteri 360 özeti (LTV + sık alınanlar) — ekstre modalının üstünde gösterilir.
    this.api.getOverview(c.id).subscribe({ next: (o) => this.overview.set(o), error: () => {} });
  }

  protected addTxn(): void {
    const c = this.ledgerContact();
    if (!c) return;
    const v = this.txnForm.getRawValue();
    if (+v.amount <= 0) {
      this.toast.error('Tutar 0\'dan büyük olmalı.');
      return;
    }
    this.saving.set(true);
    this.api.addTransaction(c.id, { direction: v.direction, amount: +v.amount, description: v.description || null }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Hareket eklendi.');
        this.openLedger(c);
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
