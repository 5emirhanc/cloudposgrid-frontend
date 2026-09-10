import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AdminApi } from '../../core/api/admin.api';
import { AdminShellComponent } from './admin-shell.component';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { DealerDetailDto, DealerDto, TenantStatus } from '../../core/models';
import { formatDate, money } from '../../core/utils';

const STATUS_LABEL: Record<string, string> = {
  Trial: 'Deneme', Active: 'Aktif', Suspended: 'Askıda', Cancelled: 'İptal',
};

/**
 * Süper-admin bayi yönetimi.
 *
 * Ekran önceden yalnız "ekle / aktif-pasif yap" yapabiliyordu ve bayinin NE İŞE YARADIĞI
 * hiçbir yerde yazmıyordu. Daha kötüsü, gösterdiği komisyon oranı dekoratifti: hiçbir yerde
 * hesaplanmıyordu, çünkü tahsil edilen tutar kayıt altına alınmıyordu. Artık her tahsilat
 * kaydediliyor ve komisyon ödeme anında donduruluyor; bu ekran da o gerçek veriyi gösteriyor:
 * bayinin getirdiği müşteriler, hak ettiği tutar, ödenen tutar ve kalan bakiye.
 */
@Component({
  selector: 'app-dealers-admin',
  imports: [FormsModule, LucideAngularModule, ModalComponent, AdminShellComponent],
  template: `
    <app-admin-shell>

    @if (detail(); as d) {
      <!-- ---------- BAYİ DETAYI ---------- -->
      <button class="btn-ghost mb-4 -ml-2" (click)="closeDetail()">
        <lucide-icon name="chevron-right" class="h-4 w-4 rotate-180"></lucide-icon> Tüm bayiler
      </button>

      <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-2xl font-black tracking-tight text-slate-900">{{ d.dealer.name }}</h1>
            @if (!d.dealer.isActive) {
              <span class="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">Pasif</span>
            }
          </div>
          <p class="text-sm text-slate-500">
            {{ d.dealer.email }} · Kod <span class="font-mono">{{ d.dealer.code }}</span> · Komisyon %{{ d.dealer.commissionRate }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-outline" (click)="openPayout(d.dealer)">
            <lucide-icon name="banknote" class="h-4 w-4"></lucide-icon> Ödeme kaydet
          </button>
          <button class="btn-outline" (click)="openPassword(d.dealer)">
            <lucide-icon name="key-round" class="h-4 w-4"></lucide-icon> Şifre sıfırla
          </button>
          <button class="btn-ghost" [disabled]="busy()" (click)="toggleActive(d.dealer)">
            <lucide-icon [name]="d.dealer.isActive ? 'user-x' : 'user-check'" class="h-4 w-4"></lucide-icon>
            {{ d.dealer.isActive ? 'Pasifleştir' : 'Aktifleştir' }}
          </button>
          <button class="btn-ghost text-rose-600" (click)="openDelete(d.dealer)">
            <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon> Sil
          </button>
        </div>
      </div>

      <!-- Para durumu -->
      <div class="mb-6 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Hak ettiği toplam</p>
          <p class="text-2xl font-black text-slate-800">{{ money(d.earnings.totalEarned) }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ d.earnings.paidInvoiceCount }} tahsilattan</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-4">
          <p class="text-xs text-slate-500">Ödenen</p>
          <p class="text-2xl font-black text-emerald-600">{{ money(d.earnings.totalPaid) }}</p>
          <p class="mt-1 text-xs text-slate-400">{{ d.payouts.length }} ödeme kaydı</p>
        </div>
        <div class="rounded-2xl p-4" [class]="d.earnings.balance > 0 ? 'border border-amber-200 bg-amber-50' : 'border border-slate-200 bg-white'">
          <p class="text-xs" [class]="d.earnings.balance > 0 ? 'text-amber-700' : 'text-slate-500'">Kalan borç</p>
          <p class="text-2xl font-black" [class]="d.earnings.balance > 0 ? 'text-amber-700' : 'text-slate-400'">
            {{ money(d.earnings.balance) }}
          </p>
          @if (d.earnings.balance > 0) {
            <p class="mt-1 text-xs text-amber-600">Bu tutarı bayiye ödemen gerekiyor</p>
          } @else {
            <p class="mt-1 text-xs text-slate-400">Hesap kapalı</p>
          }
        </div>
      </div>

      <!-- Getirdiği müşteriler -->
      <div class="mb-6">
        <h2 class="mb-2 flex items-center gap-2 font-bold text-slate-800">
          <lucide-icon name="building-2" class="h-4 w-4 text-slate-400"></lucide-icon>
          Getirdiği müşteriler ({{ d.tenants.length }})
        </h2>
        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th class="px-4 py-3 font-semibold">İşletme</th>
                <th class="px-4 py-3 font-semibold">Plan</th>
                <th class="px-4 py-3 font-semibold">Durum</th>
                <th class="px-4 py-3 font-semibold">Bitiş</th>
                <th class="px-4 py-3 font-semibold">Kayıt</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (t of d.tenants; track t.id) {
                <tr>
                  <td class="px-4 py-3">
                    <p class="font-medium text-slate-800">{{ t.name }}</p>
                    <p class="text-xs text-slate-400">{{ t.slug }}</p>
                  </td>
                  <td class="px-4 py-3 text-slate-600">{{ t.plan }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-full px-2 py-0.5 text-xs font-semibold" [class]="statusClass(t.status)">
                      {{ statusLabel(t.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-600">{{ endText(t.status, t.trialEndsAt, t.subscriptionEndsAt) }}</td>
                  <td class="px-4 py-3 text-slate-500">{{ fdate(t.createdAt) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="px-4 py-8 text-center text-sm text-slate-400">
                  Bu bayi henüz müşteri getirmemiş.
                </td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Ödeme geçmişi -->
      <div>
        <h2 class="mb-2 flex items-center gap-2 font-bold text-slate-800">
          <lucide-icon name="banknote" class="h-4 w-4 text-slate-400"></lucide-icon>
          Ödeme geçmişi ({{ d.payouts.length }})
        </h2>
        <div class="rounded-2xl border border-slate-200 bg-white">
          @for (p of d.payouts; track p.id) {
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-50 px-4 py-3 last:border-0">
              <div class="text-sm">
                <span class="font-semibold text-slate-800">{{ money(p.amount) }}</span>
                @if (p.note) { <span class="text-slate-500"> · {{ p.note }}</span> }
              </div>
              <span class="text-xs text-slate-400">{{ fdate(p.paidAt) }}</span>
            </div>
          } @empty {
            <p class="px-4 py-8 text-center text-sm text-slate-400">Bu bayiye henüz ödeme yapılmamış.</p>
          }
        </div>
      </div>

    } @else {
      <!-- ---------- BAYİ LİSTESİ ---------- -->
      <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 class="text-2xl font-black tracking-tight text-slate-900">Bayiler</h1>
          <p class="text-sm text-slate-500">Yeniden-satıcı iş ortakları</p>
        </div>
        <button class="btn-primary" (click)="toggleForm()">
          <lucide-icon [name]="formOpen() ? 'x' : 'plus'" class="h-4 w-4"></lucide-icon>
          {{ formOpen() ? 'Vazgeç' : 'Yeni Bayi' }}
        </button>
      </div>

      <!-- Ekranın ne işe yaradığını yazmak: bu açıklama olmadığı için sayfanın amacı belirsizdi. -->
      <div class="mb-5 flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <lucide-icon name="store" class="mt-0.5 h-5 w-5 shrink-0 text-brand-600"></lucide-icon>
        <p class="leading-relaxed">
          Bayi, CloudPosGrid'i işletmelere satan iş ortağıdır. Kendi girişiyle müşteri hesabı açar,
          getirdiği her müşteriden tahsil edilen abonelik üzerinden <strong>komisyon</strong> hak eder.
          Komisyon tahsilat anında hesaplanıp dondurulur — oranı sonradan değiştirmen geçmiş hakedişi
          etkilemez. Bayiye para gönderdiğinde <strong>ödeme kaydı</strong> girersin; aradaki fark
          o bayiye kalan borcundur.
        </p>
      </div>

      @if (formOpen()) {
        <div class="card mb-4 p-4">
          <h2 class="mb-3 flex items-center gap-2 font-semibold text-slate-700">
            <lucide-icon name="user-cog" class="h-4 w-4 text-brand-600"></lucide-icon> Yeni Bayi
          </h2>
          <form (ngSubmit)="save()" class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Ad</label>
              <input class="input" name="name" [(ngModel)]="form.name" placeholder="Bayi adı / ünvanı" required />
            </div>
            <div>
              <label class="label">E-posta</label>
              <input class="input" name="email" type="email" [(ngModel)]="form.email" placeholder="bayi@ornek.com" required />
            </div>
            <div>
              <label class="label">Şifre</label>
              <input class="input" name="password" type="password" [(ngModel)]="form.password" placeholder="En az 6 karakter" required />
              <p class="mt-1 text-xs text-slate-400">Bayiye ilet; sonradan bu ekrandan sıfırlayabilirsin.</p>
            </div>
            <div>
              <label class="label">Komisyon Oranı (%)</label>
              <input class="input" name="commissionRate" type="number" min="0" max="100" step="0.5"
                [(ngModel)]="form.commissionRate" placeholder="Örn. 10" required />
              <p class="mt-1 text-xs text-slate-400">Getirdiği müşterilerin ödemelerinden alacağı pay.</p>
            </div>
            <div class="flex items-end gap-2 sm:col-span-2">
              <button class="btn-primary" [disabled]="saving()">
                <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ saving() ? 'Ekleniyor…' : 'Ekle' }}
              </button>
              <button type="button" class="btn-ghost" (click)="toggleForm()">Vazgeç</button>
            </div>
          </form>
        </div>
      }

      <div class="card overflow-hidden">
        @if (loading()) {
          <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
        } @else if (error()) {
          <div class="flex flex-col items-center gap-3 py-10 text-center">
            <p class="text-sm text-rose-500">{{ error() }}</p>
            <button class="btn-outline" (click)="load()">Tekrar dene</button>
          </div>
        } @else if (!dealers().length) {
          <div class="flex flex-col items-center gap-3 py-12 text-center">
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <lucide-icon name="store" class="h-7 w-7"></lucide-icon>
            </span>
            <p class="text-sm text-slate-500">Henüz bayi yok. Sağ üstten yeni bayi ekleyin.</p>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-slate-100 text-left">
                  <th class="table-th">Ad</th>
                  <th class="table-th">E-posta</th>
                  <th class="table-th">Kod</th>
                  <th class="table-th text-right">Komisyon</th>
                  <th class="table-th text-right">Müşteri</th>
                  <th class="table-th">Durum</th>
                  <th class="table-th text-right">İşlem</th>
                </tr>
              </thead>
              <tbody>
                @for (d of dealers(); track d.id) {
                  <tr class="cursor-pointer border-b border-slate-50 hover:bg-slate-50/60"
                    [class.opacity-60]="!d.isActive" (click)="openDetail(d)">
                    <td class="table-td font-medium text-slate-800">{{ d.name }}</td>
                    <td class="table-td text-slate-600">{{ d.email }}</td>
                    <td class="table-td font-mono text-xs text-slate-500">{{ d.code }}</td>
                    <td class="table-td text-right text-slate-600">%{{ d.commissionRate }}</td>
                    <td class="table-td text-right text-slate-600">{{ d.tenantCount }}</td>
                    <td class="table-td">
                      <span class="rounded-full px-2 py-0.5 text-xs font-semibold"
                        [class]="d.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'">
                        {{ d.isActive ? 'Aktif' : 'Pasif' }}
                      </span>
                    </td>
                    <td class="table-td text-right">
                      <button class="btn-ghost px-2" title="Detay" (click)="$event.stopPropagation(); openDetail(d)">
                        <lucide-icon name="chevron-right" class="h-4 w-4"></lucide-icon>
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- ---------- Diyaloglar ---------- -->
    @if (payoutTarget(); as d) {
      <app-modal title="Bayiye ödeme kaydet" (dismiss)="payoutTarget.set(null)">
        <p class="mb-4 text-sm text-slate-500">
          <span class="font-semibold text-slate-800">{{ d.name }}</span> bayisine gönderdiğin tutarı kaydet.
          Bu kayıt bayinin kalan borcundan düşer; para transferini kendin yapıyorsun.
        </p>
        <label class="label">Tutar (TL)</label>
        <input class="input" type="number" min="0" step="0.01" [value]="payoutAmount()"
          (input)="payoutAmount.set($any($event.target).value)" placeholder="Örn. 1500" />
        <label class="label mt-3">Açıklama (isteğe bağlı)</label>
        <input class="input" [value]="payoutNote()" (input)="payoutNote.set($any($event.target).value)"
          placeholder="Havale referansı, dönem…" />
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" (click)="payoutTarget.set(null)">Vazgeç</button>
          <button class="btn-primary" [disabled]="busy() || !payoutValid()" (click)="savePayout()">
            {{ busy() ? 'Kaydediliyor…' : 'Kaydet' }}
          </button>
        </div>
      </app-modal>
    }

    @if (passwordTarget(); as d) {
      <app-modal title="Bayi şifresini sıfırla" (dismiss)="passwordTarget.set(null)">
        <p class="mb-4 text-sm text-slate-500">
          <span class="font-semibold text-slate-800">{{ d.name }}</span> için yeni şifre belirle ve
          bayiye ilet. Eski şifre hemen geçersiz olur.
        </p>
        <label class="label">Yeni şifre</label>
        <input class="input" type="text" [value]="newPassword()" (input)="newPassword.set($any($event.target).value)"
          placeholder="En az 6 karakter" />
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" (click)="passwordTarget.set(null)">Vazgeç</button>
          <button class="btn-primary" [disabled]="busy() || newPassword().length < 6" (click)="savePassword()">
            {{ busy() ? 'Kaydediliyor…' : 'Şifreyi değiştir' }}
          </button>
        </div>
      </app-modal>
    }

    @if (deleteTarget(); as d) {
      <app-modal title="Bayiyi sil" (dismiss)="closeDelete()">
        <div class="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p class="font-semibold">Bu işlem geri alınamaz.</p>
          <p class="mt-1 leading-relaxed">
            <span class="font-semibold">{{ d.name }}</span> bayisi ve ödeme geçmişi silinir.
            Getirdiği işletmeler <strong>silinmez</strong> — çalışmaya devam eder, yalnız bayi bağı düşer.
          </p>
        </div>
        <p class="mb-4 text-sm text-slate-500">
          Bayi çalışmayı bıraktıysa silmek yerine <span class="font-medium text-slate-700">Pasifleştir</span>
          kullanabilirsin; girişi kapanır, geçmişi durur.
        </p>
        <label class="label">Onaylamak için bayinin adını birebir yaz</label>
        <input class="input" [placeholder]="d.name" [value]="deleteConfirm()"
          (input)="deleteConfirm.set($any($event.target).value)" />
        <div class="mt-5 flex justify-end gap-2">
          <button class="btn-ghost" (click)="closeDelete()">Vazgeç</button>
          <button class="btn-primary !bg-rose-600 hover:!bg-rose-700"
            [disabled]="busy() || !deleteNameMatches()" (click)="confirmDelete()">
            {{ busy() ? 'Siliniyor…' : 'Kalıcı olarak sil' }}
          </button>
        </div>
      </app-modal>
    }

    </app-admin-shell>
  `,
})
export class DealersAdminComponent implements OnInit {
  private api = inject(AdminApi);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  protected money = money;
  protected fdate = formatDate;

  protected dealers = signal<DealerDto[]>([]);
  protected detail = signal<DealerDetailDto | null>(null);
  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected saving = signal(false);
  protected busy = signal(false);
  protected formOpen = signal(false);

  protected form = { name: '', email: '', password: '', commissionRate: 10 };

  protected payoutTarget = signal<DealerDto | null>(null);
  protected payoutAmount = signal('');
  protected payoutNote = signal('');
  protected payoutValid = computed(() => Number(this.payoutAmount()) > 0);

  protected passwordTarget = signal<DealerDto | null>(null);
  protected newPassword = signal('');

  protected deleteTarget = signal<DealerDto | null>(null);
  protected deleteConfirm = signal('');
  /** Ad birebir yazılana kadar silme butonu kapalı; sunucu da aynı kontrolü tekrar yapar. */
  protected deleteNameMatches = computed(() =>
    this.deleteConfirm().trim().toLocaleLowerCase('tr') ===
    (this.deleteTarget()?.name ?? '').trim().toLocaleLowerCase('tr'));

  ngOnInit(): void {
    this.load();
  }

  protected statusLabel = (s: TenantStatus | string) => STATUS_LABEL[s] ?? s;

  protected statusClass(s: TenantStatus | string): string {
    switch (s) {
      case 'Active': return 'bg-emerald-100 text-emerald-700';
      case 'Trial': return 'bg-amber-100 text-amber-700';
      case 'Suspended': return 'bg-slate-200 text-slate-600';
      default: return 'bg-rose-100 text-rose-700';
    }
  }

  /** Aktif abonelikte abonelik bitişi, denemede deneme bitişi anlamlıdır. */
  protected endText(status: string, trialEndsAt?: string | null, subscriptionEndsAt?: string | null): string {
    const d = status === 'Active' ? subscriptionEndsAt : trialEndsAt;
    return d ? formatDate(d) : '—';
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.dealers().subscribe({
      next: (list) => { this.dealers.set(list); this.loading.set(false); },
      error: () => { this.error.set('Bayiler yüklenemedi.'); this.loading.set(false); },
    });
  }

  protected openDetail(d: DealerDto): void {
    this.busy.set(true);
    this.api.dealerDetail(d.id).subscribe({
      next: (detail) => { this.detail.set(detail); this.busy.set(false); window.scrollTo({ top: 0 }); },
      error: () => this.busy.set(false),
    });
  }

  protected closeDetail(): void {
    this.detail.set(null);
    this.load(); // liste sayıları detaydayken değişmiş olabilir
  }

  /** Detay açıkken yapılan bir işlemden sonra hem detayı hem listeyi tazele. */
  private refreshDetail(): void {
    const id = this.detail()?.dealer.id;
    if (!id) { this.load(); return; }
    this.api.dealerDetail(id).subscribe({ next: (d) => this.detail.set(d) });
    this.api.dealers().subscribe({ next: (l) => this.dealers.set(l) });
  }

  protected toggleForm(): void {
    this.formOpen.set(!this.formOpen());
    if (!this.formOpen()) this.form = { name: '', email: '', password: '', commissionRate: 10 };
  }

  protected save(): void {
    if (!this.form.name.trim() || !this.form.email.trim() || this.form.password.length < 6) {
      this.toast.error('Ad, e-posta ve en az 6 karakterli şifre gerekli.');
      return;
    }
    this.saving.set(true);
    this.api.createDealer({
      name: this.form.name.trim(),
      email: this.form.email.trim(),
      password: this.form.password,
      commissionRate: Number(this.form.commissionRate),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toggleForm();
        this.toast.success('Bayi eklendi.');
        this.load();
      },
      error: () => this.saving.set(false),
    });
  }

  protected openPayout(d: DealerDto): void {
    this.payoutAmount.set('');
    this.payoutNote.set('');
    this.payoutTarget.set(d);
  }

  protected savePayout(): void {
    const d = this.payoutTarget();
    if (!d || !this.payoutValid()) return;
    this.busy.set(true);
    this.api.createDealerPayout(d.id, Number(this.payoutAmount()), this.payoutNote().trim() || undefined).subscribe({
      next: () => {
        this.busy.set(false);
        this.payoutTarget.set(null);
        this.toast.success('Ödeme kaydedildi.');
        this.refreshDetail();
      },
      error: () => this.busy.set(false),
    });
  }

  protected openPassword(d: DealerDto): void {
    this.newPassword.set('');
    this.passwordTarget.set(d);
  }

  protected savePassword(): void {
    const d = this.passwordTarget();
    if (!d || this.newPassword().length < 6) return;
    this.busy.set(true);
    this.api.resetDealerPassword(d.id, this.newPassword()).subscribe({
      next: () => {
        this.busy.set(false);
        this.passwordTarget.set(null);
        this.toast.success('Şifre değiştirildi. Yeni şifreyi bayiye iletin.');
      },
      error: () => this.busy.set(false),
    });
  }

  /**
   * Pasifleştirme bayinin girişini keser — onaysız yapılmamalı. Aktifleştirme zararsız,
   * o yüzden yalnız kapatma onay ister.
   */
  protected async toggleActive(d: DealerDto): Promise<void> {
    const next = !d.isActive;
    if (!next) {
      const ok = await this.confirm.confirm({
        title: 'Bayiyi pasifleştir',
        message: `${d.name} artık panele giriş yapamayacak. Getirdiği işletmeler etkilenmez.`,
        confirmText: 'Pasifleştir',
        danger: true,
      });
      if (!ok) return;
    }
    this.busy.set(true);
    this.api.setDealerActive(d.id, next).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(next ? 'Bayi aktifleştirildi.' : 'Bayi pasifleştirildi.');
        this.refreshDetail();
      },
      error: () => this.busy.set(false),
    });
  }

  protected openDelete(d: DealerDto): void {
    this.deleteConfirm.set('');
    this.deleteTarget.set(d);
  }

  protected closeDelete(): void {
    this.deleteTarget.set(null);
    this.deleteConfirm.set('');
  }

  protected confirmDelete(): void {
    const d = this.deleteTarget();
    if (!d || !this.deleteNameMatches()) return;
    this.busy.set(true);
    this.api.deleteDealer(d.id, this.deleteConfirm().trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.closeDelete();
        this.detail.set(null);
        this.toast.success(`${d.name} silindi.`);
        this.load();
      },
      // Kapatılmamış hakediş varsa sunucu reddeder; sebebi global hata mesajında görünür.
      error: () => this.busy.set(false),
    });
  }
}
