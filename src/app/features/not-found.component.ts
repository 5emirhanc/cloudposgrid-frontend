import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, LucideAngularModule],
  template: `
    <div class="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <div class="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
        <lucide-icon name="triangle-alert" class="h-8 w-8"></lucide-icon>
      </div>
      <p class="text-6xl font-black text-slate-800">404</p>
      <h1 class="mt-2 text-xl font-bold text-slate-700">Sayfa bulunamadı</h1>
      <p class="mt-2 max-w-sm text-sm text-slate-500">
        Aradığınız sayfa taşınmış veya hiç var olmamış olabilir.
      </p>
      <a routerLink="/" class="btn-primary mt-6">
        <lucide-icon name="layout-dashboard" class="h-4 w-4"></lucide-icon> Ana sayfaya dön
      </a>
    </div>
  `,
})
export class NotFoundComponent {}
