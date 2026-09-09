import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { AdminAuthService } from './admin-auth.service';
import { DealerAuthService } from './dealer-auth.service';
import { BusinessProfile } from './business-profile';
import { EntitlementsDto, UserRole } from './models';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isAuthenticated()) return true;
  router.navigateByUrl('/giris');
  return false;
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  router.navigateByUrl('/');
  return false;
};

/** Platform yönetici oturumu varsa panele izin verir; yoksa httpOnly refresh cookie ile
 * sessizce geri yüklemeyi dener (sayfa yenileme), o da olmazsa admin giriş sayfasına yollar. */
export const adminAuthGuard: CanActivateFn = () => {
  const admin = inject(AdminAuthService);
  const router = inject(Router);
  if (admin.isAuthenticated()) return true;
  return admin.restore().pipe(map((ok) => ok || router.createUrlTree(['/yonetim/giris'])));
};

/** Admin zaten girişliyse (veya geçerli refresh cookie varsa) giriş sayfasını atlatır. */
export const adminGuestGuard: CanActivateFn = () => {
  const admin = inject(AdminAuthService);
  const router = inject(Router);
  if (admin.isAuthenticated()) return router.createUrlTree(['/yonetim']);
  return admin.restore().pipe(map((ok) => (ok ? router.createUrlTree(['/yonetim']) : true)));
};

/** Bayi (#25) oturumu varsa panele izin verir; yoksa refresh cookie ile geri yüklemeyi dener, olmazsa bayi girişine. */
export const dealerAuthGuard: CanActivateFn = () => {
  const dealer = inject(DealerAuthService);
  const router = inject(Router);
  if (dealer.isAuthenticated()) return true;
  return dealer.restore().pipe(map((ok) => ok || router.createUrlTree(['/bayi/giris'])));
};

/** Bayi zaten girişliyse giriş sayfasını atlatır. */
export const dealerGuestGuard: CanActivateFn = () => {
  const dealer = inject(DealerAuthService);
  const router = inject(Router);
  if (dealer.isAuthenticated()) return router.createUrlTree(['/bayi']);
  return dealer.restore().pipe(map((ok) => (ok ? router.createUrlTree(['/bayi']) : true)));
};

/** Belirli rollere izin veren route guard fabrikası; yetkisiz kullanıcıyı varsayılan ekrana yollar. */
export function roleGuard(allowed: UserRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.user()?.role;
    if (role && allowed.includes(role)) return true;
    router.navigateByUrl(auth.profile().defaultRoute);
    return false;
  };
}

/**
 * Sektöre özel ekranları kilitler: uygun olmayan sektör kullanıcısını kendi varsayılan ekranına yollar.
 * Örn. tamirci /masalar'a gitmeye çalışınca /is-emirleri'ne döner (kafe ekranı ona görünmez).
 */
export function sectorGuard(allowed: (p: BusinessProfile) => boolean): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const profile = auth.profile();
    if (allowed(profile)) return true;
    router.navigateByUrl(profile.defaultRoute);
    return false;
  };
}

/**
 * Pakete bağlı ekranları kilitler: yetkisi olmayan kullanıcıyı yükseltme sayfasına yollar.
 * Nav gizlemesiyle tutarlıdır; backend zaten 403 PLAN_UPGRADE_REQUIRED ile ayrıca zorlar.
 */
export function entitlementGuard(has: (e: EntitlementsDto | undefined) => boolean): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (has(auth.user()?.entitlements)) return true;
    router.navigateByUrl('/yukselt');
    return false;
  };
}
