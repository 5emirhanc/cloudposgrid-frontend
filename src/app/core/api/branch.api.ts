import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BranchDto } from '../models';

@Injectable({ providedIn: 'root' })
export class BranchApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  getAll() {
    return this.http.get<BranchDto[]>(`${this.base}/branches`);
  }
  create(body: { name: string; address?: string | null; phone?: string | null }) {
    return this.http.post<BranchDto>(`${this.base}/branches`, body);
  }
  update(id: string, body: { name: string; address?: string | null; phone?: string | null; isActive: boolean }) {
    return this.http.put<BranchDto>(`${this.base}/branches/${id}`, body);
  }
  delete(id: string) {
    return this.http.delete(`${this.base}/branches/${id}`);
  }
}
