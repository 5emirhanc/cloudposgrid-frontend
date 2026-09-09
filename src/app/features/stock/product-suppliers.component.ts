import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { ModalComponent } from '../../shared/modal.component';
import { ProductSuppliersApi } from '../../core/api/product-suppliers.api';
import { ContactsApi } from '../../core/api/contacts.api';
import { ToastService } from '../../core/toast.service';
import { ContactDto, ProductSupplierItem } from '../../core/models';
import { apiError } from '../../core/utils';

/** Düzenlenebilir satır (isPreferred + alım koşulları). supplierSku boş string; kayıtta null'a çevrilir. */
interface SupplierRow {
  contactId: string;
  supplierSku: string;
  lastPurchasePrice: number;
  leadTimeDays: number;
  minOrderQuantity: number;
  isPreferred: boolean;
}

/**
 * Tedarikçi Eşleme (#37): bir ürünün tedarik kaynaklarını ve alım koşullarını yönetir.
 * Kaydet, listenin tamamını PUT eder (replace-all) — satır silmek için sadece listeden çıkarıp kaydetmek yeter.
 */
@Component({
  selector: 'app-product-suppliers-modal',
  imports: [LucideAngularModule, ModalComponent],
  template: `
    <app-modal [title]="'Tedarikçi Eşleme' + (productName() ? ' · ' + productName() : '')" maxWidth="56rem" (dismiss)="close.emit()">
      @if (loading()) {
        <div class="h-40 animate-pulse rounded-xl bg-slate-100"></div>
      } @else {
        <div class="space-y-4">
          <p class="text-sm text-slate-500">
            Bu ürünün tedarik kaynaklarını ve alım koşullarını yönetin. Kaydettiğinizde liste olduğu gibi güncellenir.
          </p>

          @if (suppliers().length === 0) {
            <p class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Kayıtlı tedarikçi bulunamadı. Önce Cariler bölümünden "Tedarikçi" tipinde cari ekleyin.
            </p>
          }

          @if (rows().length) {
            <div class="overflow-x-auto rounded-xl border border-slate-200">
              <table class="w-full text-sm">
                <thead>
                  <tr>
                    <th class="table-th text-left">Tedarikçi</th>
                    <th class="table-th text-left">Tedarikçi Kodu</th>
                    <th class="table-th text-right">Son Alış ₺</th>
                    <th class="table-th text-right">Teslim (gün)</th>
                    <th class="table-th text-right">Min. Sipariş</th>
                    <th class="table-th text-center">Tercih</th>
                    <th class="table-th w-8"></th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  @for (r of rows(); track $index; let i = $index) {
                    <tr>
                      <td class="table-td min-w-[12rem]">
                        <select class="select" [value]="r.contactId" (change)="setContact(i, $any($event.target).value)">
                          <option value="">— Tedarikçi seçin —</option>
                          @for (s of suppliers(); track s.id) {
                            <option [value]="s.id" [disabled]="isUsed(s.id, i)">{{ s.name }}</option>
                          }
                        </select>
                      </td>
                      <td class="table-td">
                        <input class="input" [value]="r.supplierSku" (input)="setSku(i, $any($event.target).value)" placeholder="Ops." />
                      </td>
                      <td class="table-td">
                        <input type="number" step="0.01" min="0" class="input w-28 text-right" [value]="r.lastPurchasePrice"
                               (input)="setPrice(i, $any($event.target).value)" />
                      </td>
                      <td class="table-td">
                        <input type="number" step="1" min="0" class="input w-20 text-right" [value]="r.leadTimeDays"
                               (input)="setLead(i, $any($event.target).value)" />
                      </td>
                      <td class="table-td">
                        <input type="number" step="0.01" min="0" class="input w-24 text-right" [value]="r.minOrderQuantity"
                               (input)="setMoq(i, $any($event.target).value)" />
                      </td>
                      <td class="table-td text-center">
                        <input type="checkbox" class="rounded text-brand-600" [checked]="r.isPreferred"
                               (change)="setPreferred(i, $any($event.target).checked)" title="Tercih edilen tedarikçi" />
                      </td>
                      <td class="table-td">
                        <button type="button" class="text-rose-500 hover:text-rose-700" (click)="removeRow(i)" title="Kaldır">
                          <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <p class="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              Henüz tedarikçi eklenmedi.
            </p>
          }

          <button type="button" class="btn-outline" (click)="addRow()">
            <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Tedarikçi ekle
          </button>

          <div class="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" class="btn-outline" (click)="close.emit()">Vazgeç</button>
            <button type="button" class="btn-primary" [disabled]="saving()" (click)="save()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ saving() ? 'Kaydediliyor...' : 'Kaydet' }}
            </button>
          </div>
        </div>
      }
    </app-modal>
  `,
})
export class ProductSuppliersModalComponent implements OnInit {
  private api = inject(ProductSuppliersApi);
  private contacts = inject(ContactsApi);
  private toast = inject(ToastService);

  productId = input.required<string>();
  productName = input<string>('');
  close = output<void>();

  protected loading = signal(true);
  protected saving = signal(false);
  protected rows = signal<SupplierRow[]>([]);
  protected suppliers = signal<ContactDto[]>([]);

  ngOnInit(): void {
    // Tedarikçi listesi (dropdown) — Supplier veya Both tipindeki cariler.
    this.contacts.getContacts({ page: 1, pageSize: 500 }).subscribe({
      next: (r) => this.suppliers.set(r.items.filter((c) => c.type === 'Supplier' || c.type === 'Both')),
      error: () => this.suppliers.set([]),
    });
    // Mevcut eşlemeler.
    this.api.list(this.productId()).subscribe({
      next: (list) => {
        this.rows.set(
          list.map((s) => ({
            contactId: s.contactId,
            supplierSku: s.supplierSku ?? '',
            lastPurchasePrice: s.lastPurchasePrice,
            leadTimeDays: s.leadTimeDays,
            minOrderQuantity: s.minOrderQuantity,
            isPreferred: s.isPreferred,
          })),
        );
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** Aynı tedarikçi başka satırda seçiliyse dropdown'da devre dışı bırak (çift kayıt engeli). */
  protected isUsed(contactId: string, currentIndex: number): boolean {
    return this.rows().some((r, idx) => idx !== currentIndex && r.contactId === contactId);
  }

  protected addRow(): void {
    this.rows.update((rs) => [
      ...rs,
      { contactId: '', supplierSku: '', lastPurchasePrice: 0, leadTimeDays: 0, minOrderQuantity: 0, isPreferred: rs.length === 0 },
    ]);
  }

  protected removeRow(i: number): void {
    this.rows.update((rs) => rs.filter((_, idx) => idx !== i));
  }

  private patch(i: number, change: Partial<SupplierRow>): void {
    this.rows.update((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
  }

  protected setContact(i: number, value: string): void {
    this.patch(i, { contactId: value });
  }
  protected setSku(i: number, value: string): void {
    this.patch(i, { supplierSku: value });
  }
  protected setPrice(i: number, value: string): void {
    this.patch(i, { lastPurchasePrice: Math.max(0, +value || 0) });
  }
  protected setLead(i: number, value: string): void {
    this.patch(i, { leadTimeDays: Math.max(0, Math.round(+value || 0)) });
  }
  protected setMoq(i: number, value: string): void {
    this.patch(i, { minOrderQuantity: Math.max(0, +value || 0) });
  }
  protected setPreferred(i: number, checked: boolean): void {
    // Tercih edilen tek tedarikçi olur — işaretlenince diğerlerini otomatik kaldır.
    this.rows.update((rs) => rs.map((r, idx) => ({ ...r, isPreferred: idx === i ? checked : checked ? false : r.isPreferred })));
  }

  protected save(): void {
    const rows = this.rows().filter((r) => r.contactId);
    const items: ProductSupplierItem[] = rows.map((r) => ({
      contactId: r.contactId,
      supplierSku: r.supplierSku.trim() || null,
      lastPurchasePrice: r.lastPurchasePrice,
      leadTimeDays: r.leadTimeDays,
      minOrderQuantity: r.minOrderQuantity,
      isPreferred: r.isPreferred,
    }));
    this.saving.set(true);
    this.api.upsert(this.productId(), items).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Tedarikçiler kaydedildi.');
        this.close.emit();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
