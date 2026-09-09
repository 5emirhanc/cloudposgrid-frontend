import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin } from 'rxjs';
import { ContactsApi } from '../../core/api/contacts.api';
import { FinanceApi } from '../../core/api/finance.api';
import { InvoicesApi } from '../../core/api/invoices.api';
import { StockApi } from '../../core/api/stock.api';
import { AuthService } from '../../core/auth.service';
import { CashAccountDto, ContactDto, ProductDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { apiError, money } from '../../core/utils';

@Component({
  selector: 'app-invoice-form',
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="mb-6 flex items-center gap-3">
      <a routerLink="/faturalar" class="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><lucide-icon name="chevron-right" class="h-5 w-5 rotate-180"></lucide-icon></a>
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Yeni Fatura</h1>
        <p class="text-sm text-slate-500">Satış veya alış faturası oluşturun</p>
      </div>
    </div>

    <form [formGroup]="form" (ngSubmit)="submit()" class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <!-- Başlık -->
        <div class="card p-5">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label class="label">Fatura Tipi</label>
              <select class="select" formControlName="type">
                <option value="Sales">Satış</option>
                <option value="Purchase">Alış</option>
              </select>
            </div>
            <div>
              <label class="label">{{ term().customerSingular }}</label>
              <select class="select" formControlName="contactId">
                <option value="">{{ term().customerSingular }} seçilmedi</option>
                @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Tarih</label>
              <input type="date" class="input" formControlName="date" />
            </div>
            <div>
              <label class="label">Vade <span class="text-slate-400">(opsiyonel)</span></label>
              <input type="date" class="input" formControlName="dueDate" />
              <p class="mt-1 text-xs text-slate-400">Veresiye/açık hesap satışta ödeme vadesi — yaşlandırma buna göre.</p>
            </div>
          </div>
        </div>

        <!-- Satırlar -->
        <div class="card p-5">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-base font-bold text-slate-800">Kalemler</h3>
            <button type="button" class="btn-outline btn-sm" (click)="addLine()"><lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Satır</button>
          </div>

          <div class="space-y-3" formArrayName="lines">
            @for (line of lines.controls; track $index; let i = $index) {
              <div class="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-100 p-2" [formGroupName]="i">
                <div class="col-span-12 sm:col-span-5">
                  <label class="label text-xs">{{ term().productSingular }}</label>
                  <select class="select" formControlName="productId" (change)="onProduct(i)">
                    <option value="">Seçin</option>
                    @for (p of products(); track p.id) { <option [value]="p.id">{{ p.name }} ({{ p.currentStock }} {{ p.unit }})</option> }
                  </select>
                </div>
                <div class="col-span-4 sm:col-span-2">
                  <label class="label text-xs">Miktar</label>
                  <input type="number" step="0.01" class="input" formControlName="quantity" />
                </div>
                <div class="col-span-4 sm:col-span-2">
                  <label class="label text-xs">Fiyat</label>
                  <input type="number" step="0.01" class="input" formControlName="unitPrice" />
                </div>
                <div class="col-span-3 sm:col-span-2">
                  <label class="label text-xs">KDV %</label>
                  <input type="number" step="1" class="input" formControlName="vatRate" />
                </div>
                <div class="col-span-1 flex justify-end">
                  <button type="button" class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="removeLine(i)" [disabled]="lines.length === 1">
                    <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        <div class="card p-5">
          <label class="label">Not</label>
          <input class="input" formControlName="note" placeholder="Opsiyonel" />
        </div>
      </div>

      <!-- Özet -->
      <div class="space-y-6">
        <div class="card p-5">
          <h3 class="mb-4 text-base font-bold text-slate-800">Özet</h3>
          <dl class="space-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-slate-500">Ara Toplam</dt><dd class="font-medium text-slate-800">{{ money(totals().subtotal) }}</dd></div>
            <div class="flex justify-between"><dt class="text-slate-500">KDV</dt><dd class="font-medium text-slate-800">{{ money(totals().vat) }}</dd></div>
            <div class="mt-2 flex justify-between border-t border-slate-100 pt-3"><dt class="font-bold text-slate-800">Genel Toplam</dt><dd class="text-lg font-bold text-brand-600">{{ money(totals().grand) }}</dd></div>
          </dl>
        </div>

        <div class="card p-5">
          <label class="flex cursor-pointer items-center gap-2">
            <input type="checkbox" formControlName="withPayment" class="rounded text-brand-600" (change)="onTogglePayment()" />
            <span class="text-sm font-medium text-slate-700">Peşin tahsilat / ödeme</span>
          </label>

          @if (form.controls.withPayment.value) {
            <div class="mt-4 space-y-3" formGroupName="payment">
              <div>
                <label class="label">Kasa</label>
                <select class="select" formControlName="cashAccountId">
                  @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.name }}</option> }
                </select>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Tutar</label>
                  <input type="number" step="0.01" class="input" formControlName="amount" />
                </div>
                <div>
                  <label class="label">Yöntem</label>
                  <select class="select" formControlName="method">
                    <option value="Cash">Nakit</option>
                    <option value="Card">Kart</option>
                    <option value="Transfer">Havale</option>
                  </select>
                </div>
              </div>
            </div>
          }
        </div>

        <button type="submit" class="btn-primary w-full" [disabled]="saving()">
          {{ saving() ? 'Kaydediliyor...' : 'Faturayı Kes' }}
        </button>
      </div>
    </form>
  `,
})
export class InvoiceFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private invoicesApi = inject(InvoicesApi);
  private stockApi = inject(StockApi);
  private contactsApi = inject(ContactsApi);
  private financeApi = inject(FinanceApi);
  private toast = inject(ToastService);
  private router = inject(Router);
  private auth = inject(AuthService);

  protected money = money;
  protected term = computed(() => this.auth.profile().terminology);
  protected saving = signal(false);
  protected products = signal<ProductDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected accounts = signal<CashAccountDto[]>([]);
  protected totals = signal({ subtotal: 0, vat: 0, grand: 0 });

  protected form = this.fb.nonNullable.group({
    type: ['Sales'],
    contactId: [''],
    date: [new Date().toISOString().slice(0, 10)],
    dueDate: [''],
    note: [''],
    lines: this.fb.array([this.newLine()]),
    withPayment: [false],
    payment: this.fb.nonNullable.group({
      cashAccountId: [''],
      amount: [0],
      method: ['Cash'],
    }),
  });

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  ngOnInit(): void {
    forkJoin({
      products: this.stockApi.getProducts({ pageSize: 200 }),
      contacts: this.contactsApi.getContacts({ pageSize: 200 }),
      accounts: this.financeApi.getCashAccounts(),
    }).subscribe((r) => {
      this.products.set(r.products.items);
      this.contacts.set(r.contacts.items);
      this.accounts.set(r.accounts);
      if (r.accounts.length) this.form.controls.payment.controls.cashAccountId.setValue(r.accounts[0].id);
    });

    this.form.controls.lines.valueChanges.subscribe(() => this.recompute());
    this.recompute();
  }

  private newLine(): FormGroup {
    return this.fb.nonNullable.group({
      productId: ['', Validators.required],
      quantity: [1],
      unitPrice: [0],
      vatRate: [20],
    });
  }

  protected addLine(): void {
    this.lines.push(this.newLine());
  }
  protected removeLine(i: number): void {
    if (this.lines.length > 1) this.lines.removeAt(i);
    this.recompute();
  }

  protected onProduct(i: number): void {
    const group = this.lines.at(i);
    const product = this.products().find((p) => p.id === group.get('productId')!.value);
    if (product) {
      const isSales = this.form.controls.type.value === 'Sales';
      group.patchValue({ unitPrice: isSales ? product.salePrice : product.purchasePrice, vatRate: product.vatRate });
    }
  }

  private recompute(): void {
    let subtotal = 0;
    let vat = 0;
    for (const c of this.lines.controls) {
      const q = +c.get('quantity')!.value || 0;
      const up = +c.get('unitPrice')!.value || 0;
      const vr = +c.get('vatRate')!.value || 0;
      const lt = q * up;
      subtotal += lt;
      vat += (lt * vr) / 100;
    }
    subtotal = Math.round(subtotal * 100) / 100;
    vat = Math.round(vat * 100) / 100;
    const grand = subtotal + vat;
    this.totals.set({ subtotal, vat, grand });
    // Peşin tahsilat açıkken kalemler değişirse ödeme tutarını yeni toplama eşitle (yoksa bayat kalır →
    // eksik tahsilat sessizce kaydedilir). Kullanıcı sonradan kısmi tutar yazabilir; yalnız kalem
    // değişiminde tam toplama döner (güvenli varsayılan).
    if (this.form.controls.withPayment.value) {
      this.form.controls.payment.controls.amount.setValue(grand, { emitEvent: false });
    }
  }

  protected onTogglePayment(): void {
    if (this.form.controls.withPayment.value) {
      this.form.controls.payment.controls.amount.setValue(this.totals().grand);
    }
  }

  protected submit(): void {
    if (this.lines.invalid) {
      this.toast.error('Tüm satırlarda ürün seçin.');
      this.lines.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload = {
      type: v.type,
      contactId: v.contactId || null,
      date: v.date || null,
      dueDate: v.dueDate || null,
      note: v.note || null,
      lines: v.lines.map((l: any) => ({
        productId: l.productId,
        quantity: +l.quantity,
        unitPrice: +l.unitPrice,
        vatRate: +l.vatRate,
      })),
      payment: v.withPayment
        ? { cashAccountId: v.payment.cashAccountId, amount: +v.payment.amount, method: v.payment.method }
        : null,
    };

    if (payload.payment && (!payload.payment.cashAccountId || payload.payment.amount <= 0)) {
      this.toast.error('Ödeme için kasa ve tutar girin.');
      return;
    }

    this.saving.set(true);
    this.invoicesApi.createInvoice(payload).subscribe({
      next: (inv) => {
        this.saving.set(false);
        this.toast.success(`Fatura oluşturuldu: ${inv.number}`);
        this.router.navigate(['/faturalar', inv.id]);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
