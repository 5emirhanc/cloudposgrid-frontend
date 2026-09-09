import { HttpErrorResponse } from '@angular/common/http';

/** API hata yanıtından (ProblemDetails / ValidationProblemDetails) okunabilir mesaj çıkarır. */
export function apiError(err: unknown, fallback = 'Bir hata oluştu, lütfen tekrar deneyin.'): string {
  if (err instanceof HttpErrorResponse) {
    const e = err.error;
    if (e) {
      if (typeof e === 'string') return e;
      if (e.errors && typeof e.errors === 'object') {
        const first = Object.values(e.errors)[0];
        if (Array.isArray(first) && first.length) return String(first[0]);
      }
      if (e.detail) return String(e.detail);
      if (e.title) return String(e.title);
    }
    if (err.status === 0) return 'Sunucuya bağlanılamadı. API çalışıyor mu?';
  }
  return fallback;
}

/** Blob (responseType:'blob') isteklerinde hata gövdesi Blob gelir; apiError onu okuyamayıp
 * genel mesaja düşer. Bu yardımcı Blob gövdesini metne çevirip JSON mesajını (detail/title) çıkarır. */
export async function blobError(err: unknown, fallback?: string): Promise<string> {
  if (err instanceof HttpErrorResponse && err.error instanceof Blob) {
    try {
      const txt = await err.error.text();
      try {
        const j = JSON.parse(txt);
        return j.detail ?? j.error ?? j.title ?? apiError(err, fallback);
      } catch {
        return txt || apiError(err, fallback);
      }
    } catch {
      return apiError(err, fallback);
    }
  }
  return apiError(err, fallback);
}

/** Tanımsız/boş değerleri eleyip HttpParams uyumlu bir nesne döndürür. */
export function cleanParams(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = String(v);
  }
  return out;
}

export function money(value: number | null | undefined, currency = '₺'): string {
  const n = value ?? 0;
  return currency + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function num(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

/** Çok-şube TAM stok: aktif şube seçiliyse o şubenin bakiyesi (branchStock), değilse toplam (currentStock). */
export function stockOf(p: { branchStock?: number | null; currentStock: number }): number {
  return p.branchStock ?? p.currentStock;
}

/**
 * Dahili kullanım için taranabilir EAN-13 barkodu üretir: prefix "2"
 * (GS1'in perakende iç-kullanım aralığı → gerçek üretici barkodlarıyla çakışmaz) +
 * 11 rastgele hane + geçerli EAN-13 kontrol hanesi. Backend GenerateInternalEan13 ile aynı algoritma.
 */
export function generateInternalEan13(): string {
  let digits = '2';
  for (let i = 0; i < 11; i++) digits += Math.floor(Math.random() * 10);
  // Kontrol hanesi: soldan 1-indeks; tek konumlar ×1, çift konumlar ×3.
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * (digits.charCodeAt(i) - 48);
  return digits + ((10 - (sum % 10)) % 10);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Randevu gibi KULLANICININ girdiği yerel duvar-saatlerini doğru yorumlar.
 * Bu değerler DB'de naive (timezone'suz) saklanır ama API 'Z' (UTC) ekiyle döner;
 * ham `new Date()` tarayıcının saat dilimi kadar kaydırır (TR'de +3 saat). Bu yardımcı
 * saklanan duvar-saatini (UTC bileşenleri) YEREL bir Date olarak yeniden kurar — böylece
 * getHours()/toLocaleTimeString gibi tüm çağrılar girilen saati aynen gösterir.
 * (Sunucu üretimi UTC zamanları için KULLANMA; onlar new Date ile doğru çözülür.)
 */
export function wallClock(value: string | Date): Date {
  const d = typeof value === 'string' ? new Date(value) : value;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}
