import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { BranchApi } from '../../core/api/branch.api';
import { BranchStore } from '../../core/branch.store';
import { BranchDto } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError } from '../../core/utils';

@Component({
  selector: 'app-branches',
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Şubeler</h1>
        <p class="text-sm text-slate-500">Çok şube — her şubenin kendi kasası, satışı ve raporu</p>
      </div>
      @if (enabled()) {
        <button class="btn-primary" (click)="openCreate()"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Şube</button>
      }
    </div>

    @if (!enabled()) {
      <div class="card flex flex-col items-center gap-3 p-10 text-center">
        <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600"><lucide-icon name="building-2" class="h-7 w-7"></lucide-icon></span>
        <h2 class="text-lg font-black text-slate-900">Çok şube Kurumsal'a özel</h2>
        <p class="max-w-md text-sm text-slate-500">
          Birden çok şube açıp her birinin kasa/satış/raporunu ayrı yönetmek <b>Kurumsal</b> pakette açılır.
          Profesyonel pakette tek şube (Merkez) ile çalışırsınız.
        </p>
        <a routerLink="/yukselt" class="btn-primary mt-1"><lucide-icon name="rocket" class="h-4 w-4"></lucide-icon> Kurumsal'a Yükselt</a>
      </div>
    } @else {
      @if (formOpen()) {
        <div class="card mb-4 p-4">
          <h2 class="mb-3 font-semibold text-slate-700">{{ editing() ? 'Şubeyi Düzenle' : 'Yeni Şube' }}</h2>
          <form [formGroup]="form" (ngSubmit)="save()" class="grid gap-3 sm:grid-cols-3">
            <div><label class="label">Şube Adı *</label><input class="input" formControlName="name" placeholder="Ör. Kadıköy Şubesi" /></div>
            <div><label class="label">Telefon</label><input class="input" formControlName="phone" /></div>
            <div class="sm:col-span-3"><label class="label">Adres</label><input class="input" formControlName="address" /></div>
            <div class="flex items-end gap-2 sm:col-span-3">
              <button class="btn-primary" [disabled]="saving()"><lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ editing() ? 'Kaydet' : 'Ekle' }}</button>
              <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button>
            </div>
          </form>
        </div>
      }

      <div class="card overflow-hidden">
        @if (loading()) {
          <p class="py-10 text-center text-sm text-slate-400">Yükleniyor...</p>
        } @else {
          <ul class="divide-y divide-slate-50">
            @for (b of branches(); track b.id) {
              <li class="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60" [class.opacity-60]="!b.isActive">
                <div class="flex min-w-0 items-center gap-3">
                  <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><lucide-icon name="building-2" class="h-4 w-4"></lucide-icon></span>
                  <div class="min-w-0">
                    <p class="truncate font-medium text-slate-800">
                      {{ b.name }}
                      @if (b.isDefault) { <span class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Merkez</span> }
                    </p>
                    <p class="truncate text-xs text-slate-400">{{ b.address || '—' }}@if (b.phone) { · {{ b.phone }} }</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  @if (!b.isActive) { <span class="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">Pasif</span> }
                  <button class="icon-btn" title="Düzenle" (click)="openEdit(b)"><lucide-icon name="pencil" class="h-4 w-4"></lucide-icon></button>
                  @if (!b.isDefault) {
                    <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(b)"><lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon></button>
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
export class BranchesComponent implements OnInit {
  private api = inject(BranchApi);
  private store = inject(BranchStore);
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected enabled = computed(() => this.auth.user()?.entitlements?.multiBranch ?? false);
  protected loading = signal(true);
  protected saving = signal(false);
  protected branches = signal<BranchDto[]>([]);
  protected formOpen = signal(false);
  protected editing = signal<BranchDto | null>(null);

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    address: [''],
    phone: [''],
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getAll().subscribe({
      next: (l) => {
        this.branches.set(l);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form.reset({ name: '', address: '', phone: '' });
    this.formOpen.set(true);
  }
  protected openEdit(b: BranchDto): void {
    this.editing.set(b);
    this.form.reset({ name: b.name, address: b.address ?? '', phone: b.phone ?? '' });
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
    const done = () => {
      this.saving.set(false);
      this.formOpen.set(false);
      this.toast.success('Kaydedildi.');
      this.load();
      this.store.load();
    };
    const fail = (e: unknown) => {
      this.saving.set(false);
      this.toast.error(apiError(e));
    };
    if (editing) {
      this.api.update(editing.id, { name: v.name, address: v.address || null, phone: v.phone || null, isActive: editing.isActive }).subscribe({ next: done, error: fail });
    } else {
      this.api.create({ name: v.name, address: v.address || null, phone: v.phone || null }).subscribe({ next: done, error: fail });
    }
  }

  protected async remove(b: BranchDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${b.name}" şubesi silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.delete(b.id).subscribe({
      next: () => {
        this.toast.success('Şube silindi.');
        this.load();
        this.store.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
