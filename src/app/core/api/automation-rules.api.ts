import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  AutomationRuleDto,
  AutomationTemplate,
  CreateAutomationRuleRequest,
  UpdateAutomationRuleRequest,
} from '../models';

/**
 * Otomasyon kuralları (if-this-then-that) API istemcisi.
 * Backend: AutomationRulesController — [Route("api/automation-rules")], yalnız Owner/Admin.
 * Bu sürüm sadece tanım yönetimidir (kuralları çalıştıran motor yoktur).
 */
@Injectable({ providedIn: 'root' })
export class AutomationRulesApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/automation-rules`;

  /** Tüm kuralları (en yeni önce) listeler. */
  list() {
    return this.http.get<AutomationRuleDto[]>(this.base);
  }

  /** Hazır kural şablonlarını (statik öneri listesi) getirir. */
  templates() {
    return this.http.get<AutomationTemplate[]>(`${this.base}/templates`);
  }

  /** Yeni kural oluşturur. */
  create(body: CreateAutomationRuleRequest) {
    return this.http.post<AutomationRuleDto>(this.base, body);
  }

  /** Var olan kuralı günceller (tüm alanlar yeniden yazılır). */
  update(id: string, body: UpdateAutomationRuleRequest) {
    return this.http.put<AutomationRuleDto>(`${this.base}/${id}`, body);
  }

  /** Kuralı etkin/pasif yapar. */
  toggle(id: string, active: boolean) {
    return this.http.post<AutomationRuleDto>(`${this.base}/${id}/toggle`, { active });
  }

  /** Kuralı siler. */
  remove(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
