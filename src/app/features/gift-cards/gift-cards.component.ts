import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { GiftCardsApi } from '../../core/api/gift-cards.api';
import { ContactsApi } from '../../core/api/contacts.api';
import { ContactDto, GiftCardDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError, formatDate, money } from '../../core/utils';

/**
 * Hediye Çekleri ekranı: hediye çeklerini listeler, yeni çek keser (issue),
 * koda göre bakiye/durum sorgular ve aktif çeklerde manuel harcama (redeem) / iptal yapar.
 * Backend: GiftCardsController — Owner/Admin/Accountant rolleriyle sınırlıdır.
 */
@Component({
  selector: 'app-gift-cards',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Hediye Çekleri</h1>
        <p class="text-sm text-slate-500">Hediye çeki kesin, bakiye sorgulayın ve harcamaları takip edin.</p>
      </div>
      <button class="btn-primary" (click)="openIssue()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Hediye Çeki
      </button>
    </div>

    <!-- Koda göre sorgulama -->
    <div class="card mb-4 p-4">
      <label class="label">Kod ile Sorgula</label>
      <div class="flex flex-wrap gap-2">
        <input class="input max-w-xs" [(ngModel)]="lookupCode" name="lookupCode"
               inputmode="numeric" placeholder="12 haneli çek kodu"
               (keyup.enter)="lookup()" />
        <button class="btn-primary" [disabled]="looking()" (click)="lookup()">
          <lucide-icon name="search" class="h-4 w-4"></lucide-icon> Sorgula
        </button>
        @if (found()) {
          <button class="btn-ghost" (click)="clearLookup()">Temizle</button>
        }
      </div>
      @if (found(); as f) {
        <div class="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div>
            <p class="text-xs text-slate-400">Kod</p>
            <p class="font-mono font-bold tracking-wider text-slate-800">{{ f.code }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Bakiye</p>
            <p class="font-bold text-brand-600">{{ money(f.balance) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Başlangıç</p>
            <p class="text-slate-600">{{ money(f.initialBalance) }}</p>
          </div>
          <div>
            <p class="text-xs text-slate-400">Durum</p>
            <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="statusClass(f)">{{ statusLabel(f) }}</span>
          </div>
          @if (f.expiresAt) {
            <div>
              <p class="text-xs text-slate-400">Son Kullanım</p>
              <p class="text-slate-600">{{ formatDate(f.expiresAt) }}</p>
            </div>
          }
        </div>
      }
    </div>

    <!-- Kesim formu -->
    @if (issueOpen()) {
      <div class="card mb-4 p-4">
        <h2 class="mb-3 font-semibold text-slate-700">Yeni Hediye Çeki</h2>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Tutar (₺) <span class="text-rose-500">*</span></label>
            <input class="input" type="number" min="0" step="0.01" [(ngModel)]="form.initialBalance" name="initialBalance"
                   placeholder="Örn. 250" />
          </div>
          <div>
            <label class="label">Müşteri <span class="text-slate-400">(opsiyonel)</span></label>
            <select class="input" [(ngModel)]="form.contactId" name="contactId">
              <option [ngValue]="null">— Seçilmedi —</option>
              @for (c of contacts(); track c.id) {
                <option [ngValue]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Son Kullanım Tarihi <span class="text-slate-400">(opsiyonel)</span></label>
            <input class="input" type="date" [(ngModel)]="form.expiresAt" name="expiresAt" />
          </div>
          <div>
            <label class="label">Not <span class="text-slate-400">(opsiyonel)</span></label>
            <input class="input" [(ngModel)]="form.note" name="note" placeholder="Örn. Doğum günü hediyesi" />
          </div>
          <div class="flex items-end gap-2 sm:col-span-2">
            <button class="btn-primary" [disabled]="saving()" (click)="issue()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Çek Kes
            </button>
            <button type="button" class="btn-ghost" (click)="issueOpen.set(false)">Vazgeç</button>
          </div>
        </div>
      </div>
    }

    <!-- Liste -->
    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (!cards().length) {
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="gift" class="h-6 w-6"></lucide-icon>
          </span>
          <p class="text-sm font-medium text-slate-600">Henüz hediye çeki yok.</p>
          <p class="text-xs text-slate-400">"Yeni Hediye Çeki" ile ilk çeki kesebilirsiniz.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Kod</th>
                <th class="table-th">Müşteri</th>
                <th class="table-th text-right">Başlangıç</th>
                <th class="table-th text-right">Bakiye</th>
                <th class="table-th text-center">Durum</th>
                <th class="table-th">Son Kullanım</th>
                <th class="table-th">Kesim</th>
                <th class="table-th text-right">İşlem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (g of cards(); track g.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td font-mono font-semibold tracking-wider text-slate-800">{{ g.code }}</td>
                  <td class="table-td text-slate-600">{{ g.contactName || '—' }}</td>
                  <td class="table-td text-right text-slate-500">{{ money(g.initialBalance) }}</td>
                  <td class="table-td text-right font-bold text-brand-600">{{ money(g.balance) }}</td>
                  <td class="table-td text-center">
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="statusClass(g)">{{ statusLabel(g) }}</span>
                  </td>
                  <td class="table-td text-slate-500">{{ g.expiresAt ? formatDate(g.expiresAt) : '—' }}</td>
                  <td class="table-td text-slate-500">{{ formatDate(g.createdAt) }}</td>
                  <td class="table-td text-right">
                    @if (g.status === 'Active') {
                      <button class="icon-btn" title="Harcama gir" (click)="redeem(g)">
                        <lucide-icon name="minus-circle" class="h-4 w-4"></lucide-icon>
                      </button>
                      <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="İptal et" (click)="cancel(g)">
                        <lucide-icon name="ban" class="h-4 w-4"></lucide-icon>
                      </button>
                    } @else {
                      <span class="text-xs text-slate-300">—</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `.icon-btn { border-radius:.5rem; padding:.5rem; color:#94a3b8; }
     .icon-btn:hover { background:#f1f5f9; color:#334155; }`,
  ],
})
export class GiftCardsComponent implements OnInit {
  private api = inject(GiftCardsApi);
  private contactsApi = inject(ContactsApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected money = money;
  protected formatDate = formatDate;

  protected loading = signal(true);
  protected saving = signal(false);
  protected looking = signal(false);
  protected cards = signal<GiftCardDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected issueOpen = signal(false);
  protected found = signal<GiftCardDto | null>(null);

  protected lookupCode = '';
  protected form: { initialBalance: number | null; contactId: string | null; expiresAt: string | null; note: string | null } = {
    initialBalance: null,
    contactId: null,
    expiresAt: null,
    note: null,
  };

  ngOnInit(): void {
    this.load();
    this.contactsApi.getContacts({ pageSize: 500 }).subscribe({
      next: (r) => this.contacts.set(r?.items ?? []),
      error: () => {},
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (r) => {
        this.cards.set(r ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openIssue(): void {
    this.form = { initialBalance: null, contactId: null, expiresAt: null, note: null };
    this.issueOpen.set(true);
  }

  protected issue(): void {
    const amount = Number(this.form.initialBalance);
    if (!amount || amount <= 0) {
      this.toast.error('Başlangıç bakiyesi sıfırdan büyük olmalı.');
      return;
    }
    this.saving.set(true);
    this.api
      .issue({
        initialBalance: amount,
        contactId: this.form.contactId || null,
        expiresAt: this.form.expiresAt || null,
        note: this.form.note?.trim() || null,
      })
      .subscribe({
        next: (g) => {
          this.saving.set(false);
          this.issueOpen.set(false);
          this.toast.success(`Hediye çeki kesildi: ${g.code}`);
          this.load();
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(apiError(e));
        },
      });
  }

  protected lookup(): void {
    const code = this.lookupCode.trim();
    if (!code) {
      this.toast.error('Lütfen bir çek kodu girin.');
      return;
    }
    this.looking.set(true);
    this.found.set(null);
    this.api.getByCode(code).subscribe({
      next: (g) => {
        this.found.set(g);
        this.looking.set(false);
      },
      error: (e) => {
        this.looking.set(false);
        this.toast.error(apiError(e, 'Bu koda ait hediye çeki bulunamadı.'));
      },
    });
  }

  protected clearLookup(): void {
    this.lookupCode = '';
    this.found.set(null);
  }

  protected redeem(g: GiftCardDto): void {
    const input = prompt(`"${g.code}" çekinden harcanacak tutar (₺). Bakiye: ${money(g.balance)}`, '');
    if (input === null) return;
    const amount = Number(input.trim().replace(',', '.'));
    if (!amount || amount <= 0) {
      this.toast.error('Harcama tutarı sıfırdan büyük olmalı.');
      return;
    }
    this.api.redeem(g.code, { amount }).subscribe({
      next: (updated) => {
        this.toast.success(`Harcama işlendi. Kalan bakiye: ${money(updated.balance)}`);
        this.load();
        if (this.found()?.id === updated.id) this.found.set(updated);
      },
      // Hata (özellikle 409 = aynı çeki başka bir kasa aynı anda harcadı) sonrası listeyi TAZELE:
      // yoksa satır bayat bakiyeyi gösterir, kullanıcı aynı tutarı tekrar dener ve ikinci bir hata alır.
      error: (e) => { this.toast.error(apiError(e)); this.load(); },
    });
  }

  protected async cancel(g: GiftCardDto): Promise<void> {
    if (!(await this.confirm.confirm({
      message: `"${g.code}" hediye çeki iptal edilsin mi? Kalan bakiye (${money(g.balance)}) kullanılamaz hale gelir.`,
      danger: true,
      confirmText: 'İptal Et',
    }))) return;
    this.api.cancel(g.id).subscribe({
      next: (updated) => {
        this.toast.success('Hediye çeki iptal edildi.');
        this.load();
        if (this.found()?.id === updated.id) this.found.set(updated);
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  /** Süresi geçmiş aktif çeki "expired" olarak işaretler (durum hâlâ Active olsa da). */
  private isExpired(g: GiftCardDto): boolean {
    return g.status === 'Active' && !!g.expiresAt && new Date(g.expiresAt).getTime() < Date.now();
  }

  protected statusLabel(g: GiftCardDto): string {
    if (this.isExpired(g)) return 'Süresi Doldu';
    switch (g.status) {
      case 'Active': return 'Aktif';
      case 'Used': return 'Kullanıldı';
      case 'Cancelled': return 'İptal';
      default: return g.status;
    }
  }

  protected statusClass(g: GiftCardDto): string {
    if (this.isExpired(g)) return 'bg-amber-100 text-amber-700';
    switch (g.status) {
      case 'Active': return 'bg-emerald-100 text-emerald-700';
      case 'Used': return 'bg-slate-100 text-slate-600';
      case 'Cancelled': return 'bg-rose-100 text-rose-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  }
}
