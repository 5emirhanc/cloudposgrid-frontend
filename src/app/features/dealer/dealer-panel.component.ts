import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { DealerApi } from '../../core/api/dealer.api';
import { DealerAuthService } from '../../core/dealer-auth.service';
import { ToastService } from '../../core/toast.service';
import { apiError, formatDate } from '../../core/utils';
import { BusinessType, DealerSummaryDto, DealerTenantDto, TenantStatus } from '../../core/models';

/** Bayi (#25) paneli — bayi kendi müşteri işletmelerini görür ve yeni işletme onboard eder. */
@Component({
  selector: 'app-dealer-panel',
  imports: [LucideAngularModule, FormsModule],
  template: `
    <!-- Üst çubuk: bayi kimliği + çıkış -->
    <header class="mb-6 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white">
      <div class="flex items-center gap-3">
        <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
          <lucide-icon name="store" class="h-5 w-5"></lucide-icon>
        </span>
        <div>
          <p class="text-lg font-extrabold leading-tight">{{ dealerAuth.dealer()?.name || 'Bayi Paneli' }}</p>
          <p class="text-xs text-slate-400">
            Bayi kodu: <span class="font-semibold text-slate-200">{{ dealerAuth.dealer()?.code || '—' }}</span>
          </p>
        </div>
      </div>
      <button class="btn-outline border-slate-600 text-slate-100 hover:bg-slate-800" (click)="dealerAuth.logout()">
        <lucide-icon name="log-out" class="h-4 w-4"></lucide-icon> Çıkış
      </button>
    </header>

    @if (loading()) {
      <p class="card py-16 text-center text-sm text-slate-400">Yükleniyor...</p>
    } @else if (error()) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <lucide-icon name="ban" class="h-6 w-6"></lucide-icon>
        </span>
        <p class="text-sm text-slate-500">{{ error() }}</p>
        <button class="btn-outline" (click)="load()">Tekrar dene</button>
      </div>
    } @else {

    <!-- Özet kartları -->
    @if (summary(); as s) {
      <div class="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="card flex items-center gap-3 p-4">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <lucide-icon name="building-2" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-xs font-medium text-slate-400">Toplam müşteri</p>
            <p class="text-2xl font-black text-slate-900">{{ s.totalTenants }}</p>
          </div>
        </div>
        <div class="card flex items-center gap-3 p-4">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <lucide-icon name="check" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-xs font-medium text-slate-400">Aktif</p>
            <p class="text-2xl font-black text-slate-900">{{ s.activeTenants }}</p>
          </div>
        </div>
        <div class="card flex items-center gap-3 p-4">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <lucide-icon name="rocket" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-xs font-medium text-slate-400">Deneme</p>
            <p class="text-2xl font-black text-slate-900">{{ s.trialTenants }}</p>
          </div>
        </div>
        <div class="card flex items-center gap-3 p-4">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <lucide-icon name="wallet" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-xs font-medium text-slate-400">Komisyon oranı</p>
            <p class="text-2xl font-black text-slate-900">%{{ s.commissionRate }}</p>
          </div>
        </div>
      </div>
    }

    <!-- Yeni müşteri işletmesi başlığı + aç/kapat -->
    <div class="mb-4 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Müşteri İşletmeleri</h1>
        <p class="text-sm text-slate-500">Bayiniz altındaki işletmeler ve yeni kurulum</p>
      </div>
      <button class="btn-primary" (click)="toggleForm()">
        <lucide-icon [name]="formOpen() ? 'x' : 'plus'" class="h-4 w-4"></lucide-icon>
        {{ formOpen() ? 'Vazgeç' : 'Yeni müşteri işletmesi' }}
      </button>
    </div>

    <!-- Onboard formu (satır içi / açılır) -->
    @if (formOpen()) {
      <div class="card mb-4 p-4">
        <h2 class="mb-3 font-semibold text-slate-700">Yeni müşteri işletmesi kur</h2>
        <form (ngSubmit)="submit()" class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">İşletme adı</label>
            <input class="input" name="companyName" [(ngModel)]="form.companyName" placeholder="Örn. Köşe Kafe" />
          </div>
          <div>
            <label class="label">Sahip ad-soyad</label>
            <input class="input" name="ownerFullName" [(ngModel)]="form.ownerFullName" placeholder="Ad Soyad" />
          </div>
          <div>
            <label class="label">Sahip e-posta</label>
            <input class="input" name="ownerEmail" type="email" [(ngModel)]="form.ownerEmail" placeholder="sahip@isletme.com" />
          </div>
          <div>
            <label class="label">Geçici şifre</label>
            <input class="input" name="ownerPassword" type="password" [(ngModel)]="form.ownerPassword" placeholder="En az 6 karakter" />
          </div>
          <div>
            <label class="label">Sektör</label>
            <select class="select" name="businessType" [(ngModel)]="form.businessType">
              @for (bt of businessTypes; track bt.value) {
                <option [value]="bt.value">{{ bt.label }}</option>
              }
            </select>
          </div>
          <div class="flex items-end gap-2 sm:col-span-2">
            <button class="btn-primary" [disabled]="saving()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
              {{ saving() ? 'Kuruluyor…' : 'İşletmeyi kur' }}
            </button>
            <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button>
          </div>
        </form>
      </div>
    }

    <!-- İşletmeler tablosu -->
    <div class="card overflow-hidden">
      @if (!tenants().length) {
        <p class="py-12 text-center text-sm text-slate-400">Henüz müşteri işletmesi yok — yukarıdan ekleyin.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead>
              <tr class="border-b border-slate-100">
                <th class="table-th">İşletme</th>
                <th class="table-th">Plan</th>
                <th class="table-th">Durum</th>
                <th class="table-th">Sektör</th>
                <th class="table-th">Kayıt tarihi</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tenants(); track t.id) {
                <tr class="border-b border-slate-50 hover:bg-slate-50/60">
                  <td class="table-td font-medium text-slate-800">{{ t.name }}</td>
                  <td class="table-td text-slate-600">{{ t.plan }}</td>
                  <td class="table-td">
                    <span [class]="statusBadge(t.status).cls">{{ statusBadge(t.status).label }}</span>
                  </td>
                  <td class="table-td text-slate-600">{{ businessTypeLabel(t.businessType) }}</td>
                  <td class="table-td text-slate-500">{{ formatDate(t.createdAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    }
  `,
})
export class DealerPanelComponent implements OnInit {
  private api = inject(DealerApi);
  protected dealerAuth = inject(DealerAuthService);
  private toast = inject(ToastService);

  protected readonly formatDate = formatDate;

  protected loading = signal(true);
  protected error = signal('');
  protected saving = signal(false);
  protected formOpen = signal(false);
  protected summary = signal<DealerSummaryDto | null>(null);
  protected tenants = signal<DealerTenantDto[]>([]);

  protected readonly businessTypes: { value: BusinessType; label: string }[] = [
    { value: 'General', label: 'Butik / Genel' },
    { value: 'Hospitality', label: 'Kafe / Restoran' },
    { value: 'Retail', label: 'Market / Perakende' },
    { value: 'Service', label: 'Servis / Tamir' },
    { value: 'Beauty', label: 'Kuaför / Güzellik' },
  ];

  protected form: {
    companyName: string;
    ownerFullName: string;
    ownerEmail: string;
    ownerPassword: string;
    businessType: BusinessType;
  } = this.emptyForm();

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      me: this.api.me(),
      summary: this.api.summary(),
      tenants: this.api.tenants(),
    }).subscribe({
      next: (r) => {
        // me() bayi bilgisini tazeler; oturum sinyali zaten doludur, ayrıca saklamaya gerek yok.
        this.summary.set(r.summary);
        this.tenants.set(r.tenants);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiError(e, 'Bayi paneli yüklenemedi.'));
        this.loading.set(false);
      },
    });
  }

  private reload(): void {
    // Onboard sonrası yalnız özet + liste tazelenir (bayi kimliği değişmez).
    forkJoin({ summary: this.api.summary(), tenants: this.api.tenants() }).subscribe({
      next: (r) => {
        this.summary.set(r.summary);
        this.tenants.set(r.tenants);
      },
      error: () => {},
    });
  }

  protected toggleForm(): void {
    this.formOpen.update((v) => !v);
    if (this.formOpen()) this.form = this.emptyForm();
  }

  protected submit(): void {
    const f = this.form;
    if (!f.companyName.trim() || !f.ownerFullName.trim() || !f.ownerEmail.trim()) {
      this.toast.error('İşletme adı, sahip ad-soyad ve e-posta zorunludur.');
      return;
    }
    if (f.ownerPassword.trim().length < 6) {
      this.toast.error('Geçici şifre en az 6 karakter olmalı.');
      return;
    }
    this.saving.set(true);
    this.api
      .onboard({
        companyName: f.companyName.trim(),
        ownerFullName: f.ownerFullName.trim(),
        ownerEmail: f.ownerEmail.trim(),
        ownerPassword: f.ownerPassword,
        businessType: f.businessType,
      })
      .subscribe({
        next: (r) => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.form = this.emptyForm();
          this.toast.success(`${r.ownerEmail} kuruldu`);
          this.reload();
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(apiError(e));
        },
      });
  }

  protected businessTypeLabel(bt: BusinessType): string {
    return this.businessTypes.find((x) => x.value === bt)?.label ?? bt;
  }

  protected statusBadge(status: TenantStatus): { cls: string; label: string } {
    switch (status) {
      case 'Active':
        return { cls: 'badge-green', label: 'Aktif' };
      case 'Trial':
        return { cls: 'badge-blue', label: 'Deneme' };
      case 'Suspended':
        return { cls: 'badge-amber', label: 'Askıda' };
      case 'Cancelled':
        return { cls: 'badge-red', label: 'İptal' };
      default:
        return { cls: 'badge-gray', label: status };
    }
  }

  private emptyForm() {
    return {
      companyName: '',
      ownerFullName: '',
      ownerEmail: '',
      ownerPassword: '',
      businessType: 'General' as BusinessType,
    };
  }
}
