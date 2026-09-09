import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SettingsDto } from '../models';

@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  get() {
    return this.http.get<SettingsDto>(`${this.base}/settings`);
  }
  update(body: SettingsDto) {
    return this.http.put<SettingsDto>(`${this.base}/settings`, body);
  }
}
