import { Injectable, computed, inject, signal } from '@angular/core';
import { BranchApi } from './api/branch.api';
import { BranchDto } from './models';

const KEY = 'cpg_branch';

/**
 * Çok şube durumu. Seçili şube localStorage'da tutulur; interceptor her tenant isteğine
 * X-Branch-Id başlığı ekler. currentBranchId null ise "Tüm şubeler" (birleşik) — başlık gönderilmez.
 */
@Injectable({ providedIn: 'root' })
export class BranchStore {
  private api = inject(BranchApi);

  readonly branches = signal<BranchDto[]>([]);
  readonly currentBranchId = signal<string | null>(null);
  readonly current = computed(() => this.branches().find((b) => b.id === this.currentBranchId()) ?? null);
  readonly multi = computed(() => this.branches().length > 1);

  load(): void {
    this.api.getAll().subscribe({
      next: (list) => {
        this.branches.set(list);
        const saved = localStorage.getItem(KEY);
        if (saved === 'all') {
          this.currentBranchId.set(null);
        } else if (saved && list.some((b) => b.id === saved)) {
          this.currentBranchId.set(saved);
        } else {
          this.currentBranchId.set(list.find((b) => b.isDefault)?.id ?? list[0]?.id ?? null);
        }
      },
      error: () => {},
    });
  }

  setCurrent(id: string | null): void {
    this.currentBranchId.set(id);
    localStorage.setItem(KEY, id ?? 'all');
  }

  clear(): void {
    this.branches.set([]);
    this.currentBranchId.set(null);
    localStorage.removeItem(KEY);
  }
}
