import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { InvoicesApi } from '../../core/api/invoices.api';
import { FinanceApi } from '../../core/api/finance.api';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { CashAccountDto, InvoiceDto, RefundRequest } from '../../core/models';
import { apiError, blobError, formatDate, money } from '../../core/utils';

@Component({
  selector: 'app-invoice-detail',
  imports: [RouterLink, LucideAngularModule, ModalComponent],
  template: `
    <div class="mb-6 flex items-center gap-3">
      <a routerLink="/faturalar" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><lucide-icon name="chevron-right" class="h-5 w-5 rotate-180"></lucide-icon></a>
      <h1 class="flex-1 text-2xl font-black tracking-tight text-slate-900">Fatura Detayı</h1>
      @if (invoice(); as inv) {
        <a [routerLink]="['/fis', inv.id]" class="btn-outline">
          <lucide-icon name="receipt-text" class="h-4 w-4"></lucide-icon> Fiş Yazdır
        </a>
        <button type="button" class="btn-outline" [disabled]="downloading()" (click)="downloadPdf(inv)">
          <lucide-icon name="file-down" class="h-4 w-4"></lucide-icon> {{ downloading() ? 'Hazırlanıyor…' : 'PDF İndir' }}
        </button>
        @if (canVoid() && inv.type === 'Sales' && inv.status !== 'Cancelled' && hasRefundable()) {
          <button type="button" class="btn-outline text-amber-600 hover:bg-amber-50" (click)="openRefund()">
            <lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon> Kısmi İade
          </button>
        }
        @if (canVoid() && inv.status !== 'Cancelled') {
          <button type="button" class="btn-outline text-rose-600 hover:bg-rose-50" [disabled]="voiding()" (click)="voidInvoice(inv)">
            <lucide-icon name="ban" class="h-4 w-4"></lucide-icon> Faturayı İptal
          </button>
        }
      }
    </div>

    @if (loading()) {
      <div class="card h-64 animate-pulse"></div>
    } @else if (invoice(); as inv) {
      <div class="mx-auto max-w-3xl">
        <div class="card overflow-hidden">
          <!-- Başlık -->
          <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-slate-50/60 p-6">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-xl font-bold text-slate-800">{{ inv.number }}</h2>
                @if (inv.type === 'Sales') { <span class="badge-green">Satış</span> } @else { <span class="badge-amber">Alış</span> }
              </div>
              <p class="mt-1 text-sm text-slate-500">{{ formatDate(inv.date) }}</p>
            </div>
            <div class="text-right">
              @switch (inv.status) {
                @case ('Paid') { <span class="badge-green">Ödendi</span> }
                @case ('Issued') { <span class="badge-blue">Açık</span> }
                @case ('Cancelled') { <span class="badge-red">İptal Edildi</span> }
                @default { <span class="badge-gray">{{ inv.status }}</span> }
              }
              <p class="mt-2 text-2xl font-bold text-brand-600">{{ money(inv.grandTotal) }}</p>
            </div>
          </div>

          <div class="p-6">
            @if (inv.contactName) {
              <div class="mb-5">
                <p class="text-xs uppercase tracking-wide text-slate-400">{{ term().customerSingular }}</p>
                <p class="font-semibold text-slate-800">{{ inv.contactName }}</p>
              </div>
            }

            <table class="w-full">
              <thead class="border-b border-slate-100">
                <tr>
                  <th class="table-th">{{ term().productSingular }}</th>
                  <th class="table-th text-right">Miktar</th>
                  <th class="table-th text-right">Fiyat</th>
                  <th class="table-th text-right">KDV</th>
                  <th class="table-th text-right">Tutar</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-50">
                @for (l of inv.lines; track l.id) {
                  <tr>
                    <td class="table-td font-medium text-slate-800">{{ l.productName }}</td>
                    <td class="table-td text-right">{{ l.quantity }}@if (l.refundedQuantity > 0) { <span class="text-xs text-amber-600"> (−{{ l.refundedQuantity }} iade)</span> }</td>
                    <td class="table-td text-right">{{ money(l.unitPrice) }}</td>
                    <td class="table-td text-right text-slate-500">%{{ l.vatRate }}</td>
                    <td class="table-td text-right font-medium">{{ money(l.lineTotal + l.vatAmount) }}</td>
                  </tr>
                }
              </tbody>
            </table>

            <dl class="ml-auto mt-5 max-w-xs space-y-2 text-sm">
              @if (inv.manualDiscount) {
                <div class="flex justify-between text-rose-600"><dt>İndirim{{ inv.discountReason ? ' (' + inv.discountReason + ')' : '' }}</dt><dd class="font-medium">−{{ money(inv.manualDiscount) }}</dd></div>
              }
              <div class="flex justify-between"><dt class="text-slate-500">Ara Toplam</dt><dd class="font-medium">{{ money(inv.subtotal) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">KDV</dt><dd class="font-medium">{{ money(inv.vatTotal) }}</dd></div>
              @if (inv.discount) {
                <div class="flex justify-between text-amber-600"><dt>Puan indirimi</dt><dd class="font-medium">−{{ money(inv.discount) }}</dd></div>
              }
              <div class="flex justify-between border-t border-slate-100 pt-2"><dt class="font-bold text-slate-800">Genel Toplam</dt><dd class="font-bold text-brand-600">{{ money(inv.grandTotal) }}</dd></div>
              <div class="flex justify-between"><dt class="text-slate-500">Ödenen</dt><dd class="font-medium text-emerald-600">{{ money(inv.paidAmount) }}</dd></div>
              @if (inv.grandTotal - inv.paidAmount > 0) {
                <div class="flex justify-between"><dt class="text-slate-500">Kalan</dt><dd class="font-medium text-rose-600">{{ money(inv.grandTotal - inv.paidAmount) }}</dd></div>
              }
            </dl>

            @if (inv.note) {
              <p class="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{{ inv.note }}</p>
            }
          </div>
        </div>
      </div>
    } @else {
      <p class="py-10 text-center text-sm text-slate-400">Fatura bulunamadı.</p>
    }

    @if (refundOpen()) {
      <app-modal title="Kısmi İade" maxWidth="34rem" (dismiss)="refundOpen.set(false)">
        <div class="space-y-4">
          <p class="text-sm text-slate-500">İade edilecek satır ve miktarları girin (kalan miktarı geçemez). Stok geri girer, tutar geri ödenir.</p>
          <div class="space-y-2">
            @for (l of refundableLines(); track l.id) {
              <div class="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div class="flex-1">
                  <p class="font-medium text-slate-800">{{ l.productName }}</p>
                  <p class="text-xs text-slate-400">Kalan: {{ l.quantity - l.refundedQuantity }} · {{ money(l.unitPrice) }} + %{{ l.vatRate }} KDV</p>
                </div>
                <input type="number" min="0" [max]="l.quantity - l.refundedQuantity" step="1" class="input w-24 text-right"
                       [value]="refundQty()[l.id] ?? 0" (input)="setQty(l.id, $any($event.target).value)" />
              </div>
            }
          </div>
          @if (invoice()?.contactId) {
            <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" [checked]="cashRefund()" (change)="cashRefund.set($any($event.target).checked)" class="rounded text-brand-600" />
              Nakit geri öde <span class="text-xs text-slate-400">(işaretlenmezse cariye alacak yazılır)</span>
            </label>
          }
          @if (needsCash()) {
            <div>
              <label class="label">Geri ödeme kasası</label>
              <select class="select" [value]="refundCashId()" (change)="refundCashId.set($any($event.target).value)">
                <option value="">Seçin</option>
                @for (a of cashAccounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
              </select>
            </div>
          }
          <div>
            <label class="label">Not (opsiyonel)</label>
            <input class="input" [value]="refundNote()" (input)="refundNote.set($any($event.target).value)" placeholder="Ör. müşteri iadesi" />
          </div>
          <div class="flex items-center justify-between border-t border-slate-100 pt-3">
            <span class="text-sm text-slate-500">İade tutarı: <b class="text-slate-800">{{ money(refundTotal()) }}</b></span>
            <div class="flex gap-2">
              <button type="button" class="btn-outline" (click)="refundOpen.set(false)">Vazgeç</button>
              <button type="button" class="btn-primary" [disabled]="refunding() || refundTotal() <= 0" (click)="submitRefund()">
                {{ refunding() ? 'İşleniyor...' : 'İade Et' }}
              </button>
            </div>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class InvoiceDetailComponent implements OnInit {
  private api = inject(InvoicesApi);
  private finance = inject(FinanceApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  protected term = computed(() => this.auth.profile().terminology);
  /** İptal/iade yalnız geri ofis rolleri (backend de aynı kısıtı uygular). */
  protected canVoid = computed(() => ['Owner', 'Admin', 'Accountant'].includes(this.auth.role() ?? ''));

  protected money = money;
  protected formatDate = formatDate;

  /** Route param :id (withComponentInputBinding gerektirir; yoksa snapshot kullanılır). */
  id = input<string>('');

  protected loading = signal(true);
  protected voiding = signal(false);
  protected downloading = signal(false);
  protected invoice = signal<InvoiceDto | null>(null);

  // ---- Kısmi iade ----
  protected cashAccounts = signal<CashAccountDto[]>([]);
  protected refundOpen = signal(false);
  protected refunding = signal(false);
  protected refundQty = signal<Record<string, number>>({});
  protected cashRefund = signal(true);
  protected refundCashId = signal('');
  protected refundNote = signal('');

  protected refundableLines = computed(() => (this.invoice()?.lines ?? []).filter((l) => l.quantity - l.refundedQuantity > 0));
  protected hasRefundable = computed(() => this.refundableLines().length > 0);
  /** Peşin (carisiz) satışta nakit iade zorunlu; carili satışta kullanıcı seçer. */
  protected needsCash = computed(() => !this.invoice()?.contactId || this.cashRefund());
  protected refundTotal = computed(() => {
    const q = this.refundQty();
    return (this.invoice()?.lines ?? []).reduce((sum, l) => {
      const n = Math.min(q[l.id] ?? 0, l.quantity - l.refundedQuantity);
      if (n <= 0) return sum;
      const net = n * l.unitPrice;
      return sum + net + (net * l.vatRate) / 100;
    }, 0);
  });

  ngOnInit(): void {
    const id = this.id() || location.pathname.split('/').pop() || '';
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.api.getInvoice(id).subscribe({
      next: (i) => {
        this.invoice.set(i);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.finance.getCashAccounts().subscribe((a) => this.cashAccounts.set(a));
  }

  protected openRefund(): void {
    this.refundQty.set({});
    this.refundNote.set('');
    this.cashRefund.set(true);
    this.refundCashId.set(this.cashAccounts()[0]?.id ?? '');
    this.refundOpen.set(true);
  }

  protected setQty(lineId: string, value: string): void {
    const line = this.invoice()?.lines.find((l) => l.id === lineId);
    const max = line ? line.quantity - line.refundedQuantity : 0;
    const n = Math.max(0, Math.min(+value || 0, max));
    this.refundQty.update((q) => ({ ...q, [lineId]: n }));
  }

  protected submitRefund(): void {
    const q = this.refundQty();
    const lines = Object.entries(q)
      .filter(([, n]) => n > 0)
      .map(([invoiceLineId, quantity]) => ({ invoiceLineId, quantity }));
    if (!lines.length) {
      this.toast.error('İade edilecek miktar girin.');
      return;
    }
    if (this.needsCash() && !this.refundCashId()) {
      this.toast.error('Geri ödeme kasası seçin.');
      return;
    }
    const inv = this.invoice();
    if (!inv) return;
    this.refunding.set(true);
    const body: RefundRequest = {
      lines,
      cashAccountId: this.needsCash() ? this.refundCashId() : null,
      note: this.refundNote() || null,
    };
    this.api.refundInvoice(inv.id, body).subscribe({
      next: (i) => {
        this.invoice.set(i);
        this.refunding.set(false);
        this.refundOpen.set(false);
        this.toast.success('İade işlendi; stok ve tutarlar güncellendi.');
      },
      error: (e) => {
        this.refunding.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** Faturayı PDF olarak indirir (backend QuestPDF ile üretir). Tarayıcıda blob → indirme. */
  protected downloadPdf(inv: InvoiceDto): void {
    this.downloading.set(true);
    this.api.downloadPdf(inv.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fatura-${inv.number}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        this.downloading.set(false);
      },
      error: async (e) => {
        this.downloading.set(false);
        this.toast.error(await blobError(e));
      },
    });
  }

  async voidInvoice(inv: InvoiceDto): Promise<void> {
    const ok = await this.confirm.confirm({
      message: `${inv.number} iptal edilecek. Stok, kasa ve cari etkileri geri alınacak. Devam edilsin mi?`,
      danger: true,
      confirmText: 'İptal Et',
    });
    if (!ok) return;
    this.voiding.set(true);
    this.api.voidInvoice(inv.id).subscribe({
      next: (i) => {
        this.invoice.set(i);
        this.voiding.set(false);
        this.toast.success(`${inv.number} iptal edildi; etkiler geri alındı.`);
      },
      error: (e) => {
        this.voiding.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
