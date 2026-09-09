import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { forkJoin } from 'rxjs';
import { OrdersApi } from '../../core/api/orders.api';
import { AuthService } from '../../core/auth.service';
import { DiningTableDto, OrderListItemDto, ServiceAreaDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError, money } from '../../core/utils';
import QRCode from 'qrcode';

interface AreaGroup {
  name: string;
  tables: DiningTableDto[];
}

@Component({
  selector: 'app-tables',
  imports: [LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="tables" title="Masalarınızı ve açık adisyonları buradan yönetin">
      <li>Boş masaya dokunun, hemen yeni adisyon açılsın</li>
      <li>Dolu masaya dokunup açık adisyonu görüntüleyin</li>
      <li>Paket / Gel-Al ile masasız sipariş adisyonu açın</li>
      <li>Masaları Yönet'ten bölge, masa ekleyin veya QR oluşturun</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Masalar / Adisyon</h1>
        <p class="text-sm text-slate-500">Masaya dokun: boşsa adisyon açılır, doluysa açılır</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-outline" (click)="openTakeaway.set(true)">
          <lucide-icon name="package-2" class="h-4 w-4"></lucide-icon> Paket / Gel-Al
        </button>
        <button class="btn-outline" (click)="openManage()">
          <lucide-icon name="settings" class="h-4 w-4"></lucide-icon> Masaları Yönet
        </button>
      </div>
    </div>

    @if (loading()) {
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        @for (i of [1,2,3,4,5,6,7,8]; track i) { <div class="h-24 animate-pulse rounded-xl bg-slate-100"></div> }
      </div>
    } @else {
      <!-- Durum göstergesi -->
      <div class="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-slate-300"></span> Boş</span>
        <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Dolu</span>
      </div>

      <!-- Paket / Gel-Al açık siparişler -->
      @if (takeaways().length) {
        <div class="mb-6">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Paket / Gel-Al</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            @for (o of takeaways(); track o.id) {
              <button class="card flex flex-col items-start border-l-4 border-l-violet-500 p-4 text-left hover:shadow-card-hover" (click)="goto(o.id)">
                <div class="mb-1 flex items-center gap-1">
                  <span class="badge-blue">{{ o.type === 'Delivery' ? 'Kurye' : 'Paket' }}</span>
                  @if (o.source === 'Qr') { <span class="badge-amber">QR</span> }
                </div>
                <p class="truncate text-sm font-semibold text-slate-800">{{ o.label || 'Paket' }}</p>
                <p class="mt-1 font-bold text-brand-600">{{ money(o.grandTotal) }}</p>
              </button>
            }
          </div>
        </div>
      }

      @for (g of groups(); track g.name) {
        <div class="mb-6">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{{ g.name }}</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">
            @for (t of g.tables; track t.id) {
              <button
                class="flex flex-col rounded-2xl border-2 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft"
                [class]="t.openOrderId ? 'border-emerald-500 bg-emerald-50' : 'border-dashed border-slate-200 bg-white hover:border-slate-300'"
                (click)="openTable(t)"
              >
                <div class="flex w-full items-center justify-between">
                  <span class="text-sm font-black" [class]="t.openOrderId ? 'text-emerald-800' : 'text-slate-400'">{{ t.name }}</span>
                  @if (t.openOrderId) {
                    <span class="badge-green">Dolu</span>
                  } @else {
                    <lucide-icon name="plus" class="h-4 w-4 text-slate-300"></lucide-icon>
                  }
                </div>
                @if (t.openOrderId) {
                  <p class="mt-4 text-lg font-black text-emerald-800">{{ money(t.openTotal) }}</p>
                  <p class="text-xs font-semibold text-emerald-700">Açık adisyon</p>
                } @else {
                  <p class="mt-6 text-xs font-semibold text-slate-400">Boş</p>
                }
              </button>
            }
          </div>
        </div>
      }

      @if (!tables().length) {
        <div class="card p-10 text-center text-sm text-slate-400">
          Henüz masa yok. "Masaları Yönet" ile masa ekleyin.
        </div>
      }
    }

    <!-- Yeni paket modal -->
    @if (openTakeaway()) {
      <app-modal title="Paket / Gel-Al Adisyonu" (dismiss)="openTakeaway.set(false)">
        <label class="label">Etiket (müşteri adı / sipariş no)</label>
        <input class="input mb-4" [value]="takeawayLabel()" (input)="takeawayLabel.set($any($event.target).value)" placeholder="Örn. Ahmet Bey / Paket-12" />
        <div class="flex justify-end gap-2">
          <button class="btn-outline" (click)="openTakeaway.set(false)">İptal</button>
          <button class="btn-primary" [disabled]="busy()" (click)="createTakeaway()">Adisyon Aç</button>
        </div>
      </app-modal>
    }

    <!-- Masa QR modal (yönetim modalının üstünde: z=60) -->
    @if (qrTable(); as t) {
      <app-modal [title]="t.name + ' · QR'" [z]="60" (dismiss)="qrTable.set(null)">
        <div class="text-center">
          <img [src]="qrImage()" class="mx-auto h-56 w-56" alt="QR" />
          @if (canQrOrder()) {
            <p class="mt-2 text-xs text-slate-400">Müşteri bu QR'ı okutunca {{ t.name }} için masadan sipariş verebilir.</p>
          } @else {
            <p class="mt-2 text-xs text-slate-500">Müşteri bu QR'ı okutunca <b>menüyü görüntüler</b>. Masadan sipariş <b>Kurumsal</b> pakete özeldir.</p>
            <button (click)="goUpgrade()" class="mt-2 text-xs font-semibold text-brand-600 hover:underline">Kurumsal'a yükselt →</button>
          }
          <a [href]="qrImage()" [download]="'qr-' + t.name + '.png'" class="btn-outline mt-4 inline-block">QR'ı indir</a>
        </div>
      </app-modal>
    }

    <!-- Masa/bölge yönetimi modal -->
    @if (manageOpen()) {
      <app-modal title="Masaları Yönet" maxWidth="40rem" (dismiss)="manageOpen.set(false)">
        <div class="space-y-5">
          <div>
            <label class="label">Yeni Bölge</label>
            <div class="flex gap-2">
              <input class="input" [value]="newArea()" (input)="newArea.set($any($event.target).value)" placeholder="Örn. Bahçe" />
              <button class="btn-outline shrink-0" [disabled]="busy()" (click)="addArea()">Ekle</button>
            </div>
          </div>

          <div>
            <label class="label">Yeni Masa</label>
            <div class="flex flex-wrap gap-2">
              <input class="input flex-1" [value]="newTable()" (input)="newTable.set($any($event.target).value)" placeholder="Masa adı (Örn. M1)" />
              <select class="select w-40" [value]="newTableArea()" (change)="newTableArea.set($any($event.target).value)">
                <option value="">Bölgesiz</option>
                @for (a of areas(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
              </select>
              <button class="btn-primary shrink-0" [disabled]="busy()" (click)="addTable()">Ekle</button>
            </div>
          </div>

          <div>
            <label class="label">Mevcut Masalar</label>
            <div class="max-h-64 overflow-y-auto rounded-xl border border-slate-100">
              @for (t of tables(); track t.id) {
                <div class="flex items-center justify-between border-b border-slate-50 px-3 py-2 text-sm last:border-0">
                  <span class="font-medium text-slate-700">{{ t.name }} <span class="text-slate-400">· {{ t.areaName || 'Bölgesiz' }}</span></span>
                  <div class="flex items-center gap-1">
                    <button class="rounded-lg p-1.5 text-slate-400 hover:bg-brand-50 hover:text-brand-600" (click)="showTableQr(t)" title="Masa QR">
                      <lucide-icon name="qr-code" class="h-4 w-4"></lucide-icon>
                    </button>
                    <button class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="deleteTable(t)" title="Sil">
                      <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="px-3 py-3 text-sm text-slate-400">Masa yok.</p>
              }
            </div>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class TablesComponent implements OnInit, OnDestroy {
  private api = inject(OrdersApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  private poll?: ReturnType<typeof setInterval>;
  private lastQrCount = 0;

  protected money = money;

  protected loading = signal(true);
  protected busy = signal(false);
  protected tables = signal<DiningTableDto[]>([]);
  protected areas = signal<ServiceAreaDto[]>([]);
  protected open = signal<OrderListItemDto[]>([]);

  protected takeaways = computed(() => this.open().filter((o) => o.type === 'Takeaway' || o.type === 'Delivery'));
  // Masadan sipariş yalnız Kurumsal'da; değilse masa QR'ı sadece menü gösterir (sahibi bilgilendir).
  protected canQrOrder = computed(() => this.auth.user()?.entitlements?.qrOrdering ?? false);

  protected groups = computed<AreaGroup[]>(() => {
    const map = new Map<string, DiningTableDto[]>();
    for (const t of this.tables()) {
      const key = t.areaName || 'Bölgesiz';
      (map.get(key) ?? map.set(key, []).get(key)!).push(t);
    }
    return [...map.entries()].map(([name, tables]) => ({ name, tables }));
  });

  // Modallar
  protected openTakeaway = signal(false);
  protected takeawayLabel = signal('');
  protected manageOpen = signal(false);
  protected newArea = signal('');
  protected newTable = signal('');
  protected newTableArea = signal('');
  protected qrTable = signal<DiningTableDto | null>(null);
  protected qrImage = signal('');

  ngOnInit(): void {
    this.load();
    // QR siparişleri için hafif canlı tazeleme (20 sn). SignalR'a yükseltilebilir.
    this.poll = setInterval(() => this.refresh(), 20000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  private load(): void {
    this.loading.set(true);
    forkJoin({ tables: this.api.getTables(), areas: this.api.getAreas(), open: this.api.getOpen() }).subscribe({
      next: (r) => {
        this.tables.set(r.tables);
        this.areas.set(r.areas);
        this.open.set(r.open);
        this.lastQrCount = r.open.filter((o) => o.source === 'Qr').length;
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** Sessiz arka plan tazeleme; yeni QR siparişi gelince uyarır. */
  private refresh(): void {
    forkJoin({ tables: this.api.getTables(), open: this.api.getOpen() }).subscribe({
      next: (r) => {
        this.tables.set(r.tables);
        this.open.set(r.open);
        const qr = r.open.filter((o) => o.source === 'Qr').length;
        if (qr > this.lastQrCount) this.toast.info('Yeni QR siparişi geldi! 🔔');
        this.lastQrCount = qr;
      },
      error: () => {},
    });
  }

  protected goto(orderId: string): void {
    this.router.navigate(['/adisyon', orderId]);
  }

  protected openTable(t: DiningTableDto): void {
    if (t.openOrderId) {
      this.goto(t.openOrderId);
      return;
    }
    this.busy.set(true);
    this.api.open({ type: 'DineIn', tableId: t.id }).subscribe({
      next: (o) => this.router.navigate(['/adisyon', o.id]),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected createTakeaway(): void {
    this.busy.set(true);
    this.api.open({ type: 'Takeaway', label: this.takeawayLabel().trim() || null }).subscribe({
      next: (o) => this.router.navigate(['/adisyon', o.id]),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openManage(): void {
    this.newArea.set('');
    this.newTable.set('');
    this.newTableArea.set('');
    this.manageOpen.set(true);
  }

  protected addArea(): void {
    const name = this.newArea().trim();
    if (!name) return;
    this.busy.set(true);
    this.api.createArea({ name, sortOrder: this.areas().length }).subscribe({
      next: (a) => {
        this.areas.update((list) => [...list, a]);
        this.newArea.set('');
        this.busy.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected addTable(): void {
    const name = this.newTable().trim();
    if (!name) return;
    this.busy.set(true);
    this.api.createTable({ name, areaId: this.newTableArea() || null, sortOrder: this.tables().length }).subscribe({
      next: () => {
        this.newTable.set('');
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected showTableQr(t: DiningTableDto): void {
    const url = `${location.origin}/menu/${this.auth.user()?.slug ?? ''}/masa/${t.id}`;
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then((d) => {
      this.qrImage.set(d);
      this.qrTable.set(t);
    });
  }

  protected goUpgrade(): void {
    this.qrTable.set(null);
    this.router.navigateByUrl('/yukselt');
  }

  protected async deleteTable(t: DiningTableDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${t.name}" masası silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteTable(t.id).subscribe({
      next: () => {
        this.toast.success('Masa silindi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
