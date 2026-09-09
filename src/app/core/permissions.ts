import { NavItem } from './business-profile';
import { UserRole } from './models';

/** Rollerin Türkçe etiketleri (UI'da gösterim için). */
export const ROLE_LABELS: Record<UserRole, string> = {
  Owner: 'Sahip',
  Admin: 'Yönetici',
  Accountant: 'Muhasebe',
  Cashier: 'Kasiyer',
  Waiter: 'Garson',
  Staff: 'Personel',
};

/** Personel oluştururken atanabilir roller (Owner atanamaz — yalnızca kayıt sırasında oluşur). */
export const ASSIGNABLE_ROLES: UserRole[] = ['Admin', 'Accountant', 'Cashier', 'Waiter', 'Staff'];

// Kısıtlı roller için görülebilir nav path'leri (allowlist). Owner/Admin listede yok = her şeye erişir.
const RESTRICTED_NAV: Partial<Record<UserRole, string[]>> = {
  Accountant: ['/', '/cariler', '/kasa', '/faturalar', '/raporlar', '/stok/urunler', '/stok/kategoriler', '/stok/hareketler'],
  Cashier: ['/', '/hizli-satis', '/masalar', '/is-emirleri', '/randevular', '/cariler'],
  Waiter: ['/masalar', '/is-emirleri', '/randevular'],
  Staff: ['/', '/hizli-satis', '/masalar', '/is-emirleri', '/randevular', '/cariler', '/stok/urunler'],
};

/** Verilen rol için nav öğesi/path erişilebilir mi? */
export function canAccessPath(role: UserRole | undefined | null, path: string): boolean {
  if (!role || role === 'Owner' || role === 'Admin') return true;
  const allow = RESTRICTED_NAV[role];
  return allow ? allow.includes(path) : true;
}

/** Nav listesini role göre süzer. */
export function filterNav(nav: NavItem[], role: UserRole | undefined | null): NavItem[] {
  return nav.filter((n) => canAccessPath(role, n.path));
}

/** Personel yönetimine yalnızca Sahip ve Yönetici erişir. */
export function canManageStaff(role: UserRole | undefined | null): boolean {
  return role === 'Owner' || role === 'Admin';
}
