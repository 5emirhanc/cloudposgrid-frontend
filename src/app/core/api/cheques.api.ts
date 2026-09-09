import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ChequeDto, ChequeListDto, ChequeDirection, ChequeStatus, CreateChequeRequest } from '../models';
import { cleanParams } from '../utils';

/**
 * Çek/senet portföyü API'si — alınan/verilen kıymetli evrak (vade + durum).
 * Backend: [Route("api/cheques")], [Authorize(Roles="Owner,Admin,Accountant")].
 */
@Injectable({ providedIn: 'root' })
export class ChequesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/cheques`;

  /** GET api/cheques?direction=&status= — portföy listesi + özet. */
  list(direction?: ChequeDirection | '', status?: ChequeStatus | '') {
    return this.http.get<ChequeListDto>(this.base, { params: cleanParams({ direction, status }) });
  }

  /** POST api/cheques — yeni çek/senet (durum otomatik Portfolio). */
  create(body: CreateChequeRequest) {
    return this.http.post<ChequeDto>(this.base, body);
  }

  /** PUT api/cheques/{id}/status — durum değiştir (tahsil/ödendi/karşılıksız...). */
  updateStatus(id: string, status: ChequeStatus) {
    return this.http.put<ChequeDto>(`${this.base}/${id}/status`, { status });
  }

  /** DELETE api/cheques/{id} */
  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
