import { Component, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';
import { OfflineSaleQueueService } from '../core/offline/offline-sale-queue.service';

/**
 * PWA durum çubukları (kök seviyede): çevrimdışı bandı + yeni sürüm hazır uyarısı.
 * Service worker yalnızca production'da etkin; dev'de sw.isEnabled=false olduğundan güncelleme dinlenmez.
 */
@Component({
  selector: 'app-pwa-status',
  imports: [LucideAngularModule],
  template: `
    @if (!online()) {
      <div class="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-2 bg-slate-800 px-4 py-2.5 text-center text-sm font-medium text-white">
        <lucide-icon name="wifi-off" class="h-4 w-4 shrink-0"></lucide-icon>
        Çevrimdışısınız — satışlar kaydedilip bağlantı gelince gönderilir.
        @if (pending() > 0) { <span class="rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">{{ pending() }} satış bekliyor</span> }
      </div>
    }
    @if (online() && pending() > 0) {
      <div class="fixed inset-x-3 bottom-3 z-[55] mx-auto flex max-w-xs items-center gap-2 rounded-2xl bg-slate-800 px-4 py-2.5 text-sm text-white shadow-xl sm:left-auto sm:right-4">
        <lucide-icon name="refresh-cw" class="h-4 w-4 shrink-0 animate-spin"></lucide-icon>
        <span class="font-medium">{{ pending() }} çevrimdışı satış gönderiliyor…</span>
      </div>
    }
    @if (failed() > 0) {
      <div class="fixed inset-x-3 bottom-16 z-[55] mx-auto flex max-w-sm items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2.5 text-sm text-white shadow-xl sm:left-auto sm:right-4">
        <lucide-icon name="triangle-alert" class="h-4 w-4 shrink-0"></lucide-icon>
        <span class="flex-1 font-medium">{{ failed() }} çevrimdışı satış reddedildi — kayıtlar saklandı, elle kontrol edin.</span>
      </div>
    }
    @if (updateReady()) {
      <div class="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-sm text-white shadow-xl sm:left-auto sm:right-4">
        <lucide-icon name="sparkles" class="h-5 w-5 shrink-0"></lucide-icon>
        <span class="flex-1 font-medium">Yeni sürüm hazır.</span>
        <button class="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-50" (click)="reload()">Yenile</button>
      </div>
    }
  `,
})
export class PwaStatusComponent {
  private sw = inject(SwUpdate);
  // Enjekte etmek kök servisi başlatır → 'online' dinleyicisi + açılışta kuyruk replay'i devreye girer.
  private offlineQueue = inject(OfflineSaleQueueService);
  protected online = signal(navigator.onLine);
  protected pending = this.offlineQueue.pendingCount;
  protected failed = this.offlineQueue.failedCount;
  protected updateReady = signal(false);

  constructor() {
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));

    if (this.sw.isEnabled) {
      this.sw.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
      // Uygulama açıkken periyodik güncelleme kontrolü (saatlik).
      setInterval(() => this.sw.checkForUpdate().catch(() => {}), 60 * 60 * 1000);
    }
  }

  protected reload(): void {
    this.sw.activateUpdate().then(() => document.location.reload());
  }
}
