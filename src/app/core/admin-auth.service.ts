import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { skipErrorToast } from './http-context';

interface AdminLoginResult {
  accessToken: string;
  accessTokenExpiresAt: string;
  email: string;
}

/**
 * Platform yöneticisi (süper-admin) oturumu — tenant oturumundan tamamen ayrı.
 * Access token YALNIZCA bellekte tutulur (XSS ile okunamaz). Refresh token sunucuda
 * httpOnly cookie'dedir; sayfa yenilemede bununla sessizce geri yüklenir (restore()).
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = `${environment.apiUrl}/admin/auth`;

  readonly token = signal<string | null>(null);
  readonly email = signal<string | null>(null);
  readonly isAuthenticated = computed(() => !!this.token());

  login(email: string, password: string): Observable<AdminLoginResult> {
    return this.http
      .post<AdminLoginResult>(`${this.base}/login`, { email, password }, skipErrorToast())
      .pipe(tap((r) => this.setSession(r)));
  }

  // Uçuştaki tek yenileme paylaşılır: eşzamanlı 401'ler tek refresh atsın.
  private restore$: Observable<boolean> | null = null;

  /** httpOnly refresh cookie ile sessiz oturum geri yükleme (sayfa yenileme / 401 sonrası). */
  restore(): Observable<boolean> {
    if (this.restore$) return this.restore$;
    this.restore$ = this.http.post<AdminLoginResult>(`${this.base}/refresh`, {}, skipErrorToast()).pipe(
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
    this.router.navigateByUrl('/yonetim/giris');
  }

  private setSession(r: AdminLoginResult): void {
    this.token.set(r.accessToken);
    this.email.set(r.email);
  }

  clear(): void {
    this.token.set(null);
    this.email.set(null);
  }
}
