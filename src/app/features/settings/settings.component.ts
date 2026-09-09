import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { SettingsApi } from '../../core/api/settings.api';
import { AccountApi } from '../../core/api/account.api';
import { AuditApi } from '../../core/api/audit.api';
import { QR_SOUND_KEY } from '../../shared/qr-order-alert.component';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { ToastService } from '../../core/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { apiError } from '../../core/utils';
import { SECTOR_OPTIONS } from '../../core/business-profile';
import { AuditEventDto, BusinessType, ScaleEmbedMode, TwoFactorSetupDto } from '../../core/models';
import QRCode from 'qrcode';

/** Ayarlar hub'ındaki modal kimlikleri. '' = hiçbir modal açık değil. */
type SettingsModal = '' | 'isletme' | 'sektor' | 'satis' | 'terazi' | 'qr' | 'hesap' | 'guvenlik' | 'hareket' | 'kvkk' | 'twofa';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule, LucideAngularModule, ModalComponent],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-black tracking-tight text-slate-900">Ayarlar</h1>
      <p class="text-sm text-slate-500">İşletme bilgileri ve tercihler — bir bölüme dokunun</p>
    </div>

    <div class="mx-auto max-w-2xl space-y-6">
      <!-- İŞLETME -->
      <div>
        <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">İşletme</p>
        <div class="card divide-y divide-slate-100 overflow-hidden p-0">
          <button type="button" class="settings-row" (click)="open('isletme')">
            <span class="row-ico bg-brand-50 text-brand-600"><lucide-icon name="building-2" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>İşletme Bilgileri</b><small>Firma adı, vergi, iletişim, para birimi, KDV</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
          <button type="button" class="settings-row" (click)="open('sektor')">
            <span class="row-ico bg-indigo-50 text-indigo-600"><lucide-icon name="store" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>İşletme Türü</b><small>{{ sectorLabel() }} — ekranlar buna göre uyarlanır</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
        </div>
      </div>

      <!-- SATIŞ & STOK -->
      <div>
        <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Satış & Stok</p>
        <div class="card divide-y divide-slate-100 overflow-hidden p-0">
          <button type="button" class="settings-row" (click)="open('satis')">
            <span class="row-ico bg-amber-50 text-amber-600"><lucide-icon name="percent" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>Satış & Kasa Ayarları</b><small>{{ salesSummary() }}</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
          <button type="button" class="settings-row" (click)="open('terazi')">
            <span class="row-ico bg-cyan-50 text-cyan-600"><lucide-icon name="qr-code" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>Terazi Barkodu (market)</b><small>{{ form.controls.scaleBarcodeEnabled.value ? 'Açık — etiketten ağırlık/fiyat okunur' : 'Kapalı' }}</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
        </div>
      </div>

      <!-- MENÜ -->
      @if (feat().menu) {
        <div>
          <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Menü</p>
          <div class="card divide-y divide-slate-100 overflow-hidden p-0">
            <button type="button" class="settings-row" (click)="open('qr')">
              <span class="row-ico bg-blue-50 text-blue-600"><lucide-icon name="utensils" class="h-5 w-5"></lucide-icon></span>
              <span class="row-text"><b>QR Menü</b><small>Dijital menü & masadan sipariş bağlantısı</small></span>
              <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
            </button>
          </div>
        </div>
      }

      <!-- HESAP & GÜVENLİK -->
      <div>
        <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Hesap & Güvenlik</p>
        <div class="card divide-y divide-slate-100 overflow-hidden p-0">
          <button type="button" class="settings-row" (click)="open('hesap')">
            <span class="row-ico bg-slate-100 text-slate-600"><lucide-icon name="user-cog" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>Hesap</b><small>{{ user()?.email }} · {{ user()?.plan }}</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
          <button type="button" class="settings-row" (click)="open('guvenlik')">
            <span class="row-ico bg-emerald-50 text-emerald-600"><lucide-icon name="lock" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>Güvenlik</b><small>Hesap şifrenizi güncelleyin</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
          <button type="button" class="settings-row" (click)="openTwoFa()">
            <span class="row-ico bg-indigo-50 text-indigo-600"><lucide-icon name="shield" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>İki Adımlı Doğrulama (2FA)</b><small>{{ twoFaOn() ? 'Açık — girişte kod istenir' : 'Kapalı — hesabınızı ekstra koruyun' }}</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
          @if (canAudit()) {
            <button type="button" class="settings-row" (click)="open('hareket')">
              <span class="row-ico bg-violet-50 text-violet-600"><lucide-icon name="clipboard-list" class="h-5 w-5"></lucide-icon></span>
              <span class="row-text"><b>Hareket Kaydı</b><small>Fatura iptali/iade, kasa ve stok hareketini kim yaptı</small></span>
              <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
            </button>
          }
        </div>
      </div>

      <!-- VERİ -->
      <div>
        <p class="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">Veri</p>
        <div class="card divide-y divide-slate-100 overflow-hidden p-0">
          <button type="button" class="settings-row" (click)="open('kvkk')">
            <span class="row-ico bg-rose-50 text-rose-600"><lucide-icon name="shield" class="h-5 w-5"></lucide-icon></span>
            <span class="row-text"><b>Veri & Gizlilik (KVKK)</b><small>Verilerinizi indirin{{ isOwner() ? ' veya hesabınızı silin' : '' }}</small></span>
            <lucide-icon name="chevron-right" class="h-5 w-5 text-slate-300"></lucide-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- ============ MODALLAR ============ -->

    <!-- İşletme Bilgileri -->
    @if (activeModal() === 'isletme') {
      <app-modal title="İşletme Bilgileri" maxWidth="40rem" (dismiss)="open('')">
        <form [formGroup]="form" (ngSubmit)="save()" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Firma Adı *</label>
            <input class="input" formControlName="companyName" />
          </div>
          <div><label class="label">Vergi Dairesi</label><input class="input" formControlName="taxOffice" /></div>
          <div><label class="label">Vergi No</label><input class="input" formControlName="taxNo" /></div>
          <div><label class="label">Telefon</label><input class="input" formControlName="phone" /></div>
          <div><label class="label">E-posta</label><input class="input" formControlName="email" /></div>
          <div class="sm:col-span-2"><label class="label">Adres</label><input class="input" formControlName="address" /></div>
          <div><label class="label">Para Birimi</label><input class="input" formControlName="currency" /></div>
          <div><label class="label">Varsayılan KDV %</label><input type="number" class="input" formControlName="defaultVatRate" /></div>
          <div class="sm:col-span-2 flex justify-end gap-2 pt-1">
            <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- İşletme Türü -->
    @if (activeModal() === 'sektor') {
      <app-modal title="İşletme Türü" maxWidth="32rem" (dismiss)="open('')">
        <p class="mb-3 text-xs text-slate-400">Ekranlar, menü ve terminoloji bu seçime göre uyarlanır. Verileriniz silinmez.</p>
        <div class="grid grid-cols-3 gap-2">
          @for (s of sectors; track s.type) {
            <button type="button" [disabled]="changingSector()"
              class="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center text-[11px] font-semibold leading-tight transition disabled:opacity-60"
              [class]="s.type === businessType() ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm' : 'border-slate-200 text-slate-500 hover:border-slate-300'"
              (click)="pickSector(s.type)">
              <lucide-icon [name]="s.icon" class="h-5 w-5"></lucide-icon>
              {{ s.label }}
            </button>
          }
        </div>
        <p class="mt-3 text-xs text-slate-500">Değiştirince ekranlar ve menü yeni türe göre anında uyarlanır.</p>
      </app-modal>
    }

    <!-- Satış & Kasa Ayarları -->
    @if (activeModal() === 'satis') {
      <app-modal title="Satış & Kasa Ayarları" maxWidth="34rem" (dismiss)="open('')">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
          @if (loyaltyEntitled()) {
            <div class="rounded-xl border border-slate-200 p-4">
              <label class="flex cursor-pointer items-center gap-2">
                <input type="checkbox" formControlName="loyaltyEnabled" class="rounded text-brand-600" />
                <span class="text-sm font-semibold text-slate-700">Sadakat / Puan Sistemi</span>
              </label>
              <p class="mt-1 text-xs text-slate-400">Müşteriler satıştan puan kazanır, sonraki alışverişte harcar (1 puan = ₺1).</p>
              @if (form.controls.loyaltyEnabled.value) {
                <div class="mt-3 max-w-xs">
                  <label class="label">Kazanma Oranı (% satış)</label>
                  <input type="number" step="0.1" min="0" max="100" class="input" formControlName="loyaltyEarnPercent" />
                  <p class="mt-1 text-xs text-slate-400">Ör. 5 → ₺100 alışverişte 5 puan (₺5) kazanılır.</p>
                </div>
              }
            </div>
          }
          <div class="rounded-xl border border-slate-200 p-4">
            <label class="flex cursor-pointer items-center gap-2">
              <input type="checkbox" formControlName="manualDiscountEnabled" class="rounded text-brand-600" />
              <span class="text-sm font-semibold text-slate-700">Kasada Elle İndirim</span>
            </label>
            <p class="mt-1 text-xs text-slate-400">Satış sırasında tutar ya da yüzde indirim uygulanabilir; gerekçesiyle kayda geçer.</p>
            @if (form.controls.manualDiscountEnabled.value) {
              <div class="mt-3 max-w-xs">
                <label class="label">Kasiyer Azami İndirim (%)</label>
                <input type="number" step="1" min="0" max="100" class="input" formControlName="maxManualDiscountPercent" />
                <p class="mt-1 text-xs text-slate-400">Sahip ve yöneticiler bu sınıra tabi değildir. 0 → yalnız yönetici indirim yapabilir.</p>
              </div>
            }
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Terazi Barkodu -->
    @if (activeModal() === 'terazi') {
      <app-modal title="Terazi Barkodu (market)" maxWidth="36rem" (dismiss)="open('')">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-3">
          <label class="flex cursor-pointer items-center gap-2">
            <input type="checkbox" formControlName="scaleBarcodeEnabled" class="rounded text-brand-600" />
            <span class="text-sm font-semibold text-slate-700">Terazi barkodu okumayı aç</span>
          </label>
          <p class="text-xs text-slate-400">Terazinin bastığı etiket okutulunca ağırlık/fiyat barkoddan otomatik çözülür.</p>
          @if (form.controls.scaleBarcodeEnabled.value) {
            <div class="grid gap-3 sm:grid-cols-2">
              <div>
                <label class="label">Ön ekler</label>
                <input class="input" formControlName="scaleBarcodePrefixes" placeholder="28,29" />
                <p class="mt-1 text-xs text-slate-400">Virgülle ayırın. "2" ve "20" dahili barkoda ayrılmıştır.</p>
              </div>
              <div>
                <label class="label">Gömülü değer</label>
                <select class="select" formControlName="scaleBarcodeEmbeds">
                  <option value="Weight">Ağırlık</option>
                  <option value="Price">Fiyat</option>
                </select>
              </div>
              <div><label class="label">Ürün kodu hane</label><input type="number" min="1" max="9" class="input" formControlName="scaleBarcodeItemDigits" /></div>
              <div><label class="label">Değer hane</label><input type="number" min="1" max="9" class="input" formControlName="scaleBarcodeValueDigits" /></div>
              <div>
                <label class="label">Ondalık basamak</label>
                <input type="number" min="0" max="4" class="input" formControlName="scaleBarcodeDecimals" />
                <p class="mt-1 text-xs text-slate-400">3 → 01750 = 1,750 kg</p>
              </div>
              @if (form.controls.scaleBarcodeEmbeds.value === 'Price') {
                <div class="flex items-end">
                  <label class="flex cursor-pointer items-center gap-2 pb-2">
                    <input type="checkbox" formControlName="scaleBarcodePriceIncludesVat" class="rounded text-brand-600" />
                    <span class="text-sm text-slate-700">Gömülü fiyat KDV dahil</span>
                  </label>
                </div>
              }
            </div>
            <p class="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Şablon: ön ek + ürün kodu + değer + 1 kontrol hanesi = <b>13 hane</b> olmalı.
            </p>
          }
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- QR Menü -->
    @if (activeModal() === 'qr') {
      <app-modal title="QR Menü" maxWidth="26rem" (dismiss)="open('')">
        <div class="overflow-hidden rounded-2xl">
          <div class="p-6 text-center text-white" style="background:linear-gradient(155deg,#1e3a8a,#2563eb 60%,#0ea5c4)">
            @if (qrDataUrl()) {
              <div class="mx-auto flex h-40 w-40 items-center justify-center rounded-2xl bg-white p-3 shadow-lg">
                <img [src]="qrDataUrl()" class="h-full w-full" alt="QR menü" />
              </div>
            }
            <p class="mt-4 text-sm font-bold">QR Menü Aktif</p>
            <p class="text-xs text-white/70">Masalara yapıştırın, müşteri telefondan görsün.</p>
          </div>
        </div>
        <div class="space-y-2.5 pt-4">
          <div class="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
            <lucide-icon name="qr-code" class="h-4 w-4 shrink-0 text-slate-400"></lucide-icon>
            <span class="flex-1 truncate font-mono text-xs text-slate-600">{{ menuUrl() }}</span>
            <button type="button" class="rounded-lg p-1 text-brand-600 hover:bg-brand-50" (click)="copyMenuUrl()"><lucide-icon name="copy" class="h-4 w-4"></lucide-icon></button>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <a [href]="'/menu/' + (user()?.slug ?? '')" target="_blank" rel="noopener" class="btn-outline btn-sm justify-center"><lucide-icon name="eye" class="h-4 w-4"></lucide-icon> Önizle</a>
            @if (qrDataUrl()) {
              <a [href]="qrDataUrl()" download="qr-menu.png" class="btn-primary btn-sm justify-center">İndir</a>
            }
          </div>
          <label class="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2.5">
            <span class="flex items-center gap-2 text-sm text-slate-700"><lucide-icon name="bell" class="h-4 w-4 text-slate-400"></lucide-icon> Yeni sipariş bildirim sesi</span>
            <input type="checkbox" class="rounded text-brand-600" [checked]="qrSound()" (change)="toggleQrSound($any($event.target).checked)" />
          </label>
        </div>
      </app-modal>
    }

    <!-- Hesap -->
    @if (activeModal() === 'hesap') {
      <app-modal title="Hesap" maxWidth="26rem" (dismiss)="open('')">
        <dl class="space-y-2 text-sm">
          <div class="flex justify-between"><dt class="text-slate-500">Kullanıcı</dt><dd class="font-medium text-slate-800">{{ user()?.fullName }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">E-posta</dt><dd class="font-medium text-slate-800">{{ user()?.email }}</dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Rol</dt><dd><span class="badge-blue">{{ user()?.role }}</span></dd></div>
          <div class="flex justify-between"><dt class="text-slate-500">Plan</dt><dd><span class="badge-amber">{{ user()?.plan }}</span></dd></div>
        </dl>
        <div class="mt-4 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><lucide-icon name="building-2" class="h-5 w-5"></lucide-icon></span>
          <div>
            <p class="text-sm font-semibold text-slate-800">{{ user()?.tenantName }}</p>
            <p class="text-xs text-slate-400">Verileriniz işletmenize özel, izole bir alanda saklanır.</p>
          </div>
        </div>
      </app-modal>
    }

    <!-- Güvenlik: şifre değiştir -->
    @if (activeModal() === 'guvenlik') {
      <app-modal title="Şifre Değiştir" maxWidth="26rem" (dismiss)="open('')">
        <form [formGroup]="pwForm" (ngSubmit)="changePassword()" class="space-y-3">
          <div>
            <label class="label">Mevcut Şifre</label>
            <input type="password" class="input" formControlName="currentPassword" autocomplete="current-password" />
          </div>
          <div>
            <label class="label">Yeni Şifre</label>
            <div class="relative">
              <input [type]="showPw() ? 'text' : 'password'" class="input pr-10" formControlName="newPassword"
                     autocomplete="new-password" placeholder="En az 8 karakter, harf ve rakam" />
              <button type="button" (click)="showPw.set(!showPw())" tabindex="-1"
                      class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <lucide-icon [name]="showPw() ? 'eye-off' : 'eye'" class="h-4 w-4"></lucide-icon>
              </button>
            </div>
            <div class="mt-2 space-y-1">
              @for (r of pwRules(); track r.label) {
                <p class="flex items-center gap-1.5 text-xs" [class]="r.ok ? 'text-emerald-600' : 'text-slate-400'">
                  <lucide-icon [name]="r.ok ? 'check' : 'x'" class="h-3.5 w-3.5"></lucide-icon> {{ r.label }}
                </p>
              }
            </div>
          </div>
          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
            <button type="submit" class="btn-primary" [disabled]="changingPw() || pwForm.invalid">
              {{ changingPw() ? 'Güncelleniyor...' : 'Güncelle' }}
            </button>
          </div>
        </form>
      </app-modal>
    }

    <!-- İki Adımlı Doğrulama (2FA) -->
    @if (activeModal() === 'twofa') {
      <app-modal title="İki Adımlı Doğrulama (2FA)" maxWidth="30rem" (dismiss)="open('')">
        @if (recoveryCodes().length) {
          <!-- Kurtarma kodları (bir kez gösterilir) -->
          <div class="space-y-3">
            <p class="text-sm text-slate-600">2FA açıldı ✅ Bu <b>kurtarma kodlarını</b> güvenli bir yere kaydedin — telefonunuza erişemezseniz her biri bir kez giriş yapmanızı sağlar.</p>
            <div class="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 font-mono text-sm">
              @for (c of recoveryCodes(); track c) { <span>{{ c }}</span> }
            </div>
            <button class="btn-primary w-full" (click)="finishTwoFa()">Kaydettim, kapat</button>
          </div>
        } @else if (twoFaOn()) {
          <!-- Kapatma -->
          <form (ngSubmit)="disableTwoFa()" class="space-y-3">
            <p class="text-sm text-slate-600">2FA şu an <b class="text-emerald-600">açık</b>. Kapatmak için şifrenizi girin.</p>
            <input type="password" class="input" [(ngModel)]="disablePw" name="pw" placeholder="Şifreniz" autocomplete="current-password" />
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
              <button type="submit" class="btn-danger" [disabled]="twoFaBusy()">Kapat</button>
            </div>
          </form>
        } @else if (twoFaSetup(); as s) {
          <!-- Kurulum + doğrulama -->
          <div class="space-y-3">
            <p class="text-sm text-slate-600">Authenticator uygulamanıza (Google/Microsoft Authenticator, Authy) bu gizi ekleyin, sonra ürettiği 6 haneli kodu girin:</p>
            <div class="rounded-xl bg-slate-50 p-3 text-center">
              <p class="text-xs text-slate-400">Gizli anahtar (elle ekleme)</p>
              <p class="select-all break-all font-mono text-base font-bold text-slate-800">{{ s.secret }}</p>
            </div>
            <input type="text" inputmode="numeric" class="input tracking-widest" [(ngModel)]="twoFaCode" name="code" placeholder="6 haneli kod" />
            <div class="flex justify-end gap-2">
              <button type="button" class="btn-outline" (click)="open('')">Vazgeç</button>
              <button type="button" class="btn-primary" [disabled]="twoFaBusy()" (click)="enableTwoFa()">Doğrula ve Aç</button>
            </div>
          </div>
        } @else {
          <p class="py-6 text-center text-sm text-slate-400">Hazırlanıyor…</p>
        }
      </app-modal>
    }

    <!-- Hareket Kaydı -->
    @if (activeModal() === 'hareket') {
      <app-modal title="Hareket Kaydı" maxWidth="34rem" (dismiss)="open('')">
        <p class="mb-3 text-xs text-slate-400">Fatura iptali/iadesi, kasa hareketi ve stok sayımını kim yaptı.</p>
        @if (auditLoading()) {
          <p class="py-6 text-center text-sm text-slate-400">Yükleniyor...</p>
        } @else if (!audit().length) {
          <p class="py-6 text-center text-sm text-slate-400">Henüz kayıt yok.</p>
        } @else {
          <ul class="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            @for (e of audit(); track e.id) {
              <li class="rounded-xl border border-slate-100 px-3 py-2">
                <p class="text-sm font-medium text-slate-800">{{ actionLabel(e.action) }}</p>
                @if (e.details) { <p class="text-xs text-slate-500">{{ e.details }}</p> }
                <p class="mt-0.5 text-[11px] text-slate-400">{{ e.actorEmail || 'bilinmiyor' }} · {{ formatWhen(e.createdAt) }}</p>
              </li>
            }
          </ul>
        }
      </app-modal>
    }

    <!-- Veri & Gizlilik (KVKK) -->
    @if (activeModal() === 'kvkk') {
      <app-modal title="Veri & Gizlilik (KVKK)" maxWidth="28rem" (dismiss)="open('')">
        <p class="mb-3 text-xs text-slate-400">Kişisel ve işletme verileriniz üzerindeki haklarınız.</p>
        <button type="button" class="btn-outline w-full justify-center" [disabled]="exporting()" (click)="exportData()">
          <lucide-icon name="download" class="h-4 w-4"></lucide-icon> {{ exporting() ? 'Hazırlanıyor...' : 'Verilerimi indir (JSON)' }}
        </button>
        @if (isOwner()) {
          <div class="mt-4 border-t border-slate-100 pt-4">
            @if (!deleteOpen()) {
              <button type="button" class="btn-sm flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 py-2 font-semibold text-rose-600 hover:bg-rose-50" (click)="deleteOpen.set(true)">
                <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon> Hesabımı sil
              </button>
            } @else {
              <p class="mb-2 text-xs font-medium text-rose-600">İşletmeniz ve TÜM verileriniz (ürün, cari, satış) kalıcı silinir. Geri alınamaz. Onaylamak için şifrenizi girin.</p>
              <input type="password" class="input mb-2" placeholder="Şifreniz" autocomplete="current-password"
                     [value]="deletePassword()" (input)="deletePassword.set($any($event.target).value)" />
              <div class="flex gap-2">
                <button type="button" class="btn-outline btn-sm flex-1 justify-center" (click)="deleteOpen.set(false); deletePassword.set('')">Vazgeç</button>
                <button type="button" class="btn-sm flex-1 justify-center gap-1.5 rounded-xl bg-rose-600 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                        [disabled]="deleting() || !deletePassword()" (click)="doDelete()">
                  {{ deleting() ? 'Siliniyor...' : 'Kalıcı sil' }}
                </button>
              </div>
            }
          </div>
        }
      </app-modal>
    }
  `,
  styles: [`
    .settings-row { display: flex; width: 100%; align-items: center; gap: 0.875rem; padding: 1rem 1.25rem; text-align: left; transition: background-color .15s; }
    .settings-row:hover { background-color: rgb(248 250 252); }
    .row-ico { display: flex; height: 2.5rem; width: 2.5rem; flex-shrink: 0; align-items: center; justify-content: center; border-radius: 0.75rem; }
    .row-text { flex: 1 1 0%; min-width: 0; }
    .row-text b { display: block; font-size: 0.875rem; font-weight: 600; color: rgb(30 41 59); }
    .row-text small { display: block; font-size: 0.75rem; color: rgb(148 163 184); margin-top: 0.125rem; }
  `],
})
export class SettingsComponent implements OnInit {
  private api = inject(SettingsApi);
  private account = inject(AccountApi);
  private auditApi = inject(AuditApi);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private confirm = inject(ConfirmService);

  /** Açık ayar modalı (hub → modal geçişi). */
  protected activeModal = signal<SettingsModal>('');

  protected user = this.auth.user;
  protected saving = signal(false);
  protected isOwner = computed(() => this.auth.user()?.role === 'Owner');
  /** Denetim kaydını yalnız Owner/Admin görür (backend de [Authorize(Roles)] ile zorlar). */
  protected canAudit = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'Owner' || r === 'Admin';
  });
  protected audit = signal<AuditEventDto[]>([]);
  protected auditLoading = signal(false);
  protected loyaltyEntitled = computed(() => this.auth.user()?.entitlements?.loyaltyProgram ?? false);
  protected exporting = signal(false);
  protected deleteOpen = signal(false);
  protected deleting = signal(false);
  protected deletePassword = signal('');
  protected sectors = SECTOR_OPTIONS;
  protected changingSector = signal(false);
  protected businessType = computed(() => this.auth.user()?.businessType ?? 'General');
  protected sectorLabel = computed(() => this.sectors.find((s) => s.type === this.businessType())?.label ?? 'Genel');
  protected feat = computed(() => this.auth.profile().features);
  protected menuUrl = computed(() => `${location.origin}/menu/${this.auth.user()?.slug ?? ''}`);
  /** QR sipariş bildirim sesi açık mı (yerel tercih; kapatınca toast yine görünür). */
  protected qrSound = signal(localStorage.getItem(QR_SOUND_KEY) !== 'off');
  protected qrDataUrl = signal('');

  // 2FA yönetimi
  protected twoFaOn = signal<boolean>(this.auth.user()?.twoFactorEnabled ?? false);
  protected twoFaSetup = signal<TwoFactorSetupDto | null>(null);
  protected twoFaCode = signal('');
  protected recoveryCodes = signal<string[]>([]);
  protected disablePw = signal('');
  protected twoFaBusy = signal(false);

  /** Hub satırı özetleri (kapalı/açık durum ipucu). */
  protected salesSummary = computed(() => {
    const parts: string[] = [];
    if (this.form.controls.loyaltyEnabled.value) parts.push('Sadakat açık');
    if (this.form.controls.manualDiscountEnabled.value) parts.push('Elle indirim açık');
    return parts.length ? parts.join(' · ') : 'Sadakat / puan ve elle indirim';
  });

  protected form = this.fb.nonNullable.group({
    companyName: ['', Validators.required],
    taxOffice: [''],
    taxNo: [''],
    address: [''],
    phone: [''],
    email: [''],
    currency: ['TRY'],
    defaultVatRate: [20],
    loyaltyEnabled: [false],
    loyaltyEarnPercent: [0],
    manualDiscountEnabled: [false],
    maxManualDiscountPercent: [0],
    scaleBarcodeEnabled: [false],
    scaleBarcodePrefixes: ['28,29'],
    scaleBarcodeItemDigits: [5],
    scaleBarcodeValueDigits: [5],
    scaleBarcodeDecimals: [3],
    scaleBarcodeEmbeds: ['Weight'],
    scaleBarcodePriceIncludesVat: [true],
  });

  // Şifre değiştirme (Güvenlik modalı)
  protected changingPw = signal(false);
  protected showPw = signal(false);
  protected pwForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    // Backend kuralıyla birebir: en az 8 karakter + en az bir harf + bir rakam.
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[A-Za-zÇĞİÖŞÜçğıöşü])(?=.*\d).*$/)]],
  });
  private newPw = toSignal(this.pwForm.controls.newPassword.valueChanges, { initialValue: '' });
  protected pwRules = computed(() => {
    const p = this.newPw() ?? '';
    return [
      { ok: p.length >= 8, label: 'En az 8 karakter' },
      { ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p), label: 'En az bir harf' },
      { ok: /\d/.test(p), label: 'En az bir rakam' },
    ];
  });

  /** Modal aç/kapat. Kapanırken şifre formu ve silme onayı sıfırlanır (yarım kalmış durum taşınmaz). */
  protected open(m: SettingsModal): void {
    if (m === '') {
      this.pwForm.reset({ currentPassword: '', newPassword: '' });
      this.showPw.set(false);
      this.deleteOpen.set(false);
      this.deletePassword.set('');
    }
    this.activeModal.set(m);
  }

  ngOnInit(): void {
    QRCode.toDataURL(this.menuUrl(), { width: 240, margin: 1 })
      .then((url) => this.qrDataUrl.set(url))
      .catch(() => {});

    // Denetim kaydı yalnız Owner/Admin için çekilir (aksi halde 403 alınır).
    if (this.canAudit()) {
      this.auditLoading.set(true);
      this.auditApi.list(50).subscribe({
        next: (e) => { this.audit.set(e); this.auditLoading.set(false); },
        error: () => this.auditLoading.set(false),
      });
    }

    this.api.get().subscribe((s) => {
      this.form.patchValue({
        companyName: s.companyName,
        taxOffice: s.taxOffice ?? '',
        taxNo: s.taxNo ?? '',
        address: s.address ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        currency: s.currency,
        defaultVatRate: s.defaultVatRate,
        loyaltyEnabled: s.loyaltyEnabled,
        loyaltyEarnPercent: s.loyaltyEarnPercent,
        manualDiscountEnabled: s.manualDiscountEnabled ?? false,
        maxManualDiscountPercent: s.maxManualDiscountPercent ?? 0,
        scaleBarcodeEnabled: s.scaleBarcodeEnabled ?? false,
        scaleBarcodePrefixes: s.scaleBarcodePrefixes ?? '28,29',
        scaleBarcodeItemDigits: s.scaleBarcodeItemDigits ?? 5,
        scaleBarcodeValueDigits: s.scaleBarcodeValueDigits ?? 5,
        scaleBarcodeDecimals: s.scaleBarcodeDecimals ?? 3,
        scaleBarcodeEmbeds: s.scaleBarcodeEmbeds ?? 'Weight',
        scaleBarcodePriceIncludesVat: s.scaleBarcodePriceIncludesVat ?? true,
      });
    });
  }

  /** Makine-okunur eylem kodunu Türkçe etikete çevirir. */
  protected actionLabel(action: string): string {
    const map: Record<string, string> = {
      InvoiceVoided: 'Fatura iptal edildi',
      InvoiceRefunded: 'Fatura iade edildi',
      InvoiceManualDiscount: 'Elle indirim uygulandı',
      CashIncomeCreated: 'Kasa geliri eklendi',
      CashExpenseCreated: 'Kasa gideri eklendi',
      CashTransactionDeleted: 'Kasa hareketi silindi',
      StockCountApplied: 'Stok sayımı uygulandı',
      StockWasteRecorded: 'Fire / zayi kaydedildi',
      OrderMoved: 'Adisyon taşındı',
      OrderMerged: 'Adisyon birleştirildi',
      BulkPriceUpdate: 'Toplu fiyat güncellendi',
      QuoteConverted: 'Teklif satışa çevrildi',
      PurchaseOrderSent: 'Tedarikçi siparişi gönderildi',
      PurchaseOrderReceived: 'Mal kabul yapıldı',
      PurchaseOrderCancelled: 'Tedarikçi siparişi iptal edildi',
    };
    return map[action] ?? action;
  }

  /** Sunucu-üretimi zaman damgası → yerel gösterim (wallClock gerekmez, UTC 'Z' ile gelir). */
  protected formatWhen(iso: string): string {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  }

  /** Yeni QR sipariş bildirim sesini aç/kapa (cihaz bazlı, localStorage). */
  protected toggleQrSound(on: boolean): void {
    this.qrSound.set(on);
    localStorage.setItem(QR_SOUND_KEY, on ? 'on' : 'off');
  }

  protected copyMenuUrl(): void {
    navigator.clipboard?.writeText(this.menuUrl()).then(
      () => this.toast.success('Menü bağlantısı kopyalandı.'),
      () => {}
    );
  }

  /** Kutucuktan işletme türü seçimi; onaylatıp uygular (ekranlar anında uyarlanır). */
  protected async pickSector(type: BusinessType): Promise<void> {
    const current = this.businessType();
    if (type === current || this.changingSector()) return;

    const label = this.sectors.find((s) => s.type === type)?.label ?? type;
    const ok = await this.confirm.confirm({
      title: 'İşletme türünü değiştir',
      message: `Ekranlar ve menü "${label}" düzenine göre uyarlanacak. Verileriniz silinmez. Devam edilsin mi?`,
      confirmText: 'Değiştir',
    });
    if (!ok) return;

    this.changingSector.set(true);
    this.auth.changeBusinessType(type).subscribe({
      next: () => {
        this.changingSector.set(false);
        this.open('');
        this.toast.success(`İşletme türü "${label}" olarak güncellendi.`);
      },
      error: (e) => {
        this.changingSector.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** KVKK: kişisel + işletme verilerini JSON dosyası olarak indirir. */
  protected exportData(): void {
    this.exporting.set(true);
    this.account.export().subscribe({
      next: (data) => {
        this.exporting.set(false);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cloudposgrid-verilerim_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast.success('Verileriniz indirildi.');
      },
      error: (e) => {
        this.exporting.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- İki Adımlı Doğrulama (2FA) ----
  protected openTwoFa(): void {
    this.twoFaSetup.set(null);
    this.twoFaCode.set('');
    this.recoveryCodes.set([]);
    this.disablePw.set('');
    this.open('twofa');
    // Kapalıysa kurulum gizini hazırla (QR/manuel giz gösterilir).
    if (!this.twoFaOn()) {
      this.auth.setup2fa().subscribe({
        next: (s) => this.twoFaSetup.set(s),
        error: (e) => this.toast.error(apiError(e, '2FA kurulumu başlatılamadı.')),
      });
    }
  }

  protected enableTwoFa(): void {
    const code = this.twoFaCode().trim();
    if (!code) { this.toast.error('Kodu girin.'); return; }
    this.twoFaBusy.set(true);
    this.auth.enable2fa(code).subscribe({
      next: (r) => {
        this.twoFaBusy.set(false);
        this.recoveryCodes.set(r.recoveryCodes);
        this.twoFaOn.set(true);
      },
      error: (e) => { this.twoFaBusy.set(false); this.toast.error(apiError(e, 'Kod doğrulanamadı.')); },
    });
  }

  protected disableTwoFa(): void {
    const pw = this.disablePw().trim();
    if (!pw) { this.toast.error('Şifrenizi girin.'); return; }
    this.twoFaBusy.set(true);
    this.auth.disable2fa(pw).subscribe({
      next: () => {
        this.twoFaBusy.set(false);
        this.twoFaOn.set(false);
        this.toast.success('2FA kapatıldı.');
        this.open('');
      },
      error: (e) => { this.twoFaBusy.set(false); this.toast.error(apiError(e, '2FA kapatılamadı.')); },
    });
  }

  protected finishTwoFa(): void {
    this.recoveryCodes.set([]);
    this.toast.success('İki adımlı doğrulama açıldı.');
    this.open('');
  }

  /** KVKK unutulma hakkı: şifre onayı + son bir uyarı sonrası hesabı kalıcı siler, oturumu kapatır. */
  protected async doDelete(): Promise<void> {
    const pw = this.deletePassword().trim();
    if (!pw) {
      this.toast.error('Şifrenizi girin.');
      return;
    }
    const ok = await this.confirm.confirm({
      title: 'Hesabı kalıcı olarak sil',
      message: 'İşletmeniz ve TÜM verileriniz (ürünler, cariler, satışlar) kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ. Devam edilsin mi?',
      danger: true,
      confirmText: 'Kalıcı olarak sil',
    });
    if (!ok) return;

    this.deleting.set(true);
    this.account.deleteAccount(pw).subscribe({
      next: () => {
        this.deleting.set(false);
        this.toast.success('Hesabınız ve tüm verileriniz silindi.');
        this.auth.clearSession();
        this.router.navigateByUrl('/giris');
      },
      error: (e) => {
        this.deleting.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  /** Oturum içinde şifre değiştir; sunucu yeni token verir → oturum kesintisiz devam eder, diğer oturumlar kapanır. */
  protected changePassword(): void {
    if (this.pwForm.invalid) {
      this.pwForm.markAllAsTouched();
      return;
    }
    this.changingPw.set(true);
    this.auth.changePassword(this.pwForm.getRawValue()).subscribe({
      next: () => {
        this.changingPw.set(false);
        this.open('');
        this.toast.success('Şifreniz güncellendi. Güvenlik için diğer oturumlar kapatıldı.');
      },
      error: (e) => {
        this.changingPw.set(false);
        this.toast.error(apiError(e, 'Şifre değiştirilemedi.'));
      },
    });
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Firma adı zorunludur.');
      return;
    }
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api.update({ ...v, defaultVatRate: +v.defaultVatRate, loyaltyEarnPercent: +v.loyaltyEarnPercent,
      maxManualDiscountPercent: +v.maxManualDiscountPercent,
      scaleBarcodeItemDigits: +v.scaleBarcodeItemDigits, scaleBarcodeValueDigits: +v.scaleBarcodeValueDigits,
      scaleBarcodeDecimals: +v.scaleBarcodeDecimals, scaleBarcodeEmbeds: v.scaleBarcodeEmbeds as ScaleEmbedMode,
      logoUrl: undefined }).subscribe({
      next: () => {
        this.saving.set(false);
        this.open('');
        this.toast.success('Ayarlar kaydedildi.');
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }
}
