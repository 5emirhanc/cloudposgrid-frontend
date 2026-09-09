import { Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ConfirmService } from '../core/confirm.service';
import { ModalComponent } from './modal.component';

/** Global onay diyaloğu — ConfirmService ile tetiklenir. app kökünde bir kez render edilir. */
@Component({
  selector: 'app-confirm-dialog',
  imports: [ModalComponent, LucideAngularModule],
  template: `
    @if (svc.pending(); as c) {
      <app-modal [title]="c.title || 'Onay'" maxWidth="26rem" (dismiss)="svc.respond(false)">
        <div class="flex gap-3">
          <span
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            [class]="c.danger ? 'bg-rose-100 text-rose-600' : 'bg-brand-100 text-brand-600'"
          >
            <lucide-icon [name]="c.danger ? 'triangle-alert' : 'circle-dollar-sign'" class="h-5 w-5"></lucide-icon>
          </span>
          <p class="pt-1.5 text-sm text-slate-600">{{ c.message }}</p>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="svc.respond(false)">{{ c.cancelText || 'İptal' }}</button>
          <button
            type="button"
            [class]="c.danger ? dangerBtn : 'btn-primary'"
            (click)="svc.respond(true)"
          >
            {{ c.confirmText || 'Onayla' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class ConfirmDialogComponent {
  protected svc = inject(ConfirmService);
  protected dangerBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700';
}
