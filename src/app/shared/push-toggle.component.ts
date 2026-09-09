import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { SwPush } from '@angular/service-worker';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { PushApi } from '../core/api/push.api';
import { ToastService } from '../core/toast.service';

/**
 * Web Push (#6) aç/kapa düğmesi — bildirim zili alt bilgisine yerleşir. Service worker (PWA) gerektirir;
 * ng serve (dev) modunda SwPush devre dışı olduğundan düğme gizlenir. Üretim (PWA) build'inde çalışır.
 */
@Component({
  selector: 'app-push-toggle',
  imports: [LucideAngularModule],
  template: `
    @if (supported()) {
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
        [disabled]="busy()"
        (click)="toggle()"
      >
        <span class="flex items-center gap-2 text-slate-600">
          <lucide-icon [name]="enabled() ? 'bell' : 'bell-off'" class="h-4 w-4" [class]="enabled() ? 'text-brand-600' : 'text-slate-400'"></lucide-icon>
          Tarayıcı bildirimleri
        </span>
        <span class="text-xs font-semibold" [class]="enabled() ? 'text-brand-600' : 'text-slate-400'">
          {{ busy() ? '…' : (enabled() ? 'Açık' : 'Kapalı') }}
        </span>
      </button>
    }
  `,
})
export class PushToggleComponent implements OnInit {
  private swPush = inject(SwPush);
  private api = inject(PushApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  protected supported = signal(false);
  protected enabled = signal(false);
  protected busy = signal(false);

  async ngOnInit(): Promise<void> {
    // SwPush yalnız PWA service worker etkinken çalışır (üretim). Dev/desteklenmeyen tarayıcıda gizle.
    if (!this.swPush.isEnabled) return;
    this.supported.set(true);

    // Mevcut abonelik durumunu yansıt.
    try {
      const current = await firstValueFrom(this.swPush.subscription);
      this.enabled.set(!!current);
    } catch {
      /* yoksay */
    }

    // Bildirime tıklanınca ilgili ekrana git (uygulama açıkken). Zil her açılışta bu bileşen yeniden
    // kurulduğundan aboneliği bileşen ömrüne bağla — yoksa her açılışta bir abonelik sızar.
    this.swPush.notificationClicks.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({ notification }) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      if (url) this.router.navigateByUrl(url);
    });
  }

  protected async toggle(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      if (this.enabled()) await this.disable();
      else await this.enable();
    } finally {
      this.busy.set(false);
    }
  }

  private async enable(): Promise<void> {
    const key = await firstValueFrom(this.api.getPublicKey());
    if (!key?.enabled || !key.publicKey) {
      this.toast.error('Sunucuda tarayıcı bildirimleri yapılandırılmamış.');
      return;
    }
    let sub;
    try {
      sub = await this.swPush.requestSubscription({ serverPublicKey: key.publicKey });
    } catch {
      this.toast.error('Bildirim izni verilmedi.');
      return;
    }
    const json = sub.toJSON();
    await firstValueFrom(
      this.api.subscribe({
        endpoint: json.endpoint ?? sub.endpoint,
        p256dh: json.keys?.['p256dh'] ?? '',
        auth: json.keys?.['auth'] ?? '',
        userAgent: navigator.userAgent,
      }),
    );
    this.enabled.set(true);
    this.toast.success('Tarayıcı bildirimleri açıldı.');
  }

  private async disable(): Promise<void> {
    let endpoint: string | null = null;
    try {
      const current = await firstValueFrom(this.swPush.subscription);
      endpoint = current?.endpoint ?? null;
      await this.swPush.unsubscribe();
    } catch {
      /* zaten abone değil */
    }
    if (endpoint) {
      try {
        await firstValueFrom(this.api.unsubscribe(endpoint));
      } catch {
        /* sunucu temizliği best-effort */
      }
    }
    this.enabled.set(false);
    this.toast.success('Tarayıcı bildirimleri kapatıldı.');
  }
}
