import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuditEventDto } from '../models';

/** İşletme-içi denetim kaydı (salt-okunur, yalnız Owner/Admin). */
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/audit`;

  list(limit = 50) {
    return this.http.get<AuditEventDto[]>(this.base, { params: { limit } });
  }
}
