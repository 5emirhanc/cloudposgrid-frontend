import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { WarrantiesApi } from '../../core/api/warranties.api';
import { ContactsApi } from '../../core/api/contacts.api';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ContactDto, CreateWarrantyRecordRequest, WarrantyRecordDto } from '../../core/models';
import { apiError, formatDate } from '../../core/utils';

interface WarrantyForm {
  customerName: string;
  productName: string;
  serialNo: string;
  purchaseDate: string;
  warrantyMonths: number | null;
  note: string;
  contactId: string;
}

/**
 * Garanti Kayıtları: satılan ürünlerin garanti takibi. Kayıt oluşturma/düzenleme/silme,
 * süresi dolan/yakında dolacak kayıtların renkli rozetlerle vurgulanması.
 */
@Component({
  selector: 'app-warranties',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Garanti Kayıtları</h1>
        <p class="text-sm text-slate-500">Satılan ürünlerin garanti sürelerini takip edin.</p>
      </div>
      <button class="btn-primary" (click)="openCreate()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Garanti Kaydı
      </button>
    </div>

    @if (formOpen()) {
      <div class="card mb-4 p-4">
        <h2 class="mb-3 font-semibold text-slate-700">{{ editing() ? 'Garanti Kaydını Düzenle' : 'Yeni Garanti Kaydı' }}</h2>
        <form (ngSubmit)="save()" class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label">Müşteri Adı <span class="text-rose-500">*</span></label>
            <input class="input" name="customerName" [(ngModel)]="form.customerName" placeholder="Müşteri adı" required />
          </div>
          <div>
            <label class="label">Bağlı Cari <span class="text-slate-400">(opsiyonel)</span></label>
            <select class="input" name="contactId" [(ngModel)]="form.contactId" (ngModelChange)="onContactChange($event)">
              <option value="">— Cari seçilmedi —</option>
              @for (c of contacts(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="label">Ürün Adı <span class="text-rose-500">*</span></label>
            <input class="input" name="productName" [(ngModel)]="form.productName" placeholder="Ürün adı" required />
          </div>
          <div>
            <label class="label">Seri No <span class="text-slate-400">(opsiyonel)</span></label>
            <input class="input" name="serialNo" [(ngModel)]="form.serialNo" placeholder="Seri numarası" />
          </div>
          <div>
            <label class="label">Satın Alma Tarihi <span class="text-rose-500">*</span></label>
            <input class="input" type="date" name="purchaseDate" [(ngModel)]="form.purchaseDate" required />
          </div>
          <div>
            <label class="label">Garanti Süresi (ay) <span class="text-rose-500">*</span></label>
            <input class="input" type="number" min="1" name="warrantyMonths" [(ngModel)]="form.warrantyMonths" placeholder="Örn. 24" required />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Not <span class="text-slate-400">(opsiyonel)</span></label>
            <input class="input" name="note" [(ngModel)]="form.note" placeholder="Arıza/servis açıklaması vb." />
          </div>
          <div class="flex items-end gap-2 sm:col-span-2">
            <button class="btn-primary" [disabled]="saving()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ editing() ? 'Kaydet' : 'Ekle' }}
            </button>
            <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button>
          </div>
        </form>
      </div>
    }

    <div class="mb-3 flex items-center gap-2">
      <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" [(ngModel)]="includeExpired" (ngModelChange)="load()" />
        Süresi dolanları da göster
      </label>
    </div>

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (!records().length) {
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="shield-check" class="h-6 w-6"></lucide-icon>
          </span>
          <p class="text-sm font-medium text-slate-600">Henüz garanti kaydı yok.</p>
          <p class="text-xs text-slate-400">Sattığınız ürünlerin garantisini buradan takip edin.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Ürün / Seri No</th>
                <th class="table-th">Müşteri</th>
                <th class="table-th text-center">Satın Alma</th>
                <th class="table-th text-center">Süre</th>
                <th class="table-th text-center">Bitiş</th>
                <th class="table-th text-center">Durum</th>
                <th class="table-th text-right">İşlem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (r of records(); track r.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td">
                    <span class="block font-medium text-slate-800">{{ r.productName }}</span>
                    @if (r.serialNo) { <span class="block text-xs text-slate-400">SN: {{ r.serialNo }}</span> }
                    @if (r.note) { <span class="block text-xs text-slate-400">{{ r.note }}</span> }
                  </td>
                  <td class="table-td">
                    <span class="block text-slate-700">{{ r.customerName }}</span>
                    @if (r.contactName) {
                      <span class="mt-0.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        <lucide-icon name="link" class="h-3 w-3"></lucide-icon> {{ r.contactName }}
                      </span>
                    }
                  </td>
                  <td class="table-td text-center text-slate-600">{{ formatDate(r.purchaseDate) }}</td>
                  <td class="table-td text-center text-slate-600">{{ r.warrantyMonths }} ay</td>
                  <td class="table-td text-center text-slate-600">{{ formatDate(r.expiryDate) }}</td>
                  <td class="table-td text-center">
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="statusClass(r)">{{ statusLabel(r) }}</span>
                  </td>
                  <td class="table-td text-right">
                    <div class="inline-flex gap-1">
                      <button class="icon-btn" title="Düzenle" (click)="openEdit(r)">
                        <lucide-icon name="pencil" class="h-4 w-4"></lucide-icon>
                      </button>
                      <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(r)">
                        <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `.icon-btn { border-radius:.5rem; padding:.5rem; color:#94a3b8; }
     .icon-btn:hover { background:#f1f5f9; color:#334155; }`,
  ],
})
export class WarrantiesComponent implements OnInit {
  private api = inject(WarrantiesApi);
  private contactsApi = inject(ContactsApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  protected formatDate = formatDate;

  protected loading = signal(true);
  protected saving = signal(false);
  protected records = signal<WarrantyRecordDto[]>([]);
  protected contacts = signal<ContactDto[]>([]);
  protected includeExpired = false;
  protected formOpen = signal(false);
  protected editing = signal<WarrantyRecordDto | null>(null);

  protected form: WarrantyForm = this.emptyForm();

  ngOnInit(): void {
    this.load();
    this.contactsApi.getContacts({ pageSize: 500 }).subscribe({
      next: (r) => this.contacts.set(r?.items ?? []),
      error: () => {},
    });
  }

  protected load(): void {
    this.loading.set(true);
    this.api.list(this.includeExpired).subscribe({
      next: (r) => { this.records.set(r ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.error(apiError(e)); },
    });
  }

  /** Kalan gün sayısı (negatifse süresi dolmuş). */
  private daysLeft(r: WarrantyRecordDto): number {
    const ms = new Date(r.expiryDate).getTime() - Date.now();
    return Math.ceil(ms / 86_400_000);
  }

  protected statusClass(r: WarrantyRecordDto): string {
    if (r.isExpired) return 'bg-rose-100 text-rose-700';
    return this.daysLeft(r) <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
  }

  protected statusLabel(r: WarrantyRecordDto): string {
    if (r.isExpired) return 'Süresi Doldu';
    const d = this.daysLeft(r);
    return d <= 30 ? `Yakında Dolacak (${d} gün)` : 'Aktif';
  }

  protected onContactChange(id: string): void {
    // Cari seçildiğinde müşteri adı boşsa cari adıyla doldur (kolaylık).
    if (!id || this.form.customerName.trim()) return;
    const c = this.contacts().find((x) => x.id === id);
    if (c) this.form.customerName = c.name;
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form = this.emptyForm();
    this.formOpen.set(true);
  }

  protected openEdit(r: WarrantyRecordDto): void {
    this.editing.set(r);
    this.form = {
      customerName: r.customerName,
      productName: r.productName,
      serialNo: r.serialNo ?? '',
      purchaseDate: r.purchaseDate.slice(0, 10),
      warrantyMonths: r.warrantyMonths,
      note: r.note ?? '',
      contactId: r.contactId ?? '',
    };
    this.formOpen.set(true);
  }

  protected save(): void {
    const f = this.form;
    if (!f.customerName.trim() || !f.productName.trim() || !f.purchaseDate || !f.warrantyMonths || f.warrantyMonths <= 0) {
      this.toast.error('Müşteri adı, ürün adı, satın alma tarihi ve garanti süresi (ay) zorunludur.');
      return;
    }
    const body: CreateWarrantyRecordRequest = {
      customerName: f.customerName.trim(),
      productName: f.productName.trim(),
      purchaseDate: f.purchaseDate,
      warrantyMonths: f.warrantyMonths,
      serialNo: f.serialNo.trim() || null,
      note: f.note.trim() || null,
      contactId: f.contactId || null,
    };
    this.saving.set(true);
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, body) : this.api.create(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(editing ? 'Garanti kaydı güncellendi.' : 'Garanti kaydı eklendi.');
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected async remove(r: WarrantyRecordDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${r.productName}" garanti kaydı silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.remove(r.id).subscribe({
      next: () => { this.toast.success('Garanti kaydı silindi.'); this.load(); },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  private emptyForm(): WarrantyForm {
    return { customerName: '', productName: '', serialNo: '', purchaseDate: '', warrantyMonths: null, note: '', contactId: '' };
  }
}
