import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminAuthService } from '../../core/admin-auth.service';
import { apiError } from '../../core/utils';

@Component({
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div class="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-2xl">
        <div class="mb-6 flex items-center gap-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <lucide-icon name="shield" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-lg font-extrabold text-white">Yönetim Paneli</p>
            <p class="text-xs text-slate-400">Sadece platform yöneticisi</p>
          </div>
        </div>

        <form [formGroup]="form" (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-300">E-posta</label>
            <input type="email" formControlName="email"
              class="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              placeholder="admin@ornek.com" autocomplete="username" />
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-300">Şifre</label>
            <input type="password" formControlName="password"
              class="w-full rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              placeholder="••••••••" autocomplete="current-password" />
          </div>

          @if (error()) { <p class="text-sm text-rose-400">{{ error() }}</p> }

          <button type="submit"
            class="w-full rounded-xl bg-brand-600 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            [disabled]="loading()">
            @if (loading()) { Giriş yapılıyor… } @else { Giriş Yap }
          </button>
        </form>
      </div>
    </div>
  `,
})
export class AdminLoginComponent {
  private fb = inject(FormBuilder);
  private admin = inject(AdminAuthService);
  private router = inject(Router);

  protected loading = signal(false);
  protected error = signal('');

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.admin.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/yonetim');
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiError(e, 'Giriş başarısız.'));
      },
    });
  }
}
