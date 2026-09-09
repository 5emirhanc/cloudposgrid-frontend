import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { OrdersApi } from '../../core/api/orders.api';
import { OrderListItemDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError, formatDateTime, money } from '../../core/utils';

@Component({
  selector: 'app-work-orders',
  imports: [LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="work-orders" title="Servis ve tamir işlerinizi buradan açıp takip edin">
      <li>"Yeni İş Emri" ile müşteri adı, araç/cihaz ve arıza girin</li>
      <li>Açık iş emirlerini kartlar halinde tek bakışta görün</li>
      <li>Her kartta durumu görün: Alındı, İşlemde, Hazır</li>
      <li>Karta tıklayıp parça ve işçiliği adisyona ekleyin</li>
    </app-page-help>

    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">İş Emirleri</h1>
        <p class="text-sm text-slate-500">Servis / tamir kayıtları — parça + işçilik</p>
      </div>
      <button class="btn-primary" (click)="openNew()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni İş Emri
      </button>
    </div>

    @if (loading()) {
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (i of [1,2,3]; track i) { <div class="h-28 animate-pulse rounded-xl bg-slate-100"></div> }
      </div>
    } @else if (!orders().length) {
      <div class="card p-10 text-center text-sm text-slate-400">Açık iş emri yok. "Yeni İş Emri" ile başlayın.</div>
    } @else {
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (o of orders(); track o.id) {
          <button class="card p-4 text-left transition hover:-translate-y-0.5 hover:shadow-card-hover" (click)="goto(o.id)">
            <div class="mb-2 flex items-center justify-between gap-2">
              <span class="truncate font-bold text-slate-800">{{ o.label || 'Müşteri' }}</span>
              <span class="badge-amber shrink-0">{{ statusLabel[o.workStatus || 'Received'] }}</span>
            </div>
            @if (o.assetInfo) { <p class="truncate text-sm text-slate-500">{{ o.assetInfo }}</p> }
            <p class="mt-2 text-xs text-slate-400">{{ formatDateTime(o.openedAt) }}</p>
            <p class="mt-1 font-bold text-brand-600">{{ money(o.grandTotal) }}</p>
          </button>
        }
      </div>
    }

    @if (newOpen()) {
      <app-modal title="Yeni İş Emri" (dismiss)="newOpen.set(false)">
        <label class="label">Müşteri Adı *</label>
        <input class="input mb-3" [value]="customer()" (input)="customer.set($any($event.target).value)" placeholder="Ad Soyad" />
        <label class="label">Araç / Cihaz</label>
        <input class="input mb-3" [value]="asset()" (input)="asset.set($any($event.target).value)" placeholder="Plaka / cihaz modeli" />
        <label class="label">Açıklama / Arıza</label>
        <input class="input mb-4" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Opsiyonel" />
        <div class="flex justify-end gap-2">
          <button class="btn-outline" (click)="newOpen.set(false)">İptal</button>
          <button class="btn-primary" [disabled]="busy()" (click)="create()">İş Emri Aç</button>
        </div>
      </app-modal>
    }
  `,
})
export class WorkOrdersComponent implements OnInit {
  private api = inject(OrdersApi);
  private toast = inject(ToastService);
  private router = inject(Router);

  protected money = money;
  protected formatDateTime = formatDateTime;
  protected statusLabel: Record<string, string> = { Received: 'Alındı', InProgress: 'İşlemde', Ready: 'Hazır' };

  protected loading = signal(true);
  protected busy = signal(false);
  protected orders = signal<OrderListItemDto[]>([]);

  protected newOpen = signal(false);
  protected customer = signal('');
  protected asset = signal('');
  protected note = signal('');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getOpen().subscribe({
      next: (list) => {
        this.orders.set(list.filter((o) => o.type === 'Service'));
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected goto(id: string): void {
    this.router.navigate(['/adisyon', id]);
  }

  protected openNew(): void {
    this.customer.set('');
    this.asset.set('');
    this.note.set('');
    this.newOpen.set(true);
  }

  protected create(): void {
    if (!this.customer().trim()) {
      this.toast.error('Müşteri adı girin.');
      return;
    }
    this.busy.set(true);
    this.api
      .open({ type: 'Service', label: this.customer().trim(), assetInfo: this.asset().trim() || null, note: this.note().trim() || null })
      .subscribe({
        next: (o) => this.router.navigate(['/adisyon', o.id]),
        error: (e) => {
          this.busy.set(false);
          this.toast.error(apiError(e));
        },
      });
  }
}
