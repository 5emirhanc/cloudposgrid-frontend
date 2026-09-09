import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CashAccountDto, CashShiftDto, FinanceTransactionDto, PagedResult, RecurringExpenseDto } from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class FinanceApi {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // --- Kasalar ---
  getCashAccounts() {
    return this.http.get<CashAccountDto[]>(`${this.base}/cash-accounts`);
  }
  createCashAccount(body: unknown) {
    return this.http.post<CashAccountDto>(`${this.base}/cash-accounts`, body);
  }
  updateCashAccount(id: string, body: unknown) {
    return this.http.put<CashAccountDto>(`${this.base}/cash-accounts/${id}`, body);
  }
  deleteCashAccount(id: string) {
    return this.http.delete(`${this.base}/cash-accounts/${id}`);
  }

  // --- Gelir/Gider ---
  getTransactions(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<FinanceTransactionDto>>(`${this.base}/finance/transactions`, {
      params: cleanParams(query),
    });
  }
  createTransaction(body: unknown) {
    return this.http.post<FinanceTransactionDto>(`${this.base}/finance/transactions`, body);
  }
  deleteTransaction(id: string) {
    return this.http.delete(`${this.base}/finance/transactions/${id}`);
  }

  // --- Tekrarlayan giderler ---
  getRecurring() {
    return this.http.get<RecurringExpenseDto[]>(`${this.base}/finance/recurring`);
  }
  createRecurring(body: unknown) {
    return this.http.post<RecurringExpenseDto>(`${this.base}/finance/recurring`, body);
  }
  updateRecurring(id: string, body: unknown) {
    return this.http.put<RecurringExpenseDto>(`${this.base}/finance/recurring/${id}`, body);
  }
  deleteRecurring(id: string) {
    return this.http.delete(`${this.base}/finance/recurring/${id}`);
  }
  processRecurring() {
    return this.http.post<{ postedCount: number; postedAmount: number }>(`${this.base}/finance/recurring/process`, {});
  }

  // --- Kasa vardiyası ---
  getShifts() {
    return this.http.get<CashShiftDto[]>(`${this.base}/finance/shifts`);
  }
  getOpenShift(cashAccountId: string) {
    return this.http.get<CashShiftDto | null>(`${this.base}/finance/shifts/open`, { params: { cashAccountId } });
  }
  openShift(body: unknown) {
    return this.http.post<CashShiftDto>(`${this.base}/finance/shifts/open`, body);
  }
  closeShift(id: string, body: unknown) {
    return this.http.post<CashShiftDto>(`${this.base}/finance/shifts/${id}/close`, body);
  }
}
