import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminApi } from '../../core/api/admin.api';
import { DealerDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError, formatDate } from '../../core/utils';

@Component({
  selector: 'app-dealers-admin',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Bayiler</h1>
        <p class="text-sm text-slate-500">Yeniden-satıcı iş ortakları</p>
      </div>
      <button class="btn-primary" (click)="toggleForm()">
        <lucide-icon [name]="formOpen() ? 'x' : 'plus'" class="h-4 w-4"></lucide-icon>
        {{ formOpen() ? 'Vazgeç' : 'Yeni Bayi' }}
      </button>
    </div>

    @if (formOpen()) {
      <div class="card mb-4 p-4">
        <h2 class="mb-3 flex items-center gap-2 font-semibold text-slate-700">
          <lucide-icon name="user-cog" class="h-4 w-4 text-brand-600"></lucide-icon> Yeni Bayi
        </h2>
        <form (ngSubmit)="save()" class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Ad</label>
            <input class="input" name="name" [(ngModel)]="form.name" placeholder="Bayi adı / ünvanı" required />
          </div>
          <div>
            <label class="label">E-posta</label>
            <input class="input" name="email" type="email" [(ngModel)]="form.email" placeholder="bayi@ornek.com" required />
          </div>
          <div>
            <label class="label">Şifre</label>
            <input class="input" name="password" type="password" [(ngModel)]="form.password" placeholder="En az 6 karakter" required />
          </div>
          <div>
            <label class="label">Komisyon Oranı (%)</label>
            <input class="input" name="commissionRate" type="number" min="0" max="100" step="0.5"
              [(ngModel)]="form.commissionRate" placeholder="Örn. 10" required />
          </div>
          <div class="flex items-end gap-2 sm:col-span-2">
            <button class="btn-primary" [disabled]="saving()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ saving() ? 'Ekleniyor…' : 'Ekle' }}
            </button>
            <button type="button" class="btn-ghost" (click)="toggleForm()">Vazgeç</button>
          </div>
        </form>
      </div>
    }

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (error()) {
        <div class="flex flex-col items-center gap-3 py-10 text-center">
          <p class="text-sm text-rose-500">{{ error() }}</p>
          <button class="btn-outline" (click)="load()">Tekrar dene</button>
        </div>
      } @else if (!dealers().length) {
        <div class="flex flex-col items-center gap-3 py-12 text-center">
          <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="store" class="h-7 w-7"></lucide-icon>
          </span>
          <p class="text-sm text-slate-500">Henüz bayi yok. Sağ üstten yeni bayi ekleyin.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-left">
                <th class="table-th">Ad</th>
                <th class="table-th">E-posta</th>
                <th class="table-th">Kod</th>
                <th class="table-th text-right">Komisyon</th>
                <th class="table-th text-right">Müşteri</th>
                <th class="table-th">Durum</th>
                <th class="table-th text-right">İşlem</th>
              </tr>
            </thead>
            <tbody>
              @for (d of dealers(); track d.id) {
                <tr class="border-b border-slate-50 hover:bg-slate-50/60" [class.opacity-60]="!d.isActive">
                  <td class="table-td font-medium text-slate-800">
                    <div class="flex items-center gap-2.5">
                      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">
                        {{ initials(d.name) }}
                      </span>
                      <div class="min-w-0">
                        <p class="truncate">{{ d.name }}</p>
                        <p class="text-xs font-normal text-slate-400">{{ formatDate(d.createdAt) }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="table-td text-slate-500">
                    <span class="inline-flex items-center gap-1.5">
                      <lucide-icon name="mail" class="h-3.5 w-3.5 text-slate-400"></lucide-icon> {{ d.email }}
                    </span>
                  </td>
                  <td class="table-td">
                    <span class="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600">{{ d.code }}</span>
                  </td>
                  <td class="table-td text-right font-medium text-slate-700">%{{ d.commissionRate }}</td>
                  <td class="table-td text-right">
                    <span class="inline-flex items-center gap-1 text-slate-600">
                      <lucide-icon name="building-2" class="h-3.5 w-3.5 text-slate-400"></lucide-icon> {{ d.tenantCount }}
                    </span>
                  </td>
                  <td class="table-td">
                    @if (d.isActive) {
                      <span class="badge-green">Aktif</span>
                    } @else {
                      <span class="badge-gray">Pasif</span>
                    }
                  </td>
                  <td class="table-td text-right">
                    <button class="btn-outline" [disabled]="busyId() === d.id" (click)="toggleActive(d)">
                      @if (d.isActive) {
                        <lucide-icon name="ban" class="h-4 w-4"></lucide-icon> Pasifleştir
                      } @else {
                        <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Aktifleştir
                      }
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class DealersAdminComponent implements OnInit {
  private api = inject(AdminApi);
  private toast = inject(ToastService);

  protected readonly formatDate = formatDate;

  protected loading = signal(true);
  protected saving = signal(false);
  protected error = signal('');
  protected busyId = signal<string | null>(null);
  protected dealers = signal<DealerDto[]>([]);
  protected formOpen = signal(false);

  protected form = { name: '', email: '', password: '', commissionRate: 10 };

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.dealers().subscribe({
      next: (list) => {
        this.dealers.set(list);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiError(e));
        this.loading.set(false);
      },
    });
  }

  protected toggleForm(): void {
    this.formOpen.update((v) => !v);
    if (!this.formOpen()) this.resetForm();
  }

  private resetForm(): void {
    this.form = { name: '', email: '', password: '', commissionRate: 10 };
  }

  protected initials(name: string): string {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  protected save(): void {
    const name = this.form.name.trim();
    const email = this.form.email.trim();
    const password = this.form.password;
    const commissionRate = Number(this.form.commissionRate);
    if (!name || !email || !password) {
      this.toast.error('Ad, e-posta ve şifre zorunludur.');
      return;
    }
    if (password.length < 6) {
      this.toast.error('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (isNaN(commissionRate) || commissionRate < 0 || commissionRate > 100) {
      this.toast.error('Komisyon oranı 0 ile 100 arasında olmalı.');
      return;
    }
    this.saving.set(true);
    this.api.createDealer({ name, email, password, commissionRate }).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.resetForm();
        this.toast.success('Bayi eklendi.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected toggleActive(d: DealerDto): void {
    this.busyId.set(d.id);
    this.api.setDealerActive(d.id, !d.isActive).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(d.isActive ? 'Bayi pasifleştirildi.' : 'Bayi aktifleştirildi.');
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }
}
