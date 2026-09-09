import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { AccountApi } from '../../core/api/account.api';
import { ToastService } from '../../core/toast.service';
import { LoginEventDto } from '../../core/models';
import { apiError, blobError, formatDate } from '../../core/utils';

/**
 * Güvenlik & Yedek ekranı (Owner/Admin): son giriş kayıtlarını (#46) gösterir ve tüm işletme
 * verilerinin tek dosyalık JSON yedeğini indirir (#48). Salt görüntüleme + tek tık yedek.
 */
@Component({
  selector: 'app-security',
  imports: [LucideAngularModule],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-black tracking-tight text-slate-900">Güvenlik & Yedek</h1>
      <p class="text-sm text-slate-500">Giriş kayıtları ve verilerinizin yedeği</p>
    </div>

    <!-- Yedek indirme -->
    <div class="card mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
      <div class="flex items-start gap-3">
        <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <lucide-icon name="database-backup" class="h-5 w-5"></lucide-icon>
        </span>
        <div>
          <h2 class="font-semibold text-slate-800">Verilerinizi yedekleyin</h2>
          <p class="max-w-lg text-sm text-slate-500">
            Ürünler, cariler, faturalar, satışlar ve kasa hareketleri dahil ana verileriniz tek bir
            JSON dosyası olarak iner. Güvenli bir yerde saklayın.
          </p>
        </div>
      </div>
      <button class="btn-primary" [disabled]="downloading()" (click)="downloadBackup()">
        <lucide-icon name="download" class="h-4 w-4"></lucide-icon>
        {{ downloading() ? 'Hazırlanıyor…' : 'Yedeği İndir' }}
      </button>
    </div>

    <!-- Giriş kayıtları -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 class="font-semibold text-slate-800">Son Giriş Kayıtları</h2>
        <span class="text-xs text-slate-400">Şüpheli girişleri buradan izleyin</span>
      </div>
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (!events().length) {
        <p class="py-10 text-center text-sm text-slate-400">Henüz giriş kaydı yok.</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Durum</th>
                <th class="table-th">E-posta</th>
                <th class="table-th">IP Adresi</th>
                <th class="table-th">Cihaz</th>
                <th class="table-th text-right">Zaman</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (e of events(); track e.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td">
                    @if (e.success) {
                      <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Başarılı</span>
                    } @else {
                      <span class="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">Başarısız</span>
                    }
                  </td>
                  <td class="table-td font-medium text-slate-700">{{ e.email }}</td>
                  <td class="table-td text-slate-500">{{ e.ipAddress || '—' }}</td>
                  <td class="table-td max-w-xs truncate text-xs text-slate-400" [title]="e.userAgent || ''">{{ shortAgent(e.userAgent) }}</td>
                  <td class="table-td text-right text-slate-500">{{ dateTime(e.createdAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class SecurityComponent implements OnInit {
  private auth = inject(AuthService);
  private account = inject(AccountApi);
  private toast = inject(ToastService);

  protected loading = signal(true);
  protected downloading = signal(false);
  protected events = signal<LoginEventDto[]>([]);

  ngOnInit(): void {
    this.auth.loginHistory(100).subscribe({
      next: (e) => { this.events.set(e ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected downloadBackup(): void {
    this.downloading.set(true);
    this.account.downloadBackup().subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const today = formatDate(new Date()).replace(/\./g, '-');
        a.href = url;
        a.download = `cloudposgrid-yedek-${today}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
        this.toast.success('Yedek indirildi.');
      },
      error: async (e) => {
        this.downloading.set(false);
        this.toast.error(await blobError(e));
      },
    });
  }

  /** ISO tarih-saat → "27.07.2026 14:30" gibi okunur biçim. */
  protected dateTime(iso: string): string {
    const d = new Date(iso);
    return `${formatDate(d)} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  /** Uzun User-Agent'ı kısa okunur özete indirger. */
  protected shortAgent(ua: string | null | undefined): string {
    if (!ua) return '—';
    if (/mobile|android|iphone/i.test(ua)) return 'Mobil tarayıcı';
    if (/chrome/i.test(ua)) return 'Chrome';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua)) return 'Safari';
    if (/edg/i.test(ua)) return 'Edge';
    return ua.slice(0, 40);
  }
}
