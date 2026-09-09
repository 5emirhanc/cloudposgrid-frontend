import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { AppointmentsApi } from '../../core/api/appointments.api';
import { StockApi } from '../../core/api/stock.api';
import { FinanceApi } from '../../core/api/finance.api';
import { StaffApi } from '../../core/api/staff.api';
import { ContactsApi } from '../../core/api/contacts.api';
import { AppointmentDto, CashAccountDto, ContactDto, ProductDto, StaffDto } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError, money, wallClock } from '../../core/utils';

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Component({
  selector: 'app-appointments',
  imports: [LucideAngularModule, ModalComponent, PageHelpComponent],
  template: `
    <app-page-help key="appointments" title="Günlük randevularınızı planlayın, ücretini bu ekrandan tahsil edin">
      <li>"Yeni Randevu" ile müşteri, hizmet ve saati girin</li>
      <li>Gün oklarıyla veya takvimden istediğiniz güne geçin</li>
      <li>Randevuya tıklayıp "Tahsil et &amp; Tamamla" ile kasaya işleyin</li>
      <li>Detaydan randevuyu iptal edin ya da silin</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Randevular</h1>
        <p class="text-sm text-slate-500">Günlük randevu takvimi</p>
      </div>
      <button class="btn-primary" (click)="openNew()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Randevu
      </button>
    </div>

    <!-- Gün gezgini -->
    <div class="card mb-4 flex items-center justify-between p-3">
      <button class="btn-outline btn-sm" (click)="shiftDay(-1)">‹ Önceki</button>
      <div class="flex items-center gap-3">
        <input type="date" class="input" [value]="date()" (change)="setDate($any($event.target).value)" />
        <button class="btn-outline btn-sm" (click)="goToday()">Bugün</button>
      </div>
      <button class="btn-outline btn-sm" (click)="shiftDay(1)">Sonraki ›</button>
    </div>

    @if (pendingTotal() > 0) {
      <div class="card mb-4 flex items-center justify-between p-4">
        <span class="flex items-center gap-2 text-sm text-slate-600">
          <lucide-icon name="wallet" class="h-4 w-4 text-amber-500"></lucide-icon> Bu gün bekleyen ödeme
        </span>
        <span class="text-lg font-bold text-amber-600">{{ money(pendingTotal()) }}</span>
      </div>
    }

    <!-- Renk göstergesi -->
    <div class="mb-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
      <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-brand-200"></span> Planlandı</span>
      <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-emerald-200"></span> Geldi</span>
      <span class="flex items-center gap-1.5"><span class="h-3 w-3 rounded bg-slate-200"></span> İptal</span>
      <span class="ml-auto text-slate-400">Randevuya tıkla → tahsil / iptal / sil</span>
    </div>

    @if (staffEnabled() && staff().length > 1) {
      <div class="mb-3 flex flex-wrap items-center gap-1.5">
        <span class="mr-1 text-xs font-medium text-slate-400">Personel:</span>
        <button type="button" class="rounded-lg px-2.5 py-1 text-xs font-medium transition"
          [class]="calendarStaffId() === '' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
          (click)="calendarStaffId.set('')">Tümü</button>
        @for (s of staff(); track s.id) {
          <button type="button" class="rounded-lg px-2.5 py-1 text-xs font-medium transition"
            [class]="calendarStaffId() === s.id ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
            (click)="calendarStaffId.set(s.id)">
            {{ s.fullName }}
            @if (staffCounts().get(s.id); as n) { <span class="opacity-70">· {{ n }}</span> }
          </button>
        }
        @if (staffCounts().get('none'); as n) {
          <button type="button" class="rounded-lg px-2.5 py-1 text-xs font-medium transition"
            [class]="calendarStaffId() === 'none' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'"
            (click)="calendarStaffId.set('none')">Atanmadı · {{ n }}</button>
        }
      </div>
    }

    @if (loading()) {
      <div class="card h-96 animate-pulse"></div>
    } @else {
      <div class="card overflow-hidden p-0">
        <div class="flex">
          <!-- Saat cetveli -->
          <div class="w-14 shrink-0 border-r border-slate-100">
            @for (h of hours(); track h) {
              <div class="relative" [style.height.px]="hourHeight">
                <span class="absolute -top-2 right-2 text-[11px] font-medium text-slate-400">{{ pad(h) }}:00</span>
              </div>
            }
          </div>
          <!-- Zaman çizelgesi -->
          <div class="relative flex-1" [style.height.px]="hours().length * hourHeight + 12">
            @for (h of hours(); track h; let idx = $index) {
              <div class="absolute inset-x-0 border-t border-slate-50" [style.top.px]="idx * hourHeight + 8"></div>
            }
            @if (nowLine() !== null) {
              <div class="absolute inset-x-0 z-10" [style.top.px]="nowLine()! + 8">
                <div class="relative border-t-2 border-rose-400">
                  <span class="absolute -left-1 -top-[5px] h-2.5 w-2.5 rounded-full bg-rose-400"></span>
                </div>
              </div>
            }
            @if (!appts().length) {
              <div class="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Bu gün için randevu yok.</div>
            }
            @for (b of layout(); track b.a.id) {
              <button
                class="absolute z-[1] flex flex-col overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm transition hover:z-20 hover:shadow-md"
                [style.top.px]="b.top + 8"
                [style.height.px]="b.height"
                [style.left]="'calc(' + b.leftPct + '% + 4px)'"
                [style.width]="'calc(' + b.widthPct + '% - 8px)'"
                [class]="blockClass(b.a)"
                (click)="selected.set(b.a)"
              >
                <span class="text-[11px] font-bold leading-tight">{{ formatTime(b.a.startsAt) }} · {{ b.a.customerName }}</span>
                <span class="truncate text-[11px] leading-tight opacity-80">{{ b.a.serviceName || 'Hizmet' }}@if (staffName(b.a.staffId); as sn) { <span class="opacity-90"> · {{ sn }}</span> }</span>
              </button>
            }
          </div>
        </div>
      </div>
    }

    @if (newOpen()) {
      <app-modal title="Yeni Randevu" (dismiss)="newOpen.set(false)">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">
            <label class="label">Müşteri Adı *</label>
            <input class="input" [value]="customer()" (input)="customer.set($any($event.target).value)" />
          </div>
          @if (services().length) {
            <div class="col-span-2">
              <label class="label">Hizmet & Ürün <span class="text-slate-400">(birden fazla seçebilirsiniz, fiyat otomatik toplanır)</span></label>
              <div class="flex flex-wrap gap-2">
                @for (s of services(); track s.id) {
                  <button type="button"
                    class="rounded-full border px-3 py-1.5 text-sm transition"
                    [class]="selectedServices().includes(s.id) ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
                    (click)="toggleService(s)">
                    {{ s.name }} · {{ money(s.salePrice) }}
                  </button>
                }
              </div>
            </div>
          }
          <div>
            <label class="label">Müşteri Carisi <span class="text-xs font-normal text-slate-400">(opsiyonel)</span></label>
            <select class="select" [value]="contactId()" (change)="pickContact($any($event.target).value)">
              <option value="">— Cari bağlama —</option>
              @for (c of contacts(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
            </select>
            <p class="mt-1 text-xs text-slate-400">Bağlarsanız tahsilat bu cariye faturalanır: ekstre, indirim ve puan otomatik işler.</p>
          </div>
          <div>
            <label class="label">Telefon</label>
            <input class="input" [value]="phone()" (input)="phone.set($any($event.target).value)" />
          </div>
          <div>
            <label class="label">Hizmet (özet)</label>
            <input class="input" [value]="service()" (input)="service.set($any($event.target).value)" placeholder="Yukarıdan seçin ya da yazın" />
          </div>
          @if (staffEnabled() && staff().length) {
            <div>
              <label class="label">Personel</label>
              <select class="select" [value]="staffId()" (change)="staffId.set($any($event.target).value)">
                <option value="">— Atanmadı —</option>
                @for (s of staff(); track s.id) { <option [value]="s.id">{{ s.fullName }}</option> }
              </select>
            </div>
          }
          <div>
            <label class="label">Saat</label>
            <input type="time" class="input" [value]="time()" (input)="time.set($any($event.target).value)" />
          </div>
          <div>
            <label class="label">Süre (dk)</label>
            <input type="number" class="input" [value]="duration()" (input)="duration.set(+$any($event.target).value)" />
          </div>
          <div>
            <label class="label">Ücret (bekleyen ödeme)</label>
            <input type="number" step="0.01" class="input" [value]="price()" (input)="price.set(+$any($event.target).value)" />
          </div>
          <div>
            <label class="label">Not</label>
            <input class="input" [value]="note()" (input)="note.set($any($event.target).value)" />
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button class="btn-outline" (click)="newOpen.set(false)">İptal</button>
          <button class="btn-primary" [disabled]="busy()" (click)="create()">Kaydet</button>
        </div>
      </app-modal>
    }

    @if (collectFor(); as a) {
      <app-modal title="Tahsilat" (dismiss)="collectFor.set(null)">
        <div class="mb-4 rounded-xl bg-brand-50 px-4 py-4 text-center">
          <p class="text-sm text-brand-700">{{ a.customerName }} · {{ a.serviceName || 'Hizmet' }}</p>
          <p class="text-3xl font-black text-brand-700">{{ money(a.price) }}</p>
        </div>
        <label class="label">Kasa</label>
        <select class="select mb-3" [value]="collectCash()" (change)="collectCash.set($any($event.target).value)">
          @for (acc of accounts(); track acc.id) { <option [value]="acc.id">{{ acc.name }}</option> }
        </select>
        <label class="label">Ödeme Yöntemi</label>
        <div class="mb-4 grid grid-cols-3 gap-2">
          @for (m of methods; track m) {
            <button type="button" class="rounded-xl border px-3 py-2.5 text-sm font-medium transition"
              [class]="collectMethod() === m ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'"
              (click)="collectMethod.set(m)">{{ m === 'Cash' ? 'Nakit' : m === 'Card' ? 'Kart' : 'Havale' }}</button>
          }
        </div>
        <div class="flex justify-end gap-2">
          <button type="button" class="btn-outline" (click)="collectFor.set(null)">Vazgeç</button>
          <button type="button" class="btn-primary" [disabled]="busy() || !accounts().length" (click)="confirmCollect()">Tahsil Et &amp; Tamamla</button>
        </div>
      </app-modal>
    }

    @if (selected(); as a) {
      <app-modal [title]="a.customerName" (dismiss)="selected.set(null)">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Saat</dt><dd class="font-medium text-slate-800">{{ formatTime(a.startsAt) }} · {{ a.durationMinutes }} dk</dd></div>
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Hizmet</dt><dd class="font-medium text-slate-800">{{ a.serviceName || '—' }}</dd></div>
          @if (staffName(a.staffId); as sn) { <div class="flex justify-between gap-4"><dt class="text-slate-500">Personel</dt><dd class="font-medium text-slate-800">{{ sn }}</dd></div> }
          @if (a.contactName) { <div class="flex justify-between gap-4"><dt class="text-slate-500">Cari</dt><dd class="font-medium text-brand-600">{{ a.contactName }}</dd></div> }
          @if (a.phone) { <div class="flex justify-between gap-4"><dt class="text-slate-500">Telefon</dt><dd class="font-medium text-slate-800">{{ a.phone }}</dd></div> }
          <div class="flex justify-between gap-4"><dt class="text-slate-500">Ücret</dt>
            <dd class="font-bold" [class.text-emerald-600]="a.status === 'Done'" [class.text-amber-600]="a.status === 'Scheduled'" [class.text-slate-400]="a.status === 'Cancelled'">{{ money(a.price) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4"><dt class="text-slate-500">Durum</dt><dd>
            @switch (a.status) {
              @case ('Scheduled') { <span class="badge-blue">Planlandı</span> }
              @case ('Done') { <span class="badge-green">Geldi</span> }
              @case ('Cancelled') { <span class="badge-gray">İptal</span> }
            }
          </dd></div>
          @if (a.note) { <div class="rounded-xl bg-slate-50 px-3 py-2 text-slate-600">{{ a.note }}</div> }
        </dl>
        <div class="mt-5 flex flex-wrap justify-end gap-2">
          @if (a.status === 'Scheduled') {
            <button class="btn-primary" [disabled]="busy()" (click)="collectFromDetail(a)">
              <lucide-icon name="check" class="h-4 w-4"></lucide-icon> Tahsil et &amp; Tamamla
            </button>
            <button class="btn-outline" (click)="cancelFromDetail(a)">
              <lucide-icon name="x" class="h-4 w-4"></lucide-icon> İptal Et
            </button>
          }
          <button class="btn-outline text-rose-600" (click)="removeFromDetail(a)">
            <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon> Sil
          </button>
        </div>
      </app-modal>
    }
  `,
})
export class AppointmentsComponent implements OnInit {
  private api = inject(AppointmentsApi);
  private stockApi = inject(StockApi);
  private financeApi = inject(FinanceApi);
  private contactsApi = inject(ContactsApi);
  private staffApi = inject(StaffApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected money = money;

  protected loading = signal(true);
  protected busy = signal(false);
  protected appts = signal<AppointmentDto[]>([]);
  protected date = signal(localDate(new Date()));

  /** Bugünkü planlı (henüz gelmemiş) randevuların toplam bekleyen ödemesi. */
  protected pendingTotal = computed(() =>
    this.appts().filter((a) => a.status === 'Scheduled').reduce((s, a) => s + a.price, 0)
  );

  // ---- Takvim (gün-zaman çizelgesi) ----
  protected readonly hourHeight = 56;
  protected selected = signal<AppointmentDto | null>(null);
  protected pad = (h: number) => String(h).padStart(2, '0');

  /** Gösterilecek saat aralığı — randevulara göre genişler (varsayılan 09–20). */
  protected range = computed(() => {
    let start = 9;
    let end = 20;
    for (const a of this.appts()) {
      const s = wallClock(a.startsAt);
      const sh = s.getHours();
      const eh = Math.ceil((sh * 60 + s.getMinutes() + a.durationMinutes) / 60);
      if (sh < start) start = sh;
      if (eh > end) end = eh;
    }
    return { start: Math.max(0, start), end: Math.min(24, Math.max(end, start + 1)) };
  });

  protected hours = computed(() => {
    const { start, end } = this.range();
    return Array.from({ length: end - start }, (_, i) => start + i);
  });

  /** Takvim blokları: konum (top/height) + çakışanları yan yana koymak için kolon (left/width). */
  protected layout = computed(() => {
    const { start } = this.range();
    const H = this.hourHeight;
    const min = (iso: string) => {
      const d = wallClock(iso);
      return (d.getHours() - start) * 60 + d.getMinutes();
    };
    // Personel süzgeci yalnız GİRDİYİ daraltır — yerleşim algoritması aynı kalır (tek personelin
    // günü seçilince o kişinin randevuları çakışmadan tam genişlikte görünür).
    const f = this.calendarStaffId();
    const source = f ? this.appts().filter((a) => (f === 'none' ? !a.staffId : a.staffId === f)) : this.appts();
    const items = [...source].sort((a, b) => min(a.startsAt) - min(b.startsAt));

    const blocks: { a: AppointmentDto; top: number; height: number; leftPct: number; widthPct: number }[] = [];
    let i = 0;
    while (i < items.length) {
      const cluster = [items[i]];
      let clusterEnd = min(items[i].startsAt) + items[i].durationMinutes;
      let j = i + 1;
      while (j < items.length && min(items[j].startsAt) < clusterEnd) {
        clusterEnd = Math.max(clusterEnd, min(items[j].startsAt) + items[j].durationMinutes);
        cluster.push(items[j]);
        j++;
      }
      const laneEnds: number[] = [];
      const cols: number[] = [];
      for (const a of cluster) {
        const s = min(a.startsAt);
        const e = s + a.durationMinutes;
        let lane = laneEnds.findIndex((end) => end <= s);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(e);
        } else {
          laneEnds[lane] = e;
        }
        cols.push(lane);
      }
      const colCount = laneEnds.length || 1;
      cluster.forEach((a, k) => {
        const s = min(a.startsAt);
        blocks.push({
          a,
          top: (s / 60) * H,
          height: Math.max(24, (a.durationMinutes / 60) * H - 4),
          leftPct: (cols[k] / colCount) * 100,
          widthPct: 100 / colCount,
        });
      });
      i = j;
    }
    return blocks;
  });

  /** Bugünse "şu an" çizgisinin piksel konumu; değilse null. */
  protected nowLine = computed(() => {
    if (this.date() !== localDate(new Date())) return null;
    const { start, end } = this.range();
    const now = new Date();
    const m = (now.getHours() - start) * 60 + now.getMinutes();
    if (m < 0 || now.getHours() >= end) return null;
    return (m / 60) * this.hourHeight;
  });

  protected blockClass(a: AppointmentDto): string {
    switch (a.status) {
      case 'Done':
        return 'border-emerald-200 bg-emerald-50 text-emerald-800';
      case 'Cancelled':
        return 'border-slate-200 bg-slate-50 text-slate-400';
      default:
        return 'border-brand-200 bg-brand-50 text-brand-800';
    }
  }

  protected newOpen = signal(false);
  protected customer = signal('');
  protected phone = signal('');
  protected service = signal('');
  protected time = signal('10:00');
  protected duration = signal(30);
  protected price = signal(0);
  protected note = signal('');

  // Personel atama — yalnız Kurumsal pakette (staffManagement). Randevu belirli bir personele atanır.
  protected staff = signal<StaffDto[]>([]);
  protected staffId = signal('');
  protected staffEnabled = computed(() => this.auth.user()?.entitlements?.staffManagement ?? false);
  protected staffName = (id?: string): string =>
    id ? (this.staff().find((s) => s.id === id)?.fullName ?? '') : '';

  /** Tanımlı hizmetler (Hizmet & Ürün'den) — randevuda çoklu seçilebilir. */
  protected services = signal<ProductDto[]>([]);
  protected selectedServices = signal<string[]>([]);

  // Tahsilat
  protected accounts = signal<CashAccountDto[]>([]);
  protected collectFor = signal<AppointmentDto | null>(null);
  /** Takvim personel süzgeci: '' = herkes, 'none' = atanmamışlar, aksi halde personel Id'si. */
  protected calendarStaffId = signal('');
  /** Süzgeç şeridinde her personelin o günkü randevu sayısı. */
  protected staffCounts = computed(() => {
    const m = new Map<string, number>();
    for (const a of this.appts()) {
      const k = a.staffId ?? 'none';
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  });

  // Cari bağı — seçilirse tahsilat faturası o cariye kesilir (ekstre/bakiye/indirim/puan).
  protected contacts = signal<ContactDto[]>([]);
  protected contactId = signal('');

  /** Cari seçilince müşteri adı/telefonu boşsa cariden doldur — iki kez yazdırmayalım. */
  protected pickContact(id: string): void {
    this.contactId.set(id);
    const c = this.contacts().find((x) => x.id === id);
    if (!c) return;
    if (!this.customer().trim()) this.customer.set(c.name);
    if (!this.phone().trim() && c.phone) this.phone.set(c.phone);
  }

  protected collectCash = signal('');
  protected collectMethod = signal<'Cash' | 'Card' | 'Transfer'>('Cash');
  protected readonly methods: ('Cash' | 'Card' | 'Transfer')[] = ['Cash', 'Card', 'Transfer'];

  ngOnInit(): void {
    this.load();
    // Randevuya hizmet VE ürün (şampuan vb.) eklenebilir; hizmetler önce, ürünler sonra sıralanır.
    this.stockApi.getProducts({ pageSize: 200 }).subscribe((r) => {
      this.services.set([...r.items].sort((a, b) => Number(b.isService) - Number(a.isService)));
    });
    this.financeApi.getCashAccounts().subscribe((a) => this.accounts.set(a));
    this.contactsApi.getContacts({ pageSize: 500 }).subscribe((r) => this.contacts.set(r.items));
    // Personel listesi yalnız yetkili planda (Kurumsal) yüklenir — aksi halde StaffApi 403→/yukselt yönlendirir.
    if (this.staffEnabled()) {
      this.staffApi.list().subscribe({ next: (s) => this.staff.set(s.filter((u) => u.isActive)), error: () => {} });
    }
  }

  /** Hizmet seç/kaldır: seçilenlerden ad özetini ve toplam ücreti otomatik doldurur. */
  protected toggleService(p: ProductDto): void {
    const sel = this.selectedServices();
    const next = sel.includes(p.id) ? sel.filter((x) => x !== p.id) : [...sel, p.id];
    this.selectedServices.set(next);
    const chosen = this.services().filter((s) => next.includes(s.id));
    this.service.set(chosen.map((s) => s.name).join(' + '));
    this.price.set(Math.round(chosen.reduce((sum, s) => sum + s.salePrice, 0) * 100) / 100);
  }

  protected formatTime(iso: string): string {
    return wallClock(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  private load(): void {
    this.loading.set(true);
    const d = this.date();
    this.api.getRange(`${d}T00:00:00`, `${d}T23:59:59`).subscribe({
      next: (list) => {
        this.appts.set(list);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected setDate(v: string): void {
    if (v) {
      this.date.set(v);
      this.load();
    }
  }
  protected shiftDay(delta: number): void {
    const d = new Date(this.date() + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    this.date.set(localDate(d));
    this.load();
  }
  protected goToday(): void {
    this.date.set(localDate(new Date()));
    this.load();
  }

  protected openNew(): void {
    this.customer.set('');
    this.phone.set('');
    this.service.set('');
    this.time.set('10:00');
    this.duration.set(30);
    this.price.set(0);
    this.note.set('');
    this.staffId.set('');
    this.contactId.set('');
    this.selectedServices.set([]);
    this.newOpen.set(true);
  }

  protected create(): void {
    if (!this.customer().trim()) {
      this.toast.error('Müşteri adı girin.');
      return;
    }
    this.busy.set(true);
    this.api
      .create({
        customerName: this.customer().trim(),
        phone: this.phone().trim() || null,
        serviceName: this.service().trim() || null,
        startsAt: `${this.date()}T${this.time()}:00`,
        durationMinutes: this.duration(),
        price: this.price(),
        note: this.note().trim() || null,
        productIds: this.selectedServices().join(',') || null,
        staffId: this.staffId() || null,
        contactId: this.contactId() || null,
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.newOpen.set(false);
          this.toast.success('Randevu eklendi.');
          this.load();
        },
        error: (e) => {
          this.busy.set(false);
          this.toast.error(apiError(e));
        },
      });
  }

  protected setStatus(a: AppointmentDto, status: 'Done' | 'Cancelled'): void {
    this.api.setStatus(a.id, status).subscribe({
      next: (updated) => this.appts.update((list) => list.map((x) => (x.id === a.id ? updated : x))),
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected openCollect(a: AppointmentDto): void {
    if (a.price <= 0) {
      this.setStatus(a, 'Done'); // ücretsiz randevu: sadece tamamla
      return;
    }
    if (!this.accounts().length) {
      this.toast.error('Önce bir kasa ekleyin.');
      return;
    }
    this.collectCash.set(this.accounts()[0].id);
    this.collectMethod.set('Cash');
    this.collectFor.set(a);
  }

  protected confirmCollect(): void {
    const a = this.collectFor();
    if (!a) return;
    this.busy.set(true);
    this.api.collect(a.id, { cashAccountId: this.collectCash(), method: this.collectMethod() }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.collectFor.set(null);
        this.appts.update((list) => list.map((x) => (x.id === a.id ? updated : x)));
        this.toast.success('Tahsil edildi — satışa ve panele yansıdı.');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(a: AppointmentDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `${a.customerName} randevusu silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.delete(a.id).subscribe({
      next: () => this.appts.update((list) => list.filter((x) => x.id !== a.id)),
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  // ---- Detay modalı aksiyonları (takvim bloğuna tıklayınca) ----
  protected collectFromDetail(a: AppointmentDto): void {
    this.selected.set(null);
    this.openCollect(a);
  }
  protected cancelFromDetail(a: AppointmentDto): void {
    this.selected.set(null);
    this.setStatus(a, 'Cancelled');
  }
  protected removeFromDetail(a: AppointmentDto): void {
    this.selected.set(null);
    void this.remove(a);
  }
}
