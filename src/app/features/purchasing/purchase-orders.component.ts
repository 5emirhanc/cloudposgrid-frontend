import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { ContactsApi } from '../../core/api/contacts.api';
import { FinanceApi } from '../../core/api/finance.api';
import { PurchasingApi } from '../../core/api/purchasing.api';
import { StockApi } from '../../core/api/stock.api';
import {
  CashAccountDto,
  ContactDto,
  ProductDto,
  PurchaseOrderDto,
  PurchaseOrderListItemDto,
  PurchaseOrderStatus,
} from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { PageHelpComponent } from '../../shared/page-help.component';
import { apiError, money } from '../../core/utils';

interface DraftLine {
  productId: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}
interface ReceiveRow {
  lineId: string;
  productName: string;
  remaining: number;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="purchase-orders" title="Tedarikçilere sipariş verin, gelen malı stoğa alın">
      <li>Sipariş oluşturmak stok/borç etkilemez — sadece "ne ısmarladık" kaydıdır</li>
      <li>Tedarikçiye gönderdikten sonra "Gönderildi" olur, sipariş önerisinde "yolda" sayılır</li>
      <li>Mal geldiğinde "Mal Kabul" ile miktarı girin: stok girer, tedarikçiye borç yazılır</li>
      <li>Kısmi teslimatta her partide ayrı alış faturası oluşur</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Tedarikçi Siparişleri</h1>
        <p class="text-sm text-slate-500">Sipariş ver, mal kabul yap, stoğa al</p>
      </div>
      <button class="btn-primary" (click)="openNew()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Sipariş
      </button>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div class="relative min-w-48 flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-9" placeholder="Sipariş no ya da tedarikçi ara..." [value]="search()"
          (input)="search.set($any($event.target).value)" (keyup.enter)="reload()" />
      </div>
      <select class="select w-44" [value]="status()" (change)="status.set($any($event.target).value); reload()">
        <option value="">Tüm durumlar</option>
        @for (s of statuses; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
      </select>
      <button class="btn-outline" (click)="reload()">Filtrele</button>
    </div>

    @if (loading()) {
      <div class="card h-72 animate-pulse"></div>
    } @else if (!items().length) {
      <div class="card p-12 text-center">
        <p class="text-slate-500">Henüz sipariş yok.</p>
        <button class="btn-primary mt-4" (click)="openNew()">İlk siparişinizi oluşturun</button>
      </div>
    } @else {
      <div class="card overflow-hidden p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-xs text-slate-400">
                <th class="px-4 py-3 text-left font-medium">SİPARİŞ</th>
                <th class="px-4 py-3 text-left font-medium">TEDARİKÇİ</th>
                <th class="px-4 py-3 text-left font-medium">TESLİM</th>
                <th class="px-4 py-3 text-right font-medium">TUTAR</th>
                <th class="px-4 py-3 text-left font-medium">DURUM</th>
                <th class="px-4 py-3 text-right font-medium">İŞLEM</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (o of items(); track o.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-semibold text-slate-800">{{ o.number }}</td>
                  <td class="px-4 py-3 text-slate-600">{{ o.contactName }}</td>
                  <td class="px-4 py-3 text-slate-500">{{ o.expectedDate ? fmtDate(o.expectedDate) : '—' }}</td>
                  <td class="px-4 py-3 text-right font-bold text-slate-900">{{ money(o.grandTotal) }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-lg px-2 py-0.5 text-xs font-medium" [class]="statusClass(o.status)">{{ statusLabel(o.status) }}</span>
                    @if (o.status === 'PartiallyReceived') {
                      <span class="ml-1 text-xs text-slate-400">%{{ pct(o.receivedRatio) }}</span>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-1">
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Aç" (click)="openDetail(o)">
                        <lucide-icon name="eye" class="h-4 w-4"></lucide-icon>
                      </button>
                      @if (o.status === 'Draft') {
                        <button class="rounded-lg p-2 text-brand-500 hover:bg-brand-50" title="Tedarikçiye gönder" (click)="send(o)">
                          <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (o.status === 'Sent' || o.status === 'PartiallyReceived') {
                        <button class="rounded-lg p-2 text-emerald-500 hover:bg-emerald-50" title="Mal kabul" (click)="openReceive(o)">
                          <lucide-icon name="package-check" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <!-- Sipariş formu -->
    @if (formOpen()) {
      <app-modal [title]="editing() ? editing()!.number : 'Yeni Sipariş'" maxWidth="52rem" (dismiss)="formOpen.set(false)">
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <div class="sm:col-span-1">
              <label class="label">Tedarikçi *</label>
              <select class="select" [value]="contactId()" (change)="contactId.set($any($event.target).value)">
                <option value="">Seçin...</option>
                @for (c of suppliers(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Sipariş Tarihi</label>
              <input type="date" class="input" [value]="orderDate()" (input)="orderDate.set($any($event.target).value)" />
            </div>
            <div>
              <label class="label">Beklenen Teslim</label>
              <input type="date" class="input" [value]="expectedDate()" (input)="expectedDate.set($any($event.target).value)" />
            </div>
          </div>

          <div>
            <label class="label">Kalemler</label>
            <div class="space-y-2">
              @for (l of lines(); track $index; let i = $index) {
                <div class="flex flex-wrap items-center gap-2">
                  <select class="input min-w-40 flex-1" [value]="l.productId" (change)="setProduct(i, $any($event.target).value)">
                    <option value="">Ürün seçin...</option>
                    @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                  </select>
                  <input type="number" min="0" step="0.01" class="input w-20" [value]="l.quantity"
                    (input)="setLine(i, 'quantity', $any($event.target).value)" placeholder="Adet" />
                  <input type="number" min="0" step="0.01" class="input w-28" [value]="l.unitPrice"
                    (input)="setLine(i, 'unitPrice', $any($event.target).value)" placeholder="Alış fiyatı" />
                  <input type="number" min="0" step="1" class="input w-20" [value]="l.vatRate"
                    (input)="setLine(i, 'vatRate', $any($event.target).value)" placeholder="KDV" />
                  <span class="w-24 text-right text-sm font-semibold text-slate-700">{{ money(lineTotal(l)) }}</span>
                  <button type="button" class="text-rose-500 hover:text-rose-700" (click)="removeLine(i)" title="Kaldır">×</button>
                </div>
              }
            </div>
            <button type="button" class="btn-outline btn-sm mt-2" (click)="addLine()">
              <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Kalem Ekle
            </button>
          </div>

          <div>
            <label class="label">Not <span class="text-xs font-normal text-slate-400">(opsiyonel)</span></label>
            <input class="input" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Sipariş notu" />
          </div>

          <div class="rounded-xl bg-slate-50 px-4 py-3">
            <dl class="space-y-1 text-sm">
              <div class="flex justify-between"><dt class="text-slate-500">Ara Toplam</dt><dd class="font-medium">{{ money(totals().subtotal) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">KDV</dt><dd class="font-medium">{{ money(totals().vat) }}</dd></div>
              <div class="flex justify-between border-t border-slate-200 pt-1.5"><dt class="font-bold text-slate-800">Toplam</dt><dd class="text-lg font-bold text-brand-600">{{ money(totals().grand) }}</dd></div>
            </dl>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="formOpen.set(false)">İptal</button>
            <button type="button" class="btn-primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </div>
      </app-modal>
    }

    <!-- Detay -->
    @if (detail(); as o) {
      <app-modal [title]="o.number" maxWidth="46rem" (dismiss)="detail.set(null)">
        <div class="space-y-4">
          <div class="flex flex-wrap gap-4 text-sm">
            <div><span class="text-slate-400">Tedarikçi:</span> <b>{{ o.contactName }}</b></div>
            <div><span class="text-slate-400">Durum:</span> <span class="rounded-lg px-2 py-0.5 text-xs font-medium" [class]="statusClass(o.status)">{{ statusLabel(o.status) }}</span></div>
            @if (o.expectedDate) { <div><span class="text-slate-400">Beklenen:</span> <b>{{ fmtDate(o.expectedDate) }}</b></div> }
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-100">
            <table class="w-full text-sm">
              <thead><tr class="text-xs text-slate-400">
                <th class="px-3 py-2 text-left font-medium">ÜRÜN</th>
                <th class="px-2 py-2 text-right font-medium">SİPARİŞ</th>
                <th class="px-2 py-2 text-right font-medium">GELEN</th>
                <th class="px-2 py-2 text-right font-medium">KALAN</th>
                <th class="px-3 py-2 text-right font-medium">TUTAR</th>
              </tr></thead>
              <tbody class="divide-y divide-slate-50">
                @for (l of o.lines; track l.id) {
                  <tr>
                    <td class="px-3 py-2 text-slate-700">{{ l.productName }}</td>
                    <td class="px-2 py-2 text-right">{{ l.orderedQuantity }}</td>
                    <td class="px-2 py-2 text-right text-emerald-600">{{ l.receivedQuantity }}</td>
                    <td class="px-2 py-2 text-right" [class.text-amber-600]="l.remainingQuantity > 0">{{ l.remainingQuantity }}</td>
                    <td class="px-3 py-2 text-right font-medium">{{ money(l.lineTotal) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (o.receipts.length) {
            <div>
              <p class="mb-2 text-xs font-bold uppercase text-slate-500">Mal kabul geçmişi</p>
              <div class="space-y-1">
                @for (r of o.receipts; track r.invoiceId) {
                  <div class="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span [class.line-through]="r.isCancelled" [class.text-slate-400]="r.isCancelled">{{ r.invoiceNumber }} · {{ fmtDate(r.date) }}</span>
                    <span class="font-semibold">{{ money(r.grandTotal) }}@if (r.isCancelled) { <span class="ml-1 text-xs text-rose-500">iptal</span> }</span>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Tedarikçiye gerçek gönderim: belge (yazdır/PDF) + WhatsApp -->
          <div class="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <span class="mr-1 text-xs font-medium text-slate-500">Tedarikçiye gönder:</span>
            <button type="button" class="btn-outline btn-sm" (click)="printOrder(o)">
              <lucide-icon name="printer" class="h-4 w-4"></lucide-icon> Belge / PDF
            </button>
            @if (supplierPhone(o)) {
              <button type="button" class="btn-sm inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 font-medium text-white hover:bg-emerald-600" (click)="whatsappOrder(o)">
                <lucide-icon name="message-circle" class="h-4 w-4"></lucide-icon> WhatsApp
              </button>
            } @else {
              <span class="text-xs text-slate-400">(WhatsApp için tedarikçinin telefonunu carisine ekleyin)</span>
            }
          </div>

          <div class="flex flex-wrap justify-end gap-2">
            @if (o.status === 'Draft') {
              <button type="button" class="btn-outline" (click)="editFromDetail(o)">Düzenle</button>
              <button type="button" class="btn-primary" (click)="send2(o)">Gönderildi İşaretle</button>
            }
            @if (o.status === 'Sent' || o.status === 'PartiallyReceived') {
              <button type="button" class="btn-outline text-rose-600" (click)="cancel(o)">Siparişi İptal</button>
              <button type="button" class="btn-primary" (click)="openReceive2(o)">Mal Kabul</button>
            }
          </div>
        </div>
      </app-modal>
    }

    <!-- Mal kabul -->
    @if (receiving(); as o) {
      <app-modal [title]="o.number + ' · Mal Kabul'" maxWidth="42rem" (dismiss)="receiving.set(null)">
        <div class="space-y-4">
          <p class="text-sm text-slate-500">Gelen miktarları girin. Fatura farklı fiyatla geldiyse birim fiyatı güncelleyin.</p>

          <div class="space-y-2">
            @for (r of receiveRows(); track r.lineId; let i = $index) {
              <div class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 p-2">
                <span class="min-w-32 flex-1 text-sm font-medium text-slate-700">{{ r.productName }}</span>
                <span class="text-xs text-slate-400">kalan {{ r.remaining }}</span>
                <input type="number" min="0" [max]="r.remaining" step="0.01" class="input w-24"
                  [value]="r.quantity" (input)="setReceive(i, 'quantity', $any($event.target).value)" placeholder="Gelen" />
                <input type="number" min="0" step="0.01" class="input w-28"
                  [value]="r.unitPrice" (input)="setReceive(i, 'unitPrice', $any($event.target).value)" placeholder="Fiyat" />
              </div>
            }
          </div>

          <div class="rounded-xl bg-slate-50 px-4 py-3">
            <div class="flex justify-between text-sm"><span class="text-slate-500">Bu partinin tutarı</span><b class="text-brand-600">{{ money(receiveTotal()) }}</b></div>
          </div>

          <div>
            <label class="label">Ödeme</label>
            <select class="select mb-2" [value]="payMode()" (change)="payMode.set($any($event.target).value)">
              <option value="credit">Veresiye (tedarikçiye borç)</option>
              <option value="cash">Şimdi öde</option>
            </select>
            @if (payMode() === 'cash') {
              <select class="select" [value]="cashAccountId()" (change)="cashAccountId.set($any($event.target).value)">
                @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
              </select>
            }
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-outline" (click)="receiving.set(null)">Vazgeç</button>
            <button type="button" class="btn-primary" [disabled]="busy() || receiveTotal() <= 0" (click)="doReceive()">Mal Kabul Et</button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class PurchaseOrdersComponent implements OnInit {
  private api = inject(PurchasingApi);
  private stockApi = inject(StockApi);
  private contactsApi = inject(ContactsApi);
  private financeApi = inject(FinanceApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  protected money = money;

  protected loading = signal(true);
  protected busy = signal(false);
  protected items = signal<PurchaseOrderListItemDto[]>([]);
  protected products = signal<ProductDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected accounts = signal<CashAccountDto[]>([]);

  protected search = signal('');
  protected status = signal<PurchaseOrderStatus | ''>('');

  protected readonly statuses: { value: PurchaseOrderStatus; label: string }[] = [
    { value: 'Draft', label: 'Taslak' },
    { value: 'Sent', label: 'Gönderildi' },
    { value: 'PartiallyReceived', label: 'Kısmen geldi' },
    { value: 'Received', label: 'Tamamlandı' },
    { value: 'Cancelled', label: 'İptal' },
  ];

  /** Tedarikçi + tedarikçi-müşteri carileri; alım siparişi tedarikçiye verilir. */
  protected suppliers = computed(() => this.contacts().filter((c) => c.type === 'Supplier' || c.type === 'Both'));

  // Form
  protected formOpen = signal(false);
  protected editing = signal<PurchaseOrderDto | null>(null);
  protected contactId = signal('');
  protected orderDate = signal('');
  protected expectedDate = signal('');
  protected note = signal('');
  protected lines = signal<DraftLine[]>([]);

  // Detay + mal kabul
  protected detail = signal<PurchaseOrderDto | null>(null);
  protected receiving = signal<PurchaseOrderDto | null>(null);
  protected receiveRows = signal<ReceiveRow[]>([]);
  protected payMode = signal<'credit' | 'cash'>('credit');
  protected cashAccountId = signal('');

  protected totals = computed(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let subtotal = 0;
    let vat = 0;
    for (const l of this.lines()) {
      const lt = r2(l.quantity * l.unitPrice);
      subtotal += lt;
      vat += r2((lt * l.vatRate) / 100);
    }
    subtotal = r2(subtotal);
    vat = r2(vat);
    return { subtotal, vat, grand: r2(subtotal + vat) };
  });

  /** Bu partinin net+KDV toplamı — sunucudaki fatura tutarıyla birebir aynı hesaplanır. */
  protected receiveTotal = computed(() => {
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let total = 0;
    for (const r of this.receiveRows()) {
      if (r.quantity <= 0) continue;
      const lt = r2(r.quantity * r.unitPrice);
      total += lt + r2((lt * r.vatRate) / 100);
    }
    return r2(total);
  });

  ngOnInit(): void {
    forkJoin({
      products: this.stockApi.getProducts({ pageSize: 200 }),
      contacts: this.contactsApi.getContacts({ pageSize: 500 }),
      accounts: this.financeApi.getCashAccounts(),
    }).subscribe({
      next: (r) => {
        this.products.set(r.products.items.filter((p) => !p.isVariantParent && !p.isService));
        this.contacts.set(r.contacts.items);
        this.accounts.set(r.accounts);
        if (r.accounts.length) this.cashAccountId.set(r.accounts[0].id);
      },
      error: () => {},
    });
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.api.list({ pageSize: 100, search: this.search(), status: this.status() }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('tr-TR');
  }
  protected statusLabel(s: PurchaseOrderStatus): string {
    return this.statuses.find((x) => x.value === s)?.label ?? s;
  }
  protected statusClass(s: PurchaseOrderStatus): string {
    return s === 'Received'
      ? 'bg-emerald-100 text-emerald-700'
      : s === 'PartiallyReceived'
        ? 'bg-brand-100 text-brand-700'
        : s === 'Cancelled'
          ? 'bg-rose-100 text-rose-700'
          : s === 'Sent'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600';
  }
  protected pct(ratio: number): number {
    return Math.round(ratio * 100);
  }
  protected lineTotal(l: DraftLine): number {
    const lt = Math.round(l.quantity * l.unitPrice * 100) / 100;
    return Math.round((lt + (lt * l.vatRate) / 100) * 100) / 100;
  }

  // ---- Form ----
  protected openNew(): void {
    this.editing.set(null);
    this.contactId.set('');
    this.orderDate.set(this.ymd(new Date()));
    this.expectedDate.set('');
    this.note.set('');
    this.lines.set([{ productId: '', quantity: 1, unitPrice: 0, vatRate: 20 }]);
    this.formOpen.set(true);
  }

  protected editFromDetail(o: PurchaseOrderDto): void {
    this.detail.set(null);
    this.openEdit(o);
  }

  private openEdit(o: PurchaseOrderDto): void {
    this.editing.set(o);
    this.contactId.set(o.contactId);
    this.orderDate.set(o.orderDate.slice(0, 10));
    this.expectedDate.set(o.expectedDate ? o.expectedDate.slice(0, 10) : '');
    this.note.set(o.note ?? '');
    this.lines.set(o.lines.map((l) => ({ productId: l.productId, quantity: l.orderedQuantity, unitPrice: l.unitPrice, vatRate: l.vatRate })));
    this.formOpen.set(true);
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  protected addLine(): void {
    this.lines.update((l) => [...l, { productId: '', quantity: 1, unitPrice: 0, vatRate: 20 }]);
  }
  protected removeLine(i: number): void {
    this.lines.update((l) => l.filter((_, ix) => ix !== i));
  }
  /** Ürün seçilince alış fiyatı + KDV karttan gelir. */
  protected setProduct(i: number, productId: string): void {
    const p = this.products().find((x) => x.id === productId);
    this.lines.update((ls) =>
      ls.map((l, ix) => (ix === i ? { ...l, productId, unitPrice: p?.purchasePrice ?? l.unitPrice, vatRate: p?.vatRate ?? l.vatRate } : l))
    );
  }
  protected setLine(i: number, field: 'quantity' | 'unitPrice' | 'vatRate', val: string): void {
    const n = +val || 0;
    this.lines.update((ls) => ls.map((l, ix) => (ix === i ? { ...l, [field]: n } : l)));
  }

  protected save(): void {
    if (!this.contactId()) {
      this.toast.error('Tedarikçi seçin.');
      return;
    }
    const lines = this.lines().filter((l) => l.productId && l.quantity > 0);
    if (!lines.length) {
      this.toast.error('En az bir kalem ekleyin.');
      return;
    }
    const body = {
      contactId: this.contactId(),
      orderDate: this.orderDate() || null,
      expectedDate: this.expectedDate() || null,
      note: this.note().trim() || null,
      lines,
    };
    this.busy.set(true);
    const req = this.editing() ? this.api.update(this.editing()!.id, body) : this.api.create(body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.toast.success(this.editing() ? 'Sipariş güncellendi.' : 'Sipariş oluşturuldu.');
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openDetail(o: PurchaseOrderListItemDto): void {
    this.api.getById(o.id).subscribe({ next: (full) => this.detail.set(full), error: (e) => this.toast.error(apiError(e)) });
  }

  protected send(o: { id: string }): void {
    this.busy.set(true);
    this.api.send(o.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success('Sipariş tedarikçiye gönderildi.');
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
  protected send2(o: PurchaseOrderDto): void {
    this.detail.set(null);
    this.send(o);
  }

  protected async cancel(o: PurchaseOrderDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `${o.number} iptal edilsin mi? Gelen mallar kayıtlı kalır, kalan iptal olur.`, danger: true, confirmText: 'Siparişi İptal' }))) return;
    this.api.cancel(o.id).subscribe({
      next: () => {
        this.detail.set(null);
        this.toast.success('Sipariş iptal edildi.');
        this.reload();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  // ---- Tedarikçiye gönderim (belge / WhatsApp) ----

  /** Tedarikçinin telefonu — siparişin kendi DTO'sundan gelir (contacts() listesine bağlı değil, hep güncel). */
  protected supplierPhone(o: PurchaseOrderDto): string {
    return o.contactPhone?.trim() ?? '';
  }

  /** Siparişin düz-metin özeti (WhatsApp mesajı). */
  private orderText(o: PurchaseOrderDto): string {
    const firma = this.auth.user()?.tenantName ?? 'İşletme';
    const satirlar = o.lines
      .map((l) => `• ${l.productName} — ${l.orderedQuantity} adet × ${money(l.unitPrice)}`)
      .join('\n');
    const beklenen = o.expectedDate ? `\nBeklenen teslim: ${this.fmtDate(o.expectedDate)}` : '';
    const not = o.note ? `\nNot: ${o.note}` : '';
    return (
      `*${firma}* — Sipariş Formu\n` +
      `Sipariş No: ${o.number}\n` +
      `Tarih: ${this.fmtDate(o.orderDate)}${beklenen}\n\n` +
      `Sipariş edilen ürünler:\n${satirlar}\n\n` +
      `*Toplam: ${money(o.grandTotal)}* (KDV dahil)${not}`
    );
  }

  /** Paylaşımdan sonra: sipariş taslaksa "Gönderildi" durumuna geçir (gerçekten iletildi). */
  private markSentIfDraft(o: PurchaseOrderDto): void {
    if (o.status !== 'Draft') return;
    this.api.send(o.id).subscribe({
      next: () => this.reload(),
      error: () => {}, // paylaşım yine de yapıldı; durum sonra elle işaretlenebilir
    });
  }

  /** WhatsApp'tan sipariş özetini tedarikçiye gönder (telefon uluslararası formata çevrilir). */
  protected whatsappOrder(o: PurchaseOrderDto): void {
    const raw = this.supplierPhone(o).replace(/[^0-9]/g, '');
    if (!raw) {
      this.toast.error('Tedarikçinin telefonu yok. Cari kartına ekleyin.');
      return;
    }
    // 0'la başlıyorsa Türkiye (90) öneki: 05xx… → 905xx…; zaten 90'lıysa dokunma.
    const phone = raw.startsWith('90') ? raw : raw.startsWith('0') ? '90' + raw.slice(1) : '90' + raw;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(this.orderText(o))}`, '_blank');
    this.markSentIfDraft(o);
  }

  /** Yazdırılabilir sipariş belgesi (tedarikçiye verilir / PDF olarak kaydedilir). */
  protected printOrder(o: PurchaseOrderDto): void {
    const firma = this.auth.user()?.tenantName ?? 'İşletme';
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = o.lines
      .map(
        (l) => `<tr>
          <td>${esc(l.productName)}</td>
          <td class="r">${l.orderedQuantity}</td>
          <td class="r">${money(l.unitPrice)}</td>
          <td class="r">%${l.vatRate}</td>
          <td class="r">${money(l.lineTotal)}</td>
        </tr>`
      )
      .join('');
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) {
      this.toast.error('Yazdırma penceresi açılamadı (açılır pencere engellenmiş olabilir).');
      return;
    }
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(o.number)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1e293b; margin: 32px; }
        .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
        .firma { font-size: 22px; font-weight: 800; }
        .baslik { font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
        .no { font-size: 18px; font-weight: 700; text-align: right; }
        .meta { display: flex; gap: 32px; font-size: 14px; margin-bottom: 20px; }
        .meta b { display: block; color: #64748b; font-weight: 500; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { text-align: left; background: #f1f5f9; padding: 9px 10px; font-size: 12px; text-transform: uppercase; color: #475569; }
        td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; }
        .r { text-align: right; }
        tfoot td { border: 0; font-weight: 700; padding-top: 14px; }
        .toplam { font-size: 18px; color: #2563eb; }
        .not { margin-top: 20px; font-size: 13px; color: #475569; background: #f8fafc; padding: 12px; border-radius: 8px; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <div class="head">
        <div><div class="baslik">Satın Alma Siparişi</div><div class="firma">${esc(firma)}</div></div>
        <div class="no">${esc(o.number)}</div>
      </div>
      <div class="meta">
        <div><b>Tedarikçi</b>${esc(o.contactName)}</div>
        <div><b>Sipariş Tarihi</b>${this.fmtDate(o.orderDate)}</div>
        ${o.expectedDate ? `<div><b>Beklenen Teslim</b>${this.fmtDate(o.expectedDate)}</div>` : ''}
      </div>
      <table>
        <thead><tr><th>Ürün</th><th class="r">Miktar</th><th class="r">Birim Fiyat</th><th class="r">KDV</th><th class="r">Tutar</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><td colspan="4" class="r">Ara Toplam</td><td class="r">${money(o.subtotal)}</td></tr>
          <tr><td colspan="4" class="r">KDV</td><td class="r">${money(o.vatTotal)}</td></tr>
          <tr><td colspan="4" class="r toplam">Genel Toplam</td><td class="r toplam">${money(o.grandTotal)}</td></tr>
        </tfoot>
      </table>
      ${o.note ? `<div class="not"><b>Not:</b> ${esc(o.note)}</div>` : ''}
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 350);
    this.markSentIfDraft(o);
  }

  // ---- Mal kabul ----
  protected openReceive(o: PurchaseOrderListItemDto): void {
    this.api.getById(o.id).subscribe({ next: (full) => this.startReceive(full), error: (e) => this.toast.error(apiError(e)) });
  }
  protected openReceive2(o: PurchaseOrderDto): void {
    this.detail.set(null);
    this.startReceive(o);
  }
  private startReceive(o: PurchaseOrderDto): void {
    this.receiveRows.set(
      o.lines
        .filter((l) => l.remainingQuantity > 0)
        .map((l) => ({ lineId: l.id, productName: l.productName, remaining: l.remainingQuantity, quantity: l.remainingQuantity, unitPrice: l.unitPrice, vatRate: l.vatRate }))
    );
    this.payMode.set('credit');
    this.receiving.set(o);
  }
  protected setReceive(i: number, field: 'quantity' | 'unitPrice', val: string): void {
    const n = +val || 0;
    this.receiveRows.update((rows) => rows.map((r, ix) => (ix === i ? { ...r, [field]: n } : r)));
  }

  protected doReceive(): void {
    const o = this.receiving();
    if (!o) return;
    const lines = this.receiveRows()
      .filter((r) => r.quantity > 0)
      .map((r) => ({ purchaseOrderLineId: r.lineId, quantity: r.quantity, unitPrice: r.unitPrice }));
    if (!lines.length) {
      this.toast.error('Gelen miktar girin.');
      return;
    }
    if (this.payMode() === 'cash' && !this.cashAccountId()) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    const body = {
      lines,
      date: null,
      note: null,
      // Ödeme tutarı sunucudaki kesin fatura tutarıyla birebir (net+KDV) → "aşamaz" hatası olmaz.
      payment: this.payMode() === 'cash' ? { cashAccountId: this.cashAccountId(), amount: this.receiveTotal(), method: 'Cash' } : null,
    };
    this.busy.set(true);
    this.api.receive(o.id, body).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.receiving.set(null);
        this.toast.success(`Mal kabul edildi. Fatura: ${res.invoiceNumber}`);
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
