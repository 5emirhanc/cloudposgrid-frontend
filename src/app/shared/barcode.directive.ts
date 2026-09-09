import { Directive, ElementRef, afterRenderEffect, inject, input, output } from '@angular/core';
import JsBarcode from 'jsbarcode';

type BarcodeFormat = 'EAN13' | 'UPC' | 'CODE128';

/**
 * Bir <svg> elemanına jsbarcode ile taranabilir 1D barkod çizer.
 *
 * - 13 haneli geçerli kod → EAN-13, 12 hane → UPC, diğer her şey → CODE128.
 * - Geçersizse CODE128'e düşer; o da olmazsa hiçbir şey çizmez ve `rendered=false` yayar
 *   (böylece etiket ad+fiyata düşebilir). Böyle hiçbir barkod uygulamayı kırmaz.
 * - `afterRenderEffect`: DOM yazımı render SONRASI olur VE `value()` sinyali değişince
 *   otomatik yeniden çizer. `@for` içindeki her <svg [appBarcode]> kendi örneğini çizer.
 */
@Directive({
  selector: 'svg[appBarcode]',
})
export class BarcodeDirective {
  private host = inject<ElementRef<SVGElement>>(ElementRef);

  /** Barkod değeri (ürün.barcode). Boş/geçersizse çizim yapılmaz. */
  readonly value = input.required<string>({ alias: 'appBarcode' });
  readonly barWidth = input(1.6); // jsbarcode "width": çubuk kalınlığı
  readonly barHeight = input(38);
  readonly fontSize = input(13);
  readonly showText = input(true);

  /** Çizim başarılıysa true, hepsi başarısızsa false. */
  readonly rendered = output<boolean>();

  constructor() {
    afterRenderEffect(() => {
      const el = this.host.nativeElement;
      const raw = (this.value() ?? '').trim();
      this.clear(el);
      if (!raw) {
        this.rendered.emit(false);
        return;
      }
      const primary = this.pickFormat(raw);
      const ok =
        this.tryRender(el, raw, primary) ||
        (primary !== 'CODE128' && this.tryRender(el, raw, 'CODE128'));
      this.rendered.emit(ok);
    });
  }

  /** Verilen formatta çizmeyi dener; geçersiz/hata olursa temizler ve false döner. */
  private tryRender(el: SVGElement, raw: string, format: BarcodeFormat): boolean {
    let ok = false;
    try {
      JsBarcode(el, raw, {
        format,
        width: this.barWidth(),
        height: this.barHeight(),
        fontSize: this.fontSize(),
        displayValue: this.showText(),
        margin: 4,
        textMargin: 2,
        background: '#ffffff',
        lineColor: '#000000',
        // valid callback verilince jsbarcode geçersizde throw etmez; sonucu buradan okuruz.
        valid: (v: boolean) => {
          ok = v;
        },
      });
    } catch {
      ok = false;
    }
    if (!ok) this.clear(el);
    return ok;
  }

  private pickFormat(v: string): BarcodeFormat {
    if (/^\d{13}$/.test(v)) return 'EAN13';
    if (/^\d{12}$/.test(v)) return 'UPC';
    return 'CODE128';
  }

  private clear(el: SVGElement): void {
    while (el.firstChild) el.removeChild(el.firstChild);
  }
}
