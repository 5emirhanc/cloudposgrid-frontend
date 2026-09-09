import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CreateWarrantyRecordRequest, UpdateWarrantyRecordRequest, WarrantyRecordDto } from '../models';

@Injectable({ providedIn: 'root' })
export class WarrantiesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/warranties`;

  /** Garanti kayıtları. includeExpired=false ise süresi dolanlar gizlenir. */
  list(includeExpired = false) {
    return this.http.get<WarrantyRecordDto[]>(this.base, { params: { includeExpired } });
  }
  create(body: CreateWarrantyRecordRequest) {
    return this.http.post<WarrantyRecordDto>(this.base, body);
  }
  update(id: string, body: UpdateWarrantyRecordRequest) {
    return this.http.put<WarrantyRecordDto>(`${this.base}/${id}`, body);
  }
  remove(id: string) {
    return this.http.delete(`${this.base}/${id}`);
  }
}
