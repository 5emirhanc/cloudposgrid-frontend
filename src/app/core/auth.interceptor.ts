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
  const isAuthEndpoint =
    req.url.includes('/auth/login') ||
    req.url.includes('/auth/register') ||
    req.url.includes('/auth/refresh');

  let authReq = req;
  if (isApi) {
    const token = auth.accessToken;
    const headers: Record<string, string> = {};
    if (token && !isAuthEndpoint) headers['Authorization'] = `Bearer ${token}`;
    // Çok şube: seçili şube başlığı (null ise gönderilmez → birleşik görünüm).
    const bid = branch.currentBranchId();
    if (bid && !isAuthEndpoint) headers['X-Branch-Id'] = bid;
    authReq = req.clone({
      // httpOnly refresh cookie'sinin gönderilip ayarlanabilmesi için tüm API isteklerinde gerekli.
      withCredentials: true,
      setHeaders: headers,
    });
  }

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      // Access token süresi dolmuşsa cookie ile sessizce yenile ve isteği bir kez tekrarla.
      if (err.status === 401 && isApi && !isAuthEndpoint) {
        return auth.refresh().pipe(
          switchMap((r) =>
            next(authReq.clone({ setHeaders: { Authorization: `Bearer ${r.accessToken}` } }))
          ),
          catchError((refreshErr) => {
            auth.clearSession();
            return throwError(() => refreshErr);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
