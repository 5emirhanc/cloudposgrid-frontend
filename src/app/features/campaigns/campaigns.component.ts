import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { CampaignsApi } from '../../core/api/campaigns.api';
import { StockApi } from '../../core/api/stock.api';
import { CampaignDto, CampaignType, CategoryDto, ProductDto, SaveCampaignRequest } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError, formatDate } from '../../core/utils';

/** Düzenlenebilir form modeli (günler UI'da 7 boolean; kaydederken virgüllü maskeye çevrilir). */
interface CampaignForm {
  name: string;
  type: CampaignType;
  categoryId: string | null;
  productId: string | null;
  percent: number | null;
  buyQty: number | null;
  getQty: number | null;
  startDate: string | null; // yyyy-MM-dd
  endDate: string | null; // yyyy-MM-dd
  startHour: number | null;
  endHour: number | null;
  days: boolean[]; // 0=Pzt .. 6=Paz
  isActive: boolean;
}

/**
 * Kampanyalar ekranı — promosyon/indirim tanımı CRUD (#16).
 * 4 tür: Kategori %, Ürün %, Mutlu Saatler (happy hour), X Al Y Bedava.
 * Aktif/pasif geçişi ayrı uç olmadığından tam kayıt PUT edilerek yapılır.
 */
@Component({
  selector: 'app-campaigns',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Kampanyalar</h1>
        <p class="text-sm text-slate-500">İndirim ve promosyon tanımları — satışta otomatik uygulanır.</p>
      </div>
      <button class="btn-primary" (click)="openCreate()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Kampanya
      </button>
    </div>

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (!campaigns().length) {
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="megaphone" class="h-6 w-6"></lucide-icon>
          </span>
          <p class="text-sm font-medium text-slate-600">Henüz kampanya yok.</p>
          <p class="text-xs text-slate-400">Kategori/ürün indirimi, mutlu saatler veya "X al Y bedava" tanımlayın.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Kampanya</th>
                <th class="table-th">Tür</th>
                <th class="table-th">Kapsam</th>
                <th class="table-th text-center">Değer</th>
                <th class="table-th">Tarih / Saat</th>
                <th class="table-th text-center">Durum</th>
                <th class="table-th text-right">İşlemler</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (c of campaigns(); track c.id) {
                <tr class="hover:bg-slate-50/60" [class.opacity-60]="!c.isActive">
                  <td class="table-td font-medium text-slate-800">{{ c.name }}</td>
                  <td class="table-td">
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="typeClass(c.type)">
                      {{ typeLabel(c.type) }}
                    </span>
                  </td>
                  <td class="table-td text-slate-600">{{ scopeText(c) }}</td>
                  <td class="table-td text-center font-bold text-brand-600">{{ valueText(c) }}</td>
                  <td class="table-td text-xs text-slate-500">{{ scheduleText(c) }}</td>
                  <td class="table-td text-center">
                    @if (c.isActive) {
                      <span class="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">Aktif</span>
                    } @else {
                      <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">Pasif</span>
                    }
                  </td>
                  <td class="table-td">
                    <div class="flex items-center justify-end gap-2">
                      <button class="icon-btn" [title]="c.isActive ? 'Pasifleştir' : 'Aktifleştir'"
                              [disabled]="busyId() === c.id" (click)="toggleActive(c)">
                        <lucide-icon [name]="c.isActive ? 'toggle-right' : 'toggle-left'" class="h-4 w-4"></lucide-icon>
                      </button>
                      <button class="icon-btn" title="Düzenle" (click)="openEdit(c)">
                        <lucide-icon name="pencil" class="h-4 w-4"></lucide-icon>
                      </button>
                      <button class="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Sil" (click)="remove(c)">
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

    @if (formOpen()) {
      <div class="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" (click)="close()">
        <div class="card mt-10 w-full max-w-lg p-5" (click)="$event.stopPropagation()">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-black text-slate-900">{{ editing() ? 'Kampanyayı Düzenle' : 'Yeni Kampanya' }}</h2>
            <button class="icon-btn" (click)="close()"><lucide-icon name="x" class="h-4 w-4"></lucide-icon></button>
          </div>

          <div class="grid gap-3">
            <div>
              <label class="label">Kampanya Adı</label>
              <input class="input" [(ngModel)]="form.name" placeholder="Örn. Hafta Sonu Kahve %20" />
            </div>

            <div>
              <label class="label">Tür</label>
              <select class="input" [(ngModel)]="form.type" (ngModelChange)="onTypeChange()">
                @for (t of types; track t) {
                  <option [value]="t">{{ typeLabel(t) }}</option>
                }
              </select>
            </div>

            @if (form.type === 'category_percent') {
              <div>
                <label class="label">Kategori</label>
                <select class="input" [(ngModel)]="form.categoryId">
                  <option [ngValue]="null" disabled>Kategori seçin…</option>
                  @for (cat of categories(); track cat.id) {
                    <option [ngValue]="cat.id">{{ cat.name }}</option>
                  }
                </select>
              </div>
            }

            @if (form.type === 'product_percent' || form.type === 'buy_x_get_y') {
              <div>
                <label class="label">Ürün</label>
                <select class="input" [(ngModel)]="form.productId">
                  <option [ngValue]="null" disabled>Ürün seçin…</option>
                  @for (p of products(); track p.id) {
                    <option [ngValue]="p.id">{{ p.name }}</option>
                  }
                </select>
              </div>
            }

            @if (form.type === 'category_percent' || form.type === 'product_percent' || form.type === 'happy_hour') {
              <div>
                <label class="label">İndirim Yüzdesi (%)</label>
                <input class="input" type="number" min="1" max="100" [(ngModel)]="form.percent" placeholder="Örn. 20" />
              </div>
            }

            @if (form.type === 'buy_x_get_y') {
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Alınan Adet</label>
                  <input class="input" type="number" min="1" [(ngModel)]="form.buyQty" placeholder="Örn. 3" />
                </div>
                <div>
                  <label class="label">Bedava Adet</label>
                  <input class="input" type="number" min="1" [(ngModel)]="form.getQty" placeholder="Örn. 1" />
                </div>
              </div>
              <p class="-mt-1 text-xs text-slate-400">Örn. 3 al 1 bedava: her 4 üründe 1'i ücretsiz.</p>
            }

            @if (form.type === 'happy_hour') {
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="label">Başlangıç Saati</label>
                  <input class="input" type="number" min="0" max="23" [(ngModel)]="form.startHour" placeholder="0-23" />
                </div>
                <div>
                  <label class="label">Bitiş Saati</label>
                  <input class="input" type="number" min="0" max="23" [(ngModel)]="form.endHour" placeholder="0-23" />
                </div>
              </div>
              <div>
                <label class="label">Günler <span class="text-slate-400">(boş = her gün)</span></label>
                <div class="flex flex-wrap gap-2">
                  @for (d of dayLabels; track $index) {
                    <button type="button"
                            class="rounded-full border px-3 py-1.5 text-sm transition"
                            [class]="form.days[$index] ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                            (click)="form.days[$index] = !form.days[$index]">{{ d }}</button>
                  }
                </div>
              </div>
            }

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Başlangıç Tarihi <span class="text-slate-400">(ops.)</span></label>
                <input class="input" type="date" [(ngModel)]="form.startDate" />
              </div>
              <div>
                <label class="label">Bitiş Tarihi <span class="text-slate-400">(ops.)</span></label>
                <input class="input" type="date" [(ngModel)]="form.endDate" />
              </div>
            </div>

            <label class="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600" [(ngModel)]="form.isActive" />
              Aktif (satışta uygulansın)
            </label>
          </div>

          <div class="mt-5 flex items-center justify-end gap-2">
            <button class="btn-ghost" (click)="close()">Vazgeç</button>
            <button class="btn-primary" [disabled]="saving()" (click)="save()">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> {{ editing() ? 'Kaydet' : 'Oluştur' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `.icon-btn { border-radius:.5rem; padding:.5rem; color:#94a3b8; }
     .icon-btn:hover { background:#f1f5f9; color:#334155; }
     .icon-btn:disabled { opacity:.5; cursor:not-allowed; }`,
  ],
})
export class CampaignsComponent implements OnInit {
  private api = inject(CampaignsApi);
  private stockApi = inject(StockApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected readonly types: CampaignType[] = ['category_percent', 'product_percent', 'happy_hour', 'buy_x_get_y'];
  protected readonly dayLabels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  protected loading = signal(true);
  protected saving = signal(false);
  protected busyId = signal<string | null>(null);
  protected campaigns = signal<CampaignDto[]>([]);
  protected categories = signal<CategoryDto[]>([]);
  protected products = signal<ProductDto[]>([]);
  protected formOpen = signal(false);
  protected editing = signal<CampaignDto | null>(null);

  /** Ad lookup'ları (tablo kapsam sütunu için). */
  private catName = computed(() => new Map(this.categories().map((c) => [c.id, c.name])));
  private prodName = computed(() => new Map(this.products().map((p) => [p.id, p.name])));

  protected form: CampaignForm = this.blank();

  ngOnInit(): void {
    this.load();
    this.stockApi.getCategories().subscribe({ next: (c) => this.categories.set(c ?? []), error: () => {} });
    this.stockApi.getProducts({ pageSize: 500, isActive: true }).subscribe({
      next: (r) => this.products.set(r?.items ?? []),
      error: () => {},
    });
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (list) => { this.campaigns.set(list ?? []); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.error(apiError(e)); },
    });
  }

  // --- Etiketler / gösterim ---
  protected typeLabel(t: CampaignType | string): string {
    switch (t) {
      case 'category_percent': return 'Kategori %';
      case 'product_percent': return 'Ürün %';
      case 'happy_hour': return 'Mutlu Saatler';
      case 'buy_x_get_y': return 'X Al Y Bedava';
      default: return t;
    }
  }

  protected typeClass(t: CampaignType | string): string {
    switch (t) {
      case 'category_percent': return 'bg-violet-100 text-violet-700';
      case 'product_percent': return 'bg-sky-100 text-sky-700';
      case 'happy_hour': return 'bg-amber-100 text-amber-700';
      case 'buy_x_get_y': return 'bg-emerald-100 text-emerald-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  }

  protected scopeText(c: CampaignDto): string {
    if (c.categoryId) return this.catName().get(c.categoryId) ?? 'Kategori';
    if (c.productId) return this.prodName().get(c.productId) ?? 'Ürün';
    return 'Tüm sepet';
  }

  protected valueText(c: CampaignDto): string {
    if (c.type === 'buy_x_get_y') return `${c.buyQty ?? 0} al ${c.getQty ?? 0} bedava`;
    return c.percent != null ? `%${c.percent}` : '—';
  }

  protected scheduleText(c: CampaignDto): string {
    const parts: string[] = [];
    if (c.startDate || c.endDate) {
      const s = c.startDate ? formatDate(c.startDate) : '…';
      const e = c.endDate ? formatDate(c.endDate) : '…';
      parts.push(`${s} – ${e}`);
    }
    if (c.type === 'happy_hour' && c.startHour != null && c.endHour != null) {
      parts.push(`${this.pad(c.startHour)}:00–${this.pad(c.endHour)}:00`);
      if (c.daysMask) parts.push(this.daysText(c.daysMask));
    }
    return parts.length ? parts.join(' · ') : 'Süresiz';
  }

  private daysText(mask: string): string {
    return mask
      .split(',')
      .map((x) => this.dayLabels[Number(x.trim())])
      .filter(Boolean)
      .join(', ');
  }

  private pad(n: number): string { return n < 10 ? `0${n}` : String(n); }

  // --- Form aç/kapat ---
  private blank(): CampaignForm {
    return {
      name: '', type: 'category_percent', categoryId: null, productId: null,
      percent: null, buyQty: null, getQty: null, startDate: null, endDate: null,
      startHour: null, endHour: null, days: [false, false, false, false, false, false, false], isActive: true,
    };
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.form = this.blank();
    this.formOpen.set(true);
  }

  protected openEdit(c: CampaignDto): void {
    this.editing.set(c);
    const days = [false, false, false, false, false, false, false];
    if (c.daysMask) for (const x of c.daysMask.split(',')) {
      const i = Number(x.trim());
      if (i >= 0 && i <= 6) days[i] = true;
    }
    this.form = {
      name: c.name,
      type: c.type as CampaignType,
      categoryId: c.categoryId ?? null,
      productId: c.productId ?? null,
      percent: c.percent ?? null,
      buyQty: c.buyQty ?? null,
      getQty: c.getQty ?? null,
      startDate: c.startDate ? c.startDate.substring(0, 10) : null,
      endDate: c.endDate ? c.endDate.substring(0, 10) : null,
      startHour: c.startHour ?? null,
      endHour: c.endHour ?? null,
      days,
      isActive: c.isActive,
    };
    this.formOpen.set(true);
  }

  protected onTypeChange(): void {
    // Türe uymayan alanları temizle (yanlışlıkla dolu kalması validasyonu bozmasın).
    if (this.form.type !== 'category_percent') this.form.categoryId = null;
    if (this.form.type !== 'product_percent' && this.form.type !== 'buy_x_get_y') this.form.productId = null;
    if (this.form.type === 'buy_x_get_y') this.form.percent = null;
    else { this.form.buyQty = null; this.form.getQty = null; }
    if (this.form.type !== 'happy_hour') {
      this.form.startHour = null; this.form.endHour = null;
      this.form.days = [false, false, false, false, false, false, false];
    }
  }

  protected close(): void { this.formOpen.set(false); }

  // --- Kaydet ---
  private buildRequest(f: CampaignForm): SaveCampaignRequest {
    const mask = f.days.map((on, i) => (on ? i : -1)).filter((i) => i >= 0).join(',');
    return {
      name: f.name.trim(),
      type: f.type,
      categoryId: f.type === 'category_percent' ? f.categoryId : null,
      productId: f.type === 'product_percent' || f.type === 'buy_x_get_y' ? f.productId : null,
      percent: f.type === 'buy_x_get_y' ? null : f.percent != null ? Number(f.percent) : null,
      buyQty: f.type === 'buy_x_get_y' && f.buyQty != null ? Number(f.buyQty) : null,
      getQty: f.type === 'buy_x_get_y' && f.getQty != null ? Number(f.getQty) : null,
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      startHour: f.type === 'happy_hour' && f.startHour != null ? Number(f.startHour) : null,
      endHour: f.type === 'happy_hour' && f.endHour != null ? Number(f.endHour) : null,
      daysMask: f.type === 'happy_hour' && mask ? mask : null,
      isActive: f.isActive,
    };
  }

  /** Sunucuya gitmeden hızlı doğrulama (backend de doğrular). */
  private validate(f: CampaignForm): string | null {
    if (!f.name.trim()) return 'Kampanya adı boş olamaz.';
    if ((f.type === 'category_percent' || f.type === 'product_percent' || f.type === 'happy_hour') && !(Number(f.percent) > 0))
      return 'Bu tür için geçerli bir yüzde girin.';
    if (f.type === 'category_percent' && !f.categoryId) return 'Kategori kampanyası için kategori seçin.';
    if (f.type === 'product_percent' && !f.productId) return 'Ürün kampanyası için ürün seçin.';
    if (f.type === 'buy_x_get_y' && (!f.productId || !(Number(f.buyQty) > 0) || !(Number(f.getQty) > 0)))
      return "'X al Y bedava' için ürün ve al/bedava adetlerini girin.";
    return null;
  }

  protected save(): void {
    const err = this.validate(this.form);
    if (err) { this.toast.error(err); return; }
    const body = this.buildRequest(this.form);
    this.saving.set(true);
    const editing = this.editing();
    const req$ = editing ? this.api.update(editing.id, body) : this.api.create(body);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(editing ? 'Kampanya güncellendi.' : 'Kampanya oluşturuldu.');
        this.load();
      },
      error: (e) => { this.saving.set(false); this.toast.error(apiError(e)); },
    });
  }

  // --- Aktif/pasif geçişi (ayrı uç yok; tam kayıt PUT edilir) ---
  protected toggleActive(c: CampaignDto): void {
    this.busyId.set(c.id);
    const body: SaveCampaignRequest = {
      name: c.name, type: c.type, categoryId: c.categoryId ?? null, productId: c.productId ?? null,
      percent: c.percent ?? null, buyQty: c.buyQty ?? null, getQty: c.getQty ?? null,
      startDate: c.startDate ?? null, endDate: c.endDate ?? null,
      startHour: c.startHour ?? null, endHour: c.endHour ?? null, daysMask: c.daysMask ?? null,
      isActive: !c.isActive,
    };
    this.api.update(c.id, body).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(c.isActive ? 'Kampanya pasifleştirildi.' : 'Kampanya aktifleştirildi.');
        this.load();
      },
      error: (e) => { this.busyId.set(null); this.toast.error(apiError(e)); },
    });
  }

  protected async remove(c: CampaignDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${c.name}" kampanyası silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.delete(c.id).subscribe({
      next: () => { this.toast.success('Kampanya silindi.'); this.load(); },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
