import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AutomationRulesApi } from '../../core/api/automation-rules.api';
import { AutomationRuleDto, AutomationTemplate } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError, formatDate } from '../../core/utils';

interface Meta {
  label: string;
  icon: string;
  cls: string;
}

/**
 * Otomasyon Kuralları ekranı — "eğer bu olursa şunu yap" (if-this-then-that) tanımları.
 * Kuralları listeler, oluşturur/düzenler/siler, etkin-pasif yapar. Hazır şablonlarla tek tıkla
 * kural kurmayı destekler. (Kurallar arka planda periyodik (varsayılan 60 dk) değerlendirilir; eşleşince bildirim/SMS/e-posta gider.)
 */
@Component({
  selector: 'app-automation-rules',
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Otomasyon Kuralları</h1>
        <p class="text-sm text-slate-500">
          "Eğer bu olursa şunu yap" kuralları — düşük stok, geciken alacak ve daha fazlası için otomatik aksiyon.
          Etkin kurallar arka planda düzenli aralıklarla (varsayılan saatte bir) kontrol edilir; eşleşen her durum
          için <b>aynı gün tek kez</b> bildirim düşer, seçtiyseniz SMS/e-posta da gider.
        </p>
      </div>
      <button class="btn-primary" (click)="openCreate()">
        <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni Kural
      </button>
    </div>

    <!-- Hazır şablonlar -->
    @if (templates().length) {
      <div class="mb-6">
        <p class="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Hazır Şablonlar</p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (t of templates(); track t.name) {
            <button
              class="card flex flex-col gap-2 p-4 text-left transition hover:border-brand-300 hover:shadow-sm"
              (click)="openFromTemplate(t)">
              <div class="flex items-center gap-2">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg" [class]="trigMeta(t.triggerType).cls">
                  <lucide-icon [name]="trigMeta(t.triggerType).icon" class="h-4 w-4"></lucide-icon>
                </span>
                <span class="font-semibold text-slate-800">{{ t.name }}</span>
              </div>
              <p class="text-xs text-slate-500">{{ t.description }}</p>
              <div class="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{{ trigMeta(t.triggerType).label }}</span>
                <lucide-icon name="arrow-right" class="h-3 w-3"></lucide-icon>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{{ actMeta(t.actionType).label }}</span>
              </div>
            </button>
          }
        </div>
      </div>
    }

    <!-- Kural listesi -->
    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor…</p>
      } @else if (!rules().length) {
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <lucide-icon name="workflow" class="h-6 w-6"></lucide-icon>
          </span>
          <p class="text-sm font-medium text-slate-600">Henüz otomasyon kuralı yok.</p>
          <p class="text-xs text-slate-400">Yukarıdaki şablonlardan biriyle ya da "Yeni Kural" ile başlayın.</p>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="border-b border-slate-100">
              <tr>
                <th class="table-th">Kural</th>
                <th class="table-th">Tetikleyici</th>
                <th class="table-th">Eylem</th>
                <th class="table-th text-center">Durum</th>
                <th class="table-th">Oluşturma</th>
                <th class="table-th text-right">İşlem</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              @for (r of rules(); track r.id) {
                <tr class="hover:bg-slate-50/60" [class.opacity-60]="!r.isActive">
                  <td class="table-td font-medium text-slate-800">{{ r.name }}</td>
                  <td class="table-td">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold" [class]="trigMeta(r.triggerType).cls">
                      <lucide-icon [name]="trigMeta(r.triggerType).icon" class="h-3.5 w-3.5"></lucide-icon>
                      {{ trigMeta(r.triggerType).label }}
                    </span>
                  </td>
                  <td class="table-td">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold" [class]="actMeta(r.actionType).cls">
                      <lucide-icon [name]="actMeta(r.actionType).icon" class="h-3.5 w-3.5"></lucide-icon>
                      {{ actMeta(r.actionType).label }}
                    </span>
                  </td>
                  <td class="table-td text-center">
                    <button
                      class="rounded-full px-2 py-0.5 text-xs font-bold transition"
                      [class]="r.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'"
                      [disabled]="busyId() === r.id"
                      title="Etkin/pasif değiştir"
                      (click)="toggle(r)">
                      {{ r.isActive ? 'Etkin' : 'Pasif' }}
                    </button>
                  </td>
                  <td class="table-td text-slate-500">{{ formatDate(r.createdAt) }}</td>
                  <td class="table-td">
                    <div class="flex items-center justify-end gap-1">
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

    <!-- Oluştur/Düzenle modalı -->
    @if (formOpen()) {
      <div class="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" (click)="formOpen.set(false)">
        <div class="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" (click)="$event.stopPropagation()">
          <h2 class="mb-4 text-lg font-black text-slate-900">{{ editing() ? 'Kuralı Düzenle' : 'Yeni Kural' }}</h2>

          <div class="grid gap-4">
            <div>
              <label class="label">Kural Adı</label>
              <input class="input" [(ngModel)]="draft.name" placeholder="Örn. Düşük Stok Uyarısı" />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label">Tetikleyici (Eğer…)</label>
                <select class="input" [(ngModel)]="draft.triggerType">
                  @for (t of triggerTypes; track t) {
                    <option [value]="t">{{ trigMeta(t).label }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="label">Eylem (Şunu yap)</label>
                <select class="input" [(ngModel)]="draft.actionType">
                  @for (a of actionTypes; track a) {
                    <option [value]="a">{{ actMeta(a).label }}</option>
                  }
                </select>
              </div>
            </div>

            <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" class="h-4 w-4 rounded border-slate-300 text-brand-600" [(ngModel)]="draft.isActive" />
              Kural etkin olsun
            </label>

            <button type="button" class="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700" (click)="showAdvanced.set(!showAdvanced())">
              <lucide-icon [name]="showAdvanced() ? 'chevron-down' : 'chevron-right'" class="h-3.5 w-3.5"></lucide-icon>
              Gelişmiş (koşul / eylem ayarları — JSON)
            </button>
            @if (showAdvanced()) {
              <div class="grid gap-4">
                <div>
                  <label class="label">Koşul (JSON, opsiyonel)</label>
                  <textarea class="input font-mono text-xs" rows="2" [(ngModel)]="draft.conditionText" placeholder='Örn. {{ "{" }}"minStock": 5{{ "}" }}'></textarea>
                </div>
                <div>
                  <label class="label">Eylem Ayarı (JSON, opsiyonel)</label>
                  <textarea class="input font-mono text-xs" rows="2" [(ngModel)]="draft.actionConfigText" placeholder='Örn. {{ "{" }}"phone": "05xx"{{ "}" }}'></textarea>
                </div>
              </div>
            }
          </div>

          <div class="mt-5 flex items-center justify-end gap-2">
            <button type="button" class="btn-ghost" (click)="formOpen.set(false)">Vazgeç</button>
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
     .icon-btn:hover { background:#f1f5f9; color:#334155; }`,
  ],
})
export class AutomationRulesComponent implements OnInit {
  private api = inject(AutomationRulesApi);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  protected formatDate = formatDate;

  /** Backend AllowedTriggers ile birebir. */
  protected readonly triggerTypes = ['low_stock', 'overdue_receivable', 'daily_summary', 'appointment_soon'];
  /** Backend AllowedActions ile birebir. */
  protected readonly actionTypes = ['notify', 'sms', 'email', 'task'];

  private readonly triggerMeta: Record<string, Meta> = {
    low_stock: { label: 'Düşük Stok', icon: 'package', cls: 'bg-amber-100 text-amber-700' },
    overdue_receivable: { label: 'Geciken Alacak', icon: 'clock', cls: 'bg-rose-100 text-rose-700' },
    daily_summary: { label: 'Günlük Özet', icon: 'calendar-days', cls: 'bg-blue-100 text-blue-700' },
    appointment_soon: { label: 'Yaklaşan Randevu', icon: 'calendar-clock', cls: 'bg-violet-100 text-violet-700' },
  };
  private readonly actionMeta: Record<string, Meta> = {
    notify: { label: 'Bildirim', icon: 'bell', cls: 'bg-brand-50 text-brand-600' },
    sms: { label: 'SMS', icon: 'message-square', cls: 'bg-emerald-100 text-emerald-700' },
    email: { label: 'E-posta', icon: 'mail', cls: 'bg-indigo-100 text-indigo-700' },
    task: { label: 'Görev', icon: 'list-checks', cls: 'bg-slate-100 text-slate-600' },
  };

  protected loading = signal(true);
  protected saving = signal(false);
  protected busyId = signal<string | null>(null);
  protected rules = signal<AutomationRuleDto[]>([]);
  protected templates = signal<AutomationTemplate[]>([]);
  protected formOpen = signal(false);
  protected editing = signal<AutomationRuleDto | null>(null);
  protected showAdvanced = signal(false);

  /** ngModel ile iki yönlü bağlanan form taslağı; JSON alanları metin olarak tutulur. */
  protected draft = this.emptyDraft();

  ngOnInit(): void {
    this.load();
    this.api.templates().subscribe({ next: (t) => this.templates.set(t ?? []), error: () => {} });
  }

  private load(): void {
    this.loading.set(true);
    this.api.list().subscribe({
      next: (r) => {
        this.rules.set(r ?? []);
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.toast.error(apiError(e)); },
    });
  }

  protected trigMeta(type: string): Meta {
    return this.triggerMeta[type] ?? { label: type, icon: 'zap', cls: 'bg-slate-100 text-slate-600' };
  }
  protected actMeta(type: string): Meta {
    return this.actionMeta[type] ?? { label: type, icon: 'zap', cls: 'bg-slate-100 text-slate-600' };
  }

  private emptyDraft() {
    return {
      name: '',
      triggerType: 'low_stock',
      actionType: 'notify',
      isActive: true,
      conditionText: '',
      actionConfigText: '',
    };
  }

  protected openCreate(): void {
    this.editing.set(null);
    this.draft = this.emptyDraft();
    this.showAdvanced.set(false);
    this.formOpen.set(true);
  }

  protected openFromTemplate(t: AutomationTemplate): void {
    this.editing.set(null);
    this.draft = { ...this.emptyDraft(), name: t.name, triggerType: t.triggerType, actionType: t.actionType };
    this.showAdvanced.set(false);
    this.formOpen.set(true);
  }

  protected openEdit(r: AutomationRuleDto): void {
    this.editing.set(r);
    this.draft = {
      name: r.name,
      triggerType: r.triggerType,
      actionType: r.actionType,
      isActive: r.isActive,
      conditionText: r.conditionJson ?? '',
      actionConfigText: r.actionConfigJson ?? '',
    };
    this.showAdvanced.set(!!(r.conditionJson || r.actionConfigJson));
    this.formOpen.set(true);
  }

  protected save(): void {
    const name = this.draft.name.trim();
    if (!name) {
      this.toast.error('Kural adı boş olamaz.');
      return;
    }
    const body = {
      name,
      triggerType: this.draft.triggerType,
      conditionJson: this.draft.conditionText.trim() || null,
      actionType: this.draft.actionType,
      actionConfigJson: this.draft.actionConfigText.trim() || null,
      isActive: this.draft.isActive,
    };
    this.saving.set(true);
    const editing = this.editing();
    const req = editing ? this.api.update(editing.id, body) : this.api.create(body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(editing ? 'Kural güncellendi.' : 'Kural oluşturuldu.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected toggle(r: AutomationRuleDto): void {
    this.busyId.set(r.id);
    this.api.toggle(r.id, !r.isActive).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success(r.isActive ? 'Kural pasifleştirildi.' : 'Kural etkinleştirildi.');
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(r: AutomationRuleDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${r.name}" kuralı silinsin mi?`, danger: true, confirmText: 'Sil' }))) return;
    this.api.remove(r.id).subscribe({
      next: () => {
        this.toast.success('Kural silindi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
