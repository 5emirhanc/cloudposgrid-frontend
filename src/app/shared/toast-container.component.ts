import { Component, inject } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toast-container',
  imports: [LucideAngularModule],
  template: `
    <div class="fixed top-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg animate-fade-in-up"
          [class.border-emerald-200]="t.type === 'success'"
          [class.border-rose-200]="t.type === 'error'"
          [class.border-slate-200]="t.type === 'info'"
        >
          <span class="mt-0.5 shrink-0">
            @if (t.type === 'success') {
              <lucide-icon name="check" class="h-4 w-4 text-emerald-600"></lucide-icon>
            } @else if (t.type === 'error') {
              <lucide-icon name="triangle-alert" class="h-4 w-4 text-rose-600"></lucide-icon>
            } @else {
              <lucide-icon name="circle-dollar-sign" class="h-4 w-4 text-brand-600"></lucide-icon>
            }
          </span>
          <p class="flex-1 text-sm text-slate-700">{{ t.message }}</p>
          <button (click)="toast.dismiss(t.id)" class="text-slate-400 hover:text-slate-600">
            <lucide-icon name="x" class="h-4 w-4"></lucide-icon>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  protected toast = inject(ToastService);
}
