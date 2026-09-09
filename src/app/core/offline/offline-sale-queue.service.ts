import { Injectable, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { InvoicesApi } from '../api/invoices.api';
import { ToastService } from '../toast.service';
import { AuthService } from '../auth.service';
import { apiError } from '../utils';

const DB_NAME = 'cpg-offline';
const DB_VERSION = 2;
const PENDING = 'pendingSales';
const FAILED = 'failedSales'; // ölü-mektup: kalıcı hatayla reddedilen satışlar ASLA silinmez
const MAX_ATTEMPTS = 20; // bu kadar tur ısrarla başarısız olan satış "zehirli" sayılıp FAILED'e taşınır

interface PendingSale {
  clientSaleId: string;
  payload: Record<string, unknown>;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** #47 çok-şirket: satışın ait olduğu işletme. Kuyruk tarayıcı-geneli olduğundan, yalnız AKTİF
   * işletmedeyken gönderilir → işletme değiştirince A'nın satışı yanlışlıkla B'ye YAZILMAZ. */
  tenantId?: string;
}

/**
 * Çevrimdışı POS satış kuyruğu. İnternet kesildiğinde satış kaybolmaz: yerel IndexedDB'ye alınır ve
 * bağlantı gelince otomatik gönderilir. Her satışa benzersiz `clientSaleId` eklenir; sunucu bu kimlikle
 * idempotency uygular → aynı satış iki kez gönderilse bile ÇİFT kayıt olmaz.
 *
 * HATA SINIFLANDIRMASI (kritik — burada yanlış sınıflandırma GERÇEK PARA KAYBEDER):
 *  - GEÇİCİ (ağ yok, 401 oturum yenilenemedi, 408, 429, 5xx): satış kuyrukta KALIR, sonra tekrar denenir.
 *  - KALICI (400/403/404/409/422 iş kuralı): kuyruktan çıkarılır ama SİLİNMEZ — "başarısız" deposuna
 *    taşınır ki operatör görüp elle çözebilsin. Sessiz veri kaybı yok.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSaleQueueService {
  private invoicesApi = inject(InvoicesApi);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  /** Gönderilmeyi bekleyen çevrimdışı satış sayısı. */
  readonly pendingCount = signal(0);
  /** Kalıcı hatayla reddedilmiş, operatör müdahalesi bekleyen satış sayısı. */
  readonly failedCount = signal(0);

  private replaying = false;
  private db?: Promise<IDBDatabase>;

  constructor() {
    window.addEventListener('online', () => void this.replayAll());
    void this.refreshCounts().then(() => {
      if (navigator.onLine) void this.replayAll();
    });
  }

  /** Ağ kaynaklı mı (çevrimdışı / sunucuya ulaşılamadı)? */
  isNetworkError(e: unknown): boolean {
    return (e instanceof HttpErrorResponse && e.status === 0) || !navigator.onLine;
  }

  /**
   * Bu hata SONRADAN düzelebilir mi? Öyleyse satış kuyrukta tutulur.
   * 401: oturum yenilenemedi (kullanıcı tekrar girince gönderilir). 402: abonelik/deneme kilidi (ödeyince akar).
   * 408/429: zaman aşımı / hız limiti. 5xx: sunucu geçici olarak veremedi (deploy, aşırı yük).
   */
  private isRetryable(e: unknown): boolean {
    if (this.isNetworkError(e)) return true;
    if (!(e instanceof HttpErrorResponse)) return true; // bilinmeyen hata → veri kaybetme, tekrar dene
    return e.status === 401 || e.status === 402 || e.status === 408 || e.status === 429 || e.status >= 500;
  }

  /** Yeni benzersiz satış kimliği (secure context'te crypto.randomUUID; değilse yedek). */
  newSaleId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  /** Bir satışı yerel kuyruğa alır (payload clientSaleId içermeli). */
  async enqueue(payload: Record<string, unknown> & { clientSaleId: string }): Promise<void> {
    await this.write(PENDING, (store) =>
      store.put({
        clientSaleId: payload.clientSaleId,
        payload,
        createdAt: Date.now(),
        attempts: 0,
        tenantId: this.auth.user()?.tenantId, // hangi işletmede oluştuğunu damgala (#47)
      } as PendingSale),
    );
    await this.refreshCounts();
  }

  /** Kuyruktaki satışları sırayla göndermeyi dener. İdempotent olduğu için ÇİFT satış riski yoktur. */
  async replayAll(): Promise<void> {
    if (this.replaying || !navigator.onLine) return;
    this.replaying = true;
    try {
      // #47: yalnız AKTİF işletmeye ait satışları gönder. Başka işletmenin satışları kuyrukta bekler
      // (o işletmeye geçilince senkronlanır) → işletme değiştirince yanlış tenant'a satış yazılmaz.
      // tenantId'siz eski (upgrade öncesi) kayıtlar geriye uyum için gönderilir.
      const tid = this.auth.user()?.tenantId;
      const pending = (await this.readAll()).filter((p) => !p.tenantId || p.tenantId === tid);
      let synced = 0;
      let rejected = 0;

      for (const item of pending) {
        try {
          await firstValueFrom(this.invoicesApi.createInvoice(item.payload));
          await this.write(PENDING, (s) => s.delete(item.clientSaleId));
          synced++;
        } catch (e) {
          // Gerçekten çevrimdışı → tüm tur boşuna, dur (sonraki 'online' olayında yeniden dene).
          if ((e instanceof HttpErrorResponse && e.status === 0) || !navigator.onLine) break;

          if (this.isRetryable(e)) {
            const attempts = item.attempts + 1;
            if (attempts >= MAX_ATTEMPTS) {
              // ISRARLA başarısız (zehirli satış) → karantinaya al ve DEVAM et; kuyruğu tek satış kilitlemesin.
              if (await this.moveToFailed(item, `${MAX_ATTEMPTS} deneme sonrası: ${apiError(e)}`)) rejected++;
              continue;
            }
            // Muhtemelen sunucu-geneli geçici hata → denemeyi arttır ve DUR (hammer'lama), sonra tekrar dene.
            await this.safeWrite(PENDING, (s) => s.put({ ...item, attempts, lastError: apiError(e) } as PendingSale));
            break;
          }

          // Kalıcı iş-kuralı reddi (ör. stok değişmiş): SİLME, "başarısız" deposuna taşı.
          if (await this.moveToFailed(item, apiError(e))) rejected++;
        }
      }

      await this.refreshCounts();
      if (synced > 0) this.toast.success(`${synced} çevrimdışı satış senkronlandı.`);
      if (rejected > 0) {
        this.toast.error(`${rejected} bekleyen satış sunucu tarafından reddedildi; kayıtlar saklandı, elle kontrol edin.`);
      }
    } finally {
      this.replaying = false;
    }
  }

  /** Kalıcı hatayla reddedilmiş satışlar (operatörün elle çözmesi için). */
  async failedSales(): Promise<PendingSale[]> {
    return this.readAll(FAILED);
  }

  /** Operatör satışı elle işledikten sonra başarısızlar listesinden düşer. */
  async dismissFailed(clientSaleId: string): Promise<void> {
    await this.write(FAILED, (s) => s.delete(clientSaleId));
    await this.refreshCounts();
  }

  /** Satışı ölü-mektup deposuna taşır. IndexedDB hatası (kota vb.) tüm replay turunu düşürmesin diye korumalı. */
  private async moveToFailed(item: PendingSale, lastError: string): Promise<boolean> {
    try {
      await this.write(FAILED, (s) => s.put({ ...item, lastError } as PendingSale));
      await this.write(PENDING, (s) => s.delete(item.clientSaleId));
      return true;
    } catch {
      return false; // taşınamadıysa PENDING'de kalsın (kayıp yok), döngüyü kırma
    }
  }

  /** Yazma hatasını yutar (kota/gizli mod) — çağıran akış bozulmasın. */
  private async safeWrite(store: string, op: (s: IDBObjectStore) => void): Promise<void> {
    try {
      await this.write(store, op);
    } catch {
      /* sessiz */
    }
  }

  // ---- IndexedDB yardımcıları (harici bağımlılık yok, CSP-güvenli) ----

  private open(): Promise<IDBDatabase> {
    return (this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PENDING)) db.createObjectStore(PENDING, { keyPath: 'clientSaleId' });
        if (!db.objectStoreNames.contains(FAILED)) db.createObjectStore(FAILED, { keyPath: 'clientSaleId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  private async write(store: string, op: (s: IDBObjectStore) => void): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      op(tx.objectStore(store));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private async readAll(store: string = PENDING): Promise<PendingSale[]> {
    const db = await this.open();
    return new Promise<PendingSale[]>((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve((req.result as PendingSale[]).sort((a, b) => a.createdAt - b.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  private async count(store: string): Promise<number> {
    const db = await this.open();
    return new Promise<number>((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async refreshCounts(): Promise<void> {
    try {
      this.pendingCount.set(await this.count(PENDING));
      this.failedCount.set(await this.count(FAILED));
    } catch {
      /* IndexedDB kullanılamıyorsa sessiz geç. */
    }
  }
}
