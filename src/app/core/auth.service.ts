import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, of, shareReplay, tap, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthResponse, BusinessType, UserDto } from './models';
import { profileFor } from './business-profile';
import { skipErrorToast } from './http-context';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private api = environment.apiUrl;

  // Access token YALNIZCA bellekte tutulur (XSS yüzeyini küçültür).
  // Refresh token sunucu tarafında httpOnly+Secure cookie'de; JavaScript erişemez.
  private accessTokenValue: string | null = null;

  readonly user = signal<UserDto | null>(null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  /** Oturum açan kullanıcının rolü (yetkilendirme için). */
  readonly role = computed(() => this.user()?.role ?? null);
  /** İşletme tipine göre uyarlanan ekran profili (nav, terminoloji, feature flag). */
  readonly profile = computed(() => profileFor(this.user()?.businessType));

  get accessToken(): string | null {
    return this.accessTokenValue;
  }

  /** Kayıt için e-postaya doğrulama kodu gönderir. */
  sendCode(email: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/send-code`, { email }, skipErrorToast());
  }

  register(body: {
    companyName: string;
    fullName: string;
    email: string;
    password: string;
    businessType: BusinessType;
    code: string;
  }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/register`, body, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  /** İşletme tipini değiştirir; dönen güncel kullanıcı belleğe yazılır (profile otomatik güncellenir). */
  changeBusinessType(businessType: BusinessType): Observable<UserDto> {
    return this.http
      .put<UserDto>(`${this.api}/settings/business-type`, { businessType })
      .pipe(tap((u) => this.user.set(u)));
  }

  login(body: { email: string; password: string; twoFactorCode?: string }): Observable<AuthResponse> {
    // 2FA açık kullanıcıda ilk yanıt {twoFactorRequired:true} (token yok) → oturum AÇMA, istemci kod ister.
    return this.http.post<AuthResponse>(`${this.api}/auth/login`, body, skipErrorToast())
      .pipe(tap((r) => { if (!r.twoFactorRequired) this.setSession(r); }));
  }

  // ---- İki adımlı doğrulama (2FA) ----
  setup2fa(): Observable<import('./models').TwoFactorSetupDto> {
    return this.http.post<import('./models').TwoFactorSetupDto>(`${this.api}/auth/2fa/setup`, {});
  }
  enable2fa(code: string): Observable<import('./models').TwoFactorEnabledDto> {
    return this.http.post<import('./models').TwoFactorEnabledDto>(`${this.api}/auth/2fa/enable`, { code });
  }
  disable2fa(password: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/2fa/disable`, { password });
  }

  /** İşletmenin son giriş kayıtları (başarılı/başarısız, IP/cihaz) — şüpheli giriş görünürlüğü (#46). Owner/Admin. */
  loginHistory(take = 50): Observable<import('./models').LoginEventDto[]> {
    return this.http.get<import('./models').LoginEventDto[]>(`${this.api}/auth/login-history`, { params: { take } });
  }

  /** "Şifremi unuttum": e-postaya sıfırlama kodu ister. Enumerasyon için sunucu her zaman başarı döner. */
  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/forgot-password`, { email }, skipErrorToast());
  }

  /** E-posta koduyla yeni şifre belirler (tüm oturumlar kapanır, kullanıcı yeniden giriş yapar). */
  resetPassword(body: { email: string; code: string; newPassword: string }): Observable<void> {
    return this.http.post<void>(`${this.api}/auth/reset-password`, body, skipErrorToast());
  }

  /** Oturum içinde şifre değiştirir; sunucu yeni token verir → mevcut oturum kesintisiz devam eder. */
  changePassword(body: { currentPassword: string; newPassword: string }): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/change-password`, body, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  /** Tek tıkla demo: sunucu örnek verili geçici işletme kurar, oturum otomatik açılır (24 saat). */
  demo(): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/demo`, {}, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  /** Paylaşılan terminalde PIN ile personel değiştirir (mevcut işletme içinde). */
  pinLogin(pin: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/pin-login`, { pin }, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  /** Çok-şirket (#47): aktif işletmeyi değiştirir (hesabın hedef tenant'taki üyeliğine yeni token+cookie). */
  switchTenant(tenantId: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/switch-tenant`, { tenantId }, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  /** Mevcut hesaba yeni işletme ekler (tenant+şema+Owner üyeliği) ve ona geçer. */
  createBusiness(companyName: string, businessType: BusinessType): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.api}/auth/businesses`, { companyName, businessType }, skipErrorToast()).pipe(tap((r) => this.setSession(r)));
  }

  // Uçuştaki tek yenileme: eşzamanlı 401'ler aynı refresh çağrısını paylaşır.
  private refresh$: Observable<AuthResponse> | null = null;

  refresh(): Observable<AuthResponse> {
    // Eşzamanlı 401'lerde her istek ayrı refresh atarsa: ilki refresh token'ı rotasyonla
    // iptal eder, ikincisi ARTIK iptal edilmiş cookie'yi gönderir → sunucu bunu "çalıntı token"
    // sanıp TÜM oturumları kapatır (kullanıcı sebepsiz atılır). Tek in-flight yenileme paylaşarak
    // bunu önlüyoruz; tamamlanınca alanı sıfırlayıp sonraki yenilemeye izin veriyoruz.
    if (this.refresh$) return this.refresh$;
    // Refresh token gövdede değil cookie'de gider (interceptor withCredentials ekler).
    // skipErrorToast: yenileme SESSİZ bir işlemdir. Başarısız olduğunda kullanıcı zaten giriş
    // ekranına düşer; ayrıca "Bir hata oluştu" toast'ı atmak kafa karıştırır. Bu özellikle
    // açılışta önemli: API uykudaysa/erişilemezse ilk ziyaretçi hiçbir şey yapmadan hata görürdü.
    // (401 zaten interceptor'da sessiz; buradaki koruma ağ hatası, CORS ve zaman aşımı içindir.)
    this.refresh$ = this.http.post<AuthResponse>(`${this.api}/auth/refresh`, {}, skipErrorToast()).pipe(
      // Süre sınırı KAYNAĞA bağlı olmalı. Aşağıdaki shareReplay'in ÜSTÜNE konursa isteği
      // gerçekten iptal etmez (shareReplay varsayılan olarak kaynağa abone kalır): çağıran
      // vazgeçer, kullanıcı giriş ekranına düşer, sonra geç gelen yanıt setSession'ı çalıştırıp
      // "giriş ekranındayım ama oturum açık" gibi tutarsız bir duruma yol açar. Burada,
      // tap'ten önce durduğu için zaman aşımında istek iptal edilir ve setSession hiç çalışmaz.
      // Ücretsiz barındırmada API uykudan uyanırken bu çağrı dakikayı bulabiliyor; açılışı
      // (provideAppInitializer) sonsuza kadar bekletmemesi için sınır şart.
      timeout(20_000),
      tap((r) => this.setSession(r)),
      finalize(() => (this.refresh$ = null)),
      shareReplay(1),
    );
    return this.refresh$;
  }

  /** Uygulama açılışında sessiz oturum geri yükleme: cookie geçerliyse access token + kullanıcı belleğe alınır. */
  restoreSession(): Observable<AuthResponse | null> {
    return this.refresh().pipe(
      // Süre sınırı refresh()'in içinde (kaynağa bağlı) — buraya konursa isteği iptal etmiyordu.
      // Süre aşımında ya da hatada oturumsuz devam ediyoruz: giriş ekranı açılır, kullanıcı
      // giriş yaptığında API çoktan uyanmış olur.
      catchError(() => {
        this.clearSession();
        return of(null);
      })
    );
  }

  logout(): void {
    this.http.post(`${this.api}/auth/logout`, {}).subscribe({ error: () => {} });
    this.clearSession();
    this.router.navigateByUrl('/giris');
  }

  setSession(r: AuthResponse): void {
    this.accessTokenValue = r.accessToken;
    this.user.set(r.user);
  }

  clearSession(): void {
    this.accessTokenValue = null;
    this.user.set(null);
  }
}
