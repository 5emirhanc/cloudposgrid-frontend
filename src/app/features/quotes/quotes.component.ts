import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { ContactsApi } from '../../core/api/contacts.api';
import { FinanceApi } from '../../core/api/finance.api';
import { QuotesApi } from '../../core/api/quotes.api';
import { StockApi } from '../../core/api/stock.api';
import { CashAccountDto, ContactDto, ProductDto, QuoteDto, QuoteListItemDto, QuoteStatus } from '../../core/models';
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

@Component({
  selector: 'app-quotes',
  standalone: true,
  imports: [LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="quotes" title="Müşterilerinize bağlayıcı olmayan fiyat teklifi hazırlayın">
      <li>Teklif stoktan düşmez, cariye borç yazmaz — sadece bir tekliftir</li>
      <li>Müşteriye gönderdiğinizde "Gönderildi" olarak işaretleyin</li>
      <li>Kabul edilirse tek tıkla satışa çevirin: stok ve tahsilat o an işlenir</li>
      <li>Geçerlilik tarihi geçen teklifler listede işaretlenir</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Teklifler</h1>
        <p class="text-sm text-slate-500">Proforma hazırlayın, kabul edilince satışa çevirin</p>
      </div>
      <button class="btn-primary" (click)="openNew()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Teklif
      </button>
    </div>

    <div class="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div class="relative min-w-48 flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-9" placeholder="Teklif no ya da müşteri ara..." [value]="search()"
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
        <p class="text-slate-500">Henüz teklif yok.</p>
        <button class="btn-primary mt-4" (click)="openNew()">İlk teklifinizi oluşturun</button>
      </div>
    } @else {
      <div class="card overflow-hidden p-0">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-100 text-xs text-slate-400">
                <th class="px-4 py-3 text-left font-medium">TEKLİF</th>
                <th class="px-4 py-3 text-left font-medium">MÜŞTERİ</th>
                <th class="px-4 py-3 text-left font-medium">GEÇERLİLİK</th>
                <th class="px-4 py-3 text-right font-medium">TUTAR</th>
                <th class="px-4 py-3 text-left font-medium">DURUM</th>
                <th class="px-4 py-3 text-right font-medium">İŞLEM</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (q of items(); track q.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-4 py-3 font-semibold text-slate-800">{{ q.number }}</td>
                  <td class="px-4 py-3 text-slate-600">{{ q.contactName || q.customerName || '—' }}</td>
                  <td class="px-4 py-3 text-slate-500">
                    {{ fmtDate(q.validUntil) }}
                    @if (q.isExpired) { <span class="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">süresi geçti</span> }
                  </td>
                  <td class="px-4 py-3 text-right font-bold text-slate-900">{{ money(q.grandTotal) }}</td>
                  <td class="px-4 py-3">
                    <span class="rounded-lg px-2 py-0.5 text-xs font-medium" [class]="statusClass(q.status)">{{ statusLabel(q.status) }}</span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-1">
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Aç" (click)="openEdit(q)">
                        <lucide-icon name="eye" class="h-4 w-4"></lucide-icon>
                      </button>
                      @if (q.status !== 'Converted') {
                        <button class="rounded-lg p-2 text-emerald-500 hover:bg-emerald-50" title="Satışa çevir" (click)="openConvert(q)">
                          <lucide-icon name="check" class="h-4 w-4"></lucide-icon>
                        </button>
                        <button class="rounded-lg p-2 text-rose-400 hover:bg-rose-50" title="Sil" (click)="remove(q)">
                          <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
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

    <!-- Teklif formu -->
    @if (formOpen()) {
      <app-modal [title]="editing() ? editing()!.number : 'Yeni Teklif'" maxWidth="52rem" (dismiss)="formOpen.set(false)">
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Müşteri Carisi</label>
              <select class="select" [value]="contactId()" (change)="contactId.set($any($event.target).value)">
                <option value="">— Cari yok (potansiyel müşteri) —</option>
                @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Müşteri Adı <span class="text-xs font-normal text-slate-400">(cari seçmediyseniz)</span></label>
              <input class="input" [value]="customerName()" (input)="customerName.set($any($event.target).value)" placeholder="Ör. ACME A.Ş." />
            </div>
            <div>
              <label class="label">Teklif Tarihi</label>
              <input type="date" class="input" [value]="date()" (input)="date.set($any($event.target).value)" />
            </div>
            <div>
              <label class="label">Geçerlilik Bitişi</label>
              <input type="date" class="input" [value]="validUntil()" (input)="validUntil.set($any($event.target).value)" />
            </div>
          </div>

          <div>
            <label class="label">Kalemler</label>
            <div class="space-y-2">
              @for (l of lines(); track $index; let i = $index) {
                <div class="flex flex-wrap items-center gap-2">
                  <select class="input min-w-40 flex-1" [value]="l.productId" (change)="setProduct(i, $any($event.target).value)">
                    <option value="">Ürün/hizmet seçin...</option>
                    @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                  </select>
                  <input type="number" min="0" step="0.01" class="input w-20" [value]="l.quantity"
                    (input)="setLine(i, 'quantity', $any($event.target).value)" placeholder="Adet" />
                  <input type="number" min="0" step="0.01" class="input w-28" [value]="l.unitPrice"
                    (input)="setLine(i, 'unitPrice', $any($event.target).value)" placeholder="Fiyat" />
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
            <label class="label">Teklif Şartları <span class="text-xs font-normal text-slate-400">(opsiyonel)</span></label>
            <input class="input" [value]="note()" (input)="note.set($any($event.target).value)" placeholder="Ör. 30 gün teslim, nakliye dahil" />
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

    <!-- Satışa çevir -->
    @if (converting(); as q) {
      <app-modal title="Satışa Çevir" maxWidth="26rem" (dismiss)="converting.set(null)">
        <div class="mb-4 rounded-xl bg-brand-50 px-4 py-4 text-center">
          <p class="text-sm text-brand-700">{{ q.number }} · fatura tutarı</p>
          <p class="text-3xl font-black text-brand-700">{{ money(q.grandTotal) }}</p>
        </div>
        <p class="mb-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          Bu işlem satış faturası keser: <strong>stok düşer</strong>, tahsilat kasaya işlenir. Geri almak için faturayı iptal etmeniz gerekir.
        </p>

        <label class="label">Tahsilat</label>
        <select class="select mb-3" [value]="convertMode()" (change)="convertMode.set($any($event.target).value)">
          <option value="cash">Şimdi tahsil et</option>
          <option value="credit" [disabled]="!q.contactName">Veresiye (cariye borç yaz)</option>
        </select>

        @if (convertMode() === 'cash') {
          <label class="label">Kasa</label>
          <select class="select mb-4" [value]="cashAccountId()" (change)="cashAccountId.set($any($event.target).value)">
            @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
          </select>
        } @else {
          <p class="mb-4 text-xs text-slate-500">Tutar <strong>{{ q.contactName }}</strong> carisine borç yazılacak.</p>
        }

        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="converting.set(null)">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="busy()" (click)="doConvert()">Faturaya Çevir</button>
        </div>
      </app-modal>
    }
  `,
})
export class QuotesComponent implements OnInit {
  private api = inject(QuotesApi);
  private stockApi = inject(StockApi);
  private contactsApi = inject(ContactsApi);
  private financeApi = inject(FinanceApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);

  protected money = money;

  protected loading = signal(true);
  protected busy = signal(false);
  protected items = signal<QuoteListItemDto[]>([]);
  protected products = signal<ProductDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected accounts = signal<CashAccountDto[]>([]);

  protected search = signal('');
  protected status = signal<QuoteStatus | ''>('');

  protected readonly statuses: { value: QuoteStatus; label: string }[] = [
    { value: 'Draft', label: 'Taslak' },
    { value: 'Sent', label: 'Gönderildi' },
    { value: 'Accepted', label: 'Kabul edildi' },
    { value: 'Rejected', label: 'Reddedildi' },
    { value: 'Converted', label: 'Faturalandı' },
  ];

  // Form durumu
  protected formOpen = signal(false);
  protected editing = signal<QuoteDto | null>(null);
  protected contactId = signal('');
  protected customerName = signal('');
  protected date = signal('');
  protected validUntil = signal('');
  protected note = signal('');
  protected lines = signal<DraftLine[]>([]);

  // Dönüştürme durumu
  protected converting = signal<QuoteListItemDto | null>(null);
  protected convertMode = signal<'cash' | 'credit'>('cash');
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

  ngOnInit(): void {
    forkJoin({
      products: this.stockApi.getProducts({ pageSize: 200 }),
      contacts: this.contactsApi.getContacts({ pageSize: 500 }),
      accounts: this.financeApi.getCashAccounts(),
    }).subscribe({
      next: (r) => {
        this.products.set(r.products.items.filter((p) => !p.isVariantParent));
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
  protected statusLabel(s: QuoteStatus): string {
    return this.statuses.find((x) => x.value === s)?.label ?? s;
  }
  protected statusClass(s: QuoteStatus): string {
    return s === 'Converted'
      ? 'bg-emerald-100 text-emerald-700'
      : s === 'Accepted'
        ? 'bg-brand-100 text-brand-700'
        : s === 'Rejected'
          ? 'bg-rose-100 text-rose-700'
          : s === 'Sent'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-slate-100 text-slate-600';
  }

  protected lineTotal(l: DraftLine): number {
    const lt = Math.round(l.quantity * l.unitPrice * 100) / 100;
    return Math.round((lt + (lt * l.vatRate) / 100) * 100) / 100;
  }

  // ---- Form ----
  protected openNew(): void {
    const today = new Date();
    const in15 = new Date(today.getTime() + 15 * 86400000);
    this.editing.set(null);
    this.contactId.set('');
    this.customerName.set('');
    this.date.set(this.ymd(today));
    this.validUntil.set(this.ymd(in15));
    this.note.set('');
    this.lines.set([{ productId: '', quantity: 1, unitPrice: 0, vatRate: 20 }]);
    this.formOpen.set(true);
  }

  protected openEdit(q: QuoteListItemDto): void {
    this.api.getById(q.id).subscribe({
      next: (full) => {
        this.editing.set(full);
        this.contactId.set(full.contactId ?? '');
        this.customerName.set(full.customerName ?? '');
        this.date.set(full.date.slice(0, 10));
        this.validUntil.set(full.validUntil.slice(0, 10));
        this.note.set(full.note ?? '');
        this.lines.set(
          full.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, vatRate: l.vatRate }))
        );
        this.formOpen.set(true);
      },
      error: (e) => this.toast.error(apiError(e)),
    });
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
  /** Ürün seçilince fiyat ve KDV kartından otomatik gelir (kullanıcı sonra pazarlık fiyatını yazabilir). */
  protected setProduct(i: number, productId: string): void {
    const p = this.products().find((x) => x.id === productId);
    this.lines.update((ls) =>
      ls.map((l, ix) => (ix === i ? { ...l, productId, unitPrice: p?.salePrice ?? l.unitPrice, vatRate: p?.vatRate ?? l.vatRate } : l))
    );
  }
  protected setLine(i: number, field: 'quantity' | 'unitPrice' | 'vatRate', val: string): void {
    const n = +val || 0;
    this.lines.update((ls) => ls.map((l, ix) => (ix === i ? { ...l, [field]: n } : l)));
  }

  protected save(): void {
    const lines = this.lines().filter((l) => l.productId && l.quantity > 0);
    if (!lines.length) {
      this.toast.error('En az bir kalem ekleyin.');
      return;
    }
    if (!this.contactId() && !this.customerName().trim()) {
      this.toast.error('Cari seçin ya da müşteri adı yazın.');
      return;
    }
    const body = {
      contactId: this.contactId() || null,
      customerName: this.customerName().trim() || null,
      date: this.date() || null,
      validUntil: this.validUntil() || null,
      note: this.note().trim() || null,
      lines,
    };
    this.busy.set(true);
    const req = this.editing() ? this.api.update(this.editing()!.id, body) : this.api.create(body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.toast.success(this.editing() ? 'Teklif güncellendi.' : 'Teklif oluşturuldu.');
        this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Dönüştür ----
  protected openConvert(q: QuoteListItemDto): void {
    this.convertMode.set(q.contactName ? 'cash' : 'cash');
    this.converting.set(q);
  }

  protected doConvert(): void {
    const q = this.converting();
    if (!q) return;
    const credit = this.convertMode() === 'credit';
    if (!credit && !this.cashAccountId()) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    this.busy.set(true);
    const payment = credit ? null : { cashAccountId: this.cashAccountId(), amount: q.grandTotal, method: 'Cash' };
    this.api.convert(q.id, payment).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.converting.set(null);
        this.toast.success('Teklif satışa çevrildi.');
        if (res.invoiceId) this.router.navigate(['/faturalar', res.invoiceId]);
        else this.reload();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(q: QuoteListItemDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `${q.number} silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.remove(q.id).subscribe({
      next: () => {
        this.toast.success('Teklif silindi.');
        this.reload();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
