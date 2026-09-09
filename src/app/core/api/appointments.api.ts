import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AppointmentDto } from '../models';

@Injectable({ providedIn: 'root' })
export class AppointmentsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getRange(from: string, to: string) {
    return this.http.get<AppointmentDto[]>(`${this.base}/appointments`, { params: { from, to } });
  }
  create(body: {
    customerName: string;
    phone?: string | null;
    serviceName?: string | null;
    startsAt: string;
    durationMinutes: number;
    price: number;
    note?: string | null;
    productIds?: string | null;
    staffId?: string | null;
    /** Bağlanırsa tahsilat faturası bu cariye kesilir. */
    contactId?: string | null;
  }) {
    return this.http.post<AppointmentDto>(`${this.base}/appointments`, body);
  }
  setStatus(id: string, status: string) {
    return this.http.put<AppointmentDto>(`${this.base}/appointments/${id}/status`, { status });
  }
  collect(id: string, body: { cashAccountId: string; method: string }) {
    return this.http.post<AppointmentDto>(`${this.base}/appointments/${id}/collect`, body);
  }
  delete(id: string) {
    return this.http.delete(`${this.base}/appointments/${id}`);
  }
}
