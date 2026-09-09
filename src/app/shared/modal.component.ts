import { Component, HostListener, input, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-modal',
  imports: [LucideAngularModule],
  template: `
    <div class="fixed inset-0 flex items-start justify-center overflow-y-auto p-4 sm:items-center" [style.z-index]="z()">
      <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="dismiss.emit()"></div>
      <div
        class="relative my-8 flex max-h-[calc(100dvh-4rem)] w-full flex-col rounded-2xl bg-white shadow-2xl animate-fade-in-up"
        [style.max-width]="maxWidth()"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
      >
        <div class="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 class="text-lg font-bold text-slate-800">{{ title() }}</h3>
          <button type="button" (click)="dismiss.emit()" aria-label="Kapat" class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <lucide-icon name="x" class="h-5 w-5"></lucide-icon>
          </button>
        </div>
        <div class="overflow-y-auto px-6 py-5">
          <ng-content></ng-content>
        </div>
      </div>
    </div>
  `,
})
export class ModalComponent {
  title = input('');
  maxWidth = input('34rem');
  /** Yığılan modallarda üstte kalması gereken modal daha yüksek z-index alır (varsayılan 50). */
  z = input(50);
  dismiss = output<void>();

  /** Esc ile kapatma. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dismiss.emit();
  }
}
