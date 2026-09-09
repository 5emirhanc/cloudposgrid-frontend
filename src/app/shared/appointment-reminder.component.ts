import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AppointmentsApi } from '../core/api/appointments.api';
import { AuthService } from '../core/auth.service';
import { AppointmentDto } from '../core/models';
import { money, wallClock } from '../core/utils';

/**
 * Randevu saati yaklaşınca/gelince uygulama genelinde uyarı modalı açar (kuaför/güzellik).
 * - "Yaklaşıyor": başlamadan 5 dk önce (hazırlık payı).
 * - "Saati geldi": tam saatinde (başlangıçtan sonraki 10 dk içinde kaçırılmadıysa).
 * Her randevu için her aşama en fazla bir kez gösterilir. Yalnızca randevu özelliği olan
 * sektörde (Beauty) çalışır; diğerlerinde hiç sorgu yapmaz.
 */
@Component({
  selector: 'app-appointment-reminder',
  imports: [LucideAngularModule],
  template: `
    @if (due(); as d) {
      <div class="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4" style="z-index:70" (click)="dismiss()">
        <div class="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl" (click)="$event.stopPropagation()">
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
               [class]="d.phase === 'now' ? 'bg-rose-100 text-rose-600' : 'bg-brand-100 text-brand-700'">
            <lucide-icon name="calendar-days" class="h-8 w-8"></lucide-icon>
          </div>
          <p class="text-xs font-bold uppercase tracking-wide" [class]="d.phase === 'now' ? 'text-rose-600' : 'text-brand-600'">
            {{ d.phase === 'now' ? 'Randevu saati geldi' : 'Randevu yaklaşıyor' }}
          </p>
          <h2 class="mt-1 text-2xl font-black text-slate-900">{{ d.appt.customerName }}</h2>
          <p class="mt-2 text-slate-600">
            <span class="font-bold">{{ time(d.appt) }}</span>@if (d.appt.serviceName) { · {{ d.appt.serviceName }} }
          </p>
          <p class="mt-1 text-sm text-slate-400">
            {{ d.appt.durationMinutes }} dk@if (d.appt.price > 0) { · {{ money(d.appt.price) }} }
          </p>
          <div class="mt-6 flex gap-2">
            <button class="btn-outline flex-1" (click)="dismiss()">Tamam</button>
            <button class="btn-primary flex-1" (click)="goto()">Randevulara Git</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AppointmentReminderComponent implements OnInit, OnDestroy {
  private apptsApi = inject(AppointmentsApi);
  private auth = inject(AuthService);
  private router = inject(Router);

  protected money = money;
  protected due = signal<{ appt: AppointmentDto; phase: 'soon' | 'now' } | null>(null);

  private notified = new Set<string>();
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    if (!this.auth.profile().features.appointments) return; // yalnızca kuaför/güzellik
    this.check();
    this.timer = setInterval(() => this.check(), 30_000); // 30 sn'de bir tara
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Bugünün randevularını çeker, zamanı gelen ilk uyarıyı gösterir. */
  private check(): void {
    if (this.due()) return; // bir modal açıkken üstüne yenisini bindirme
    const d = new Date();
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.apptsApi.getRange(`${day}T00:00:00`, `${day}T23:59:59`).subscribe({
      next: (list) => {
        const now = Date.now();
        for (const a of list ?? []) {
          if (a.status !== 'Scheduled') continue;
          const start = wallClock(a.startsAt).getTime();

          const soonKey = a.id + ':soon';
          if (now >= start - 5 * 60_000 && now < start && !this.notified.has(soonKey)) {
            this.notified.add(soonKey);
            this.due.set({ appt: a, phase: 'soon' });
            return;
          }

          const nowKey = a.id + ':now';
          if (now >= start && now < start + 10 * 60_000 && !this.notified.has(nowKey)) {
            this.notified.add(nowKey);
            this.due.set({ appt: a, phase: 'now' });
            return;
          }
        }
      },
      error: () => {},
    });
  }

  protected dismiss(): void {
    this.due.set(null);
  }

  protected goto(): void {
    this.due.set(null);
    this.router.navigateByUrl('/randevular');
  }

  protected time(a: AppointmentDto): string {
    const d = wallClock(a.startsAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
