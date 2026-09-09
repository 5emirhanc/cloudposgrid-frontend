import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StaffApi } from '../../core/api/staff.api';
import { BranchApi } from '../../core/api/branch.api';
import { BranchDto, StaffDto, UserRole } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError } from '../../core/utils';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../../core/permissions';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-staff',
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Personel</h1>
        <p class="text-sm text-slate-500">Çalışan hesapları, roller ve PIN ile hızlı giriş</p>
      </div>
      @if (staffEnabled()) {
        <button class="btn-primary" (click)="openCreate()">
          <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Personel
        </button>
      }
    </div>

    @if (!staffEnabled()) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <lucide-icon name="crown" class="h-7 w-7"></lucide-icon>
        </span>
        <h2 class="text-lg font-black text-slate-900">Personel & rol yönetimi Kurumsal'a özel</h2>
        <p class="max-w-md text-sm text-slate-500">
          Çoklu kullanıcı, roller ve PIN ile hızlı personel girişi <b>Kurumsal</b> pakette açılır.
          Profesyonel pakette tek sahip kullanıcı ile çalışırsınız.
        </p>
        <a routerLink="/yukselt" class="btn-primary mt-1">
          <lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> Kurumsal'a Yükselt
        </a>
      </div>
    } @else {

    @if (formOpen()) {
      <div class="card mb-4 p-4">
        <h2 class="mb-3 font-semibold text-slate-700">{{ editing() ? 'Personeli Düzenle' : 'Yeni Personel' }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Ad Soyad</label>
            <input class="input" formControlName="fullName" placeholder="Ad Soyad" />
          </div>
          <div>
            <label class="label">E-posta</label>
            <input class="input" formControlName="email" type="email" placeholder="personel@işletme.com" />
          </div>
          @if (!editing()) {
            <div>
              <label class="label">Şifre</label>
              <input class="input" formControlName="password" type="password" placeholder="En az 6 karakter" />
            </div>
          }
          <div>
            <label class="label">Rol</label>
            <select class="input" formControlName="role">
              @for (r of roles; track r) {
                <option [value]="r">{{ roleLabels[r] }}</option>
              }
            </select>
          </div>
          @if (multiBranch()) {
            <div>
              <label class="label">Şubeler <span class="text-slate-400">(hiçbiri seçilmezse tüm şubeler)</span></label>
              <div class="flex flex-wrap gap-2">
                @for (b of branches(); track b.id) {
                  <button type="button"
                    class="rounded-full border px-3 py-1.5 text-sm transition"
                    [class]="selectedBranchIds().includes(b.id) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                    (click)="toggleBranch(b.id)">
                    {{ b.name }}
                  </button>
                }
              </div>
              <p class="mt-1 text-xs text-slate-400">Seçilen şubeler arasında geçiş yapabilir; dışına çıkamaz.</p>
            </div>
          }
          @if (!editing()) {
            <div>
              <label class="label">PIN <span class="text-slate-400">(opsiyonel, 4-6 hane)</span></label>
              <input class="input" formControlName="pin" inputmode="numeric" maxlength="6" placeholder="Örn. 1234" />
            </div>
          }
          <!-- Granüler yetki (#28): rolün üstüne ek kısıtlar. Owner buradan yönetilmez (listede zaten gizli). -->
          <div class="sm:col-span-2">
            <label class="label">Yetkiler <span class="text-slate-400">(kapatılırsa rol izinli olsa bile yapamaz)</span></label>
            <div class="flex flex-wrap gap-4 rounded-xl border border-slate-200 p-3">
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" formControlName="canVoid" class="rounded text-brand-600" /> Fatura iptal (void)
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" formControlName="canRefund" class="rounded text-brand-600" /> İade yapabilir
              </label>
              <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" formControlName="canViewCost" class="rounded text-brand-600" /> Maliyet/kâr görebilir
              </label>
            </div>
          </div>
          <div class="flex items-end gap-2 sm:col-span-2">
            <button class="btn-primary" [disabled]="saving()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ editing() ? 'Kaydet' : 'Ekle' }}
            </button>
            <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button>
          </div>
        </form>
      </div>
    }

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor...</p>
      } @else if (!staff().length) {
        <p class="py-10 text-center text-sm text-slate-400">Henüz personel yok.</p>
      } @else {
        <ul class="divide-y divide-slate-50">
          @for (s of staff(); track s.id) {
            <li class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60" [class.opacity-60]="!s.isActive">
              <div class="flex min-w-0 items-center gap-3">
                <span class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {{ initials(s.fullName) }}
                </span>
                <div class="min-w-0">
                  <p class="truncate font-medium text-slate-800">
                    {{ s.fullName }}
                    @if (s.id === currentUserId()) { <span class="ml-1 text-xs text-brand-600">(Siz)</span> }
                  </p>
                  <p class="truncate text-xs text-slate-400">{{ s.email }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge-blue">{{ roleLabels[s.role] }}</span>
                @if (isRestricted(s)) { <span class="rounded-md bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-600" title="Yetkileri kısıtlı">Kısıtlı</span> }
                @if (s.hasPin) { <span class="rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-600">PIN</span> }
                @if (!s.isActive) { <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Pasif</span> }

                @if (s.role !== 'Owner' && s.id !== currentUserId()) {
                  <button class="icon-btn" title="PIN ata/kaldır" (click)="setPin(s)">
                    <lucide-icon name="key-round" class="h-4 w-4"></lucide-icon>
                  </button>
                  <button class="icon-btn" title="Düzenle" (click)="openEdit(s)">
                    <lucide-icon name="pencil" class="h-4 w-4"></lucide-icon>
                  </button>
                  <button class="icon-btn" [title]="s.isActive ? 'Pasifleştir' : 'Aktifleştir'" (click)="toggleActive(s)">
                    <lucide-icon [name]="s.isActive ? 'user-x' : 'user-check'" class="h-4 w-4"></lucide-icon>
                  </button>
                  <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(s)">
                    <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                  </button>
                }
              </div>
            </li>
          }
        </ul>
      }
    </div>

    }
  `,
  styles: [
    `.icon-btn { border-radius:.5rem; padding:.5rem; color:#94a3b8; }
     .icon-btn:hover { background:#f1f5f9; color:#334155; }`,
  ],
})
export class StaffComponent implements OnInit {
  private api = inject(StaffApi);
  private branchApi = inject(BranchApi);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  protected readonly roles = ASSIGNABLE_ROLES;
  protected readonly roleLabels = ROLE_LABELS;
  protected loading = signal(true);
  protected saving = signal(false);
  protected staff = signal<StaffDto[]>([]);
  protected branches = signal<BranchDto[]>([]);
  protected formOpen = signal(false);
  protected editing = signal<StaffDto | null>(null);
  protected currentUserId = computed(() => this.auth.user()?.id);
  protected staffEnabled = computed(() => this.auth.user()?.entitlements?.staffManagement ?? false);
  /** Şube atama alanı yalnız çok-şubeli işletmede (2+ şube) anlamlı. */
  protected multiBranch = computed(() =>
    (this.auth.user()?.entitlements?.multiBranch ?? false) && this.branches().length > 1);

  protected form = this.fb.nonNullable.group({
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    role: ['Cashier' as UserRole, Validators.required],
    pin: [''],
    // Granüler yetki (#28) — role'ün üstüne ek kısıtlar. Varsayılan true (kısıtsız).
    canVoid: [true],
    canRefund: [true],
    canViewCost: [true],
  });

  /** Personelin erişebileceği şubeler (boş = kısıtsız). Formdan ayrı sinyalde tutulur. */
  protected selectedBranchIds = signal<string[]>([]);

  protected toggleBranch(id: string): void {
    this.selectedBranchIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  ngOnInit(): void {
    this.load();
    // Çok-şube paketinde şube listesini yükle (atama dropdown'ı için).
    if (this.auth.user()?.entitlements?.multiBranch) {
      this.branchApi.getAll().subscribe({ next: (b) => this.branches.set(b), error: () => {} });
    }
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (s) => {
        this.staff.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected initials(name: string): string {
    return name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  }

  /** Üç granüler yetkiden herhangi biri kapalıysa kısıtlı sayılır (rozet gösterimi için). */
  protected isRestricted(s: StaffDto): boolean {
    return s.canVoid === false || s.canRefund === false || s.canViewCost === false;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ fullName: '', email: '', password: '', role: 'Cashier', pin: '', canVoid: true, canRefund: true, canViewCost: true });
    this.selectedBranchIds.set([]);
    this.form.controls.email.enable();
    this.form.controls.password.addValidators([Validators.required, Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
    this.formOpen.set(true);
  }

  protected openEdit(s: StaffDto): void {
    this.editing.set(s);
    this.form.reset({
      fullName: s.fullName, email: s.email, password: '', role: s.role, pin: '',
      canVoid: s.canVoid ?? true, canRefund: s.canRefund ?? true, canViewCost: s.canViewCost ?? true,
    });
    this.selectedBranchIds.set([...(s.branchIds ?? [])]);
    this.form.controls.email.disable();
    this.form.controls.password.clearValidators();
    this.form.controls.password.updateValueAndValidity();
    this.formOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    const editing = this.editing();
    const branchIds = this.selectedBranchIds(); // boş dizi → kısıtsız (tüm şubeler)
    if (editing) {
      this.api.update(editing.id, {
        fullName: v.fullName, role: v.role, isActive: editing.isActive, branchIds,
        canVoid: v.canVoid, canRefund: v.canRefund, canViewCost: v.canViewCost,
      }).subscribe({
        next: () => this.done('Personel güncellendi.'),
        error: (e) => this.fail(e),
      });
    } else {
      this.api
        .create({ fullName: v.fullName, email: v.email, password: v.password, role: v.role, pin: v.pin || null, branchIds })
        .subscribe({ next: () => this.done('Personel eklendi.'), error: (e) => this.fail(e) });
    }
  }

  private done(msg: string): void {
    this.saving.set(false);
    this.formOpen.set(false);
    this.toast.success(msg);
    this.load();
  }
  private fail(e: unknown): void {
    this.saving.set(false);
    this.toast.error(apiError(e));
  }

  protected toggleActive(s: StaffDto): void {
    // Şube atamasını ve granüler yetkileri koru: aksi halde aktif/pasif değişimi bunları sıfırlardı.
    this.api.update(s.id, {
      fullName: s.fullName, role: s.role, isActive: !s.isActive, branchIds: s.branchIds ?? [],
      canVoid: s.canVoid, canRefund: s.canRefund, canViewCost: s.canViewCost,
    }).subscribe({
      next: () => {
        this.toast.success(s.isActive ? 'Personel pasifleştirildi.' : 'Personel aktifleştirildi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected setPin(s: StaffDto): void {
    const pin = prompt(`${s.fullName} için PIN (4-6 hane). Kaldırmak için boş bırakın:`, '');
    if (pin === null) return;
    const trimmed = pin.trim();
    if (trimmed && !/^\d{4,6}$/.test(trimmed)) {
      this.toast.error('PIN 4-6 haneli rakam olmalı.');
      return;
    }
    this.api.setPin(s.id, trimmed || null).subscribe({
      next: () => {
        this.toast.success(trimmed ? 'PIN güncellendi.' : 'PIN kaldırıldı.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected async remove(s: StaffDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${s.fullName}" silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.remove(s.id).subscribe({
      next: () => {
        this.toast.success('Personel silindi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
