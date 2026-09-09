import { Component, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { OrdersApi } from '../core/api/orders.api';
import { AuthService } from '../core/auth.service';
import { BranchStore } from '../core/branch.store';
import { ToastService } from '../core/toast.service';

const POLL_MS = 15_000;
export const QR_SOUND_KEY = 'cpg_qr_sound'; // 'off' → ses kapalı (toast yine görünür)

/**
 * Masadan QR ile sipariş gelince SES + toast ile uyarır (kök seviyede, görünmez bileşen).
 * Yalnız QR menü açık (features.menu) + QR sipariş yetkisi (entitlements.qrOrdering) olan işletmelerde çalışır.
 * Ses HARİCİ DOSYA olmadan Web Audio API ile üretilir (CSP/çevrimdışı güvenli).
 * Tarayıcı otomatik-oynatma kısıtı: AudioContext ilk kullanıcı etkileşiminde (tık/tuş) uyandırılır.
 */
@Component({
  selector: 'app-qr-order-alert',
  template: '',
})
export class QrOrderAlertComponent implements OnInit, OnDestroy {
  private ordersApi = inject(OrdersApi);
  private auth = inject(AuthService);
  private branchStore = inject(BranchStore);
  private toast = inject(ToastService);

  private seen = new Set<string>();
  private primed = false;
  private timer?: ReturnType<typeof setInterval>;
  private audioCtx?: AudioContext;
  private readonly resume = (): void => { void this.audioCtx?.resume().catch(() => {}); };

  constructor() {
    // Şube değişince (X-Branch-Id başlığı değişir, sayfa yeniden yüklenmez) durumu sıfırla → yeni şubenin
    // MEVCUT açık siparişleri "yeni" sanılıp toplu çalmasın (bir sonraki poll yeniden sessiz priming yapar).
    effect(() => {
      this.branchStore.currentBranchId();
      this.seen.clear();
      this.primed = false;
    });
  }

  private enabled(): boolean {
    return !!this.auth.profile().features.menu && (this.auth.user()?.entitlements?.qrOrdering ?? false);
  }

  ngOnInit(): void {
    if (!this.enabled()) return;
    // Otomatik-oynatma kısıtı: ilk tık/tuşla ses bağlamını uyandır (aksi halde ilk bip çalmayabilir).
    document.addEventListener('pointerdown', this.resume);
    document.addEventListener('keydown', this.resume);
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_MS);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('pointerdown', this.resume);
    document.removeEventListener('keydown', this.resume);
  }

  private poll(): void {
    this.ordersApi.getOpen().subscribe({
      next: (list) => {
        const orders = list ?? [];
        if (!this.primed) {
          // Açılışta mevcut siparişleri "görüldü" say → uygulama açılırken çalmasın.
          orders.forEach((o) => this.seen.add(o.id));
          this.primed = true;
          return;
        }
        const fresh = orders.filter((o) => o.source === 'Qr' && !this.seen.has(o.id));
        // seen'i mevcut açık kümeyle DEĞİŞTİR → kapanan siparişler düşer (sınırsız büyüme/bellek sızıntısı yok),
        // açık kalanlar hâlâ "görülmüş" sayılır.
        this.seen = new Set(orders.map((o) => o.id));
        if (fresh.length === 0) return;

        if (localStorage.getItem(QR_SOUND_KEY) !== 'off') this.beep();
        const where = fresh.map((o) => o.tableName || o.label || 'Masa').join(', ');
        this.toast.success(`🔔 Yeni QR sipariş — ${where}`);
      },
      error: () => {},
    });
  }

  /** İki tonlu kısa "ding-dong" (Web Audio; harici ses dosyası yok). */
  private beep(): void {
    try {
      const Ctx = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.audioCtx ??= new Ctx();
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') void ctx.resume();

      const t0 = ctx.currentTime;
      const tone = (freq: number, start: number, dur: number): void => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(0.35, t0 + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.02);
      };
      tone(880, 0, 0.22);      // A5
      tone(1174.66, 0.16, 0.34); // D6
    } catch {
      /* Ses açılamazsa toast yine görünür. */
    }
  }
}
