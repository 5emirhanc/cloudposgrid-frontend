import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { DealerAuthService } from './dealer-auth.service';
import { BranchStore } from './branch.store';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const adminAuth = inject(AdminAuthService);
  const dealerAuth = inject(DealerAuthService);
  const branch = inject(BranchStore);
  const router = inject(Router);

  const isApi = req.url.startsWith(environment.apiUrl);
  const isAdminApi = req.url.includes('/api/admin');
  const isDealerApi = req.url.includes('/api/dealer');

  // --- Platform yönetici (ayrı oturum) ---
  if (isAdminApi) {
    // Auth uçları (login/refresh/logout) Authorization taşımaz ama httpOnly refresh cookie'sinin
    // gönderilip ayarlanabilmesi için tüm admin isteklerinde withCredentials gerekir.
    const isAdminAuthEndpoint = req.url.includes('/admin/auth/');
    const t = adminAuth.token();
    const headers: Record<string, string> = {};
    if (t && !isAdminAuthEndpoint) headers['Authorization'] = `Bearer ${t}`;
    const adminReq = req.clone({ withCredentials: true, setHeaders: headers });
    return next(adminReq).pipe(
      catchError((err: HttpErrorResponse) => {
        // Erişim token'ı süresi dolmuşsa refresh cookie ile sessizce yenile ve isteği bir kez tekrarla.
        if (err.status === 401 && !isAdminAuthEndpoint) {
          return adminAuth.restore().pipe(
            switchMap((ok) => {
              if (!ok) {
                adminAuth.clear();
                router.navigateByUrl('/yonetim/giris');
                return throwError(() => err);
              }
              return next(adminReq.clone({ withCredentials: true, setHeaders: { Authorization: `Bearer ${adminAuth.token()}` } }));
            })
          );
        }
        return throwError(() => err);
      })
    );
  }

  // --- Bayi (ayrı oturum, kendi cookie'si) ---
  if (isDealerApi) {
    const isDealerAuthEndpoint = req.url.includes('/dealer/auth/');
    const t = dealerAuth.token();
    const headers: Record<string, string> = {};
    if (t && !isDealerAuthEndpoint) headers['Authorization'] = `Bearer ${t}`;
    const dealerReq = req.clone({ withCredentials: true, setHeaders: headers });
    return next(dealerReq).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401 && !isDealerAuthEndpoint) {
          return dealerAuth.restore().pipe(
            switchMap((ok) => {
              if (!ok) {
                dealerAuth.clear();
                router.navigateByUrl('/bayi/giris');
                return throwError(() => err);
              }
              return next(dealerReq.clone({ withCredentials: true, setHeaders: { Authorization: `Bearer ${dealerAuth.token()}` } }));
            })
          );
        }
        return throwError(() => err);
      })
    );
  }

  // --- Tenant oturumu ---
  // İki AYRI kavram; tek bayrakta birleştirilemez:
  //   a) uç Authorization taşımaz mı?
  //   b) ucun 401'i "token süresi doldu" sayılmalı mı?
  // Sorgu dizesi ayıklanıp TAM EŞLEŞME kullanılıyor: `includes('/auth/login')` aynı zamanda
  // `/auth/login-history` ile de eşleşiyordu, o yüzden giriş geçmişi ekranı hiçbir zaman
  // Authorization başlığı alamıyor ve kalıcı olarak 401 dönüyordu.
  const path = req.url.split('?')[0];

  const isAnonymousAuthEndpoint =
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/register') ||
    path.endsWith('/auth/refresh');

  // pin-login BURAYA dahil, yukarıya DEĞİL: uç [Authorize] olduğu ve mevcut oturumun işletmesini
  // kullandığı için token'a ihtiyacı var. Ama yanlış PIN'in 401'i kullanıcı hatasıdır; yenileyip
  // tekrar denemek paylaşılan POS terminalinde tek yazım hatasıyla tüm oturumu düşürüyordu.
  const skipRefreshOn401 = isAnonymousAuthEndpoint || path.endsWith('/auth/pin-login');

  let authReq = req;
  if (isApi) {
    const token = auth.accessToken;
    const headers: Record<string, string> = {};
    if (token && !isAnonymousAuthEndpoint) headers['Authorization'] = `Bearer ${token}`;
    // Çok şube: seçili şube başlığı (null ise gönderilmez → birleşik görünüm).
    const bid = branch.currentBranchId();
    if (bid && !isAnonymousAuthEndpoint) headers['X-Branch-Id'] = bid;
    authReq = req.clone({
      // httpOnly refresh cookie'sinin gönderilip ayarlanabilmesi için tüm API isteklerinde gerekli.
      withCredentials: true,
      setHeaders: headers,
    });
  }

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Access token süresi dolmuşsa cookie ile sessizce yenile ve isteği bir kez tekrarla.
      if (err.status === 401 && isApi && !skipRefreshOn401) {
        return auth.refresh().pipe(
          // catchError YALNIZ yenilemeye bağlı olmalı. Önceden switchMap'ten SONRA geliyordu;
          // o hâlde yenileme BAŞARILI olsa bile tekrarlanan isteğin herhangi bir hatası
          // (sunucu 500'ü, ağ kopması, iş kuralı hatası) oturumu siliyordu.
          catchError((refreshErr) => {
            auth.clearSession();
            // Admin (satır 39) ve bayi (satır 65) dallarıyla aynı davranış. Yönlendirme olmadan
            // kullanıcı ölü oturumla aynı ekranda kalıyordu: authGuard yalnız ebeveyn rotada
            // canActivate olarak bağlı (canActivateChild yok), bu yüzden uygulama içi gezinmede
            // yeniden çalışmıyor — yani kendiliğinden kurtarma hiç yoktu.
            router.navigateByUrl('/giris');
            return throwError(() => refreshErr);
          }),
          switchMap((r) =>
            next(authReq.clone({ setHeaders: { Authorization: `Bearer ${r.accessToken}` } }))
          )
        );
      }
      return throwError(() => err);
    })
  );
};
