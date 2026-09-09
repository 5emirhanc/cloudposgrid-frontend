import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/** Kamerayla okutma destekleniyor mu? (getUserMedia + güvenli bağlam — iOS Safari dahil modern tarayıcılar). */
export function barcodeCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Uygulama içi kamera ile barkod/QR okutma katmanı. ZXing (JS decode) kullanır; native BarcodeDetector'a
 * bağlı değildir, bu yüzden iOS Safari, Android ve masaüstünde çalışır. Kod bulununca `scanned` yayınlar.
 * Not: mobilde kamera için HTTPS (güvenli bağlam) gerekir — üretimde app.cloudposgrid.com HTTPS ile sorunsuz.
 */
@Component({
  selector: 'app-barcode-camera',
  imports: [LucideAngularModule],
  template: `
    <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <div class="relative w-full max-w-md overflow-hidden rounded-2xl bg-black">
        <video #video class="h-auto w-full" playsinline muted autoplay></video>
        <div class="pointer-events-none absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500/80"></div>
        <div class="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/60"></div>
      </div>
      @if (error()) {
        <p class="mt-4 max-w-md text-center text-sm text-rose-300">{{ error() }}</p>
      } @else {
        <p class="mt-4 text-center text-sm text-white/80">Barkodu çerçeveye getirin</p>
      }
      <button class="mt-4 rounded-xl bg-white/10 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/20" (click)="close()">
        <lucide-icon name="x" class="mr-1 inline h-4 w-4"></lucide-icon> Kapat
      </button>
    </div>
  `,
})
export class BarcodeCameraComponent implements OnInit, OnDestroy {
  @ViewChild('video', { static: true }) videoRef!: ElementRef<HTMLVideoElement>;
  @Output() scanned = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  protected error = signal('');
  private reader = new BrowserMultiFormatReader();
  private controls?: IScannerControls;
  private done = false;

  async ngOnInit(): Promise<void> {
    if (!barcodeCameraSupported()) {
      this.error.set('Bu tarayıcı kamerayla okutmayı desteklemiyor.');
      return;
    }
    try {
      // Arka (environment) kamera; kod okununca durur.
      this.controls = await this.reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        this.videoRef.nativeElement,
        (result) => {
          const text = result?.getText().trim();
          if (text && !this.done) {
            this.done = true;
            this.scanned.emit(text);
            this.stop();
          }
        }
      );
    } catch {
      this.error.set('Kameraya erişilemedi. İzin verildiğinden ve HTTPS kullanıldığından emin olun.');
    }
  }

  protected close(): void {
    this.stop();
    this.closed.emit();
  }

  private stop(): void {
    try {
      this.controls?.stop();
    } catch {
      /* zaten durmuş olabilir */
    }
    this.controls = undefined;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
