import { Component, OnDestroy, OnInit, effect, inject, input, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpService } from '../core/page-help.service';

/**
 * Sayfa başına "bu ekran nasıl çalışır" bilgi bandı.
 * İlk girişte gösterilir; kapatılınca localStorage'a yazılır. Header'daki "?" ile tekrar açılır.
 *
 * Kullanım (maddeler projeksiyonla — kaçış derdi yok):
 *   <app-page-help key="products" title="...">
 *     <li>Yeni ürün ekleyin, fiyat ve stok girin</li>
 *     <li>...</li>
 *   </app-page-help>
 */
@Component({
  selector: 'app-page-help',
  imports: [LucideAngularModule],
  template: `
    @if (visible()) {
      <div class="mb-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-gradient-to-r from-brand-50 to-cyan-50 p-4">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
          <lucide-icon name="info" class="h-5 w-5"></lucide-icon>
        </span>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-slate-900">{{ title() }}</p>
          <ul class="mt-1 ml-4 list-disc space-y-1 text-sm text-slate-600 marker:text-brand-400">
            <ng-content></ng-content>
          </ul>
        </div>
        <button type="button" class="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600"
                (click)="close()" title="Anladım, kapat">
          <lucide-icon name="x" class="h-4 w-4"></lucide-icon>
        </button>
      </div>
    }
  `,
})
export class PageHelpComponent implements OnInit, OnDestroy {
  private svc = inject(PageHelpService);

  key = input.required<string>();
  title = input.required<string>();

  protected visible = signal(false);

  constructor() {
    // Header "?" butonuna basınca (reopenTick artınca) bu bandı yeniden aç.
    effect(() => {
      const tick = this.svc.reopenTick();
      if (tick > 0 && this.svc.active()?.key === this.key()) this.visible.set(true);
    });
  }

  ngOnInit(): void {
    this.svc.setActive(this.key(), this.title());
    this.visible.set(!this.svc.isDismissed(this.key()));
  }

  ngOnDestroy(): void {
    this.svc.clearActive(this.key());
  }

  protected close(): void {
    this.svc.dismiss(this.key());
    this.visible.set(false);
  }
}
