import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { NotificationDto, NotificationListDto } from '../models';

@Injectable({ providedIn: 'root' })
export class NotificationsApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/notifications`;

  /** Son bildirimler + okunmamış sayısı (zil açılınca). */
  list(unreadOnly = false, take = 30) {
    return this.http.get<NotificationListDto>(`${this.base}?unreadOnly=${unreadOnly}&take=${take}`);
  }
  /** Okunmamış rozeti için hafif uç (periyodik yoklanır). */
  unreadCount() {
    return this.http.get<number>(`${this.base}/unread-count`);
  }
  markRead(id: string) {
    return this.http.post<void>(`${this.base}/${id}/read`, {});
  }
  markAllRead() {
    return this.http.post<void>(`${this.base}/read-all`, {});
  }
  dismiss(id: string) {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}

export type { NotificationDto, NotificationListDto };
