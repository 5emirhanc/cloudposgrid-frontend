import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { skipErrorToast } from './http-context';

interface DealerLoginResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  name: string;
  email: string;
  code: string;
  commissionRate: number;
}

export interface DealerInfo {
  name: string;
  email: string;
  code: string;
  commissionRate: number;
}

/**
 * Bayi (#25) oturumu — tenant ve süper-admin oturumlarından tamamen ayrı (kendi cookie'si cpg_dealer_rt).
 * Access token yalnız bellekte; refresh httpOnly cookie'de. Süper-admin (AdminAuthService) deseninin ikizi.
 */
@Injectable({ providedIn: 'root' })
export class DealerAuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = `${environment.apiUrl}/dealer/auth`;

  readonly token = signal<string | null>(null);
  readonly dealer = signal<DealerInfo | null>(null);
  readonly isAuthenticated = computed(() => !!this.token());

  login(email: string, password: string): Observable<DealerLoginResult> {
    return this.http
      .post<DealerLoginResult>(`${this.base}/login`, { email, password }, skipErrorToast())
      .pipe(tap((r) => this.setSession(r)));
  }

  private restore$: Observable<boolean> | null = null;

  /** httpOnly refresh cookie ile sessiz oturum geri yükleme. */
  restore(): Observable<boolean> {
    if (this.restore$) return this.restore$;
    this.restore$ = this.http.post<DealerLoginResult>(`${this.base}/refresh`, {}, skipErrorToast()).pipe(
      tap((r) => this.setSession(r)),
      map(() => true),
      catchError(() => {
        this.clear();
        return of(false);
      }),
      finalize(() => (this.restore$ = null)),
      shareReplay(1),
    );
    return this.restore$;
  }

  logout(): void {
    this.http.post(`${this.base}/logout`, {}).subscribe({ error: () => {} });
    this.clear();
    this.router.navigateByUrl('/bayi/giris');
  }

  private setSession(r: DealerLoginResult): void {
    this.token.set(r.accessToken);
    this.dealer.set({ name: r.name, email: r.email, code: r.code, commissionRate: r.commissionRate });
  }

  clear(): void {
    this.token.set(null);
    this.dealer.set(null);
  }
}
