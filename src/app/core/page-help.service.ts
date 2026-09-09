import { Injectable, signal } from '@angular/core';

/**
 * Sayfa yardım bantlarının durumunu yönetir.
 * - İlk giriş: bant otomatik gösterilir, kullanıcı kapatınca localStorage'a yazılır (bir daha çıkmaz).
 * - Header'daki "?" butonu `reopen()` çağırır → o an ekranda olan bant tekrar açılır.
 */
@Injectable({ providedIn: 'root' })
export class PageHelpService {
  private static readonly PREFIX = 'cpg_help_';

  /** O an ekranda mount olmuş yardım bandı (header "?" butonu buna göre görünür). */
  readonly active = signal<{ key: string; title: string } | null>(null);
  /** "?" butonuna her basışta artar; aktif bant bunu dinleyip yeniden açılır. */
  readonly reopenTick = signal(0);

  isDismissed(key: string): boolean {
    return localStorage.getItem(PageHelpService.PREFIX + key) === '1';
  }
  dismiss(key: string): void {
    localStorage.setItem(PageHelpService.PREFIX + key, '1');
  }
  setActive(key: string, title: string): void {
    this.active.set({ key, title });
  }
  clearActive(key: string): void {
    if (this.active()?.key === key) this.active.set(null);
  }
  reopen(): void {
    this.reopenTick.update((v) => v + 1);
  }
}
