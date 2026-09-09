import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { apiError } from '../../core/utils';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex min-h-screen bg-slate-100">
      <!-- Sol marka paneli -->
      <div class="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex"
           style="background:linear-gradient(155deg,#1e3a8a,#2563eb 55%,#0ea5c4)">
        <div class="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl"></div>
        <div class="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl"></div>
        <div class="relative flex items-center gap-2.5">
          <span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <img src="/logo.svg" alt="" class="h-7 w-7" />
          </span>
          <span class="text-xl font-extrabold">CloudPosGrid</span>
        </div>
        <div class="relative">
          <h1 class="text-4xl font-black leading-tight">Dükkanınızın tamamı<br />tek ekranda.</h1>
          <p class="mt-4 max-w-md text-white/80">
            Satış, stok, cari ve ön muhasebe — bulutta, her yerden.
          </p>
          <div class="mt-8 space-y-3">
            @for (f of features; track f) {
              <div class="flex items-center gap-3 text-sm text-white/90">
                <span class="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                  <lucide-icon name="check" class="h-3.5 w-3.5 text-emerald-300"></lucide-icon>
                </span>
                {{ f }}
              </div>
            }
          </div>
        </div>
        <p class="relative text-xs text-white/60">14 gün ücretsiz deneme · kart gerekmez</p>
      </div>

      <!-- Sağ form -->
      <div class="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/logo.svg" alt="CloudPosGrid" class="h-9 w-9 rounded-xl" />
            <span class="text-lg font-extrabold text-slate-800">CloudPosGrid</span>
          </div>

          <h2 class="text-2xl font-black text-slate-900">Tekrar hoş geldiniz 👋</h2>
          <p class="mt-1 text-sm text-slate-500">İşletme hesabınıza giriş yapın.</p>

          <form [formGroup]="form" (ngSubmit)="submit()" class="mt-8 space-y-5">
            <div>
              <label class="label">E-posta</label>
              <div class="relative">
                <lucide-icon name="mail" class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
                <input type="email" formControlName="email" class="input pl-11" placeholder="ornek@firma.com" autocomplete="email" />
              </div>
              @if (form.controls.email.touched && form.controls.email.invalid) {
                <p class="mt-1 text-xs text-rose-600">Geçerli bir e-posta girin.</p>
              }
            </div>
            <div>
              <label class="label">Şifre</label>
              <div class="relative">
                <lucide-icon name="lock" class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
                <input [type]="showPassword() ? 'text' : 'password'" formControlName="password" class="input pl-11 pr-10" placeholder="••••••••" autocomplete="current-password" />
                <button type="button" (click)="showPassword.set(!showPassword())" tabindex="-1"
                        class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <lucide-icon [name]="showPassword() ? 'eye-off' : 'eye'" class="h-4 w-4"></lucide-icon>
                </button>
              </div>
              @if (form.controls.password.touched && form.controls.password.invalid) {
                <p class="mt-1 text-xs text-rose-600">Şifre zorunlu.</p>
              }
              <div class="mt-1.5 text-right">
                <a routerLink="/sifremi-unuttum" class="text-xs font-medium text-brand-600 hover:text-brand-700">Şifremi unuttum?</a>
              </div>
            </div>

            @if (twoFaRequired()) {
              <div>
                <label class="label">Doğrulama Kodu</label>
                <div class="relative">
                  <lucide-icon name="shield" class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
                  <input type="text" inputmode="numeric" autocomplete="one-time-code" formControlName="twoFactorCode"
                         class="input pl-11 tracking-widest" placeholder="6 haneli kod veya kurtarma kodu" autofocus />
                </div>
                <p class="mt-1 text-xs text-slate-400">Authenticator uygulamanızdaki kodu ya da bir kurtarma kodunu girin.</p>
              </div>
            }

            <button type="submit" class="btn-primary w-full" [disabled]="loading()">
              @if (loading()) { Giriş yapılıyor... }
              @else if (twoFaRequired()) { Doğrula ve Gir <lucide-icon name="arrow-right" class="h-4 w-4"></lucide-icon> }
              @else { Giriş Yap <lucide-icon name="arrow-right" class="h-4 w-4"></lucide-icon> }
            </button>
          </form>

          <p class="mt-6 text-center text-sm text-slate-500">
            Hesabınız yok mu?
            <a routerLink="/kayit" class="font-semibold text-brand-600 hover:text-brand-700">Hemen kaydolun</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected loading = signal(false);
  protected showPassword = signal(false);
  protected features = ['Barkodlu hızlı satış', 'Veresiye & cari takibi', 'QR menü & masa düzeni'];

  protected twoFaRequired = signal(false);

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    twoFactorCode: [''],
  });

  protected submit(): void {
    // 2FA adımındayken e-posta/şifre değişmez; sadece kod zorunlu olur.
    if (!this.twoFaRequired() && this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (this.twoFaRequired() && !v.twoFactorCode.trim()) {
      this.toast.error('Doğrulama kodunu girin.');
      return;
    }
    this.loading.set(true);
    this.auth.login({ email: v.email, password: v.password, twoFactorCode: v.twoFactorCode || undefined }).subscribe({
      next: (r) => {
        this.loading.set(false);
        if (r.twoFactorRequired) {
          this.twoFaRequired.set(true);
          this.toast.info('Authenticator uygulamanızdaki 6 haneli kodu girin.');
          return;
        }
        this.router.navigateByUrl('/');
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e, 'Giriş başarısız.'));
      },
    });
  }
}
