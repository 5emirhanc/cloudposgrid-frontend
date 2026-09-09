import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { apiError } from '../../core/utils';
import { SECTOR_OPTIONS } from '../../core/business-profile';
import { BusinessType } from '../../core/models';

const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 600; // backend kodu 10 dk geçerli tutuyor
const RESEND_COOLDOWN_SECONDS = 30;

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex min-h-screen">
      <div class="relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex"
           style="background:linear-gradient(155deg,#1e3a8a,#2563eb 55%,#0ea5c4)">
        <div class="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl"></div>
        <div class="absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-white/10 blur-3xl"></div>
        <div class="relative flex items-center gap-2.5">
          <span class="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
            <img src="/logo.svg" alt="" class="h-7 w-7" />
          </span>
          <span class="text-xl font-extrabold">CloudPosGrid</span>
        </div>
        <div class="relative">
          <h1 class="text-4xl font-black leading-tight">14 gün<br />ücretsiz deneyin.</h1>
          <p class="mt-4 max-w-md text-white/80">
            Kredi kartı gerekmez. İşletme türünüzü seçin, dakikalar içinde size özel uyarlanmış ekranla başlayın.
          </p>
        </div>
        <p class="relative text-xs text-white/60">© 2026 CloudPosGrid. Tüm hakları saklıdır.</p>
      </div>

      <div class="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div class="w-full max-w-md">
          <!-- Adım göstergesi -->
          <div class="mb-8 flex items-center gap-2">
            @for (n of [1, 2, 3]; track n) {
              <span class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                [class]="step() >= n ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'">{{ n }}</span>
              @if (n < 3) { <span class="h-0.5 w-8 rounded" [class]="step() > n ? 'bg-brand-600' : 'bg-slate-200'"></span> }
            }
            <span class="ml-2 text-sm text-slate-400">
              {{ step() === 1 ? 'İşletme türü' : step() === 2 ? 'Bilgiler' : 'Doğrulama' }}
            </span>
          </div>

          @if (step() === 1) {
            <h2 class="text-2xl font-black tracking-tight text-slate-900">İşletmeniz ne tür?</h2>
            <p class="mt-1 text-sm text-slate-500">Ekranlar, menü ve özellikler seçiminize göre uyarlanır.</p>

            <div class="mt-6 space-y-2">
              @for (s of sectors; track s.type) {
                <button type="button"
                  class="flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition"
                  [class]="selected() === s.type ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'"
                  (click)="selected.set(s.type)">
                  <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600">
                    <lucide-icon [name]="s.icon" class="h-5 w-5"></lucide-icon>
                  </span>
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold text-slate-800">{{ s.label }}</p>
                    <p class="truncate text-xs text-slate-500">{{ s.description }}</p>
                  </div>
                  @if (selected() === s.type) {
                    <lucide-icon name="check" class="h-5 w-5 shrink-0 text-brand-600"></lucide-icon>
                  }
                </button>
              }
            </div>

            <button type="button" class="btn-primary mt-6 w-full" (click)="step.set(2)">
              Devam Et <lucide-icon name="chevron-right" class="h-4 w-4"></lucide-icon>
            </button>
          } @else if (step() === 2) {
            <button type="button" class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700" (click)="step.set(1)">
              <lucide-icon name="chevron-right" class="h-4 w-4 rotate-180"></lucide-icon> Geri
            </button>

            <h2 class="text-2xl font-black tracking-tight text-slate-900">İşletme bilgileriniz</h2>
            <div class="mt-2 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
              <lucide-icon [name]="selectedProfile().icon" class="h-4 w-4"></lucide-icon>
              {{ selectedProfile().label }}
              <button type="button" class="font-semibold underline" (click)="step.set(1)">değiştir</button>
            </div>

            <form [formGroup]="form" (ngSubmit)="sendCodeAndNext()" class="mt-6 space-y-4">
              <div>
                <label class="label">İşletme Adı</label>
                <input formControlName="companyName" class="input" placeholder="Örn. Kahve Dünyası" />
                @if (form.controls.companyName.touched && form.controls.companyName.invalid) {
                  <p class="mt-1 text-xs text-rose-600">İşletme adı zorunlu.</p>
                }
              </div>
              <div>
                <label class="label">Ad Soyad</label>
                <input formControlName="fullName" class="input" placeholder="Adınız Soyadınız" />
                @if (form.controls.fullName.touched && form.controls.fullName.invalid) {
                  <p class="mt-1 text-xs text-rose-600">Ad soyad zorunlu.</p>
                }
              </div>
              <div>
                <label class="label">E-posta</label>
                <input type="email" formControlName="email" class="input" placeholder="ornek@firma.com" />
                @if (form.controls.email.touched && form.controls.email.invalid) {
                  <p class="mt-1 text-xs text-rose-600">Geçerli bir e-posta girin.</p>
                }
              </div>
              <div>
                <label class="label">Şifre</label>
                <input type="password" formControlName="password" class="input" placeholder="En az 8 karakter, harf ve rakam içermeli" />
                <div class="mt-2 space-y-1">
                  @for (r of pwdRules(); track r.label) {
                    <p class="flex items-center gap-1.5 text-xs" [class]="r.ok ? 'text-emerald-600' : 'text-slate-400'">
                      <lucide-icon [name]="r.ok ? 'check' : 'x'" class="h-3.5 w-3.5"></lucide-icon>
                      {{ r.label }}
                    </p>
                  }
                </div>
              </div>

              <button type="submit" class="btn-primary w-full" [disabled]="sending()">
                @if (sending()) { Kod gönderiliyor... } @else { Doğrulama Kodu Gönder }
              </button>

              <!-- Yasal onam: kayıt ile koşullar + KVKK kabul edilmiş sayılır -->
              <p class="text-center text-xs leading-relaxed text-slate-400">
                Kayıt olarak
                <a href="https://cloudposgrid.com/kullanim-kosullari" target="_blank" rel="noopener" class="font-medium text-slate-500 underline hover:text-brand-600">Kullanım Koşulları</a>'nı
                kabul etmiş,
                <a href="https://cloudposgrid.com/kvkk" target="_blank" rel="noopener" class="font-medium text-slate-500 underline hover:text-brand-600">KVKK Aydınlatma Metni</a>'ni
                okumuş sayılırsınız.
              </p>
            </form>
          } @else {
            <button type="button" class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700" (click)="step.set(2)">
              <lucide-icon name="chevron-right" class="h-4 w-4 rotate-180"></lucide-icon> Geri
            </button>

            <h2 class="text-2xl font-black tracking-tight text-slate-900">E-postanızı doğrulayın</h2>
            <p class="mt-1 text-sm text-slate-500">
              <span class="font-semibold text-slate-700">{{ form.controls.email.value }}</span> adresine gönderdiğimiz {{ codeLength }} haneli kodu girin.
            </p>

            <!-- 6 kutulu kod girişi -->
            <div class="mt-6 flex justify-between gap-2" (paste)="onPaste($event)">
              @for (d of digits(); track $index) {
                <input
                  #digitInput
                  class="code-box h-14 w-12 rounded-xl border text-center text-2xl font-black tracking-tight text-slate-900 outline-none transition sm:w-14"
                  [class]="codeError() ? 'border-rose-400 bg-rose-50 focus:border-rose-500' : 'border-slate-200 focus:border-brand-500'"
                  inputmode="numeric"
                  maxlength="1"
                  [value]="d"
                  [disabled]="loading()"
                  (input)="onDigitInput($index, $event)"
                  (keydown)="onDigitKeydown($index, $event)"
                />
              }
            </div>

            @if (codeError()) {
              <p class="mt-2 text-center text-sm font-medium text-rose-600">{{ codeError() }}</p>
            }

            <div class="mt-4 text-center text-sm">
              @if (secondsLeft() > 0) {
                <span class="text-slate-400">Kodun süresi: <span class="font-semibold text-slate-600">{{ formattedTime() }}</span></span>
              } @else {
                <span class="font-medium text-rose-600">Kodun süresi doldu, yeni kod isteyin.</span>
              }
            </div>

            <button type="button" class="btn-primary mt-4 w-full" [disabled]="loading() || code().length < codeLength" (click)="submit()">
              @if (loading()) { Doğrulanıyor... } @else { Doğrula ve Tamamla }
            </button>
            <button type="button" class="mt-3 w-full text-center text-sm font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-300"
              [disabled]="sending() || resendCooldown() > 0" (click)="resend()">
              @if (sending()) { Gönderiliyor... } @else if (resendCooldown() > 0) { Kodu tekrar gönder ({{ resendCooldown() }}s) } @else { Kodu tekrar gönder }
            </button>
          }

          <p class="mt-6 text-center text-sm text-slate-500">
            Zaten hesabınız var mı?
            <a routerLink="/giris" class="font-semibold text-brand-600 hover:text-brand-700">Giriş yapın</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class RegisterComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected readonly codeLength = CODE_LENGTH;

  protected loading = signal(false);
  protected sending = signal(false);
  protected step = signal(1);
  protected sectors = SECTOR_OPTIONS;
  protected selected = signal<BusinessType>('General');
  protected selectedProfile = computed(() => this.sectors.find((s) => s.type === this.selected()) ?? this.sectors[0]);

  protected digits = signal<string[]>(Array(CODE_LENGTH).fill(''));
  protected code = computed(() => this.digits().join(''));
  protected codeError = signal('');
  protected secondsLeft = signal(0);
  protected resendCooldown = signal(0);
  protected formattedTime = computed(() => {
    const s = this.secondsLeft();
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });

  private digitInputs = viewChildren<ElementRef<HTMLInputElement>>('digitInput');
  private expiryTimer?: ReturnType<typeof setInterval>;
  private cooldownTimer?: ReturnType<typeof setInterval>;

  protected form = this.fb.nonNullable.group({
    companyName: ['', Validators.required],
    fullName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    // Backend kuralıyla birebir: en az 8 karakter + en az bir harf + bir rakam.
    password: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[A-Za-zÇĞİÖŞÜçğıöşü])(?=.*\d).*$/)]],
  });

  // Şifre kural göstergesi (canlı yeşil tikler) — kurallara uymadan kod adımına geçilemez.
  private pwd = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected pwdRules = computed(() => {
    const p = this.pwd() ?? '';
    return [
      { ok: p.length >= 8, label: 'En az 8 karakter' },
      { ok: /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(p), label: 'En az bir harf' },
      { ok: /\d/.test(p), label: 'En az bir rakam' },
    ];
  });

  ngOnDestroy(): void {
    clearInterval(this.expiryTimer);
    clearInterval(this.cooldownTimer);
  }

  /** Adım 2: bilgileri doğrula, kodu gönder, adım 3'e geç. */
  protected sendCodeAndNext(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.auth.sendCode(this.form.controls.email.value).subscribe({
      next: () => {
        this.sending.set(false);
        this.resetCode();
        this.step.set(3);
        this.startExpiryTimer();
        this.startResendCooldown();
        this.toast.success('Doğrulama kodu e-postanıza gönderildi.');
        this.focusDigit(0);
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(apiError(e, 'Kod gönderilemedi.'));
      },
    });
  }

  protected resend(): void {
    this.sending.set(true);
    this.auth.sendCode(this.form.controls.email.value).subscribe({
      next: () => {
        this.sending.set(false);
        this.resetCode();
        this.startExpiryTimer();
        this.startResendCooldown();
        this.toast.success('Kod tekrar gönderildi.');
        this.focusDigit(0);
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(apiError(e, 'Kod gönderilemedi.'));
      },
    });
  }

  protected onDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);

    this.digits.update((d) => {
      const next = [...d];
      next[index] = value;
      return next;
    });
    this.codeError.set('');

    if (value && index < this.codeLength - 1) {
      this.focusDigit(index + 1);
    } else if (value && index === this.codeLength - 1 && this.code().length === this.codeLength) {
      this.submit();
    }
  }

  protected onDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      this.focusDigit(index - 1);
      this.digits.update((d) => {
        const next = [...d];
        next[index - 1] = '';
        return next;
      });
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' && index > 0) {
      this.focusDigit(index - 1);
    } else if (event.key === 'ArrowRight' && index < this.codeLength - 1) {
      this.focusDigit(index + 1);
    }
  }

  protected onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = text.replace(/\D/g, '').slice(0, this.codeLength).split('');
    if (!digits.length) return;
    event.preventDefault();

    this.digits.set([...digits, ...Array(this.codeLength - digits.length).fill('')]);
    this.codeError.set('');
    const lastFilled = Math.min(digits.length, this.codeLength) - 1;
    this.focusDigit(lastFilled);
    if (digits.length === this.codeLength) this.submit();
  }

  /** Adım 3: kodu doğrula ve kaydı tamamla. */
  protected submit(): void {
    if (this.code().length < this.codeLength) {
      this.codeError.set(`${this.codeLength} haneli kodu girin.`);
      return;
    }
    this.loading.set(true);
    this.auth.register({ ...this.form.getRawValue(), businessType: this.selected(), code: this.code() }).subscribe({
      next: () => {
        this.loading.set(false);
        this.toast.success('İşletmeniz oluşturuldu, hoş geldiniz!');
        this.router.navigateByUrl('/');
      },
      error: (e) => {
        this.loading.set(false);
        this.codeError.set(apiError(e, 'Kod hatalı veya süresi dolmuş.'));
        this.resetCode();
        this.focusDigit(0);
      },
    });
  }

  private resetCode(): void {
    this.digits.set(Array(this.codeLength).fill(''));
    this.codeError.set('');
  }

  private focusDigit(index: number): void {
    queueMicrotask(() => this.digitInputs()[index]?.nativeElement.focus());
  }

  private startExpiryTimer(): void {
    clearInterval(this.expiryTimer);
    this.secondsLeft.set(CODE_TTL_SECONDS);
    this.expiryTimer = setInterval(() => {
      this.secondsLeft.update((s) => Math.max(0, s - 1));
      if (this.secondsLeft() === 0) clearInterval(this.expiryTimer);
    }, 1000);
  }

  private startResendCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.resendCooldown.set(RESEND_COOLDOWN_SECONDS);
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown.update((s) => Math.max(0, s - 1));
      if (this.resendCooldown() === 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }
}
