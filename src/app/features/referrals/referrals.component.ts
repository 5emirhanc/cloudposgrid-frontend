import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { ModalComponent } from '../../shared/modal.component';
import { ReferralsApi } from '../../core/api/referrals.api';
import { ContactsApi } from '../../core/api/contacts.api';
import { ContactDto, ReferralDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError, formatDate, money } from '../../core/utils';

/**
 * Referans (tavsiye) programı ekranı: hangi cari kimi tavsiye etti, benzersiz kod,
 * ödül tutarı ve durum (Bekliyor / Ödüllendirildi / İptal) takibi. Yeni referans oluşturur
 * ve bekleyen bir referansın ödülünü "verildi" olarak işaretler.
 */
@Component({
  selector: 'app-referrals',
  imports: [FormsModule, LucideAngularModule, ModalComponent],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Referans Programı</h1>
        <p class="text-sm text-slate-500">Sizi tavsiye eden müşterilere ödül tanımlayın, kod ve durum takibi yapın.</p>
      </div>
      <button class="btn-primary" (click)="openCreate()">
        <lucide-icon name="user-plus" class="h-4 w-4"></lucide-icon> Yeni Referans
      </button>
    </div>

    <!-- Özet kartları -->
    <div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Toplam</p>
        <p class="mt-1 text-2xl font-black text-slate-900">{{ items().length }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Bekleyen</p>
        <p class="mt-1 text-2xl font-black text-amber-600">{{ pendingCount() }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Ödüllendirilen</p>
        <p class="mt-1 text-2xl font-black text-emerald-600">{{ rewardedCount() }}</p>
      </div>
      <div class="card p-4">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">Verilen Ödül</p>
        <p class="mt-1 text-2xl font-black text-slate-900">{{ money(rewardedTotal()) }}</p>
      </div>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Tavsiye Eden</th>
              <th class="table-th">Kod</th>
              <th class="table-th">Tavsiye Edilen</th>
              <th class="table-th text-right">Ödül</th>
              <th class="table-th text-center">Durum</th>
              <th class="table-th hidden sm:table-cell">Tarih</th>
              <th class="table-th text-right">İşlem</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td colspan="7" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (error()) {
              <tr><td colspan="7" class="py-10 text-center text-sm text-rose-500">{{ error() }}</td></tr>
            } @else if (!items().length) {
              <tr>
                <td colspan="7" class="py-12 text-center">
                  <span class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <lucide-icon name="user-plus" class="h-6 w-6"></lucide-icon>
                  </span>
                  <p class="text-sm font-medium text-slate-600">Henüz referans kaydı yok.</p>
                  <p class="text-xs text-slate-400">Sizi tavsiye eden müşteriler için ödül tanımlayarak başlayın.</p>
                </td>
              </tr>
            } @else {
              @for (r of items(); track r.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td font-semibold text-slate-800">{{ r.referrerName || 'Silinmiş cari' }}</td>
                  <td class="table-td">
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-slate-600">{{ r.code }}</span>
                  </td>
                  <td class="table-td text-slate-600">{{ r.referredName || referredName(r.referredContactId) }}</td>
                  <td class="table-td text-right font-semibold text-slate-800">{{ money(r.rewardAmount) }}</td>
                  <td class="table-td text-center">
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="statusClass(r.status)">{{ statusLabel(r.status) }}</span>
                  </td>
                  <td class="table-td hidden sm:table-cell whitespace-nowrap text-slate-500">{{ formatDate(r.createdAt) }}</td>
                  <td class="table-td">
                    <div class="flex items-center justify-end gap-1">
                      @if (r.status === 'Pending') {
                        <button class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50"
                                [disabled]="busyId() === r.id" title="Ödülü verildi olarak işaretle" (click)="markRewarded(r)">
                          <lucide-icon name="gift" class="mr-1 inline h-3.5 w-3.5"></lucide-icon> Ödüllendir
                        </button>
                      }
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              [disabled]="busyId() === r.id" title="Sil" (click)="remove(r)">
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

    <!-- Yeni referans modalı -->
    @if (formOpen()) {
      <app-modal title="Yeni Referans" (dismiss)="formOpen.set(false)">
        <form (ngSubmit)="save()" class="space-y-4">
          <div>
            <label class="label">Tavsiye Eden Cari *</label>
            <select class="select" [(ngModel)]="form.referrerContactId" name="referrerContactId" required>
              <option value="">Seçiniz...</option>
              @for (c of contacts(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
            <p class="mt-1 text-xs text-slate-400">Sizi başkasına tavsiye eden mevcut müşteri.</p>
          </div>
          <div>
            <label class="label">Tavsiye Edilen Cari</label>
            <select class="select" [(ngModel)]="form.referredContactId" name="referredContactId">
              <option value="">— (opsiyonel)</option>
              @for (c of contacts(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Ödül Tutarı (₺)</label>
            <input type="number" step="0.01" min="0" class="input" [(ngModel)]="form.rewardAmount" name="rewardAmount" />
          </div>
          <div>
            <label class="label">Not</label>
            <input class="input" [(ngModel)]="form.note" name="note" placeholder="İsteğe bağlı açıklama" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="formOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Kaydet</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class ReferralsComponent implements OnInit {
  private api = inject(ReferralsApi);
  private contactsApi = inject(ContactsApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected money = money;
  protected formatDate = formatDate;

  protected loading = signal(true);
  protected saving = signal(false);
  protected busyId = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected items = signal<ReferralDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);

  protected formOpen = signal(false);
  protected form: { referrerContactId: string; referredContactId: string; rewardAmount: number; note: string } = {
    referrerContactId: '',
    referredContactId: '',
    rewardAmount: 0,
    note: '',
  };

  protected pendingCount = computed(() => this.items().filter((r) => r.status === 'Pending').length);
  protected rewardedCount = computed(() => this.items().filter((r) => r.status === 'Rewarded').length);
  protected rewardedTotal = computed(() =>
    this.items().filter((r) => r.status === 'Rewarded').reduce((s, r) => s + (r.rewardAmount ?? 0), 0),
  );

  /** Server adı (r.referredName) yoksa yerel cari listesinden çözer. Listede yoksa (500-dışı / silinmiş)
   * "Silinmiş cari" DEME — canlı olabilir; nötr '—' göster (yanlış "silindi" etiketi vermemek için). */
  protected referredName(id: string | null | undefined): string {
    if (!id) return '—';
    return this.contacts().find((c) => c.id === id)?.name ?? '—';
  }

  ngOnInit(): void {
    this.load();
    // Cari listesi hem dropdown'lar hem de tavsiye edilen adını çözmek için gerekli.
    this.contactsApi.getContacts({ page: 1, pageSize: 500 }).subscribe({
      next: (r) => this.contacts.set(r.items ?? []),
      error: () => {},
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.list().subscribe({
      next: (r) => {
        this.items.set(r ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiError(e));
        this.loading.set(false);
      },
    });
  }

  protected openCreate(): void {
    this.form = { referrerContactId: '', referredContactId: '', rewardAmount: 0, note: '' };
    this.formOpen.set(true);
  }

  protected save(): void {
    if (!this.form.referrerContactId) {
      this.toast.error('Lütfen tavsiye eden cariyi seçin.');
      return;
    }
    if (+this.form.rewardAmount < 0) {
      this.toast.error('Ödül tutarı negatif olamaz.');
      return;
    }
    this.saving.set(true);
    this.api
      .create({
        referrerContactId: this.form.referrerContactId,
        referredContactId: this.form.referredContactId || null,
        rewardAmount: +this.form.rewardAmount,
        note: this.form.note?.trim() || null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.toast.success('Referans oluşturuldu.');
          this.load();
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(apiError(e));
        },
      });
  }

  protected markRewarded(r: ReferralDto): void {
    this.busyId.set(r.id);
    this.api.markRewarded(r.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Ödül verildi olarak işaretlendi.');
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(r: ReferralDto): Promise<void> {
    if (!(await this.confirm.confirm({
      message: `"${r.referrerName || 'Bu'}" referans kaydı silinecek. Devam edilsin mi?`,
      danger: true,
      confirmText: 'Sil',
    }))) return;
    this.busyId.set(r.id);
    this.api.delete(r.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Referans silindi.');
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'Pending': return 'Bekliyor';
      case 'Rewarded': return 'Ödüllendirildi';
      case 'Cancelled': return 'İptal';
      default: return status;
    }
  }

  protected statusClass(status: string): string {
    switch (status) {
      case 'Rewarded': return 'bg-emerald-100 text-emerald-700';
      case 'Cancelled': return 'bg-slate-100 text-slate-500';
      default: return 'bg-amber-100 text-amber-700';
    }
  }
}
