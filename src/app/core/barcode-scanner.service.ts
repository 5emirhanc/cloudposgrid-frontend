import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Donanım barkod okuyucu altyapısı. Çoğu USB/Bluetooth okuyucu "klavye taklidi" (HID) yapar:
 * kodu hızlıca yazar ve Enter'a basar. Bu servis global tuş dizisini dinler, hızlı dizi + Enter'ı
 * bir tarama olarak tanır (insan yazımından zamanlamayla ayırır) ve `scans` ile yayınlar.
 *
 * Bir metin alanı odaktayken yakalamaz (alanın kendi Enter'ını ele geçirmemek için) — böylece
 * "her yerde okut" davranışı, adisyon/isim yazarken tetiklenmez.
 */
@Injectable({ providedIn: 'root' })
export class BarcodeScannerService {
  readonly scans = new Subject<string>();

  private buffer = '';
  private lastTime = 0;
  private started = false;

  /** Global dinleyiciyi başlatır (bir kez yeterli). */
  start(): void {
    if (this.started || typeof document === 'undefined') return;
    this.started = true;
    document.addEventListener('keydown', this.onKey, true);
  }

  private onKey = (e: KeyboardEvent): void => {
    // Kullanıcı bir alana yazıyorsa karışma — o alan kendi girdisini yönetir.
    const el = document.activeElement as HTMLElement | null;
    const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
    if (typing) return;

    // Bazı olaylar (otofil, şifre yöneticisi, sanal klavye, sentetik keydown) `key` taşımaz → undefined.
    // Aşağıda e.key.length okunduğundan koru; yoksa "Cannot read properties of undefined (reading 'length')" patlar.
    if (typeof e.key !== 'string') return;

    const now = Date.now();
    // Karakterler arası boşluk büyükse (insan) tamponu sıfırla; okuyucu ~10-30ms aralıkla yazar.
    if (now - this.lastTime > 50) this.buffer = '';
    this.lastTime = now;

    if (e.key === 'Enter') {
      const code = this.buffer.trim();
      this.buffer = '';
      if (code.length >= 3) this.scans.next(code); // yeterince uzun + hızlı = tarama
      return;
    }
    if (e.key.length === 1) this.buffer += e.key;
  };
}
