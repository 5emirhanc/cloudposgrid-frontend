import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { Subscription, forkJoin } from 'rxjs';
import { ContactsApi } from '../../core/api/contacts.api';
import { FinanceApi } from '../../core/api/finance.api';
import { InvoicesApi } from '../../core/api/invoices.api';
import { OfflineSaleQueueService } from '../../core/offline/offline-sale-queue.service';
import { BranchStore } from '../../core/branch.store';
import { SettingsApi } from '../../core/api/settings.api';
import { StockApi } from '../../core/api/stock.api';
import { AuthService } from '../../core/auth.service';
import { CashAccountDto, CategoryDto, ContactDto, DiscountReason, ProductDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { BarcodeCameraComponent, barcodeCameraSupported } from '../../shared/barcode-camera.component';
import { BarcodeScannerService } from '../../core/barcode-scanner.service';
import { apiError, money, stockOf } from '../../core/utils';

interface CartItem {
  product: ProductDto;
  quantity: number;
  /** Terazi barkodunda gömülü fiyattan çözülen birim fiyat. Yoksa ürünün satış fiyatı kullanılır. */
  unitPrice?: number;
}

/** Satır birim fiyatı: terazi etiketinden gelen fiyat varsa o, yoksa ürün kartındaki satış fiyatı. */
const unitOf = (i: CartItem): number => i.unitPrice ?? i.product.salePrice;

@Component({
  selector: 'app-quick-sale',
  imports: [LucideAngularModule, ModalComponent, BarcodeCameraComponent, PageHelpComponent],
  template: `
    <app-page-help key="quick-sale" title="Ürünleri sepete ekleyip anında satışı tamamlayın">
      <li>Ürünü arayıp veya kategoriden seçip sepete ekleyin</li>
      <li>Barkodu okutun ya da elle girip Enter'a basın</li>
      <li>Sepette adet artırıp azaltın, isterseniz müşteri seçin</li>
      <li>Tahsil Et ile kasa ve ödeme yöntemini seçip bitirin</li>
    </app-page-help>

    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">{{ saleTitle() }}</h1>
        <p class="text-sm text-slate-500">{{ term().products }} seç, anında satışı tamamla</p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <!-- Ürün ızgarası -->
      <div class="lg:col-span-2">
        <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
          <div class="relative min-w-[180px] flex-1">
            <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
            <input class="input pl-10" [placeholder]="term().productSingular + ' ara...'" [value]="search()" (input)="search.set($any($event.target).value)" />
          </div>
          <div class="relative min-w-[170px]">
            <lucide-icon name="qr-code" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
            <input class="input pl-10" placeholder="Barkod okut/gir + Enter" [value]="barcode()" (input)="barcode.set($any($event.target).value)" (keyup.enter)="onBarcode()" />
          </div>
          @if (cameraSupported) {
            <button type="button" class="btn-outline shrink-0" (click)="cameraOpen.set(true)" title="Kamerayla okut">
              <lucide-icon name="camera" class="h-4 w-4"></lucide-icon>
            </button>
          }
        </div>

        <div class="mb-4 flex flex-wrap gap-2">
          <button class="chip" [class.chip-active]="activeCat() === ''" (click)="activeCat.set('')">Tümü</button>
          @for (c of categories(); track c.id) {
            <button class="chip" [class.chip-active]="activeCat() === c.id" (click)="activeCat.set(c.id)">{{ c.name }}</button>
          }
        </div>

        @if (loading()) {
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            @for (i of [1,2,3,4,5,6]; track i) { <div class="h-24 animate-pulse rounded-xl bg-slate-100"></div> }
          </div>
        } @else if (!filtered().length) {
          <div class="card p-10 text-center text-sm text-slate-400">{{ term().productSingular }} bulunamadı.</div>
        } @else {
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            @for (p of filtered(); track p.id) {
              <button
                class="group flex flex-col rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-soft disabled:opacity-50"
                [disabled]="!p.isService && stockOf(p) <= 0"
                (click)="add(p)"
              >
                @if (p.imageUrl) {
                  <img [src]="p.imageUrl" class="mb-2 h-16 w-full rounded-lg object-cover" alt="" />
                } @else {
                  <div class="mb-2 flex h-16 w-full items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-50 text-slate-300 group-hover:text-brand-500">
                    <lucide-icon [name]="p.isService ? 'sparkles' : 'package'" class="h-7 w-7"></lucide-icon>
                  </div>
                }
                <p class="line-clamp-2 text-sm font-semibold leading-tight text-slate-800">{{ p.name }}</p>
                <p class="mt-1 text-sm font-black text-brand-600">{{ money(p.salePrice) }}</p>
                @if (p.isService) {
                  <span class="mt-1 badge-blue">Hizmet</span>
                } @else if (stockOf(p) <= 0) {
                  <span class="mt-1 badge-red">Stok yok</span>
                } @else if (stockOf(p) <= p.minStock) {
                  <span class="mt-1 badge-amber">Az stok · {{ stockOf(p) }}</span>
                }
              </button>
            }
          </div>
        }
      </div>

      <!-- Sepet -->
      <div class="lg:sticky lg:top-20 lg:h-fit">
        <div class="card flex flex-col">
          <div class="flex items-center justify-between border-b border-slate-100 p-4">
            <h3 class="flex items-center gap-2 font-bold text-slate-800">
              <lucide-icon name="shopping-cart" class="h-5 w-5 text-brand-600"></lucide-icon> Sepet
            </h3>
            @if (cart().length) {
              <button class="text-xs font-medium text-rose-600 hover:underline" (click)="clear()">Temizle</button>
            }
          </div>

          <div class="max-h-[40vh] flex-1 overflow-y-auto p-3">
            @if (!cart().length) {
              <div class="flex flex-col items-center justify-center py-12 text-center">
                <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-300">
                  <lucide-icon name="shopping-cart" class="h-6 w-6"></lucide-icon>
                </div>
                <p class="text-sm text-slate-400">Sepet boş. Soldan ürün ekleyin.</p>
              </div>
            } @else {
              <div class="space-y-2">
                @for (item of cart(); track item.product.id) {
                  <div class="flex items-center gap-2.5 rounded-xl border border-slate-100 p-2.5">
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-semibold text-slate-800">{{ item.product.name }}</p>
                      <p class="text-xs text-slate-500">{{ money(unit(item)) }} / {{ item.product.unit }}</p>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button class="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" (click)="dec(item)"><lucide-icon name="minus" class="h-3.5 w-3.5"></lucide-icon></button>
                      <span class="w-6 text-center text-sm font-bold">{{ item.quantity }}</span>
                      <button class="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50" (click)="inc(item)"><lucide-icon name="plus" class="h-3.5 w-3.5"></lucide-icon></button>
                    </div>
                    <span class="w-16 text-right text-sm font-bold text-slate-900">{{ money(unit(item) * item.quantity) }}</span>
                  </div>
                }
              </div>
            }
          </div>

          <div class="border-t border-slate-100 p-4">
            <select class="select mb-3" [value]="customerId()" (change)="onCustomer($any($event.target).value)">
              <option value="">Müşteri (opsiyonel)</option>
              @for (c of contacts(); track c.id) {
                <option [value]="c.id">{{ c.name }}@if (c.discountRate > 0) { · %{{ c.discountRate }} indirim }</option>
              }
            </select>
            @if (customerId()) {
              <div class="mb-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm"
                   [class]="customerBalance() > 0 ? 'bg-rose-50 text-rose-700' : customerBalance() < 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-600'">
                <span class="font-medium">Cari bakiye</span>
                <span class="font-bold">{{ balanceLabel() }}</span>
              </div>
            }
            @if (loyaltyEnabled() && availablePoints() > 0) {
              <div class="mb-3 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2">
                <span class="flex items-center gap-1.5 text-sm font-medium text-amber-800"><lucide-icon name="sparkles" class="h-4 w-4"></lucide-icon> {{ availablePoints() }} puan</span>
                <input type="number" min="0" step="1" [max]="availablePoints()" class="input h-8 w-24 text-right text-sm" placeholder="Kullan" [value]="pointsToRedeem()" (input)="pointsToRedeem.set(+$any($event.target).value)" />
              </div>
            }
            <dl class="space-y-1.5 text-sm">
              @if (discountRate() > 0) {
                <div class="flex justify-between text-emerald-600"><dt>Müşteri indirimi</dt><dd class="font-medium">%{{ discountRate() }}</dd></div>
              }
              @if (manualAllowed()) {
                <div class="flex items-center justify-between">
                  <dt class="text-slate-500">İndirim</dt>
                  <dd>
                    <button type="button" class="flex items-center gap-1 rounded-lg px-2 py-0.5 text-sm font-semibold transition"
                      [class]="appliedManual() > 0 ? 'bg-rose-50 text-rose-600' : 'text-brand-600 hover:bg-brand-50'"
                      (click)="openDiscount()">
                      <lucide-icon name="percent" class="h-3.5 w-3.5"></lucide-icon>
                      {{ appliedManual() > 0 ? '−' + money(appliedManual()) : 'Ekle' }}
                    </button>
                  </dd>
                </div>
              }
              <div class="flex justify-between"><dt class="text-slate-500">Ara Toplam</dt><dd class="font-medium">{{ money(totals().subtotal) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">KDV</dt><dd class="font-medium">{{ money(totals().vat) }}</dd></div>
              @if (appliedRedeem() > 0) {
                <div class="flex justify-between text-amber-600"><dt>Puan indirimi</dt><dd class="font-medium">−{{ money(appliedRedeem()) }}</dd></div>
              }
              <div class="flex justify-between border-t border-slate-100 pt-2"><dt class="font-bold text-slate-800">Toplam</dt><dd class="text-lg font-bold text-brand-600">{{ money(totals().grand) }}</dd></div>
            </dl>
            @if (mustPickBranch()) {
              <p class="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">Satış için üstten bir şube seçin (çok şubede stok şubeye göre tutulur).</p>
            }
            <button class="btn-primary mt-4 w-full" [disabled]="!cart().length || mustPickBranch()" (click)="openCheckout()">
              <lucide-icon name="credit-card" class="h-4 w-4"></lucide-icon> Tahsil Et
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Elle indirim modal -->
    @if (discountOpen()) {
      <app-modal title="İndirim Uygula" maxWidth="24rem" (dismiss)="discountOpen.set(false)">
        <div class="mb-4 grid grid-cols-2 gap-2">
          <button type="button" class="rounded-xl border px-3 py-2 text-sm font-medium transition"
            [class]="discountMode() === 'percent' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
            (click)="setDiscountMode('percent')">Yüzde (%)</button>
          <button type="button" class="rounded-xl border px-3 py-2 text-sm font-medium transition"
            [class]="discountMode() === 'amount' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'"
            (click)="setDiscountMode('amount')">Tutar (₺)</button>
        </div>

        <label class="label">{{ discountMode() === 'percent' ? 'İndirim oranı' : 'İndirim tutarı' }}</label>
        <input type="number" min="0" step="0.01" class="input mb-1" [value]="discountInput()"
          (input)="discountInput.set(+$any($event.target).value)" />
        @if (manualOverLimit()) {
          <p class="mb-3 text-xs font-medium text-rose-600">En fazla %{{ maxManualPercent() }} indirim yetkiniz var.</p>
        } @else {
          <p class="mb-3 text-xs text-slate-400">Ara toplam {{ money(grossTotals().grand) }} → yeni toplam {{ money(totals().grand) }}</p>
        }

        <label class="label">Gerekçe</label>
        <select class="select mb-4" [value]="discountReason()" (change)="discountReason.set($any($event.target).value)">
          @for (r of discountReasons; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
        </select>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="clearDiscount()">Kaldır</button>
          <button type="button" class="btn-primary" [disabled]="manualOverLimit()" (click)="discountOpen.set(false)">Uygula</button>
        </div>
      </app-modal>
    }

    <!-- Tahsilat modal -->
    @if (checkoutOpen()) {
      <app-modal title="Tahsilat" (dismiss)="checkoutOpen.set(false)">
        <div class="mb-5 rounded-xl bg-brand-50 px-4 py-4 text-center">
          <p class="text-sm text-brand-700">Tahsil edilecek</p>
          <p class="text-3xl font-black text-brand-700">{{ money(totals().grand) }}</p>
        </div>

        @if (method() !== 'Credit') {
          <label class="label">Kasa</label>
          <select class="select mb-4" [value]="cashAccountId()" (change)="cashAccountId.set($any($event.target).value)">
            @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
        }

        <label class="label">Ödeme Yöntemi</label>
        <div class="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          @for (m of methods; track m.value) {
            <button type="button"
              class="rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
              [disabled]="(m.value === 'Credit' && !customerId()) || (m.value !== 'Credit' && !accounts().length)"
              [class]="method() === m.value ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
              (click)="method.set(m.value)">
              <lucide-icon [name]="m.icon" class="mx-auto mb-1 h-4 w-4"></lucide-icon>{{ m.label }}
            </button>
          }
        </div>
        @if (!customerId()) {
          <p class="mb-4 text-xs text-slate-400">Veresiye (cari hesaba yazmak) için üstten bir müşteri seçin.</p>
        } @else {
          <div class="mb-4"></div>
        }

        <!-- Karma ödeme (split tender): parça nakit + parça kart -->
        @if (accounts().length && method() !== 'Credit') {
          <label class="mb-3 flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" class="rounded text-brand-600" [checked]="splitMode()" (change)="toggleSplit($any($event.target).checked)" />
            Karma ödeme (nakit + kart böl)
          </label>
        }

        @if (splitMode()) {
          <div class="mb-4 space-y-2">
            @for (p of splitPayments(); track $index) {
              <div class="flex items-center gap-2">
                <select class="select flex-1" [value]="p.method" (change)="setSplitMethod($index, $any($event.target).value)">
                  <option value="Cash">Nakit</option>
                  <option value="Card">Kart</option>
                  <option value="Transfer">Havale</option>
                </select>
                <input type="number" step="0.01" class="input w-28" [value]="p.amount" (input)="setSplitAmount($index, +$any($event.target).value)" />
                <button type="button" class="rounded-lg p-2 text-slate-400 hover:text-rose-600" (click)="removeSplit($index)"><lucide-icon name="x" class="h-4 w-4"></lucide-icon></button>
              </div>
            }
            <button type="button" class="btn-outline btn-sm w-full" (click)="addSplit()"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Ödeme satırı ekle</button>
            <div class="flex justify-between rounded-xl px-4 py-2.5 text-sm"
                 [class]="splitRemaining() === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'">
              <span>Kalan</span>
              <span class="font-bold">{{ money(splitRemaining()) }}</span>
            </div>
          </div>
        } @else {
          @if (method() === 'Cash') {
            <div class="mb-2">
              <label class="label">Alınan Tutar</label>
              <input type="number" step="0.01" class="input" [value]="received()" (input)="received.set(+$any($event.target).value)" />
            </div>
            <div class="mb-4 flex justify-between rounded-xl bg-slate-50 px-4 py-2.5 text-sm">
              <span class="text-slate-500">Para Üstü</span>
              <span class="font-bold" [class.text-emerald-600]="change() >= 0" [class.text-rose-600]="change() < 0">{{ money(change()) }}</span>
            </div>
          }

          @if (method() === 'Credit') {
            <div class="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p class="flex items-center gap-1.5 font-semibold"><lucide-icon name="book-text" class="h-4 w-4"></lucide-icon> Veresiye — cari hesaba yazılacak</p>
              <p class="mt-1 text-xs">
                {{ money(totals().grand) }} tutar <b>{{ customerName() }}</b> hesabına yazılacak; nakit tahsil edilmez.
                Yeni bakiye: <b>{{ projectedBalanceLabel() }}</b>. Sonra Cariler'den tahsil edebilirsiniz.
              </p>
            </div>
          }
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="checkoutOpen.set(false)">İptal</button>
          <button type="button" class="btn-primary" [disabled]="saving()" (click)="complete()">
            {{ saving() ? 'İşleniyor...' : (method() === 'Credit' && !splitMode() ? 'Cariye Yaz' : 'Satışı Tamamla') }}
          </button>
        </div>
      </app-modal>
    }

    @if (cameraOpen()) {
      <app-barcode-camera (scanned)="onCameraScan($event)" (closed)="cameraOpen.set(false)" />
    }
  `,
})
export class QuickSaleComponent implements OnInit, OnDestroy {
  private stockApi = inject(StockApi);
  private financeApi = inject(FinanceApi);
  private invoicesApi = inject(InvoicesApi);
  private contactsApi = inject(ContactsApi);
  private settingsApi = inject(SettingsApi);
  private auth = inject(AuthService);
  private scanner = inject(BarcodeScannerService);
  private toast = inject(ToastService);
  private offlineQueue = inject(OfflineSaleQueueService);
  private branchStore = inject(BranchStore);

  /** Çok-şubede "Tüm şubeler" görünümündeyken satış tek (varsayılan) şubeye yazılır ama stok TOPLAM görünür →
   * yanıltıcı. Somut şube seçilmeli (tek-şubede sorun yok: seçim gizli, stok=o şube). */
  protected mustPickBranch = computed(() => this.branchStore.multi() && !this.branchStore.currentBranchId());

  protected money = money;
  protected stockOf = stockOf;
  protected term = computed(() => this.auth.profile().terminology);
  protected cameraSupported = barcodeCameraSupported();
  protected cameraOpen = signal(false);
  private scanSub?: Subscription;
  protected saleTitle = computed(() => this.auth.profile().nav.find((n) => n.path === '/hizli-satis')?.label ?? 'Hızlı Satış');

  protected loading = signal(true);
  protected saving = signal(false);
  protected products = signal<ProductDto[]>([]);
  protected categories = signal<CategoryDto[]>([]);
  protected accounts = signal<CashAccountDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected customerId = signal('');
  protected loyaltyEnabled = signal(false);

  // Elle indirim (kasiyer). Sınır ayarlardan gelir; Owner/Admin sınırsızdır (sunucu da doğrular).
  protected manualDiscountEnabled = signal(false);
  private maxManualSetting = signal(0);
  protected discountOpen = signal(false);
  protected discountMode = signal<'percent' | 'amount'>('percent');
  protected discountInput = signal(0);
  protected discountReason = signal<DiscountReason>('Rounding');
  /** Sahip/yönetici sınırsız; diğer roller yalnız sınır > 0 ise indirim yapabilir. */
  private isManager = computed(() => this.auth.role() === 'Owner' || this.auth.role() === 'Admin');
  protected maxManualPercent = computed(() => (this.isManager() ? 100 : this.maxManualSetting()));
  protected manualAllowed = computed(() => this.manualDiscountEnabled() && this.maxManualPercent() > 0);
  protected discountReasons: { value: DiscountReason; label: string }[] = [
    { value: 'Rounding', label: 'Yuvarlama' },
    { value: 'Negotiation', label: 'Pazarlık' },
    { value: 'Complimentary', label: 'İkram' },
    { value: 'Damaged', label: 'Hasarlı ürün' },
    { value: 'Other', label: 'Diğer' },
  ];
  protected pointsToRedeem = signal(0);

  protected search = signal('');
  protected barcode = signal('');
  protected activeCat = signal('');
  protected cart = signal<CartItem[]>([]);

  protected checkoutOpen = signal(false);
  protected cashAccountId = signal('');
  protected method = signal<'Cash' | 'Card' | 'Transfer' | 'Credit'>('Cash');
  protected received = signal(0);

  // Karma ödeme (split tender): parça nakit + parça kart/havale.
  protected splitMode = signal(false);
  protected splitPayments = signal<{ method: 'Cash' | 'Card' | 'Transfer'; amount: number }[]>([]);
  protected splitRemaining = computed(() =>
    Math.round((this.totals().grand - this.splitPayments().reduce((s, p) => s + (+p.amount || 0), 0)) * 100) / 100);

  protected methods = [
    { value: 'Cash' as const, label: 'Nakit', icon: 'banknote' },
    { value: 'Card' as const, label: 'Kart', icon: 'credit-card' },
    { value: 'Transfer' as const, label: 'Havale', icon: 'wallet' },
    // Veresiye: müşteri seçiliyken satış onun cari hesabına borç yazılır (nakit tahsil edilmez).
    { value: 'Credit' as const, label: 'Veresiye', icon: 'book-text' },
  ];

  protected filtered = computed(() => {
    const s = this.search().trim().toLowerCase();
    const cat = this.activeCat();
    return this.products().filter(
      (p) =>
        !p.isVariantParent && // varyant şablonu satılmaz (stok varyantlarda); varyantların kendisi normal ürün gibi listelenir
        (!cat || p.categoryId === cat) &&
        (!s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
    );
  });

  /** Seçili müşterinin indirim yüzdesi (varsa). */
  protected discountRate = computed(() => this.contacts().find((c) => c.id === this.customerId())?.discountRate ?? 0);
  /** Seçili müşterinin kullanılabilir sadakat puanı bakiyesi. */
  protected availablePoints = computed(() => this.contacts().find((c) => c.id === this.customerId())?.pointsBalance ?? 0);
  /** Seçili müşterinin cari bakiyesi (+ = bize borçlu / veresiyeci, − = alacaklı / ön ödemeli). */
  protected customerBalance = computed(() => this.contacts().find((c) => c.id === this.customerId())?.balance ?? 0);
  protected customerName = computed(() => this.contacts().find((c) => c.id === this.customerId())?.name ?? '');
  protected balanceLabel = computed(() => this.fmtBalance(this.customerBalance()));
  /** Veresiye sonrası oluşacak yeni cari bakiye (mevcut + satış tutarı). */
  protected projectedBalanceLabel = computed(() => this.fmtBalance(this.customerBalance() + this.totals().grand));
  private fmtBalance(b: number): string {
    if (b > 0.0001) return `${money(b)} borç`;
    if (b < -0.0001) return `${money(-b)} alacak`;
    return money(0);
  }

  /** Puan indirimi ÖNCESİ toplamlar (müşteri % indirimi dahil). */
  protected grossTotals = computed(() => {
    const rate = this.discountRate();
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let subtotal = 0;
    let vat = 0;
    for (const i of this.cart()) {
      // Sunucuyla aynı: indirim satır bazında, 2 ondalığa yuvarlanarak uygulanır.
      const unit = rate > 0 ? r2(unitOf(i) * (1 - rate / 100)) : unitOf(i);
      const line = r2(unit * i.quantity);
      subtotal += line;
      vat += r2((line * i.product.vatRate) / 100);
    }
    subtotal = r2(subtotal);
    vat = r2(vat);
    return { subtotal, vat, grand: r2(subtotal + vat) };
  });

  /** Elle indirimin ₺ karşılığı — sunucuyla aynı sıra: müşteri % → ELLE → puan. */
  protected appliedManual = computed(() => {
    if (!this.manualAllowed()) return 0;
    const gross = this.grossTotals().grand;
    const v = Math.max(0, this.discountInput() || 0);
    if (v <= 0 || gross <= 0) return 0;
    const raw = this.discountMode() === 'percent' ? (gross * v) / 100 : v;
    return Math.round(Math.min(raw, gross) * 100) / 100;
  });

  /** Uygulanmak istenen oran — kasiyer sınırının aşılıp aşılmadığını göstermek için. */
  protected manualRate = computed(() => {
    const gross = this.grossTotals().grand;
    return gross > 0 ? (this.appliedManual() / gross) * 100 : 0;
  });
  protected manualOverLimit = computed(() => this.manualRate() > this.maxManualPercent() + 0.0001);

  /** Elle indirim SONRASI toplamlar (KDV de orantılı düşer — sunucu satır fiyatına işliyor). */
  private afterManual = computed(() => {
    const g = this.grossTotals();
    const cut = this.appliedManual();
    if (cut <= 0 || g.grand <= 0) return g;
    const factor = 1 - cut / g.grand;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const subtotal = r2(g.subtotal * factor);
    const vat = r2(g.vat * factor);
    return { subtotal, vat, grand: r2(subtotal + vat) };
  });

  /** Uygulanan puan indirimi (₺): istenen ile mevcut puan + toplamın küçüğü. Sunucu da aynısını kırpar. */
  protected appliedRedeem = computed(() => {
    if (!this.loyaltyEnabled()) return 0;
    const grand = this.afterManual().grand;
    const want = Math.max(0, this.pointsToRedeem() || 0);
    return Math.round(Math.min(want, this.availablePoints(), grand) * 100) / 100;
  });

  protected totals = computed(() => {
    const g = this.afterManual();
    const redeem = this.appliedRedeem();
    return { subtotal: g.subtotal, vat: g.vat, redeem, grand: Math.round((g.grand - redeem) * 100) / 100 };
  });

  protected change = computed(() => Math.round((this.received() - this.totals().grand) * 100) / 100);

  protected openDiscount(): void {
    this.discountOpen.set(true);
  }
  /** Mod değişince girdi sıfırlanır: "%10" ile "10 ₺" bambaşka tutarlar, taşınırsa kasiyer yanılır. */
  protected setDiscountMode(m: 'percent' | 'amount'): void {
    if (this.discountMode() === m) return;
    this.discountMode.set(m);
    this.discountInput.set(0);
  }
  protected clearDiscount(): void {
    this.discountInput.set(0);
    this.discountOpen.set(false);
  }

  ngOnInit(): void {
    this.scanner.start();
    this.scanSub = this.scanner.scans.subscribe((code) => this.scan(code));
    forkJoin({
      products: this.stockApi.getProducts({ pageSize: 200 }),
      categories: this.stockApi.getCategories(),
      accounts: this.financeApi.getCashAccounts(),
      contacts: this.contactsApi.getContacts({ pageSize: 500 }),
      settings: this.settingsApi.get(),
    }).subscribe({
      next: (r) => {
        this.products.set(r.products.items);
        this.categories.set(r.categories);
        this.accounts.set(r.accounts);
        this.contacts.set(r.contacts.items);
        this.loyaltyEnabled.set(r.settings.loyaltyEnabled);
        this.manualDiscountEnabled.set(r.settings.manualDiscountEnabled ?? false);
        this.maxManualSetting.set(r.settings.maxManualDiscountPercent ?? 0);
        if (r.accounts.length) this.cashAccountId.set(r.accounts[0].id);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  ngOnDestroy(): void {
    this.scanSub?.unsubscribe();
  }

  protected onBarcode(): void {
    this.scan(this.barcode());
    this.barcode.set('');
  }

  protected onCameraScan(code: string): void {
    this.cameraOpen.set(false);
    this.scan(code);
  }

  /** Şablonda kullanılan birim fiyat yardımcısı (terazi fiyatı varsa o). */
  protected unit = unitOf;

  /** Barkodla ürün bul ve sepete ekle (donanım okuyucu, kamera veya elle giriş — tek nokta).
   * Terazi etiketiyse miktar/fiyat barkoddan çözülür; değilse normal ürün olarak eklenir. */
  private scan(code: string): void {
    const c = code.trim();
    if (!c) return;
    this.stockApi.scan(c).subscribe({
      next: (r) => {
        if (!r.isScaleBarcode) {
          this.add(r.product);
          return;
        }
        // Terazi kalemi: her etiket AYRI bir tartımdır → mevcut satıra eklenmez, miktar üzerine YAZILIR.
        this.addWeighed(r.product, r.quantity, r.unitPrice ?? undefined);
      },
      error: (e) => this.toast.error(apiError(e) || `Barkod bulunamadı: ${c}`),
    });
  }

  /** Tartılabilir kalem: aynı ürün ikinci kez okutulursa miktarlar TOPLANIR (iki paket domates). */
  private addWeighed(p: ProductDto, qty: number, unitPrice?: number): void {
    const existing = this.cart().find((i) => i.product.id === p.id && i.unitPrice === unitPrice);
    if (existing) {
      this.cart.update((c) =>
        c.map((i) => (i === existing ? { ...i, quantity: Math.round((i.quantity + qty) * 1000) / 1000 } : i))
      );
    } else {
      this.cart.update((c) => [...c, { product: p, quantity: qty, unitPrice }]);
    }
    this.toast.success(`${p.name}: ${qty} ${p.unit}`);
  }

  protected add(p: ProductDto): void {
    const existing = this.cart().find((i) => i.product.id === p.id);
    if (existing) {
      this.inc(existing);
      return;
    }
    this.cart.update((c) => [...c, { product: p, quantity: 1 }]);
  }

  protected inc(item: CartItem): void {
    // Hizmet kalemleri (kuaför/tamirci) stok takip etmez; sadece fiziksel ürünlerde stok sınırı uygula.
    if (!item.product.isService && item.quantity + 1 > stockOf(item.product)) {
      this.toast.error(`Yeterli stok yok (mevcut: ${stockOf(item.product)}).`);
      return;
    }
    this.cart.update((c) => c.map((i) => (i.product.id === item.product.id ? { ...i, quantity: i.quantity + 1 } : i)));
  }

  protected dec(item: CartItem): void {
    this.cart.update((c) =>
      c
        .map((i) => (i.product.id === item.product.id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0)
    );
  }

  protected clear(): void {
    this.cart.set([]);
    this.customerId.set('');
    this.pointsToRedeem.set(0);
  }

  /** Müşteri değişince puan kullanımını sıfırla (yeni müşterinin bakiyesine göre kırpılır). */
  protected onCustomer(id: string): void {
    this.customerId.set(id);
    this.pointsToRedeem.set(0);
    // Müşteri kaldırıldıysa Veresiye seçili kalmasın (cariye yazacak müşteri yok).
    if (!id && this.method() === 'Credit') this.method.set('Cash');
  }

  protected openCheckout(): void {
    if (this.mustPickBranch()) {
      this.toast.error('Satış için üstten bir şube seçin — çok şubede stok şubeye göre tutulur.');
      return;
    }
    // Kasa yoksa yalnız veresiye (müşteri seçili) mümkün; ikisi de yoksa engelle.
    if (!this.accounts().length && !this.customerId()) {
      this.toast.error('Önce bir kasa ekleyin (ya da müşteri seçip veresiye yazın).');
      return;
    }
    this.method.set(this.accounts().length ? 'Cash' : 'Credit');
    this.received.set(this.totals().grand);
    this.splitMode.set(false);
    this.splitPayments.set([]);
    this.checkoutOpen.set(true);
  }

  // ---- Karma ödeme (split) ----
  protected toggleSplit(on: boolean): void {
    this.splitMode.set(on);
    if (on && this.splitPayments().length === 0)
      this.splitPayments.set([{ method: 'Cash', amount: this.totals().grand }]);
  }
  protected addSplit(): void {
    this.splitPayments.update((l) => [...l, { method: 'Card', amount: Math.max(0, this.splitRemaining()) }]);
  }
  protected removeSplit(i: number): void {
    this.splitPayments.update((l) => l.filter((_, idx) => idx !== i));
  }
  protected setSplitMethod(i: number, m: 'Cash' | 'Card' | 'Transfer'): void {
    this.splitPayments.update((l) => l.map((p, idx) => (idx === i ? { ...p, method: m } : p)));
  }
  protected setSplitAmount(i: number, a: number): void {
    this.splitPayments.update((l) => l.map((p, idx) => (idx === i ? { ...p, amount: a } : p)));
  }

  protected complete(): void {
    const items = this.cart();
    if (!items.length) return;

    const split = this.splitMode();
    // Veresiye: satış müşterinin cari hesabına borç yazılır (nakit tahsilat yok). Müşteri zorunlu.
    const onAccount = !split && this.method() === 'Credit';
    if (onAccount && !this.customerId()) {
      this.toast.error('Veresiye için müşteri seçin.');
      return;
    }
    if (split) {
      const sum = this.splitPayments().reduce((s, p) => s + (+p.amount || 0), 0);
      if (Math.abs(sum - this.totals().grand) > 0.01) {
        this.toast.error('Ödeme parçalarının toplamı tahsil edilecek tutara eşit olmalı.');
        return;
      }
      if (!this.cashAccountId()) { this.toast.error('Önce bir kasa ekleyin.'); return; }
    }
    // Nakit/Kart/Havale kasa gerektirir — kasa seçili değilse sunucu "Kasa bulunamadı" döndürürdü.
    if (!onAccount && !this.cashAccountId()) {
      this.toast.error('Önce bir kasa ekleyin ya da veresiye seçin.');
      return;
    }

    const payload = {
      type: 'Sales',
      contactId: this.customerId() || null,
      date: null,
      note: onAccount ? 'Veresiye satış' : 'Hızlı satış',
      lines: items.map((i) => ({
        productId: i.product.id,
        quantity: i.quantity,
        unitPrice: unitOf(i),
        vatRate: i.product.vatRate,
      })),
      // Veresiye'de ödeme YOK → sunucu tutarı carinin bakiyesine borç yazar. Diğer yöntemlerde tam tahsilat.
      // Karma ödeme (split): tek payment yerine payments dizisi (her parça aynı kasaya, farklı yöntemle).
      payment: (onAccount || split) ? null : { cashAccountId: this.cashAccountId(), amount: this.totals().grand, method: this.method() },
      payments: split
        ? this.splitPayments().map((p) => ({ cashAccountId: this.cashAccountId(), amount: +p.amount, method: p.method }))
        : null,
      // Sadakat: kullanılacak puan (₺). Sunucu cari bakiyesi + toplamla tekrar kırpar.
      redeemPoints: this.appliedRedeem() || null,
      // Elle indirim: tutar olarak gönderilir (ekranda görülen ₺ ile fatura birebir tutsun diye).
      // Sunucu yetki sınırını yeniden doğrular — istemci kırpması yalnız kullanıcıyı erken uyarmak içindir.
      manualDiscountAmount: this.appliedManual() || null,
      manualDiscountReason: this.appliedManual() > 0 ? this.discountReason() : null,
      // Çevrimdışı kuyruk için idempotency anahtarı: ağ kesilip yeniden gönderilse bile çift satış olmaz.
      clientSaleId: this.offlineQueue.newSaleId(),
    };

    this.saving.set(true);
    this.invoicesApi.createInvoice(payload).subscribe({
      next: (inv) => {
        this.saving.set(false);
        this.checkoutOpen.set(false);
        this.toast.success(onAccount ? `Veresiye cariye yazıldı: ${inv.number}` : `Satış tamamlandı: ${inv.number}`);
        window.open(`/fis/${inv.id}`, '_blank');
        this.clear();
        // Stokları güncelle
        this.stockApi.getProducts({ pageSize: 200 }).subscribe((r) => this.products.set(r.items));
        // Cari puan bakiyelerini tazele — sonraki satışta bayat puanla yanlış tutar/eksik tahsilat olmasın.
        this.contactsApi.getContacts({ pageSize: 500 }).subscribe((r) => this.contacts.set(r.items));
        // Bağlantı yeni geldiyse bekleyen çevrimdışı satışları da boşalt.
        void this.offlineQueue.replayAll();
      },
      error: (e) => {
        this.saving.set(false);
        // Ağ hatası (çevrimdışı / sunucuya ulaşılamadı) → satışı KAYBETME, yerel kuyruğa al; bağlanınca gönderilir.
        if (this.offlineQueue.isNetworkError(e)) {
          void this.offlineQueue.enqueue(payload);
          this.checkoutOpen.set(false);
          this.toast.success('Çevrimdışısınız — satış kaydedildi, bağlantı gelince otomatik gönderilecek.');
          this.clear();
        } else {
          this.toast.error(apiError(e));
        }
      },
    });
  }
}
