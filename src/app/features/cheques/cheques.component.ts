import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ChequesApi } from '../../core/api/cheques.api';
import { ContactsApi } from '../../core/api/contacts.api';
import {
  ChequeDto,
  ChequeDirection,
  ChequeKind,
  ChequeStatus,
  ChequeSummaryDto,
} from '../../core/models';
import { apiError, formatDate, money } from '../../core/utils';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';

/**
 * Çek / Senet portföyü ekranı — alınan/verilen kıymetli evrak (vade + durum takibi).
 * Vade yakınlığı renkli rozetlerle gösterilir; yön (alınan/verilen) ve duruma göre filtrelenir.
 * Yeni evrak ekleme + durum değiştirme (tahsil/ödendi/karşılıksız...) + silme.
 */
@Component({
  selector: 'app-cheques',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Çek / Senet</h1>
        <p class="text-sm text-slate-500">Alınan ve verilen çek/senetlerin vade ve durum takibi.</p>
      </div>
      <button class="btn-primary" (click)="openCreate()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Çek / Senet
      </button>
    </div>

    <!-- Özet kartları -->
    <div class="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Portföy · Alınan</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <lucide-icon name="arrow-down-right" class="h-4 w-4"></lucide-icon>
          </span>
        </div>
        <p class="mt-2 text-xl font-black text-slate-900">{{ money(summary().portfolioReceived) }}</p>
        <p class="text-xs text-slate-400">Tahsil bekleyen alacak evrakı</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Portföy · Verilen</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <lucide-icon name="arrow-up-right" class="h-4 w-4"></lucide-icon>
          </span>
        </div>
        <p class="mt-2 text-xl font-black text-slate-900">{{ money(summary().portfolioGiven) }}</p>
        <p class="text-xs text-slate-400">Ödeme bekleyen borç evrakı</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Vadesi Geçen</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
            <lucide-icon name="triangle-alert" class="h-4 w-4"></lucide-icon>
          </span>
        </div>
        <p class="mt-2 text-xl font-black text-rose-600">{{ money(summary().overdueReceived) }}</p>
        <p class="text-xs text-slate-400">Vadesi geçmiş alacak evrakı</p>
      </div>
      <div class="card p-4">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Vadesi Yaklaşan</span>
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
            <lucide-icon name="clock" class="h-4 w-4"></lucide-icon>
          </span>
        </div>
        <p class="mt-2 text-xl font-black text-amber-600">{{ money(summary().dueSoonReceived) }}</p>
        <p class="text-xs text-slate-400">7 gün içinde vadesi gelen alacak</p>
      </div>
    </div>

    <!-- Filtreler -->
    <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
      <div class="flex flex-wrap gap-2">
        @for (d of directionFilters; track d.value) {
          <button
            class="rounded-lg px-3 py-1.5 text-sm font-semibold transition"
            [class]="direction() === d.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
            (click)="setDirection(d.value)">
            {{ d.label }}
          </button>
        }
      </div>
      <div class="ml-auto flex items-center gap-2">
        <lucide-icon name="filter" class="h-4 w-4 text-slate-400"></lucide-icon>
        <select class="select" [ngModel]="status()" (ngModelChange)="setStatus($event)">
          <option value="">Tüm durumlar</option>
          @for (s of statuses; track s.value) {
            <option [value]="s.value">{{ s.label }}</option>
          }
        </select>
      </div>
    </div>

    @if (error()) {
      <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{{ error() }}</div>
    }

    <!-- Liste -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Yön</th>
              <th class="table-th">Tür</th>
              <th class="table-th">Cari</th>
              <th class="table-th hidden md:table-cell">Banka / Seri</th>
              <th class="table-th">Vade</th>
              <th class="table-th text-right">Tutar</th>
              <th class="table-th">Durum</th>
              <th class="table-th text-right">İşlem</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td colspan="8" class="py-10 text-center text-sm text-slate-400">Yükleniyor…</td></tr>
            } @else if (!items().length) {
              <tr>
                <td colspan="8" class="py-12 text-center">
                  <div class="flex flex-col items-center gap-2">
                    <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                      <lucide-icon name="banknote" class="h-6 w-6"></lucide-icon>
                    </span>
                    <p class="text-sm font-medium text-slate-600">Kayıtlı çek/senet yok.</p>
                    <p class="text-xs text-slate-400">"Yeni Çek / Senet" ile ilk evrakınızı ekleyin.</p>
                  </div>
                </td>
              </tr>
            } @else {
              @for (c of items(); track c.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td">
                    <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold"
                          [class]="c.direction === 'Received' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'">
                      <lucide-icon [name]="c.direction === 'Received' ? 'arrow-down-right' : 'arrow-up-right'" class="h-3 w-3"></lucide-icon>
                      {{ c.direction === 'Received' ? 'Alınan' : 'Verilen' }}
                    </span>
                  </td>
                  <td class="table-td text-slate-600">{{ c.kind === 'Cheque' ? 'Çek' : 'Senet' }}</td>
                  <td class="table-td font-medium text-slate-800">{{ c.contactName || '—' }}</td>
                  <td class="table-td hidden md:table-cell text-slate-500">
                    <span class="block">{{ c.bank || '—' }}</span>
                    @if (c.serialNo) { <span class="block text-xs text-slate-400">{{ c.serialNo }}</span> }
                  </td>
                  <td class="table-td">
                    <span class="block text-slate-700">{{ formatDate(c.dueDate) }}</span>
                    @if (c.status === 'Portfolio') {
                      <span class="mt-0.5 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-bold" [class]="dueCls(c.dueDate)">
                        {{ dueLabel(c.dueDate) }}
                      </span>
                    }
                  </td>
                  <td class="table-td text-right font-bold text-slate-900">{{ money(c.amount) }}</td>
                  <td class="table-td">
                    <span class="inline-flex rounded-full px-2 py-0.5 text-xs font-bold" [class]="statusCls(c.status)">
                      {{ statusLabel(c.status) }}
                    </span>
                  </td>
                  <td class="table-td" (click)="$event.stopPropagation()">
                    <div class="flex items-center justify-end gap-2">
                      <select class="select py-1 text-xs" title="Durum değiştir"
                              (change)="onStatusChange(c, $any($event.target).value); $any($event.target).value = ''">
                        <option value="" disabled selected>Durum ▾</option>
                        @for (s of statuses; track s.value) {
                          @if (s.value !== c.status) { <option [value]="s.value">{{ s.label }}</option> }
                        }
                      </select>
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(c)">
                        <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Yeni evrak modalı -->
    @if (formOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" (click)="formOpen.set(false)">
        <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-bold text-slate-900">Yeni Çek / Senet</h2>
            <button class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" (click)="formOpen.set(false)">
              <lucide-icon name="x" class="h-5 w-5"></lucide-icon>
            </button>
          </div>

          <form (ngSubmit)="save()" class="space-y-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Tür</label>
                <select class="select" [(ngModel)]="draft.kind" name="kind">
                  <option value="Cheque">Çek</option>
                  <option value="PromissoryNote">Senet</option>
                </select>
              </div>
              <div>
                <label class="label">Yön</label>
                <select class="select" [(ngModel)]="draft.direction" name="direction">
                  <option value="Received">Alınan (müşteriden)</option>
                  <option value="Given">Verilen (tedarikçiye)</option>
                </select>
              </div>
              <div class="sm:col-span-2">
                <label class="label">Cari (opsiyonel)</label>
                <select class="select" [(ngModel)]="draft.contactId" name="contactId">
                  <option value="">— Cari seçilmedi —</option>
                  @for (ct of contacts(); track ct.id) {
                    <option [value]="ct.id">{{ ct.name }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Tutar (₺) *</label>
                <input type="number" step="0.01" min="0" class="input" [(ngModel)]="draft.amount" name="amount" />
              </div>
              <div>
                <label class="label">Vade Tarihi *</label>
                <input type="date" class="input" [(ngModel)]="draft.dueDate" name="dueDate" />
              </div>
              <div>
                <label class="label">Banka</label>
                <input class="input" [(ngModel)]="draft.bank" name="bank" placeholder="Örn. Ziraat" />
              </div>
              <div>
                <label class="label">Seri No</label>
                <input class="input" [(ngModel)]="draft.serialNo" name="serialNo" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Not</label>
                <input class="input" [(ngModel)]="draft.note" name="note" />
              </div>
            </div>

            @if (formError()) {
              <p class="text-sm font-medium text-rose-600">{{ formError() }}</p>
            }

            <div class="flex justify-end gap-2 pt-2">
              <button type="button" class="btn-outline" (click)="formOpen.set(false)">İptal</button>
              <button type="submit" class="btn-primary" [disabled]="saving()">
                {{ saving() ? 'Kaydediliyor…' : 'Kaydet' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ChequesComponent implements OnInit {
  private api = inject(ChequesApi);
  private contactsApi = inject(ContactsApi);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  protected money = money;
  protected formatDate = formatDate;

  protected loading = signal(true);
  protected saving = signal(false);
  protected error = signal('');
  protected items = signal<ChequeDto[]>([]);
  protected summary = signal<ChequeSummaryDto>({
    portfolioReceived: 0,
    portfolioGiven: 0,
    overdueReceived: 0,
    dueSoonReceived: 0,
  });

  protected direction = signal<ChequeDirection | ''>('');
  protected status = signal<ChequeStatus | ''>('');

  protected formOpen = signal(false);
  protected formError = signal('');
  protected contacts = signal<{ id: string; name: string }[]>([]);

  protected draft: {
    kind: ChequeKind;
    direction: ChequeDirection;
    contactId: string;
    amount: number | null;
    dueDate: string;
    bank: string;
    serialNo: string;
    note: string;
  } = this.emptyDraft();

  protected readonly directionFilters: { label: string; value: ChequeDirection | '' }[] = [
    { label: 'Tümü', value: '' },
    { label: 'Alınan', value: 'Received' },
    { label: 'Verilen', value: 'Given' },
  ];

  protected readonly statuses: { label: string; value: ChequeStatus }[] = [
    { label: 'Portföyde', value: 'Portfolio' },
    { label: 'Tahsil edildi', value: 'Collected' },
    { label: 'Ciro edildi', value: 'Endorsed' },
    { label: 'Karşılıksız', value: 'Bounced' },
    { label: 'Ödendi', value: 'Paid' },
    { label: 'İptal', value: 'Cancelled' },
  ];

  ngOnInit(): void {
    this.load();
    this.loadContacts();
  }

  private emptyDraft() {
    return {
      kind: 'Cheque' as ChequeKind,
      direction: 'Received' as ChequeDirection,
      contactId: '',
      amount: null as number | null,
      dueDate: '',
      bank: '',
      serialNo: '',
      note: '',
    };
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(this.direction(), this.status()).subscribe({
      next: (r) => {
        this.items.set(r.items ?? []);
        if (r.summary) this.summary.set(r.summary);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiError(e));
        this.loading.set(false);
      },
    });
  }

  private loadContacts(): void {
    // Cari bağlama için hafif liste (opsiyonel — başarısız olursa evrak yine eklenebilir).
    this.contactsApi.getContacts({ pageSize: 500 }).subscribe({
      next: (r) => this.contacts.set((r.items ?? []).map((c) => ({ id: c.id, name: c.name }))),
      error: () => {},
    });
  }

  protected setDirection(d: ChequeDirection | ''): void {
    this.direction.set(d);
    this.load();
  }
  protected setStatus(s: ChequeStatus | ''): void {
    this.status.set(s);
    this.load();
  }

  protected openCreate(): void {
    this.draft = this.emptyDraft();
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected save(): void {
    const amount = Number(this.draft.amount);
    if (!amount || amount <= 0) {
      this.formError.set('Tutar sıfırdan büyük olmalı.');
      return;
    }
    if (!this.draft.dueDate) {
      this.formError.set('Vade tarihi zorunludur.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    this.api
      .create({
        kind: this.draft.kind,
        direction: this.draft.direction,
        contactId: this.draft.contactId || null,
        amount,
        dueDate: this.draft.dueDate,
        bank: this.draft.bank.trim() || null,
        serialNo: this.draft.serialNo.trim() || null,
        note: this.draft.note.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.load();
        },
        error: (e) => {
          this.saving.set(false);
          this.formError.set(apiError(e));
        },
      });
  }

  protected onStatusChange(c: ChequeDto, status: string): void {
    if (!status || status === c.status) return;
    this.api.updateStatus(c.id, status as ChequeStatus).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected async remove(c: ChequeDto): Promise<void> {
    const label = c.kind === 'Cheque' ? 'çek' : 'senet';
    if (!(await this.confirm.confirm({ message: `Bu ${label} kaydı silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.delete(c.id).subscribe({
      next: () => this.load(),
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  // --- Görünüm yardımcıları ---

  /** Vadeye kalan gün (UTC tarih bazlı; backend AppTime.Today ile tutarlı). */
  private daysUntil(due: string): number {
    const d = new Date(due);
    const dueUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return Math.round((dueUtc - todayUtc) / 86400000);
  }

  protected dueLabel(due: string): string {
    const d = this.daysUntil(due);
    if (d < 0) return `${Math.abs(d)} gün gecikti`;
    if (d === 0) return 'Bugün vadeli';
    return `${d} gün kaldı`;
  }

  protected dueCls(due: string): string {
    const d = this.daysUntil(due);
    if (d < 0) return 'bg-rose-100 text-rose-700';
    if (d <= 7) return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  }

  protected statusLabel(s: ChequeStatus): string {
    return this.statuses.find((x) => x.value === s)?.label ?? s;
  }

  protected statusCls(s: ChequeStatus): string {
    switch (s) {
      case 'Portfolio':
        return 'bg-sky-100 text-sky-700';
      case 'Collected':
      case 'Paid':
        return 'bg-emerald-100 text-emerald-700';
      case 'Endorsed':
        return 'bg-violet-100 text-violet-700';
      case 'Bounced':
        return 'bg-rose-100 text-rose-700';
      case 'Cancelled':
        return 'bg-slate-100 text-slate-500';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  }
}
