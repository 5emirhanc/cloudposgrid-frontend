import { Component, OnInit, inject, signal } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { SubscriptionApi } from '../../core/api/subscription.api';
import { ToastService } from '../../core/toast.service';
import { BillingCycle, PackageDto, SubscriptionInfoDto } from '../../core/models';
import { money } from '../../core/utils';

@Component({
  selector: 'app-upgrade',
  imports: [LucideAngularModule],
  template: `
    <div class="mx-auto max-w-4xl">
      <div class="mb-6">
        <h1 class="text-2xl font-black tracking-tight text-slate-900">Paketini Yükselt</h1>
        <p class="text-sm text-slate-500">14 gün ücretsiz deneme sonrası devam etmek için bir paket seçin.</p>
      </div>

      @if (info(); as i) {
        <!-- Durum bandı -->
        <div class="mb-6 rounded-2xl border p-4"
             [class]="i.isLocked ? 'border-rose-200 bg-rose-50' : 'border-brand-100 bg-brand-50'">
          <div class="flex items-center gap-3">
            <lucide-icon [name]="i.isLocked ? 'triangle-alert' : 'clock'"
              class="h-5 w-5" [class]="i.isLocked ? 'text-rose-600' : 'text-brand-600'"></lucide-icon>
            <div class="text-sm">
              @if (i.status === 'Active') {
                <span class="font-semibold text-slate-800">Aboneliğiniz aktif.</span>
                <span class="text-slate-600"> {{ i.daysLeft }} gün kaldı.</span>
              } @else if (i.isLocked) {
                <span class="font-semibold text-rose-700">Deneme/abonelik süreniz doldu.</span>
                <span class="text-rose-600"> Satış ve kayıt için paketinizi yükseltin.</span>
              } @else {
                <span class="font-semibold text-slate-800">Deneme sürümü.</span>
                <span class="text-slate-600"> {{ i.daysLeft }} gün kaldı.</span>
              }
            </div>
          </div>
        </div>

        @if (i.hasPendingRequest) {
          <div class="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <lucide-icon name="clock" class="h-5 w-5 text-amber-600"></lucide-icon>
            <p class="text-sm text-amber-800">
              <span class="font-semibold">Talebiniz alındı, onay bekleniyor.</span>
              Havaleniz kontrol edildikten sonra paketiniz aktifleştirilecek.
            </p>
          </div>
        }

        <!-- Aylık/Yıllık -->
        <div class="mb-6 inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button class="rounded-lg px-4 py-1.5 text-sm font-semibold transition"
            [class]="billing() === 'Monthly' ? 'bg-brand-600 text-white' : 'text-slate-600'"
            (click)="billing.set('Monthly')">Aylık</button>
          <button class="rounded-lg px-4 py-1.5 text-sm font-semibold transition"
            [class]="billing() === 'Yearly' ? 'bg-brand-600 text-white' : 'text-slate-600'"
            (click)="billing.set('Yearly')">Yıllık <span class="text-xs opacity-80">(2 ay bedava)</span></button>
        </div>

        <!-- Paketler (3 katman: Profesyonel / Kurumsal / Zincir — hepsi fiyatlı) -->
        <div class="grid gap-5 sm:grid-cols-3">
          @for (p of i.packages; track p.plan) {
            <div class="flex flex-col rounded-2xl border-2 p-6"
                 [class]="isPopular(p.plan) ? 'border-brand-500 bg-white shadow-lg shadow-brand-100' : 'border-slate-200 bg-white'">
              <div class="mb-1 flex items-center gap-2">
                <lucide-icon [name]="iconByPlan[p.plan]" class="h-5 w-5 text-brand-600"></lucide-icon>
                <h3 class="text-lg font-bold text-slate-800">{{ p.name }}</h3>
                @if (isPopular(p.plan)) { <span class="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">En popüler</span> }
              </div>
              <p class="mb-1 text-3xl font-black text-slate-800">
                {{ money(billing() === 'Yearly' ? p.yearlyPrice : p.monthlyPrice) }}
                <span class="text-sm font-medium text-slate-400">/ {{ billing() === 'Yearly' ? 'yıl' : 'ay' }} + KDV</span>
              </p>
              <p class="mb-4 text-xs text-slate-400">
                KDV dahil {{ kdvIncl(billing() === 'Yearly' ? p.yearlyPrice : p.monthlyPrice) }} / {{ billing() === 'Yearly' ? 'yıl' : 'ay' }}
              </p>
              <p class="mb-4 text-sm text-slate-500">{{ descByPlan[p.plan] }}</p>

              <ul class="mb-5 space-y-2 text-sm">
                @for (f of featuresByPlan[p.plan]; track f.label) {
                  <li class="flex items-start gap-2">
                    <lucide-icon name="check" class="mt-0.5 h-4 w-4 shrink-0" [class]="f.highlight ? 'text-brand-600' : 'text-emerald-500'"></lucide-icon>
                    <span [class]="f.highlight ? 'font-semibold text-slate-800' : 'text-slate-600'">{{ f.label }}</span>
                  </li>
                }
              </ul>

              <button class="btn-primary mt-auto justify-center"
                      [disabled]="i.hasPendingRequest || submitting()"
                      (click)="requestPlan(p)">
                {{ i.hasPendingRequest ? 'Onay Bekleniyor' : 'Bu Paketi Seç' }}
              </button>
            </div>
          }
        </div>

        <!-- Havale bilgisi -->
        <div class="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <div class="mb-3 flex items-center gap-2">
            <lucide-icon name="banknote" class="h-5 w-5 text-emerald-600"></lucide-icon>
            <h3 class="font-bold text-slate-800">Havale / EFT ile Ödeme</h3>
          </div>
          <p class="mb-4 text-sm text-slate-500">
            Paketi seçip talep oluşturun, ardından aşağıdaki hesaplardan birine ödeme yapın. Havaleniz onaylanınca paketiniz aktifleşir.
            Ödenecek tutar, seçtiğiniz paketin <span class="font-semibold text-slate-700">KDV dahil</span> bedelidir.
          </p>
          @if (i.banks.length) {
            <div class="grid gap-3 sm:grid-cols-2">
              @for (bank of i.banks; track bank.iban) {
                <div class="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                  <div class="flex justify-between gap-4"><span class="text-slate-500">Alıcı</span><span class="font-semibold text-slate-800">{{ bank.accountName }}</span></div>
                  <div class="flex justify-between gap-4"><span class="text-slate-500">Banka</span><span class="font-semibold text-slate-800">{{ bank.bank }}</span></div>
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-slate-500">IBAN</span>
                    <span class="flex items-center gap-2 font-mono font-semibold text-slate-800">
                      {{ bank.iban }}
                      <button (click)="copyIban(bank.iban)" class="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700" title="Kopyala">
                        <lucide-icon name="copy" class="h-4 w-4"></lucide-icon>
                      </button>
                    </span>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">Havale bilgisi henüz tanımlanmamış.</p>
          }
          <p class="mt-3 text-xs text-slate-400">Açıklama kısmına işletme adınızı yazmayı unutmayın.</p>
        </div>
      } @else {
        <p class="text-sm text-slate-400">Yükleniyor…</p>
      }
    </div>
  `,
})
export class UpgradeComponent implements OnInit {
  private api = inject(SubscriptionApi);
  private toast = inject(ToastService);

  protected money = money;
  // Türkiye standart KDV %20 (yazılım/hizmet). Fiyatlar KDV hariç; dahil karşılığı ayrıca gösterilir.
  protected kdvIncl = (base: number) => money(Math.round(base * 1.20 * 100) / 100);
  protected info = signal<SubscriptionInfoDto | null>(null);
  protected billing = signal<BillingCycle>('Monthly');
  protected submitting = signal(false);

  // Tanıtım sitesindeki (Pricing.astro) listeyle BİREBİR aynı olmalı — plana göre 3 liste.
  private readonly proFeatures = [
    { label: 'Sektörel uyarlama (kafe, market, kuaför, tamirci…)', highlight: false },
    { label: 'Adisyon, masa, hesap bölme & QR menü', highlight: false },
    { label: 'Hızlı satış + barkod (kamerayla da)', highlight: false },
    { label: 'Randevu takvimi & servis iş emri', highlight: false },
    { label: 'Sınırsız ürün, stok & CSV içe aktarma', highlight: false },
    { label: 'Cari, veresiye & müşteriye özel indirim', highlight: false },
    { label: 'Kasa, fatura, 80mm fiş & gün sonu (Z) raporu', highlight: false },
    { label: 'Panel, raporlar & PWA kurulum', highlight: false },
    { label: 'Tek kullanıcı · tek şube', highlight: false },
    { label: '7/24 destek', highlight: false },
  ];
  private readonly kurumsalFeatures = [
    { label: 'Profesyonel plandaki her şey', highlight: false },
    { label: 'Çoklu kullanıcı + rol/PIN yönetimi', highlight: true },
    { label: 'Gelişmiş raporlar & Excel/CSV dışa aktarma', highlight: true },
    { label: 'Analitik: satış ısı haritası, personel & envanter analizi', highlight: true },
    { label: 'Kampanyalar, otomasyon kuralları & hediye çekleri', highlight: true },
    { label: 'QR menüden masadan sipariş', highlight: true },
    { label: '3 şubeye kadar (şube bazlı kasa/rapor)', highlight: true },
    { label: 'Talebe göre ek özellik geliştirme', highlight: false },
    { label: '7/24 destek', highlight: false },
  ];
  private readonly zincirFeatures = [
    { label: 'Kurumsal plandaki her şey', highlight: false },
    { label: 'Sınırsız şube yönetimi & şube seçici', highlight: true },
    { label: 'Pazaryeri entegrasyonu — Trendyol + Hepsiburada (Yeni)', highlight: true },
    { label: 'Tek stok senkronu — aşırı satış önleme', highlight: false },
    { label: 'Siparişler otomatik satışa + bildirim çanı', highlight: false },
    { label: "Tek tuşla Trendyol'da ilan açma", highlight: false },
    { label: '7/24 öncelikli destek', highlight: false },
  ];

  // Plana göre kart içeriği (paketler backend config'ten gelir: Pro / Enterprise / Chain).
  protected featuresByPlan: Record<string, { label: string; highlight: boolean }[]> = {
    Pro: this.proFeatures, Enterprise: this.kurumsalFeatures, Chain: this.zincirFeatures,
  };
  protected descByPlan: Record<string, string> = {
    Pro: 'Tek işletme için ihtiyacınız olan her şey — sektörünüze uyarlanmış.',
    Enterprise: 'Personelli işletmeler: çoklu kullanıcı, roller, gelişmiş rapor, masadan sipariş.',
    Chain: 'Zincir & çok şubeli işletmeler: sınırsız şube + pazaryeri entegrasyonu.',
  };
  protected iconByPlan: Record<string, string> = { Pro: 'crown', Enterprise: 'building-2', Chain: 'building-2' };
  // Tanıtım sitesiyle senkron: "En popüler" rozeti ORTA pakette (Kurumsal / Enterprise).
  protected isPopular = (plan: string): boolean => plan === 'Enterprise';

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.api.info().subscribe({ next: (i) => this.info.set(i) });
  }

  protected requestPlan(p: PackageDto): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.api.request({ plan: p.plan, billingCycle: this.billing() }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('Talebiniz alındı. Havale onayından sonra paketiniz aktifleşecek.');
        this.load();
      },
      error: () => this.submitting.set(false),
    });
  }

  protected copyIban(iban: string): void {
    navigator.clipboard?.writeText(iban).then(
      () => this.toast.success('IBAN kopyalandı.'),
      () => {}
    );
  }
}
