import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AssistantContext, AssistantInsight, AssistantIntentDto, AssistantReplyDto, AssistantSuggestionDto, AssistantUnresolvedDto } from '../models';

@Injectable({ providedIn: 'root' })
export class AssistantApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/assistant`;

  /** Hazır soru butonları (chip'ler). */
  suggestions() {
    return this.http.get<AssistantSuggestionDto[]>(`${this.base}/suggestions`);
  }
  /** Doğal dil sorusunu yolla, cevabı al. context = önceki konuşma bağlamı (takip sorularını bağlar). */
  ask(question: string, context?: AssistantContext | null) {
    return this.http.post<AssistantReplyDto>(`${this.base}/ask`, { question, context: context ?? null });
  }
  /** Proaktif içgörüler/uyarılar (dashboard AI özeti). */
  insights() {
    return this.http.get<AssistantInsight[]>(`${this.base}/insights`);
  }

  // ---- Eğitim (yalnız yönetici) ----

  /** Anlaşılamayan sorular (en çok sorulan önce). */
  unresolved() {
    return this.http.get<AssistantUnresolvedDto[]>(`${this.base}/unresolved`);
  }
  /** Niyet kataloğu (dropdown seçenekleri). */
  intents() {
    return this.http.get<AssistantIntentDto[]>(`${this.base}/intents`);
  }
  /** Anlaşılamayan soruyu bir niyete ata → motor öğrenir. */
  resolve(unresolvedId: string, intent: string) {
    return this.http.post<void>(`${this.base}/resolve`, { unresolvedId, intent });
  }
  /** Anlaşılamayan soruyu öğrenmeden gizle. */
  dismiss(id: string) {
    return this.http.post<void>(`${this.base}/dismiss/${id}`, {});
  }
}
