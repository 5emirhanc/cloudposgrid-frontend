import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CampaignDto, SaveCampaignRequest } from '../models';

/**
 * Kampanya/promosyon motoru (#16) API istemcisi. Tanım CRUD.
 * Sepet 'evaluate' ucu POS satış bağlamı gerektirir; bu ekran yalnız CRUD yapar.
 * Controller: [Route("api/campaigns")]. Create/Update/Delete Owner,Admin ister.
 */
@Injectable({ providedIn: 'root' })
export class CampaignsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/campaigns`;

  list() {
    return this.http.get<CampaignDto[]>(this.base);
  }
  create(body: SaveCampaignRequest) {
    return this.http.post<CampaignDto>(this.base, body);
  }
  update(id: string, body: SaveCampaignRequest) {
    return this.http.put<CampaignDto>(`${this.base}/${id}`, body);
  }
  delete(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
