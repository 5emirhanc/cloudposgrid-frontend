import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SubscriptionInfoDto } from '../models';

@Injectable({ providedIn: 'root' })
export class SubscriptionApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/subscription`;

  info() {
    return this.http.get<SubscriptionInfoDto>(this.base);
  }
  request(body: { plan: string; billingCycle: string }) {
    return this.http.post<void>(`${this.base}/request`, body);
  }
}
