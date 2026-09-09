import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { DealerAuthService } from '../../core/dealer-auth.service';
import { apiError } from '../../core/utils';

@Component({
  selector: 'app-dealer-login',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <div class="w-full max-w-sm rounded-2xl bg-slate-800 p-8 shadow-2xl">
        <div class="mb-6 flex items-center gap-2.5">
          <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <lucide-icon name="store" class="h-5 w-5"></lucide-icon>
          </span>
          <div>
            <p class="text-lg font-extrabold text-white">Bayi Girişi</p>
            <p class="text-xs text-slate-400">Yeniden-satıcı paneli</p>
          </div>
        </div>

        <form (ngSubmit)="submit()" class="space-y-4">
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-300">E-posta</label>
            <div class="relative">
              <lucide-icon name="mail" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"></lucide-icon>
              <input type="email" name="email" [(ngModel)]="email"
                class="w-full rounded-xl border border-slate-600 bg-slate-900 py-2.5 pl-10 pr-3 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                placeholder="bayi@ornek.com" autocomplete="username" />
            </div>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium text-slate-300">Şifre</label>
            <div class="relative">
              <lucide-icon name="lock" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"></lucide-icon>
              <input type="password" name="password" [(ngModel)]="password"
                class="w-full rounded-xl border border-slate-600 bg-slate-900 py-2.5 pl-10 pr-3 text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
                placeholder="••••••••" autocomplete="current-password" />
            </div>
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
export class DealerLoginComponent {
  private dealerAuth = inject(DealerAuthService);
  private router = inject(Router);

  protected email = '';
  protected password = '';
  protected loading = signal(false);
  protected error = signal('');

  protected submit(): void {
    const email = this.email.trim();
    const password = this.password;
    if (!email || !password) {
      this.error.set('E-posta ve şifre zorunlu.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.dealerAuth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/bayi');
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiError(e, 'Giriş başarısız.'));
      },
    });
  }
}
