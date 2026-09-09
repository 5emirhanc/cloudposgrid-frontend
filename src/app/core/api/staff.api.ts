import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CreateStaffRequest, StaffDto, UpdateStaffRequest } from '../models';

@Injectable({ providedIn: 'root' })
export class StaffApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/staff`;

  list() {
    return this.http.get<StaffDto[]>(this.base);
  }
  create(body: CreateStaffRequest) {
    return this.http.post<StaffDto>(this.base, body);
  }
  update(id: string, body: UpdateStaffRequest) {
    return this.http.put<StaffDto>(`${this.base}/${id}`, body);
  }
  setPin(id: string, pin: string | null) {
    return this.http.put<void>(`${this.base}/${id}/pin`, { pin });
  }
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
