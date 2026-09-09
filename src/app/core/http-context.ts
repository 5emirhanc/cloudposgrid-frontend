import { HttpContext, HttpContextToken } from '@angular/common/http';

/** true ise global hata interceptor'ı o istek için toast göstermez (ekran hatayı kendi gösterir). */
export const SKIP_ERROR_TOAST = new HttpContextToken<boolean>(() => false);

/** İnline/özel hata gösteren istekler için hazır options. */
export const skipErrorToast = () => ({ context: new HttpContext().set(SKIP_ERROR_TOAST, true) });
