import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  CreateConnectionRequest, CreateListingRequest, MarketplaceConnectionDto, MarketplaceListingDto,
  MarketplaceOrderDto, PagedResult, SyncResultDto, UpdateConnectionRequest, UpdateListingRequest,
  TrendyolCategory, TrendyolCategoryAttribute, TrendyolBrand, TrendyolCargoProvider, SubmitListingRequest,
} from '../models';
import { cleanParams } from '../utils';

@Injectable({ providedIn: 'root' })
export class MarketplaceApi {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/marketplace`;

  // Bağlantılar
  listConnections() {
    return this.http.get<MarketplaceConnectionDto[]>(`${this.base}/connections`);
  }
  createConnection(body: CreateConnectionRequest) {
    return this.http.post<MarketplaceConnectionDto>(`${this.base}/connections`, body);
  }
  updateConnection(id: string, body: UpdateConnectionRequest) {
    return this.http.put<MarketplaceConnectionDto>(`${this.base}/connections/${id}`, body);
  }
  deleteConnection(id: string) {
    return this.http.delete<void>(`${this.base}/connections/${id}`);
  }
  testConnection(id: string) {
    return this.http.post<SyncResultDto>(`${this.base}/connections/${id}/test`, {});
  }
  syncNow(id: string) {
    return this.http.post<SyncResultDto>(`${this.base}/connections/${id}/sync`, {});
  }

  // Eşleştirme
  listListings() {
    return this.http.get<MarketplaceListingDto[]>(`${this.base}/listings`);
  }
  createListing(body: CreateListingRequest) {
    return this.http.post<MarketplaceListingDto>(`${this.base}/listings`, body);
  }
  updateListing(id: string, body: UpdateListingRequest) {
    return this.http.put<MarketplaceListingDto>(`${this.base}/listings/${id}`, body);
  }
  deleteListing(id: string) {
    return this.http.delete<void>(`${this.base}/listings/${id}`);
  }
  autoMatch() {
    return this.http.post<{ matched: number }>(`${this.base}/listings/auto-match`, {});
  }

  // İlan açma (createProducts)
  getCategories() {
    return this.http.get<TrendyolCategory[]>(`${this.base}/trendyol/categories`);
  }
  getCategoryAttributes(categoryId: number) {
    return this.http.get<TrendyolCategoryAttribute[]>(`${this.base}/trendyol/categories/${categoryId}/attributes`);
  }
  searchBrands(query: string) {
    return this.http.get<TrendyolBrand[]>(`${this.base}/trendyol/brands`, { params: { query } });
  }
  getCargoProviders() {
    return this.http.get<TrendyolCargoProvider[]>(`${this.base}/trendyol/cargo-providers`);
  }
  submitListing(productId: string, body: SubmitListingRequest) {
    return this.http.post<MarketplaceListingDto>(`${this.base}/listings/${productId}/create`, body);
  }

  // Siparişler
  getOrders(query: Record<string, unknown> = {}) {
    return this.http.get<PagedResult<MarketplaceOrderDto>>(`${this.base}/orders`, { params: cleanParams(query) });
  }
  getPending() {
    return this.http.get<MarketplaceOrderDto[]>(`${this.base}/orders/pending`);
  }
}
