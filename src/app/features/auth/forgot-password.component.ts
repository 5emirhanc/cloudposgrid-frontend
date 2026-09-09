import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChildren } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { apiError } from '../../core/utils';

const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 600; // backend kodu 10 dk geçerli tutuyor
const RESEND_COOLDOWN_SECONDS = 30;

/**
 * "Şifremi unuttum" akışı — 2 adım:
 *  1) E-posta gir → sunucu (kayıtlıysa) 6 haneli sıfırlama kodu gönderir (enumerasyon-güvenli: her zaman "gönderildi").
 *  2) Kod + yeni şifre → şifre sıfırlanır, tüm oturumlar kapanır → /giris'e yönlenir.
 */
@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="flex min-h-screen bg-slate-100">
      <!-- Sol marka paneli -->
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
          <h1 class="text-4xl font-black leading-tight">Şifrenizi mi<br />unuttunuz?</h1>
          <p class="mt-4 max-w-md text-white/80">
            E-postanıza göndereceğimiz kodla birkaç adımda yeni şifre belirleyin.
          </p>
        </div>
        <p class="relative text-xs text-white/60">Güvenliğiniz için sıfırlama sonrası tüm oturumlar kapatılır.</p>
      </div>

      <!-- Sağ form -->
      <div class="flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div class="w-full max-w-sm">
          <div class="mb-8 flex items-center gap-2.5 lg:hidden">
            <img src="/logo.svg" alt="CloudPosGrid" class="h-9 w-9 rounded-xl" />
            <span class="text-lg font-extrabold text-slate-800">CloudPosGrid</span>
          </div>

          @if (step() === 1) {
            <h2 class="text-2xl font-black text-slate-900">Şifre sıfırlama</h2>
            <p class="mt-1 text-sm text-slate-500">Hesabınızın e-postasını girin, size bir kod gönderelim.</p>

            <form [formGroup]="emailForm" (ngSubmit)="sendCode()" class="mt-8 space-y-5">
              <div>
                <label class="label">E-posta</label>
                <div class="relative">
                  <lucide-icon name="mail" class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
                  <input type="email" formControlName="email" class="input pl-11" placeholder="ornek@firma.com" autocomplete="email" />
                </div>
                @if (emailForm.controls.email.touched && emailForm.controls.email.invalid) {
                  <p class="mt-1 text-xs text-rose-600">Geçerli bir e-posta girin.</p>
                }
              </div>

              <button type="submit" class="btn-primary w-full" [disabled]="sending()">
                @if (sending()) { Kod gönderiliyor... } @else { Sıfırlama Kodu Gönder <lucide-icon name="arrow-right" class="h-4 w-4"></lucide-icon> }
              </button>
            </form>
          } @else {
            <button type="button" class="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700" (click)="step.set(1)">
              <lucide-icon name="chevron-right" class="h-4 w-4 rotate-180"></lucide-icon> Geri
            </button>

            <h2 class="text-2xl font-black text-slate-900">Yeni şifre belirleyin</h2>
            <p class="mt-1 text-sm text-slate-500">
              <span class="font-semibold text-slate-700">{{ emailForm.controls.email.value }}</span> adresine gönderdiğimiz {{ codeLength }} haneli kodu girin.
            </p>

            <!-- 6 kutulu kod girişi -->
            <div class="mt-6 flex justify-between gap-2" (paste)="onPaste($event)">
              @for (d of digits(); track $index) {
                <input
                  #digitInput
                  class="h-14 w-12 rounded-xl border text-center text-2xl font-black tracking-tight text-slate-900 outline-none transition sm:w-14"
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

            <div class="mt-2 text-center text-sm">
              @if (secondsLeft() > 0) {
                <span class="text-slate-400">Kodun süresi: <span class="font-semibold text-slate-600">{{ formattedTime() }}</span></span>
              } @else {
                <span class="font-medium text-rose-600">Kodun süresi doldu, yeni kod isteyin.</span>
              }
            </div>

            <form [formGroup]="resetForm" (ngSubmit)="submit()" class="mt-6 space-y-4">
              <div>
                <label class="label">Yeni Şifre</label>
                <div class="relative">
                  <lucide-icon name="lock" class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
                  <input [type]="showPassword() ? 'text' : 'password'" formControlName="newPassword" class="input pl-11 pr-10"
                         placeholder="En az 8 karakter, harf ve rakam" autocomplete="new-password" />
                  <button type="button" (click)="showPassword.set(!showPassword())" tabindex="-1"
                          class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <lucide-icon [name]="showPassword() ? 'eye-off' : 'eye'" class="h-4 w-4"></lucide-icon>
                  </button>
                </div>
                <div class="mt-2 space-y-1">
                  @for (r of pwdRules(); track r.label) {
                    <p class="flex items-center gap-1.5 text-xs" [class]="r.ok ? 'text-emerald-600' : 'text-slate-400'">
                      <lucide-icon [name]="r.ok ? 'check' : 'x'" class="h-3.5 w-3.5"></lucide-icon>
                      {{ r.label }}
                    </p>
                  }
                </div>
              </div>

              @if (codeError()) {
                <p class="text-sm font-medium text-rose-600">{{ codeError() }}</p>
              }

              <button type="submit" class="btn-primary w-full"
                      [disabled]="loading() || code().length < codeLength || resetForm.invalid">
                @if (loading()) { Şifre güncelleniyor... } @else { Şifreyi Sıfırla }
              </button>
              <button type="button" class="w-full text-center text-sm font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-slate-300"
                      [disabled]="sending() || resendCooldown() > 0" (click)="resend()">
                @if (sending()) { Gönderiliyor... } @else if (resendCooldown() > 0) { Kodu tekrar gönder ({{ resendCooldown() }}s) } @else { Kodu tekrar gönder }
              </button>
            </form>
          }

          <p class="mt-6 text-center text-sm text-slate-500">
            Şifrenizi hatırladınız mı?
            <a routerLink="/giris" class="font-semibold text-brand-600 hover:text-brand-700">Giriş yapın</a>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class ForgotPasswordComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  protected readonly codeLength = CODE_LENGTH;

  protected step = signal(1);
  protected sending = signal(false);
  protected loading = signal(false);
  protected showPassword = signal(false);

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

  protected emailForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected resetForm = this.fb.nonNullable.group({
    // Backend kuralıyla birebir: en az 8 karakter + en az bir harf + bir rakam.
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.pattern(/^(?=.*[A-Za-zÇĞİÖŞÜçğıöşü])(?=.*\d).*$/)]],
  });

  private pwd = toSignal(this.resetForm.controls.newPassword.valueChanges, { initialValue: '' });
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

  /** Adım 1: e-postaya sıfırlama kodu gönder, adım 2'ye geç. */
  protected sendCode(): void {
    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.auth.forgotPassword(this.emailForm.controls.email.value).subscribe({
      next: () => {
        this.sending.set(false);
        this.resetCode();
        this.step.set(2);
        this.startExpiryTimer();
        this.startResendCooldown();
        // Enumerasyon: kayıtlı olsun olmasın aynı mesaj.
        this.toast.success('E-postanız kayıtlıysa sıfırlama kodu gönderildi.');
        this.focusDigit(0);
      },
      error: (e) => {
        this.sending.set(false);
        this.toast.error(apiError(e, 'İşlem başarısız. Lütfen tekrar deneyin.'));
      },
    });
  }

  protected resend(): void {
    this.sending.set(true);
    this.auth.forgotPassword(this.emailForm.controls.email.value).subscribe({
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

    if (value && index < this.codeLength - 1) this.focusDigit(index + 1);
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
    this.focusDigit(Math.min(digits.length, this.codeLength) - 1);
  }

  /** Adım 2: kod + yeni şifre ile sıfırla. */
  protected submit(): void {
    if (this.code().length < this.codeLength) {
      this.codeError.set(`${this.codeLength} haneli kodu girin.`);
      return;
    }
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.auth
      .resetPassword({
        email: this.emailForm.controls.email.value,
        code: this.code(),
        newPassword: this.resetForm.controls.newPassword.value,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.toast.success('Şifreniz güncellendi. Yeni şifrenizle giriş yapabilirsiniz.');
          this.router.navigateByUrl('/giris');
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
