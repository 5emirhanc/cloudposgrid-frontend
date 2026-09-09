import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';

/**
 * Tek tıkla demo girişi. Tanıtım sitesindeki "Gerçek uygulamada dene" butonu buraya gelir;
 * sunucu örnek verilerle dolu geçici bir işletme kurar (24 saat yaşar) ve panel açılır.
 */
@Component({
  selector: 'app-demo-entry',
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 p-4">
      <div class="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
        @if (!error()) {
          <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="sparkles" class="h-8 w-8"></lucide-icon>
          </div>
          <h1 class="text-2xl font-black tracking-tight text-slate-900">Demo işletmeniz hazırlanıyor</h1>
          <p class="mt-2 text-sm text-slate-500">
            Örnek ürünler, masalar ve satışlarla dolu bir kafe kuruyoruz. Birkaç saniye sürer…
          </p>
          <div class="mt-6 flex justify-center">
            <span class="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600"></span>
          </div>
          <p class="mt-6 text-xs text-slate-400">
            Demo işletme 24 saat sonra otomatik silinir. Dilediğiniz gibi kurcalayın 👌
          </p>
        } @else {
          <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <lucide-icon name="triangle-alert" class="h-8 w-8"></lucide-icon>
          </div>
          <h1 class="text-2xl font-black tracking-tight text-slate-900">Demo başlatılamadı</h1>
          <p class="mt-2 text-sm text-slate-500">{{ error() }}</p>
          <div class="mt-6 flex flex-col gap-2">
            <button type="button" class="btn-primary w-full" (click)="start()">Tekrar Dene</button>
            <a routerLink="/kayit" class="btn-ghost w-full">Ücretsiz Hesap Aç</a>
          </div>
        }
      </div>
    </div>
  `,
})
export class DemoEntryComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  protected error = signal<string | null>(null);

  ngOnInit(): void {
    this.start();
  }

  protected start(): void {
    this.error.set(null);
    this.auth.demo().subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) =>
        this.error.set(e?.error?.detail ?? 'Şu anda demo oluşturulamıyor. Lütfen birazdan tekrar deneyin.'),
    });
  }
}
