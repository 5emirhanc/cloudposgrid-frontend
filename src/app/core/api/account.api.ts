import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';

/// <summary>KVKK self-servis: kişisel/işletme verilerini indirme + hesabı silme.</summary>
@Injectable({ providedIn: 'root' })
export class AccountApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/account`;

  /** Kişisel + işletme verilerini yapılandırılmış JSON olarak döner (erişim/taşınabilirlik). */
  export() {
    return this.http.get<unknown>(`${this.base}/export`);
  }

  /** İşletmeyi ve tüm verilerini kalıcı siler (şifre onayı; yalnız Owner). */
  deleteAccount(password: string) {
    return this.http.post<void>(`${this.base}/delete`, { password });
  }

  /** Tüm ana verileri tek JSON dosyası olarak indirir (#48 self-servis yedek; Owner/Admin). */
  downloadBackup() {
    return this.http.get(`${environment.apiUrl}/backup/export`, { responseType: 'blob' });
  }
}
