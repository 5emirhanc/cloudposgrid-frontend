import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { ContactsApi } from '../../core/api/contacts.api';
import { FinanceApi } from '../../core/api/finance.api';
import { OrdersApi } from '../../core/api/orders.api';
import { SettingsApi } from '../../core/api/settings.api';
import { StockApi } from '../../core/api/stock.api';
import { CashAccountDto, CategoryDto, ContactDto, DiningTableDto, DiscountReason, OrderDto, OrderLineDto, ProductDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AuthService } from '../../core/auth.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError, money } from '../../core/utils';

@Component({
  selector: 'app-order-detail',
  imports: [LucideAngularModule, ModalComponent],
  template: `
    <div class="mb-6 flex items-center gap-3">
      <button class="rounded-lg p-2 text-slate-600 hover:bg-slate-100" (click)="back()">
        <lucide-icon name="chevron-right" class="h-5 w-5 rotate-180"></lucide-icon>
      </button>
      <div class="flex-1">
        <h1 class="text-2xl font-black tracking-tight text-slate-900">
          {{ order()?.tableName || order()?.label || term().sale }}
        </h1>
        <p class="text-sm text-slate-500">{{ typeLabel() }} · Açık {{ term().sale }}</p>
      </div>
      @if (order(); as o) {
        <button class="btn-outline text-rose-600" [disabled]="busy()" (click)="cancel()">
          <lucide-icon name="x" class="h-4 w-4"></lucide-icon> İptal
        </button>
      }
    </div>

    @if (loading()) {
      <div class="card p-10 text-center text-sm text-slate-400">Yükleniyor...</div>
    } @else if (order(); as o) {
      @if (o.type === 'Service') {
        <div class="card mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
          <div class="text-sm">
            <span class="font-semibold text-slate-700">{{ o.label || 'Müşteri' }}</span>
            @if (o.assetInfo) { <span class="text-slate-400"> · {{ o.assetInfo }}</span> }
          </div>
          <div class="flex gap-1">
            @for (s of workStatuses; track s.value) {
              <button class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                [class]="o.workStatus === s.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
                [disabled]="busy()" (click)="setStatus(s.value)">{{ s.label }}</button>
            }
          </div>
        </div>
      }
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <!-- Ürün ızgarası -->
        <div class="lg:col-span-2">
          <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
            <div class="relative min-w-[180px] flex-1">
              <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
              <input class="input pl-10" [placeholder]="term().productSingular + ' ara...'" [value]="search()" (input)="search.set($any($event.target).value)" />
            </div>
          </div>

          <div class="mb-4 flex flex-wrap gap-2">
            <button class="btn-sm rounded-lg px-3 py-1.5 font-medium transition"
              [class]="activeCat() === '' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'"
              (click)="activeCat.set('')">Tümü</button>
            @for (c of categories(); track c.id) {
              <button class="btn-sm rounded-lg px-3 py-1.5 font-medium transition"
                [class]="activeCat() === c.id ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'"
                (click)="activeCat.set(c.id)">{{ c.name }}</button>
            }
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            @for (p of filtered(); track p.id) {
              <button
                class="card group flex flex-col items-start p-4 text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover"
                [disabled]="busy()"
                (click)="add(p)"
              >
                @if (p.imageUrl) {
                  <img [src]="p.imageUrl" class="mb-2 h-9 w-9 rounded-lg object-cover" alt="" />
                }
                <p class="line-clamp-2 text-sm font-semibold text-slate-800">{{ p.name }}</p>
                @if (!p.isService) {
                  <p class="mt-1 text-xs text-slate-400">Stok: {{ p.currentStock }} {{ p.unit }}</p>
                }
                <p class="mt-1 font-bold text-brand-600">{{ money(p.salePrice) }}</p>
              </button>
            } @empty {
              <p class="col-span-full p-8 text-center text-sm text-slate-400">{{ term().productSingular }} bulunamadı.</p>
            }
          </div>
        </div>

        <!-- Adisyon -->
        <div class="lg:sticky lg:top-20 lg:h-fit">
          <div class="card flex flex-col">
            <div class="border-b border-slate-100 p-4">
              <h3 class="flex items-center gap-2 font-bold text-slate-800">
                <lucide-icon name="receipt-text" class="h-5 w-5 text-brand-600"></lucide-icon> {{ term().sale }}
              </h3>
            </div>

            <div class="max-h-[45vh] flex-1 overflow-y-auto">
              @if (!o.lines.length) {
                <p class="p-8 text-center text-sm text-slate-400">{{ term().sale }} boş. Soldan {{ term().productSingular.toLocaleLowerCase('tr') }} ekleyin.</p>
              } @else {
                <ul class="divide-y divide-slate-50">
                  @for (l of o.lines; track l.id) {
                    <li class="flex items-center gap-2 p-3">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-slate-800">{{ l.productName }}</p>
                        <p class="text-xs text-slate-400">{{ money(l.unitPrice) }} × {{ l.quantity }}</p>
                      </div>
                      <div class="flex items-center gap-1">
                        <button class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" [disabled]="busy()" (click)="setQty(l.id, l.quantity - 1)">−</button>
                        <span class="w-7 text-center text-sm font-semibold">{{ l.quantity }}</span>
                        <button class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200" [disabled]="busy()" (click)="setQty(l.id, l.quantity + 1)">+</button>
                      </div>
                      <span class="w-20 text-right text-sm font-semibold text-slate-800">{{ money(l.lineTotal) }}</span>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="border-t border-slate-100 p-4">
              <dl class="space-y-1.5 text-sm">
                <div class="flex justify-between"><dt class="text-slate-500">Ara Toplam</dt><dd class="font-medium">{{ money(o.subtotal) }}</dd></div>
                <div class="flex justify-between"><dt class="text-slate-500">KDV</dt><dd class="font-medium">{{ money(o.vatTotal) }}</dd></div>
                <div class="flex justify-between border-t border-slate-100 pt-2"><dt class="font-bold text-slate-800">Toplam</dt><dd class="text-lg font-bold text-brand-600">{{ money(o.grandTotal) }}</dd></div>
              </dl>
              <button class="btn-primary mt-4 w-full" [disabled]="!o.lines.length || busy()" (click)="openCheckout()">
                <lucide-icon name="credit-card" class="h-4 w-4"></lucide-icon> Tahsil Et & Kapat
              </button>
              <button class="btn-outline mt-2 w-full" [disabled]="!o.lines.length || busy()" (click)="openSplit()">
                <lucide-icon name="layout-grid" class="h-4 w-4"></lucide-icon> Hesabı Böl / Kısmi Tahsil
              </button>
              @if (o.tableId) {
                <button class="btn-outline mt-2 w-full" [disabled]="busy()" (click)="openMove()">
                  <lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon> Masa Taşı / Birleştir
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Tahsilat modal -->
    @if (checkoutOpen() && order(); as o) {
      <app-modal title="Tahsilat" (dismiss)="checkoutOpen.set(false)">
        <div class="mb-5 rounded-xl bg-brand-50 px-4 py-4 text-center">
          <p class="text-sm text-brand-700">Tahsil edilecek</p>
          <p class="text-3xl font-black text-brand-700">{{ money(payableTotal()) }}</p>
          @if (appliedDiscount() > 0) {
            <p class="mt-0.5 text-xs text-brand-600"><s>{{ money(o.grandTotal) }}</s> · −{{ money(appliedDiscount()) }} indirim</p>
          }
        </div>

        @if (manualAllowed()) {
          <div class="mb-4 rounded-xl border border-slate-200 p-3">
            <div class="mb-2 flex items-center gap-2">
              <label class="label mb-0 flex-1">İndirim</label>
              <button type="button" class="rounded-lg px-2 py-0.5 text-xs font-medium transition"
                [class]="discountMode() === 'percent' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'"
                (click)="setDiscountMode('percent')">%</button>
              <button type="button" class="rounded-lg px-2 py-0.5 text-xs font-medium transition"
                [class]="discountMode() === 'amount' ? 'bg-brand-50 text-brand-700' : 'text-slate-500'"
                (click)="setDiscountMode('amount')">₺</button>
            </div>
            <div class="flex gap-2">
              <input type="number" min="0" step="0.01" class="input flex-1" placeholder="0"
                [value]="discountInput()" (input)="setDiscount(+$any($event.target).value)" />
              <select class="select flex-1" [value]="discountReason()" (change)="discountReason.set($any($event.target).value)">
                @for (r of discountReasons; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
              </select>
            </div>
            @if (discountOverLimit()) {
              <p class="mt-1.5 text-xs font-medium text-rose-600">En fazla %{{ maxManualPercent() }} indirim yetkiniz var.</p>
            }
          </div>
        }

        <label class="label">Ödeme Yöntemi</label>
        <div class="mb-4 grid grid-cols-2 gap-2">
          @for (m of methods; track m.value) {
            <button type="button" class="rounded-xl border px-3 py-2.5 text-sm font-medium transition"
              [class]="method() === m.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
              (click)="method.set(m.value)">
              <lucide-icon [name]="m.icon" class="mx-auto mb-1 h-4 w-4"></lucide-icon>{{ m.label }}
            </button>
          }
        </div>

        @if (method() === 'Credit') {
          <label class="label">Cari (borç bu hesaba yazılır) *</label>
          <select class="select mb-4" [value]="contactId()" (change)="contactId.set($any($event.target).value)">
            <option value="">Cari seçin...</option>
            @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        } @else {
          <label class="label">Kasa</label>
          <select class="select mb-4" [value]="cashAccountId()" (change)="cashAccountId.set($any($event.target).value)">
            @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
          <div class="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label class="label">Alınan Tutar</label>
              <input type="number" step="0.01" class="input" [value]="amount()" (input)="amount.set(+$any($event.target).value)" />
            </div>
            <div>
              <label class="label">Bahşiş</label>
              <input type="number" step="0.01" class="input" [value]="tip()" (input)="tip.set(+$any($event.target).value)" />
            </div>
          </div>
          @if (amount() < payableTotal()) {
            <p class="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Kısmi ödeme — kalan {{ money(payableTotal() - amount()) }}{{ contactId() ? ' cariye borç yazılacak.' : ' için aşağıdan cari seçebilirsiniz.' }}
            </p>
            <label class="label">Cari (kalan borç için, opsiyonel)</label>
            <select class="select mb-4" [value]="contactId()" (change)="contactId.set($any($event.target).value)">
              <option value="">Seçilmedi</option>
              @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
          }
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="checkoutOpen.set(false)">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="complete()">
            {{ busy() ? 'İşleniyor...' : 'Kapat' }}
          </button>
        </div>
      </app-modal>
    }

    <!-- Hesabı böl modal -->
    @if (splitOpen() && order(); as o) {
      <app-modal title="Hesabı Böl / Kısmi Tahsil" maxWidth="32rem" (dismiss)="splitOpen.set(false)">
        <p class="mb-3 text-sm text-slate-500">Şimdi tahsil edilecek {{ term().productSingular.toLocaleLowerCase('tr') }} ve miktarları seçin. Kalanlar açık kalır.</p>
        <div class="mb-4 max-h-60 space-y-2 overflow-y-auto">
          @for (l of o.lines; track l.id) {
            <div class="flex items-center gap-2 rounded-xl border border-slate-100 p-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-800">{{ l.productName }}</p>
                <p class="text-xs text-slate-400">{{ l.quantity }} adet · {{ money(l.unitPrice) }}</p>
              </div>
              <div class="flex items-center gap-1">
                <button class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600" (click)="splitDec(l)">−</button>
                <span class="w-7 text-center text-sm font-semibold">{{ splitQty(l.id) }}</span>
                <button class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600" (click)="splitInc(l)">+</button>
              </div>
            </div>
          }
        </div>

        <div class="mb-4 flex justify-between rounded-xl bg-brand-50 px-4 py-3">
          <span class="font-semibold text-brand-700">Seçilen Toplam</span>
          <span class="text-lg font-bold text-brand-700">{{ money(splitTotal()) }}</span>
        </div>

        <label class="label">Ödeme Yöntemi</label>
        <div class="mb-4 grid grid-cols-2 gap-2">
          @for (m of methods; track m.value) {
            <button type="button" class="rounded-xl border px-3 py-2.5 text-sm font-medium transition"
              [class]="method() === m.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
              (click)="method.set(m.value)">
              <lucide-icon [name]="m.icon" class="mx-auto mb-1 h-4 w-4"></lucide-icon>{{ m.label }}
            </button>
          }
        </div>
        @if (method() === 'Credit') {
          <label class="label">Cari *</label>
          <select class="select mb-4" [value]="contactId()" (change)="contactId.set($any($event.target).value)">
            <option value="">Cari seçin...</option>
            @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        } @else {
          <label class="label">Kasa</label>
          <select class="select mb-4" [value]="cashAccountId()" (change)="cashAccountId.set($any($event.target).value)">
            @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="splitOpen.set(false)">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="busy() || splitTotal() <= 0" (click)="doSplit()">Seçileni Tahsil Et</button>
        </div>
      </app-modal>
    }

    <!-- Masa taşı / birleştir modal -->
    @if (moveOpen()) {
      <app-modal title="Masa Taşı / Birleştir" maxWidth="26rem" (dismiss)="moveOpen.set(false)">
        <p class="mb-4 text-sm text-slate-500">Adisyonu hangi masaya taşımak istiyorsunuz?</p>

        @if (moveTargets().length === 0) {
          <p class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Taşınabilecek başka masa yok.</p>
        } @else {
          <div class="mb-4 max-h-72 space-y-1.5 overflow-y-auto">
            @for (t of moveTargets(); track t.id) {
              <button type="button" class="flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition"
                [class]="moveTargetId() === t.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50'"
                (click)="moveTargetId.set(t.id)">
                <span class="text-sm font-semibold text-slate-800">{{ t.name }}</span>
                @if (t.openOrderId) {
                  <span class="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Dolu · {{ money(t.openTotal) }}</span>
                } @else {
                  <span class="text-xs text-slate-400">Boş</span>
                }
              </button>
            }
          </div>

          @if (moveTargetOccupied()) {
            <p class="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              Bu masada açık adisyon var. Devam ederseniz iki adisyon <strong>birleştirilir</strong> — tüm ürünler tek hesapta toplanır.
            </p>
          }
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="moveOpen.set(false)">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="busy() || !moveTargetId()" (click)="doMove()">
            {{ moveTargetOccupied() ? 'Birleştir' : 'Taşı' }}
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class OrderDetailComponent implements OnInit {
  private api = inject(OrdersApi);
  private stockApi = inject(StockApi);
  private financeApi = inject(FinanceApi);
  private contactsApi = inject(ContactsApi);
  private settingsApi = inject(SettingsApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  /** Sektöre göre terminoloji: kafe "Adisyon/Ürün", tamirci "İş Emri/Parça". */
  protected term = computed(() => this.auth.profile().terminology);

  protected money = money;
  private orderId = '';

  protected loading = signal(true);
  protected busy = signal(false);
  protected order = signal<OrderDto | null>(null);
  protected products = signal<ProductDto[]>([]);
  protected categories = signal<CategoryDto[]>([]);
  protected accounts = signal<CashAccountDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);

  protected search = signal('');
  protected activeCat = signal('');

  protected checkoutOpen = signal(false);
  protected cashAccountId = signal('');
  protected method = signal<'Cash' | 'Card' | 'Transfer' | 'Credit'>('Cash');
  protected amount = signal(0);
  protected tip = signal(0);
  protected contactId = signal('');

  protected splitOpen = signal(false);
  protected splitSel = signal<Record<string, number>>({});
  protected splitTotal = computed(() => {
    const o = this.order();
    if (!o) return 0;
    const sel = this.splitSel();
    return o.lines.reduce((sum, l) => sum + (sel[l.id] ?? 0) * l.unitPrice * (1 + l.vatRate / 100), 0);
  });

  // Elle indirim (adisyon kapatırken). Sunucu yetki sınırını yeniden doğrular.
  protected manualDiscountEnabled = signal(false);
  private maxManualSetting = signal(0);
  protected discountMode = signal<'percent' | 'amount'>('percent');
  protected discountInput = signal(0);
  protected discountReason = signal<DiscountReason>('Rounding');
  protected discountReasons: { value: DiscountReason; label: string }[] = [
    { value: 'Rounding', label: 'Yuvarlama' },
    { value: 'Negotiation', label: 'Pazarlık' },
    { value: 'Complimentary', label: 'İkram' },
    { value: 'Damaged', label: 'Hasarlı ürün' },
    { value: 'Other', label: 'Diğer' },
  ];
  private isManager = computed(() => this.auth.role() === 'Owner' || this.auth.role() === 'Admin');
  protected maxManualPercent = computed(() => (this.isManager() ? 100 : this.maxManualSetting()));
  protected manualAllowed = computed(() => this.manualDiscountEnabled() && this.maxManualPercent() > 0);

  /** Uygulanan indirimin ₺ karşılığı (adisyon toplamı üzerinden). */
  protected appliedDiscount = computed(() => {
    const gross = this.order()?.grandTotal ?? 0;
    const v = Math.max(0, this.discountInput() || 0);
    if (!this.manualAllowed() || v <= 0 || gross <= 0) return 0;
    const raw = this.discountMode() === 'percent' ? (gross * v) / 100 : v;
    return Math.round(Math.min(raw, gross) * 100) / 100;
  });
  protected payableTotal = computed(() =>
    Math.round(((this.order()?.grandTotal ?? 0) - this.appliedDiscount()) * 100) / 100);
  protected discountOverLimit = computed(() => {
    const gross = this.order()?.grandTotal ?? 0;
    return gross > 0 && (this.appliedDiscount() / gross) * 100 > this.maxManualPercent() + 0.0001;
  });

  /** İndirim değişince tahsil edilecek tutar da takip etmeli — yoksa kasiyer eski tutarı tahsil eder. */
  protected setDiscount(v: number): void {
    this.discountInput.set(v);
    this.amount.set(this.payableTotal());
  }
  protected setDiscountMode(m: 'percent' | 'amount'): void {
    if (this.discountMode() === m) return;
    this.discountMode.set(m);
    this.setDiscount(0);
  }

  protected moveOpen = signal(false);
  protected moveTables = signal<DiningTableDto[]>([]);
  protected moveTargetId = signal('');
  /** Kendi masası hariç, aktif masalar. */
  protected moveTargets = computed(() => {
    const cur = this.order()?.tableId;
    return this.moveTables().filter((t) => t.isActive && t.id !== cur);
  });
  protected moveTargetOccupied = computed(() => {
    const id = this.moveTargetId();
    return !!this.moveTables().find((t) => t.id === id)?.openOrderId;
  });

  protected methods = [
    { value: 'Cash' as const, label: 'Nakit', icon: 'banknote' },
    { value: 'Card' as const, label: 'Kart', icon: 'credit-card' },
    { value: 'Transfer' as const, label: 'Havale', icon: 'wallet' },
    { value: 'Credit' as const, label: 'Veresiye', icon: 'book-text' },
  ];

  protected workStatuses = [
    { value: 'Received' as const, label: 'Alındı' },
    { value: 'InProgress' as const, label: 'İşlemde' },
    { value: 'Ready' as const, label: 'Hazır' },
  ];

  protected filtered = computed(() => {
    const s = this.search().trim().toLowerCase();
    const cat = this.activeCat();
    return this.products().filter(
      (p) =>
        (!cat || p.categoryId === cat) &&
        (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
    );
  });

  protected typeLabel = computed(() => {
    const t = this.order()?.type;
    return t === 'Takeaway' ? 'Paket / Gel-Al' : t === 'Delivery' ? 'Kurye' : t === 'Service' ? 'Servis / İş Emri' : 'Masa';
  });

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({
      order: this.api.getOrder(this.orderId),
      products: this.stockApi.getProducts({ pageSize: 200 }),
      categories: this.stockApi.getCategories(),
      accounts: this.financeApi.getCashAccounts(),
      contacts: this.contactsApi.getContacts({ pageSize: 500 }),
      settings: this.settingsApi.get(),
    }).subscribe({
      next: (r) => {
        this.order.set(r.order);
        this.products.set(r.products.items);
        this.categories.set(r.categories);
        this.accounts.set(r.accounts);
        this.contacts.set(r.contacts.items);
        this.manualDiscountEnabled.set(r.settings.manualDiscountEnabled ?? false);
        this.maxManualSetting.set(r.settings.maxManualDiscountPercent ?? 0);
        if (r.accounts.length) this.cashAccountId.set(r.accounts[0].id);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
        this.back();
      },
    });
  }

  protected add(p: ProductDto): void {
    this.busy.set(true);
    this.api.addLine(this.orderId, { productId: p.id, quantity: 1 }).subscribe({
      next: (o) => {
        this.order.set(o);
        this.busy.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected setQty(lineId: string, quantity: number): void {
    this.busy.set(true);
    this.api.updateLine(this.orderId, lineId, quantity).subscribe({
      next: (o) => {
        this.order.set(o);
        this.busy.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openCheckout(): void {
    const o = this.order();
    if (!o) return;
    this.method.set('Cash');
    this.discountInput.set(0); // her tahsilat kendi indirimiyle başlar (önceki denemeden taşınmasın)
    this.amount.set(o.grandTotal);
    this.tip.set(0);
    this.contactId.set('');
    this.checkoutOpen.set(true);
  }

  protected complete(): void {
    const o = this.order();
    if (!o) return;

    const credit = this.method() === 'Credit';
    if (credit && !this.contactId()) {
      this.toast.error('Veresiye için cari seçin.');
      return;
    }
    if (!credit && !this.cashAccountId()) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }

    // İndirim tutar olarak gönderilir: ekranda görülen ₺ ile kesilen fatura birebir tutsun.
    const discount = this.appliedDiscount() > 0
      ? { manualDiscountAmount: this.appliedDiscount(), manualDiscountReason: this.discountReason() }
      : {};

    const body = credit
      ? { payment: null, contactId: this.contactId(), tip: 0, ...discount }
      : {
          payment: { cashAccountId: this.cashAccountId(), amount: this.amount(), method: this.method() },
          contactId: this.contactId() || null,
          tip: this.tip(),
          ...discount,
        };

    this.busy.set(true);
    this.api.close(this.orderId, body).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.checkoutOpen.set(false);
        this.toast.success(`${this.term().sale} kapatıldı, satış tamamlandı.`);
        if (o.invoiceId) window.open(`/fis/${o.invoiceId}`, '_blank');
        this.back();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected setStatus(s: 'Received' | 'InProgress' | 'Ready'): void {
    this.busy.set(true);
    this.api.setWorkStatus(this.orderId, s).subscribe({
      next: (o) => {
        this.order.set(o);
        this.busy.set(false);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openSplit(): void {
    this.splitSel.set({});
    this.method.set('Cash');
    this.contactId.set('');
    this.splitOpen.set(true);
  }
  protected splitQty(id: string): number {
    return this.splitSel()[id] ?? 0;
  }
  protected splitInc(l: OrderLineDto): void {
    this.splitSel.update((s) => ({ ...s, [l.id]: Math.min((s[l.id] ?? 0) + 1, l.quantity) }));
  }
  protected splitDec(l: OrderLineDto): void {
    this.splitSel.update((s) => {
      const n = { ...s };
      const v = (n[l.id] ?? 0) - 1;
      if (v <= 0) delete n[l.id];
      else n[l.id] = v;
      return n;
    });
  }
  protected doSplit(): void {
    const items = Object.entries(this.splitSel())
      .filter(([, q]) => q > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    if (!items.length) {
      this.toast.error('En az bir ürün seçin.');
      return;
    }
    const credit = this.method() === 'Credit';
    if (credit && !this.contactId()) {
      this.toast.error('Veresiye için cari seçin.');
      return;
    }
    if (!credit && !this.cashAccountId()) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    const body = {
      items,
      payment: credit ? null : { cashAccountId: this.cashAccountId(), amount: this.splitTotal(), method: this.method() },
      contactId: this.contactId() || null,
    };
    this.busy.set(true);
    this.api.splitClose(this.orderId, body).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.splitOpen.set(false);
        this.order.set(o);
        this.toast.success('Kısmi tahsilat alındı.');
        if (o.status === 'Closed') {
          if (o.invoiceId) window.open(`/fis/${o.invoiceId}`, '_blank');
          this.back();
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openMove(): void {
    this.moveTargetId.set('');
    this.moveOpen.set(true);
    // Masaların güncel doluluğu (openOrderId) taşıma/birleştirme kararı için taze olmalı.
    this.api.getTables().subscribe({ next: (t) => this.moveTables.set(t) });
  }

  protected doMove(): void {
    const target = this.moveTargetId();
    if (!target) return;
    const merge = this.moveTargetOccupied();
    this.busy.set(true);
    this.api.move(this.orderId, { targetTableId: target, merge }).subscribe({
      next: (o) => {
        this.busy.set(false);
        this.moveOpen.set(false);
        this.toast.success(merge ? 'Adisyonlar birleştirildi.' : 'Adisyon taşındı.');
        // Birleştirmede kaynak adisyon kapanır → hedef adisyona geç. Aynı rotada kaldığımız için
        // bileşen yeniden kurulmaz (ngOnInit snapshot okur) — durumu yanıttan elle tazeliyoruz.
        if (o.id !== this.orderId) {
          this.orderId = o.id;
          this.router.navigate(['/adisyon', o.id], { replaceUrl: true });
        }
        this.order.set(o);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async cancel(): Promise<void> {
    if (!(await this.confirm.confirm({ message: `${this.term().sale} iptal edilsin mi? Satış/fatura oluşmaz.`, danger: true, confirmText: `${this.term().sale} İptal`, cancelText: 'Vazgeç' }))) return;
    this.busy.set(true);
    this.api.cancel(this.orderId).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(`${this.term().sale} iptal edildi.`);
        this.back();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected back(): void {
    this.router.navigate(['/masalar']);
  }
}
