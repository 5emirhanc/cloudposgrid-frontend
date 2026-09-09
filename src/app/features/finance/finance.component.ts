import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { FinanceApi } from '../../core/api/finance.api';
import { CashAccountDto, CashShiftDto, FinanceTransactionDto, RecurringExpenseDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError, formatDate, money } from '../../core/utils';

@Component({
  selector: 'app-finance',
  imports: [ReactiveFormsModule, LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="finance" title="Kasalarınızı ve para giriş-çıkışlarınızı buradan takip edin">
      <li>Kasa butonuyla nakit veya banka hesabı açın</li>
      <li>Gelir butonuyla para girişini kasa ve tutarla kaydedin</li>
      <li>Gider butonuyla ödemelerinizi kategori ve açıklamayla girin</li>
      <li>Hareketleri Gelir ya da Gider olarak filtreleyin</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Kasa & Gelir-Gider</h1>
        <p class="text-sm text-slate-500">Nakit/banka hesapları ve hareketleri</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-outline" (click)="openCashModal()"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Kasa</button>
        <button class="btn-outline" (click)="openRecurring()"><lucide-icon name="refresh-cw" class="h-4 w-4"></lucide-icon> Sabit Giderler</button>
        <button class="btn-outline" (click)="openShiftModal()"><lucide-icon name="clock" class="h-4 w-4"></lucide-icon> Vardiya</button>
        <button class="btn-primary" (click)="openTxn('Income')"><lucide-icon name="trending-up" class="h-4 w-4"></lucide-icon> Gelir</button>
        <button class="btn-danger" (click)="openTxn('Expense')"><lucide-icon name="trending-down" class="h-4 w-4"></lucide-icon> Gider</button>
      </div>
    </div>

    <!-- Kasa kartları -->
    <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      @for (a of accounts(); track a.id) {
        <div class="kpi-card">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-sm font-medium text-slate-500">{{ a.name }}</p>
              <p class="mt-1 text-xl font-black" [class.text-rose-600]="a.balance < 0" [class.text-slate-900]="a.balance >= 0">{{ money(a.balance) }}</p>
            </div>
            <span class="flex h-10 w-10 items-center justify-center rounded-xl" [class]="a.type === 'Cash' ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'">
              <lucide-icon [name]="a.type === 'Cash' ? 'banknote' : 'credit-card'" class="h-5 w-5"></lucide-icon>
            </span>
          </div>
          <p class="mt-2 text-xs text-slate-400">{{ a.type === 'Cash' ? 'Nakit Kasa' : 'Banka' }}</p>
        </div>
      }
    </div>

    <!-- Hareketler -->
    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        @for (f of typeFilters; track f.value) {
          <button class="chip" [class.chip-active]="typeFilter() === f.value" (click)="setType(f.value)">{{ f.label }}</button>
        }
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Tarih</th>
              <th class="table-th">Açıklama</th>
              <th class="table-th">Kategori</th>
              <th class="table-th">Kasa</th>
              <th class="table-th text-right">Tutar</th>
              <th class="table-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (!items().length) {
              <tr><td colspan="6" class="py-10 text-center text-sm text-slate-400">Hareket yok.</td></tr>
            } @else {
              @for (t of items(); track t.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td whitespace-nowrap text-slate-500">{{ formatDate(t.date) }}</td>
                  <td class="table-td">
                    <div class="flex items-center gap-3">
                      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" [class]="t.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'">
                        <lucide-icon [name]="t.type === 'Income' ? 'trending-up' : 'trending-down'" class="h-4 w-4"></lucide-icon>
                      </span>
                      <span class="font-medium text-slate-800">{{ t.description || '—' }}</span>
                    </div>
                  </td>
                  <td class="table-td text-slate-500">{{ t.category || '—' }}</td>
                  <td class="table-td text-slate-500">{{ t.cashAccountName }}</td>
                  <td class="table-td text-right font-semibold" [class.text-emerald-600]="t.type === 'Income'" [class.text-rose-600]="t.type === 'Expense'">
                    {{ t.type === 'Income' ? '+' : '−' }}{{ money(t.amount) }}
                  </td>
                  <td class="table-td text-right">
                    <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(t)"><lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon></button>
                  </td>
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

    <!-- Gelir/Gider modal -->
    @if (txnOpen()) {
      <app-modal [title]="txnForm.getRawValue().type === 'Income' ? 'Gelir Ekle' : 'Gider Ekle'" (dismiss)="txnOpen.set(false)">
        <form [formGroup]="txnForm" (ngSubmit)="saveTxn()" class="space-y-4">
          <div>
            <label class="label">Kasa</label>
            <select class="select" formControlName="cashAccountId">
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Tutar</label>
              <input type="number" step="0.01" class="input" formControlName="amount" />
            </div>
            <div>
              <label class="label">Yöntem</label>
              <select class="select" formControlName="paymentMethod">
                <option value="Cash">Nakit</option>
                <option value="Card">Kart</option>
                <option value="Transfer">Havale</option>
              </select>
            </div>
          </div>
          <div>
            <label class="label">Kategori</label>
            <input class="input" formControlName="category" placeholder="Örn. Kira, Maaş, Satış" />
          </div>
          <div>
            <label class="label">Açıklama</label>
            <input class="input" formControlName="description" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="txnOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Kaydet</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Kasa modal -->
    @if (cashOpen()) {
      <app-modal title="Yeni Kasa / Banka" (dismiss)="cashOpen.set(false)">
        <form [formGroup]="cashForm" (ngSubmit)="saveCash()" class="space-y-4">
          <div>
            <label class="label">Ad</label>
            <input class="input" formControlName="name" placeholder="Örn. Ziraat Banka" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="label">Tip</label>
              <select class="select" formControlName="type">
                <option value="Cash">Nakit</option>
                <option value="Bank">Banka</option>
              </select>
            </div>
            <div>
              <label class="label">Açılış Bakiyesi</label>
              <input type="number" step="0.01" class="input" formControlName="openingBalance" />
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="cashOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Kaydet</button>
          </div>
        </form>
      </app-modal>
    }

    @if (recurringOpen()) {
      <app-modal title="Tekrarlayan (Sabit) Giderler" maxWidth="44rem" (dismiss)="recurringOpen.set(false)">
        <p class="mb-3 text-xs text-slate-500">Kira, maaş, abonelik gibi her ay tekrar eden giderler. Vadesi (ayın günü) gelince otomatik gider olarak yazılır.</p>

        <form [formGroup]="recForm" (ngSubmit)="saveRec()" class="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Gider Adı</label>
            <input class="input" formControlName="name" placeholder="Örn. Dükkan kirası" />
          </div>
          <div>
            <label class="label">Tutar</label>
            <input type="number" step="0.01" class="input" formControlName="amount" />
          </div>
          <div>
            <label class="label">Kategori <span class="text-xs font-normal text-slate-400">(ops.)</span></label>
            <input class="input" formControlName="category" placeholder="Kira / Maaş..." />
          </div>
          <div>
            <label class="label">Kasa</label>
            <select class="select" formControlName="cashAccountId">
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>
          <div>
            <label class="label">Ayın Günü (1–28)</label>
            <input type="number" min="1" max="28" class="input" formControlName="dueDay" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Açıklama <span class="text-xs font-normal text-slate-400">(ops.)</span></label>
            <input class="input" formControlName="description" />
          </div>
          <div class="flex justify-end gap-2 sm:col-span-2">
            @if (editingRecId()) { <button type="button" class="btn-outline btn-sm" (click)="resetRecForm()">Vazgeç</button> }
            <button type="submit" class="btn-primary btn-sm" [disabled]="recSaving()">{{ editingRecId() ? 'Güncelle' : 'Ekle' }}</button>
          </div>
        </form>

        @if (recurring().length) {
          <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full text-sm">
              <thead><tr class="text-xs text-slate-400">
                <th class="px-3 py-2 text-left font-medium">Gider</th>
                <th class="px-2 py-2 text-right font-medium">Tutar</th>
                <th class="px-2 py-2 text-center font-medium">Gün</th>
                <th class="px-2 py-2 text-center font-medium">Bu ay</th>
                <th class="w-16"></th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                @for (r of recurring(); track r.id) {
                  <tr [class.opacity-50]="!r.isActive">
                    <td class="px-3 py-2 text-slate-700">{{ r.name }}<span class="block text-xs text-slate-400">{{ r.cashAccountName }}@if (r.category) { · {{ r.category }} }</span></td>
                    <td class="px-2 py-2 text-right font-semibold text-rose-600">{{ money(r.amount) }}</td>
                    <td class="px-2 py-2 text-center text-slate-500">{{ r.dueDay }}</td>
                    <td class="px-2 py-2 text-center">
                      @if (r.postedThisPeriod) {
                        <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">İşlendi</span>
                      } @else {
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Bekliyor</span>
                      }
                    </td>
                    <td class="px-2 py-2">
                      <div class="flex justify-end gap-1">
                        <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Düzenle" (click)="editRec(r)"><lucide-icon name="pencil" class="h-4 w-4"></lucide-icon></button>
                        <button class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="deleteRec(r)"><lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon></button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else { <p class="py-6 text-center text-sm text-slate-400">Henüz tekrarlayan gider yok.</p> }
      </app-modal>
    }

    @if (shiftModalOpen()) {
      <app-modal title="Kasa Vardiyası" maxWidth="42rem" (dismiss)="shiftModalOpen.set(false)">
        <div class="space-y-4">
          <div>
            <label class="label">Kasa</label>
            <select class="select" [value]="shiftAccountId()" (change)="onShiftAccountChange($any($event.target).value)">
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
            </select>
          </div>

          @if (currentShift(); as s) {
            <div class="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
              <p class="text-sm font-medium text-emerald-700">Açık vardiya</p>
              <p class="text-xs text-slate-500">Açılış: {{ formatDate(s.openedAt) }} · {{ s.openedByName || '—' }} · Başlangıç {{ money(s.openingFloat) }}</p>
            </div>
            <div>
              <label class="label">Sayılan Nakit (kör sayım)</label>
              <input type="number" step="0.01" class="input" [value]="countedAmount()" (input)="countedAmount.set(+$any($event.target).value)" placeholder="Kasadaki fiziksel tutarı sayıp girin" />
              <p class="mt-1 text-xs text-slate-400">Beklenen tutarı görmeden sayın; kapatınca fark gösterilir.</p>
            </div>
            <div class="flex justify-end">
              <button class="btn-primary" [disabled]="shiftSaving()" (click)="doCloseShift()">Vardiyayı Kapat</button>
            </div>
          } @else if (lastClosed(); as lc) {
            <div class="rounded-xl border p-4" [class]="(lc.difference ?? 0) === 0 ? 'border-emerald-200 bg-emerald-50' : ((lc.difference ?? 0) < 0 ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50')">
              <p class="text-sm font-bold text-slate-800">Vardiya kapandı</p>
              <div class="mt-2 grid grid-cols-3 gap-2 text-center">
                <div><p class="text-xs text-slate-500">Beklenen</p><p class="font-black text-slate-800">{{ money(lc.expectedAmount) }}</p></div>
                <div><p class="text-xs text-slate-500">Sayılan</p><p class="font-black text-slate-800">{{ money(lc.countedAmount) }}</p></div>
                <div><p class="text-xs text-slate-500">Fark</p><p class="font-black" [class]="(lc.difference ?? 0) === 0 ? 'text-emerald-600' : ((lc.difference ?? 0) < 0 ? 'text-rose-600' : 'text-amber-600')">{{ money(lc.difference) }}</p></div>
              </div>
              <p class="mt-2 text-center text-xs text-slate-500">
                {{ (lc.difference ?? 0) === 0 ? 'Kasa tam tutuyor ✓' : ((lc.difference ?? 0) < 0 ? 'Kasa açığı (eksik para)' : 'Kasa fazlası') }}
              </p>
            </div>
          } @else {
            <div>
              <label class="label">Açılış Nakdi (başlangıç bozuk parası)</label>
              <input type="number" step="0.01" class="input" [value]="openingFloat()" (input)="openingFloat.set(+$any($event.target).value)" />
            </div>
            <div class="flex justify-end">
              <button class="btn-primary" [disabled]="shiftSaving()" (click)="doOpenShift()">Vardiya Aç</button>
            </div>
          }

          @if (shifts().length) {
            <div>
              <p class="mb-2 text-xs font-bold uppercase text-slate-500">Son Vardiyalar</p>
              <div class="overflow-x-auto rounded-xl border border-slate-100">
                <table class="w-full text-sm">
                  <thead><tr class="text-xs text-slate-400">
                    <th class="px-3 py-2 text-left font-medium">Kasa</th>
                    <th class="px-2 py-2 text-left font-medium">Açılış</th>
                    <th class="px-2 py-2 text-right font-medium">Beklenen</th>
                    <th class="px-2 py-2 text-right font-medium">Sayılan</th>
                    <th class="px-3 py-2 text-right font-medium">Fark</th>
                  </tr></thead>
                  <tbody class="divide-y divide-slate-50">
                    @for (s of shifts(); track s.id) {
                      <tr>
                        <td class="px-3 py-2 text-slate-700">{{ s.cashAccountName }}</td>
                        <td class="px-2 py-2 text-slate-500">{{ formatDate(s.openedAt) }}</td>
                        <td class="px-2 py-2 text-right text-slate-600">{{ s.expectedAmount != null ? money(s.expectedAmount) : '—' }}</td>
                        <td class="px-2 py-2 text-right text-slate-600">{{ s.countedAmount != null ? money(s.countedAmount) : '—' }}</td>
                        <td class="px-3 py-2 text-right font-semibold" [class]="s.difference == null ? 'text-slate-400' : ((s.difference ?? 0) === 0 ? 'text-emerald-600' : ((s.difference ?? 0) < 0 ? 'text-rose-600' : 'text-amber-600'))">
                          {{ s.status === 'Open' ? 'Açık' : money(s.difference) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </div>
      </app-modal>
    }
  `,
})
export class FinanceComponent implements OnInit {
  private api = inject(FinanceApi);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected money = money;
  protected formatDate = formatDate;
  protected readonly pageSize = 15;

  protected loading = signal(true);
  protected saving = signal(false);
  protected accounts = signal<CashAccountDto[]>([]);
  protected items = signal<FinanceTransactionDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected typeFilter = signal<'' | 'Income' | 'Expense'>('');
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  protected txnOpen = signal(false);
  protected cashOpen = signal(false);

  protected typeFilters = [
    { label: 'Tümü', value: '' as const },
    { label: 'Gelir', value: 'Income' as const },
    { label: 'Gider', value: 'Expense' as const },
  ];

  protected txnForm = this.fb.nonNullable.group({
    cashAccountId: ['', Validators.required],
    type: ['Income'],
    amount: [0],
    paymentMethod: ['Cash'],
    category: [''],
    description: [''],
  });

  protected cashForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['Cash'],
    openingBalance: [0],
  });

  // ---- Tekrarlayan giderler ----
  protected recurringOpen = signal(false);
  protected recSaving = signal(false);
  protected recurring = signal<RecurringExpenseDto[]>([]);
  protected editingRecId = signal<string | null>(null);
  protected recForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    amount: [0],
    category: [''],
    cashAccountId: ['', Validators.required],
    dueDay: [1],
    description: [''],
  });

  // ---- Kasa vardiyası ----
  protected shiftModalOpen = signal(false);
  protected shiftSaving = signal(false);
  protected shiftAccountId = signal('');
  protected currentShift = signal<CashShiftDto | null>(null);
  protected shifts = signal<CashShiftDto[]>([]);
  protected openingFloat = signal(0);
  protected countedAmount = signal(0);
  protected lastClosed = signal<CashShiftDto | null>(null);

  ngOnInit(): void {
    this.loadAccounts();
    this.load();
    this.processRecurring(); // vadesi gelen sabit giderleri otomatik yaz (idempotent)
  }

  private loadAccounts(): void {
    this.api.getCashAccounts().subscribe((a) => this.accounts.set(a));
  }

  private load(): void {
    this.loading.set(true);
    this.api.getTransactions({ page: this.page(), pageSize: this.pageSize, type: this.typeFilter() }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected setType(t: '' | 'Income' | 'Expense'): void {
    this.typeFilter.set(t);
    this.page.set(1);
    this.load();
  }
  protected setPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  protected openTxn(type: 'Income' | 'Expense'): void {
    if (!this.accounts().length) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    this.txnForm.reset({ cashAccountId: this.accounts()[0].id, type, amount: 0, paymentMethod: 'Cash', category: '', description: '' });
    this.txnOpen.set(true);
  }

  protected saveTxn(): void {
    const v = this.txnForm.getRawValue();
    if (+v.amount <= 0) {
      this.toast.error('Tutar 0\'dan büyük olmalı.');
      return;
    }
    this.saving.set(true);
    this.api.createTransaction({ ...v, amount: +v.amount }).subscribe({
      next: () => {
        this.saving.set(false);
        this.txnOpen.set(false);
        this.toast.success('Hareket eklendi.');
        this.loadAccounts();
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openCashModal(): void {
    this.cashForm.reset({ name: '', type: 'Cash', openingBalance: 0 });
    this.cashOpen.set(true);
  }

  protected saveCash(): void {
    if (this.cashForm.invalid) return;
    const v = this.cashForm.getRawValue();
    this.saving.set(true);
    this.api.createCashAccount({ ...v, openingBalance: +v.openingBalance }).subscribe({
      next: () => {
        this.saving.set(false);
        this.cashOpen.set(false);
        this.toast.success('Kasa eklendi.');
        this.loadAccounts();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(t: FinanceTransactionDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: 'Bu hareket silinsin mi? Kasa bakiyesi düzeltilecek.', danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteTransaction(t.id).subscribe({
      next: () => {
        this.toast.success('Hareket silindi.');
        this.loadAccounts();
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  // ---- Tekrarlayan giderler ----
  private processRecurring(): void {
    this.api.processRecurring().subscribe({
      next: (r) => {
        if (r.postedCount > 0) {
          this.toast.success(`${r.postedCount} tekrarlayan gider işlendi (${this.money(r.postedAmount)}).`);
          this.loadAccounts();
          this.load();
        }
      },
      error: () => {},
    });
  }

  protected resetRecForm(): void {
    this.editingRecId.set(null);
    this.recForm.reset({ name: '', amount: 0, category: '', cashAccountId: this.accounts()[0]?.id ?? '', dueDay: 1, description: '' });
  }

  protected openRecurring(): void {
    if (!this.accounts().length) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    this.resetRecForm();
    this.loadRecurring();
    this.recurringOpen.set(true);
  }

  private loadRecurring(): void {
    this.api.getRecurring().subscribe((r) => this.recurring.set(r));
  }

  protected editRec(r: RecurringExpenseDto): void {
    this.editingRecId.set(r.id);
    this.recForm.reset({
      name: r.name, amount: r.amount, category: r.category ?? '',
      cashAccountId: r.cashAccountId, dueDay: r.dueDay, description: r.description ?? '',
    });
  }

  protected saveRec(): void {
    const v = this.recForm.getRawValue();
    if (!v.name.trim()) { this.toast.error('Gider adı girin.'); return; }
    if (+v.amount <= 0) { this.toast.error('Tutar 0\'dan büyük olmalı.'); return; }
    if (!v.cashAccountId) { this.toast.error('Kasa seçin.'); return; }
    this.recSaving.set(true);
    const body = {
      name: v.name.trim(), amount: +v.amount, category: v.category || null,
      cashAccountId: v.cashAccountId, dueDay: +v.dueDay, description: v.description || null,
    };
    const id = this.editingRecId();
    const req = id ? this.api.updateRecurring(id, { ...body, isActive: true }) : this.api.createRecurring(body);
    req.subscribe({
      next: () => {
        this.recSaving.set(false);
        this.resetRecForm();
        this.toast.success(id ? 'Güncellendi.' : 'Tekrarlayan gider eklendi.');
        this.loadRecurring();
      },
      error: (e) => { this.recSaving.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected async deleteRec(r: RecurringExpenseDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${r.name}" tekrarlayan gideri silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteRecurring(r.id).subscribe({
      next: () => { this.toast.success('Silindi.'); this.loadRecurring(); },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  // ---- Kasa vardiyası ----
  protected openShiftModal(): void {
    if (!this.accounts().length) { this.toast.error('Önce bir kasa ekleyin.'); return; }
    this.shiftAccountId.set(this.accounts()[0].id);
    this.openingFloat.set(0);
    this.countedAmount.set(0);
    this.lastClosed.set(null);
    this.loadShiftState();
    this.shiftModalOpen.set(true);
  }

  protected onShiftAccountChange(id: string): void {
    this.shiftAccountId.set(id);
    this.lastClosed.set(null);
    this.countedAmount.set(0);
    this.loadShiftState();
  }

  private loadShiftState(): void {
    const acc = this.shiftAccountId();
    if (!acc) return;
    this.api.getOpenShift(acc).subscribe((s) => this.currentShift.set(s ?? null));
    this.api.getShifts().subscribe((list) => this.shifts.set(list));
  }

  protected doOpenShift(): void {
    const acc = this.shiftAccountId();
    if (!acc) { this.toast.error('Kasa seçin.'); return; }
    if (+this.openingFloat() < 0) { this.toast.error('Açılış nakdi negatif olamaz.'); return; }
    this.shiftSaving.set(true);
    this.api.openShift({ cashAccountId: acc, openingFloat: +this.openingFloat(), note: null }).subscribe({
      next: (s) => { this.shiftSaving.set(false); this.currentShift.set(s); this.toast.success('Vardiya açıldı.'); this.loadShiftState(); },
      error: (e) => { this.shiftSaving.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected doCloseShift(): void {
    const s = this.currentShift();
    if (!s) return;
    this.shiftSaving.set(true);
    this.api.closeShift(s.id, { countedAmount: +this.countedAmount(), note: null }).subscribe({
      next: (res) => {
        this.shiftSaving.set(false);
        this.currentShift.set(null);
        this.lastClosed.set(res); // kör sayım → sonuç (beklenen/fark) sayımdan SONRA açığa çıkar
        this.loadShiftState();
        this.loadAccounts();
      },
      error: (e) => { this.shiftSaving.set(false); this.toast.error(apiError(e)); },
    });
  }
}
