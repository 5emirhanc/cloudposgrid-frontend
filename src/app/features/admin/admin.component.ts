import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AdminApi } from '../../core/api/admin.api';
import { AdminAuthService } from '../../core/admin-auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import {
  AdminStatsDto, BillingCycle, SubscriptionRequestDto, TenantAdminDto, TenantPlan, TenantStatus,
} from '../../core/models';
import { money, formatDate } from '../../core/utils';

const STATUS_LABEL: Record<TenantStatus, string> = {
  Trial: 'Deneme', Active: 'Aktif', Suspended: 'Askıda', Cancelled: 'İptal',
};
const PLAN_LABEL: Record<string, string> = {
  Starter: 'Başlangıç', Pro: 'Profesyonel', Enterprise: 'Kurumsal', Chain: 'Zincir',
};
const SECTOR_LABEL: Record<string, string> = {
  General: 'Genel', Hospitality: 'Kafe/Restoran', Retail: 'Market', Service: 'Servis', Beauty: 'Kuaför',
};

@Component({
  selector: 'app-admin',
  imports: [RouterLink, LucideAngularModule, ModalComponent],
  template: `
    <div class="min-h-screen bg-slate-50">
      <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:px-8">
        <img src="/logo.svg" class="h-8 w-8 rounded-lg" alt="CloudPosGrid" />
        <div>
          <p class="text-sm font-extrabold text-slate-800">Müşteri Yönetim Paneli</p>
          <p class="text-[10px] uppercase tracking-wider text-slate-400">CloudPosGrid Admin</p>
        </div>
        <div class="ml-auto flex items-center gap-3">
          <span class="hidden text-sm text-slate-500 sm:block">{{ adminEmail() }}</span>
          <a routerLink="/yonetim/bayiler" class="btn-ghost">
            <lucide-icon name="store" class="h-4 w-4"></lucide-icon> Bayiler
          </a>
          <button class="btn-ghost" (click)="logout()">
            <lucide-icon name="log-out" class="h-4 w-4"></lucide-icon> Çıkış
          </button>
        </div>
      </header>

      <main class="mx-auto max-w-7xl px-4 py-6 lg:px-8">

    <!-- KPI -->
    @if (stats(); as s) {
      <div class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Toplam İşletme</p>
          <p class="text-2xl font-black text-slate-800">{{ s.totalTenants }}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Aktif Deneme</p>
          <p class="text-2xl font-black text-amber-600">{{ s.activeTrials }}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Bitmek Üzere</p>
          <p class="text-2xl font-black text-orange-600">{{ s.trialsExpiringSoon }}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Ödeyen Müşteri</p>
          <p class="text-2xl font-black text-emerald-600">{{ s.payingCustomers }}</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Askıda/İptal</p>
          <p class="text-2xl font-black text-slate-500">{{ s.suspended }}</p>
        </div>
        <div class="rounded-2xl border border-brand-100 bg-brand-50 p-4">
          <p class="text-xs text-brand-700">Tahmini Aylık Gelir</p>
          <p class="text-2xl font-black text-brand-700">{{ money(s.estimatedMrr) }}</p>
        </div>
      </div>
    }

    <!-- Bekleyen talepler -->
    @if (requests().length > 0) {
      <div class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div class="mb-3 flex items-center gap-2">
          <lucide-icon name="clock" class="h-5 w-5 text-amber-600"></lucide-icon>
          <h2 class="font-bold text-amber-800">Bekleyen Havale Talepleri ({{ requests().length }})</h2>
        </div>
        <div class="space-y-2">
          @for (r of requests(); track r.id) {
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-3">
              <div class="text-sm">
                <span class="font-semibold text-slate-800">{{ r.tenantName }}</span>
                <span class="text-slate-500"> · {{ planLabel(r.requestedPlan) }} · {{ r.billingCycle === 'Yearly' ? 'Yıllık' : 'Aylık' }} · {{ money(r.amount) }}</span>
                <span class="text-slate-400"> · {{ fdate(r.createdAt) }}</span>
              </div>
              <div class="flex gap-2">
                <button class="btn-primary" [disabled]="busy()" (click)="approve(r)">
                  <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Onayla
                </button>
                <button class="btn-ghost text-rose-600" [disabled]="busy()" (click)="reject(r)">
                  <lucide-icon name="x" class="h-4 w-4"></lucide-icon> Reddet
                </button>
              </div>
            </div>
          }
        </div>
      </div>
    }

    <!-- Filtre + arama -->
    <div class="mb-4 flex flex-wrap items-center gap-2">
      @for (f of filters; track f.key) {
        <button class="rounded-lg px-3 py-1.5 text-sm font-medium transition"
          [class]="filter() === f.key ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 border border-slate-200'"
          (click)="setFilter(f.key)">{{ f.label }}</button>
      }
      <div class="ml-auto flex items-center gap-2">
        <input class="input w-52" placeholder="İşletme ara…"
          [value]="search()" (input)="search.set($any($event.target).value)" (keyup.enter)="reload()" />
        <button class="btn-outline" (click)="reload()"><lucide-icon name="search" class="h-4 w-4"></lucide-icon></button>
      </div>
    </div>

    <!-- Tablo -->
    <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th class="px-4 py-3 font-semibold">İşletme</th>
            <th class="px-4 py-3 font-semibold">Sektör</th>
            <th class="px-4 py-3 font-semibold">Plan</th>
            <th class="px-4 py-3 font-semibold">Durum</th>
            <th class="px-4 py-3 font-semibold">Bitiş</th>
            <th class="px-4 py-3 text-center font-semibold">Kul.</th>
            <th class="px-4 py-3 font-semibold">Kullanım</th>
            <th class="px-4 py-3 font-semibold">Kayıt</th>
            <th class="px-4 py-3 text-right font-semibold">İşlem</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          @for (t of tenants(); track t.id) {
            <tr class="hover:bg-slate-50">
              <td class="px-4 py-3">
                <p class="font-semibold text-slate-800">{{ t.name }}</p>
                <p class="text-xs text-slate-400">{{ t.slug }}</p>
              </td>
              <td class="px-4 py-3 text-slate-600">{{ sectorLabel(t.businessType) }}</td>
              <td class="px-4 py-3 text-slate-600">{{ planLabel(t.plan) }}</td>
              <td class="px-4 py-3"><span class="rounded-full px-2 py-0.5 text-xs font-semibold" [class]="statusClass(t.status)">{{ statusLabel(t.status) }}</span></td>
              <td class="px-4 py-3 text-slate-600">{{ endText(t) }}</td>
              <td class="px-4 py-3 text-center text-slate-600">{{ t.userCount }}</td>
              <td class="px-4 py-3">
                <p class="whitespace-nowrap text-slate-700">{{ t.productCount }} ürün · {{ t.salesCount }} satış</p>
                <p class="text-xs" [class]="t.lastLoginAt ? 'text-slate-400' : 'text-rose-400'">Son giriş: {{ lastSeen(t) }}</p>
              </td>
              <td class="px-4 py-3 text-slate-500">{{ fdate(t.createdAt) }}</td>
              <td class="px-4 py-3">
                <div class="flex justify-end gap-1">
                  <button class="btn-ghost px-2 text-emerald-600" title="Aktifle / Yenile" (click)="openActivate(t)">
                    <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
                  </button>
                  <button class="btn-ghost px-2 text-slate-600" title="Süre uzat (+30 gün)" [disabled]="busy()" (click)="extend(t)">
                    <lucide-icon name="clock" class="h-4 w-4"></lucide-icon>
                  </button>
                  <button class="btn-ghost px-2 text-rose-600" title="Askıya al" [disabled]="busy()" (click)="suspend(t)">
                    <lucide-icon name="ban" class="h-4 w-4"></lucide-icon>
                  </button>
                </div>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="9" class="px-4 py-10 text-center text-slate-400">Kayıt bulunamadı.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Sayfalama -->
    @if (total() > pageSize) {
      <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>Toplam {{ total() }} işletme</span>
        <div class="flex gap-2">
          <button class="btn-outline" [disabled]="page() <= 1" (click)="go(-1)">Önceki</button>
          <button class="btn-outline" [disabled]="page() * pageSize >= total()" (click)="go(1)">Sonraki</button>
        </div>
      </div>
    }

    <!-- Aktivasyon modalı -->
    @if (activateTarget(); as t) {
      <app-modal title="Paketi Aktifle / Yenile" (dismiss)="activateTarget.set(null)">
        <p class="mb-4 text-sm text-slate-500">
          <span class="font-semibold text-slate-800">{{ t.name }}</span> için havale onaylandıysa paketi aktifleştirin.
        </p>
        <div class="space-y-3">
          <div>
            <label class="label">Paket</label>
            <select class="input" [value]="aPlan()" (change)="aPlan.set($any($event.target).value)">
              <option value="Pro">Profesyonel</option>
              <option value="Enterprise">Kurumsal</option>
              <option value="Chain">Zincir</option>
            </select>
          </div>
          <div>
            <label class="label">Dönem</label>
            <select class="input" [value]="aCycle()" (change)="aCycle.set($any($event.target).value)">
              <option value="Monthly">Aylık</option>
              <option value="Yearly">Yıllık</option>
            </select>
          </div>
          <div>
            <label class="label">Tahsil Edilen Tutar (₺) <span class="text-slate-400">(opsiyonel)</span></label>
            <input class="input" type="number" [value]="aAmount()" (input)="aAmount.set($any($event.target).value)" placeholder="Örn. 5990" />
          </div>
          <div>
            <label class="label">Not <span class="text-slate-400">(havale referansı vb.)</span></label>
            <input class="input" [value]="aNote()" (input)="aNote.set($any($event.target).value)" />
          </div>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" (click)="activateTarget.set(null)">Vazgeç</button>
          <button class="btn-primary" [disabled]="busy()" (click)="confirmActivate()">Aktifle</button>
        </div>
      </app-modal>
    }
      </main>
    </div>
  `,
})
export class AdminComponent implements OnInit {
  private api = inject(AdminApi);
  private adminAuth = inject(AdminAuthService);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  protected adminEmail = this.adminAuth.email;
  protected money = money;
  protected fdate = formatDate;
  protected readonly pageSize = 20;

  protected readonly filters = [
    { key: 'all', label: 'Tümü' },
    { key: 'trial', label: 'Deneme' },
    { key: 'expiring', label: 'Bitmek Üzere' },
    { key: 'active', label: 'Aktif' },
    { key: 'suspended', label: 'Askıda' },
  ];

  protected stats = signal<AdminStatsDto | null>(null);
  protected tenants = signal<TenantAdminDto[]>([]);
  protected requests = signal<SubscriptionRequestDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected filter = signal('all');
  protected search = signal('');
  protected busy = signal(false);

  protected activateTarget = signal<TenantAdminDto | null>(null);
  protected aPlan = signal<TenantPlan>('Pro');
  protected aCycle = signal<BillingCycle>('Monthly');
  protected aAmount = signal('');
  protected aNote = signal('');

  ngOnInit(): void {
    this.reload();
    this.loadStats();
    this.loadRequests();
  }

  protected logout(): void {
    this.adminAuth.logout();
  }

  protected statusLabel = (s: TenantStatus) => STATUS_LABEL[s] ?? s;
  protected planLabel = (p: string) => PLAN_LABEL[p] ?? p;
  protected sectorLabel = (b: string) => SECTOR_LABEL[b] ?? b;

  protected statusClass(s: TenantStatus): string {
    switch (s) {
      case 'Active': return 'bg-emerald-100 text-emerald-700';
      case 'Trial': return 'bg-amber-100 text-amber-700';
      case 'Suspended': return 'bg-slate-200 text-slate-600';
      default: return 'bg-rose-100 text-rose-700';
    }
  }

  /** Son giriş anını satış takibi için okunur göreli metne çevirir. */
  protected lastSeen(t: TenantAdminDto): string {
    if (!t.lastLoginAt) return 'hiç';
    const days = Math.floor((Date.now() - new Date(t.lastLoginAt).getTime()) / 86400000);
    if (days <= 0) return 'bugün';
    if (days === 1) return 'dün';
    return `${days} gün önce`;
  }

  protected endText(t: TenantAdminDto): string {
    const end = t.status === 'Active' ? t.subscriptionEndsAt : t.trialEndsAt;
    if (!end) return '—';
    const days = Math.ceil((new Date(end).getTime() - Date.now()) / 86400000);
    return `${formatDate(end)}${days <= 0 ? ' (doldu)' : ` (${days}g)`}`;
  }

  protected setFilter(key: string): void {
    this.filter.set(key);
    this.page.set(1);
    this.reload();
  }

  protected go(delta: number): void {
    this.page.set(Math.max(1, this.page() + delta));
    this.reload();
  }

  protected reload(): void {
    const f = this.filter();
    this.api.tenants({ filter: f === 'all' ? undefined : f, search: this.search().trim() || undefined, page: this.page(), pageSize: this.pageSize })
      .subscribe({ next: (r) => { this.tenants.set(r.items); this.total.set(r.total); } });
  }

  private loadStats(): void {
    this.api.stats().subscribe({ next: (s) => this.stats.set(s) });
  }
  private loadRequests(): void {
    this.api.requests('Pending').subscribe({ next: (r) => this.requests.set(r) });
  }

  private refreshAll(): void {
    this.reload();
    this.loadStats();
    this.loadRequests();
  }

  protected openActivate(t: TenantAdminDto): void {
    // Aktivasyon dropdown'u için mevcut planı koru (deneme/Starter → varsayılan Profesyonel).
    this.aPlan.set(t.plan === 'Enterprise' || t.plan === 'Chain' ? t.plan : 'Pro');
    this.aCycle.set(t.billingCycle ?? 'Monthly');
    this.aAmount.set('');
    this.aNote.set('');
    this.activateTarget.set(t);
  }

  protected confirmActivate(): void {
    const t = this.activateTarget();
    if (!t || this.busy()) return;
    this.busy.set(true);
    const amount = this.aAmount() ? Number(this.aAmount()) : null;
    this.api.activate(t.id, { plan: this.aPlan(), billingCycle: this.aCycle(), amount, note: this.aNote().trim() || null }).subscribe({
      next: () => {
        this.busy.set(false);
        this.activateTarget.set(null);
        this.toast.success(`${t.name} aktifleştirildi.`);
        this.refreshAll();
      },
      error: () => this.busy.set(false),
    });
  }

  protected extend(t: TenantAdminDto): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.extend(t.id, 30).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Süre 30 gün uzatıldı.'); this.refreshAll(); },
      error: () => this.busy.set(false),
    });
  }

  protected async suspend(t: TenantAdminDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'İşletmeyi askıya al', message: `${t.name} askıya alınsın mı? Erişimi kısıtlanır.`, danger: true, confirmText: 'Askıya al',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.suspend(t.id).subscribe({
      next: () => { this.busy.set(false); this.toast.success('İşletme askıya alındı.'); this.refreshAll(); },
      error: () => this.busy.set(false),
    });
  }

  protected approve(r: SubscriptionRequestDto): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.approve(r.id).subscribe({
      next: () => { this.busy.set(false); this.toast.success(`${r.tenantName} paketi aktifleştirildi.`); this.refreshAll(); },
      error: () => this.busy.set(false),
    });
  }

  protected async reject(r: SubscriptionRequestDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Talebi reddet', message: `${r.tenantName} talebi reddedilsin mi?`, danger: true, confirmText: 'Reddet',
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.reject(r.id).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Talep reddedildi.'); this.refreshAll(); },
      error: () => this.busy.set(false),
    });
  }
}
