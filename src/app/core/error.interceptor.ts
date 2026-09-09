import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from './toast.service';
import { apiError } from './utils';
import { SKIP_ERROR_TOAST } from './http-context';

/**
 * Tüm HTTP hatalarını tek yerden bildirir. 401 (auth interceptor / login yönetir) ve
 * SKIP_ERROR_TOAST işaretli istekler (ekran hatayı kendi gösterir) hariç toast atar.
 * 402 (deneme/abonelik kilidi) yakalanınca yükseltme ekranına yönlendirir.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 402 && err.error?.code === 'SUBSCRIPTION_REQUIRED') {
          toast.error(err.error?.error ?? 'Aboneliğiniz sona erdi. Lütfen paketinizi yükseltin.');
          if (!router.url.startsWith('/yukselt')) router.navigateByUrl('/yukselt');
        } else if (err.status === 403 && err.error?.code === 'PLAN_UPGRADE_REQUIRED') {
          toast.error(err.error?.detail ?? 'Bu özellik mevcut paketinizde yok. Yükseltin.');
          if (!router.url.startsWith('/yukselt')) router.navigateByUrl('/yukselt');
        } else if (err.status !== 401 && !req.context.get(SKIP_ERROR_TOAST)) {
          toast.error(apiError(err));
        }
      }
      return throwError(() => err);
    })
  );
};
