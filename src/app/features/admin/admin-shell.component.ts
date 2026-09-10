import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminAuthService } from '../../core/admin-auth.service';

/**
 * Platform yönetim panelinin ortak kabuğu: üst bar, sayfalar arası gezinme ve çıkış.
 *
 * NEDEN VAR: her yönetim sayfası kendi başınaydı. /yonetim'in kendi üst barı vardı ve bayilere
 * link veriyordu; bayiler sayfasında ise HİÇBİR şey yoktu — ne başlık, ne dönüş yolu, ne de
 * içeriği ortalayan bir kap. Tek yönlü bir kapıydı: giren geri çıkamıyor, sayfa da ekranın
 * kenarına yapışık render oluyordu. Kabuk tek yerde tanımlanınca yeni bir yönetim sayfası
 * eklemek de sadece bunu sarmalamak demek.
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 lg:px-8">
          <img src="/logo.svg" class="h-8 w-8 shrink-0 rounded-lg" alt="" />
          <div class="mr-auto min-w-0">
            <p class="truncate text-sm font-extrabold text-slate-800">Platform Yönetimi</p>
            <p class="text-[10px] uppercase tracking-wider text-slate-400">CloudPosGrid Admin</p>
          </div>

          <!-- Gezinme: hangi sayfada olduğun her zaman belli olsun. -->
          <nav class="order-last flex w-full gap-1 border-t border-slate-100 pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0">
            <a routerLink="/yonetim" [routerLinkActiveOptions]="{ exact: true }" routerLinkActive="!bg-brand-50 !text-brand-700"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:flex-none">
              <lucide-icon name="building-2" class="h-4 w-4"></lucide-icon> İşletmeler
            </a>
            <a routerLink="/yonetim/bayiler" routerLinkActive="!bg-brand-50 !text-brand-700"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 sm:flex-none">
              <lucide-icon name="store" class="h-4 w-4"></lucide-icon> Bayiler
            </a>
          </nav>

          <span class="hidden max-w-[16rem] truncate text-sm text-slate-500 lg:block">{{ adminEmail() }}</span>
          <button class="btn-ghost shrink-0" (click)="logout()">
            <lucide-icon name="log-out" class="h-4 w-4"></lucide-icon>
            <span class="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        <ng-content></ng-content>
      </main>
    </div>
  `,
})
export class AdminShellComponent {
  private auth = inject(AdminAuthService);
  protected adminEmail = this.auth.email;

  protected logout(): void {
    this.auth.logout();
  }
}
