import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { PageHelpComponent } from '../../shared/page-help.component';
import { StockApi } from '../../core/api/stock.api';
import { MarketplaceApi } from '../../core/api/marketplace.api';
import { SettingsApi } from '../../core/api/settings.api';
import { BulkPriceResultDto, CategoryDto, ImportProductRow, ImportResultDto, ProductDto, WasteReason } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { AuthService } from '../../core/auth.service';
import { BranchStore } from '../../core/branch.store';
import { ModalComponent } from '../../shared/modal.component';
import { FieldErrorComponent } from '../../shared/field-error.component';
import { BarcodeCameraComponent, barcodeCameraSupported } from '../../shared/barcode-camera.component';
import { ListingWizardComponent } from '../marketplace/listing-wizard.component';
import { ProductOptionsModalComponent } from './product-options.component';
import { ProductRecipeModalComponent } from './product-recipe.component';
import { ProductSuppliersModalComponent } from './product-suppliers.component';
import { apiError, generateInternalEan13, money, stockOf } from '../../core/utils';

@Component({
  selector: 'app-products',
  imports: [ReactiveFormsModule, LucideAngularModule, ModalComponent, FieldErrorComponent, BarcodeCameraComponent, PageHelpComponent, ListingWizardComponent, ProductOptionsModalComponent, ProductRecipeModalComponent, ProductSuppliersModalComponent],
  template: `
    <app-page-help key="products" title="Ürünlerinizi ekleyin, fiyatlarını ve stoklarını buradan yönetin">
      <li>"Yeni Ürün" ile ad, fiyat ve stok girin</li>
      <li>Arama ve kategori filtresiyle ürünü hızlıca bulun</li>
      <li>"Stok Hareketi" ile giriş, çıkış veya sayım yapın</li>
      <li>"İçe Aktar" ile ürünleri CSV'den toplu ekleyin</li>
    </app-page-help>

    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-black tracking-tight text-slate-900">{{ term().products }}</h1>
        <p class="text-sm text-slate-500">Fiyat, kart ve stok yönetimi</p>
      </div>
      <div class="flex gap-2">
        @if (pf().barcode) {
          <button class="btn-outline" (click)="openLabelPrint()">
            <lucide-icon name="printer" class="h-4 w-4"></lucide-icon> Etiket Yazdır
          </button>
        }
        <button class="btn-outline" (click)="openImport()">
          <lucide-icon name="upload" class="h-4 w-4"></lucide-icon> İçe Aktar
        </button>
        <button class="btn-outline" [disabled]="exporting() || !total()" (click)="exportCsv()">
          <lucide-icon name="download" class="h-4 w-4"></lucide-icon> {{ exporting() ? 'Hazırlanıyor…' : 'Dışa Aktar' }}
        </button>
        @if (pf().stock && branchStore.multi()) {
          <button class="btn-outline" (click)="openTransfer()">
            <lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon> Şube Transferi
          </button>
        }
        @if (pf().stock) {
          <button class="btn-outline" (click)="openVariant()">
            <lucide-icon name="shirt" class="h-4 w-4"></lucide-icon> Varyantlı Ürün
          </button>
        }
        <button class="btn-outline" (click)="openBulkPrice()">
          <lucide-icon name="percent" class="h-4 w-4"></lucide-icon> Toplu Fiyat
        </button>
        <button class="btn-primary" (click)="openCreate()">
          <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni {{ term().productSingular }}
        </button>
      </div>
    </div>

    <!-- Filtreler -->
    <div class="card mb-4 flex flex-wrap items-center gap-3 p-3">
      <div class="relative min-w-[200px] flex-1">
        <lucide-icon name="search" class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
        <input class="input pl-10" [placeholder]="term().productSingular + ' adı, SKU veya barkod ara...'" [value]="search()" (input)="onSearch($any($event.target).value)" />
      </div>
      <select class="select w-44" [value]="categoryId()" (change)="onCategory($any($event.target).value)">
        <option value="">Tüm kategoriler</option>
        @for (c of categories(); track c.id) {
          <option [value]="c.id">{{ c.name }}</option>
        }
      </select>
      <label class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600">
        <input type="checkbox" [checked]="lowOnly()" (change)="onLow($any($event.target).checked)" class="rounded text-brand-600" />
        Sadece kritik stok
      </label>
    </div>

    <!-- Tablo -->
    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead class="border-b border-slate-100 bg-slate-50/60">
            <tr>
              <th class="table-th">Ürün</th>
              <th class="table-th hidden sm:table-cell">Kategori</th>
              @if (pf().stock) {
                <th class="table-th text-right">Stok</th>
                <th class="table-th text-right hidden sm:table-cell">Alış</th>
              }
              <th class="table-th text-right">Satış</th>
              <th class="table-th text-right">İşlem</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-50">
            @if (loading()) {
              <tr><td [attr.colspan]="pf().stock ? 6 : 4" class="py-10 text-center text-sm text-slate-400">Yükleniyor...</td></tr>
            } @else if (!products().length) {
              <tr><td [attr.colspan]="pf().stock ? 6 : 4" class="py-10 text-center text-sm text-slate-400">{{ term().productSingular }} bulunamadı. "Yeni {{ term().productSingular }}" ile başlayın.</td></tr>
            } @else {
              @for (p of products(); track p.id) {
                <tr class="hover:bg-slate-50/60">
                  <td class="table-td">
                    <div class="flex items-center gap-3">
                      @if (p.imageUrl) {
                        <img [src]="p.imageUrl" class="h-10 w-10 shrink-0 rounded-lg object-cover" alt="" />
                      } @else {
                        <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                          <lucide-icon [name]="p.isService ? 'sparkles' : 'package'" class="h-5 w-5"></lucide-icon>
                        </span>
                      }
                      <div>
                        <p class="font-semibold text-slate-900">{{ p.name }}
                          @if (p.isVariantParent) {
                            <span class="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">Varyantlı</span>
                          }
                        </p>
                        <p class="text-xs text-slate-400"><span class="font-mono">{{ p.sku }}</span>@if (p.barcode) { · <span class="font-mono">{{ p.barcode }}</span> }</p>
                        @if (pf().location && (p.shelfLocation || p.storageArea)) {
                          <p class="mt-0.5 flex items-center gap-1 text-xs text-brand-600">
                            <lucide-icon name="map-pin" class="h-3 w-3"></lucide-icon>
                            {{ p.shelfLocation }}@if (p.shelfLocation && p.storageArea) { · }{{ p.storageArea }}
                          </p>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="table-td hidden sm:table-cell text-slate-500">{{ p.categoryName || '—' }}</td>
                  @if (pf().stock) {
                    <td class="table-td text-right">
                      @if (p.isVariantParent) {
                        <span class="badge-gray">Varyantlı</span>
                      } @else {
                        <span [class]="stockOf(p) <= p.minStock ? 'badge-red' : 'badge-gray'">{{ stockOf(p) }} {{ p.unit }}</span>
                      }
                    </td>
                    <td class="table-td text-right hidden sm:table-cell text-slate-600">{{ money(p.purchasePrice) }}</td>
                  }
                  <td class="table-td text-right font-medium text-slate-800">{{ money(p.salePrice) }}</td>
                  <td class="table-td">
                    <div class="flex items-center justify-end gap-1">
                      @if (pf().stock && !p.isVariantParent) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-brand-50 hover:text-brand-600" title="Stok hareketi" (click)="openMovement(p)">
                          <lucide-icon name="arrow-left-right" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (marketplaceReady() && !p.isService && !p.isVariantParent) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-fuchsia-50 hover:text-fuchsia-600" title="Trendyol'da İlan Aç" (click)="openListing(p)">
                          <lucide-icon name="store" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (pf().barcode && !p.isVariantParent) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600" title="Etiket yazdır" (click)="printLabel(p)">
                          <lucide-icon name="printer" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (isAdmin() && feat().menu && !p.isVariantParent) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-amber-50 hover:text-amber-600" title="Seçenekler (boy, ekstra…)" (click)="optionsFor.set(p)">
                          <lucide-icon name="tags" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (isAdmin() && feat().menu && !p.isVariantParent && !p.isService) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Reçete (bileşenler)" (click)="recipeFor.set(p)">
                          <lucide-icon name="utensils" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      @if (isAdmin() && !p.isVariantParent && !p.isService) {
                        <button class="rounded-lg p-2 text-slate-400 hover:bg-sky-50 hover:text-sky-600" title="Tedarikçiler" (click)="suppliersFor.set(p)">
                          <lucide-icon name="building-2" class="h-4 w-4"></lucide-icon>
                        </button>
                      }
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Düzenle" (click)="openEdit(p)">
                        <lucide-icon name="pencil" class="h-4 w-4"></lucide-icon>
                      </button>
                      <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Pasife al" (click)="remove(p)">
                        <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      @if (total() > pageSize) {
        <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
          <span>{{ total() }} kayıt</span>
          <div class="flex items-center gap-2">
            <button class="btn-outline btn-sm" [disabled]="page() === 1" (click)="setPage(page() - 1)">Önceki</button>
            <span>{{ page() }} / {{ totalPages() }}</span>
            <button class="btn-outline btn-sm" [disabled]="page() >= totalPages()" (click)="setPage(page() + 1)">Sonraki</button>
          </div>
        </div>
      }
    </div>

    <!-- Ürün form modal -->
    @if (formOpen()) {
      <app-modal [title]="(editingId() ? term().productSingular + ' Düzenle' : 'Yeni ' + term().productSingular)" maxWidth="40rem" (dismiss)="formOpen.set(false)">
        <form [formGroup]="form" (ngSubmit)="save()" class="space-y-4">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div class="flex items-center gap-3 sm:col-span-2">
              <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                @if (form.controls.imageUrl.value) {
                  <img [src]="form.controls.imageUrl.value" class="h-full w-full object-cover" alt="" />
                } @else {
                  <lucide-icon name="package" class="h-6 w-6 text-slate-300"></lucide-icon>
                }
              </div>
              <div class="min-w-0 flex-1">
                <input #fileInput type="file" accept="image/*" class="hidden" (change)="onImage($event)" />
                <button type="button" class="btn-outline btn-sm" [disabled]="uploading()" (click)="fileInput.click()">
                  <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> {{ uploading() ? 'Yükleniyor...' : 'Fotoğraf yükle' }}
                </button>
                @if (form.controls.imageUrl.value) {
                  <button type="button" class="btn-sm ml-1 text-rose-600 hover:underline" (click)="form.controls.imageUrl.setValue('')">Kaldır</button>
                }
                <input class="input mt-2 text-sm" formControlName="imageUrl" placeholder="veya görsel linki yapıştır (https://...)" />
              </div>
            </div>
            @if (marketplaceReady()) {
              <div class="sm:col-span-2">
                <label class="label">Marka <span class="text-xs font-normal text-slate-400">(pazaryeri ilanı için)</span></label>
                <input class="input" formControlName="brandName" placeholder="Ör. LC Waikiki" />
              </div>
              <div>
                <label class="label">Desi <span class="text-xs font-normal text-slate-400">(pazaryeri kargo)</span></label>
                <input class="input" type="number" min="0" step="0.1" formControlName="dimensionalWeight" placeholder="Boş = 1" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Ek Görseller <span class="text-xs font-normal text-slate-400">(pazaryeri — 8'e kadar)</span></label>
                <div class="flex flex-wrap items-center gap-2">
                  @for (img of extraImages(); track img; let i = $index) {
                    <div class="relative h-14 w-14 overflow-hidden rounded-lg border border-slate-200">
                      <img [src]="img" class="h-full w-full object-cover" alt="" />
                      <button type="button" class="absolute right-0 top-0 bg-rose-600 px-1 text-[10px] leading-4 text-white" (click)="removeExtraImage(i)" title="Kaldır">×</button>
                    </div>
                  }
                  @if (extraImages().length < 8) {
                    <input #extraFile type="file" accept="image/*" class="hidden" (change)="onExtraImage($event)" />
                    <button type="button" class="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600"
                            [disabled]="uploadingExtra()" (click)="extraFile.click()" title="Görsel ekle">
                      <lucide-icon name="plus" class="h-5 w-5"></lucide-icon>
                    </button>
                  }
                </div>
                @if (extraImages().length < 8) {
                  <div class="mt-2 flex gap-1">
                    <input class="input text-sm" [value]="extraLink()" (input)="extraLink.set($any($event.target).value)"
                           (keydown.enter)="addExtraLink(); $event.preventDefault()" placeholder="veya görsel linki yapıştır (https://...)" />
                    <button type="button" class="btn-outline btn-sm shrink-0" (click)="addExtraLink()">Ekle</button>
                  </div>
                }
              </div>
            }
            <div class="sm:col-span-2">
              <label class="label">{{ term().productSingular }} Adı *</label>
              <input class="input" formControlName="name" placeholder="Örn. Latte" />
              <field-error [control]="form.controls.name" [label]="term().productSingular + ' adı'" />
            </div>
            @if (pf().sku) {
              <div>
                <label class="label">{{ term().productCode }}</label>
                <input class="input" formControlName="sku" placeholder="Boş bırakılırsa otomatik" />
              </div>
            }
            @if (pf().barcode) {
              <div>
                <label class="label">Barkod</label>
                <div class="flex gap-2">
                  <input class="input flex-1" formControlName="barcode" placeholder="Okut, yaz ya da üret" />
                  @if (cameraSupported) {
                    <button type="button" class="btn-outline shrink-0" (click)="cameraOpen.set(true)" title="Kamerayla okut">
                      <lucide-icon name="camera" class="h-4 w-4"></lucide-icon>
                    </button>
                  }
                  @if (!form.controls.barcode.value) {
                    <button type="button" class="btn-outline shrink-0" (click)="form.controls.barcode.setValue(genBarcode())" title="Dahili barkod üret (etiket + POS için)">Üret</button>
                  }
                </div>
              </div>
              @if (scaleEnabled()) {
                <div>
                  <label class="label">Terazi Ürün Kodu <span class="text-xs font-normal text-slate-400">(tartılabilir)</span></label>
                  <input class="input" formControlName="scaleItemCode" placeholder="Ör. 12345" inputmode="numeric" />
                  <p class="mt-1 text-xs text-slate-400">Terazi etiketine basılan kod. Doldurulursa okutmada miktar otomatik gelir.</p>
                </div>
              }
            }
            @if (pf().location) {
              <div>
                <label class="label">Raf</label>
                <input class="input" formControlName="shelfLocation" placeholder="Ör. A-3" />
              </div>
              <div>
                <label class="label">Depo Bölgesi</label>
                <input class="input" formControlName="storageArea" placeholder="Ör. Ön depo" />
              </div>
            }
            <div>
              <label class="label">Kategori</label>
              <select class="select" formControlName="categoryId">
                <option value="">Kategorisiz</option>
                @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            @if (pf().stock) {
              <div>
                <label class="label">Birim</label>
                <input class="input" formControlName="unit" placeholder="adet" />
              </div>
              <div>
                <label class="label">Alış Fiyatı</label>
                <input type="number" step="0.01" class="input" formControlName="purchasePrice" />
              </div>
              <div class="sm:col-span-2">
                <label class="label">Alış Birimi <span class="text-xs font-normal text-slate-400">(opsiyonel — koli/paket)</span></label>
                <div class="flex items-center gap-2">
                  <input class="input flex-1" formControlName="purchaseUnit" placeholder="Ör. koli" />
                  <span class="text-sm text-slate-400">=</span>
                  <input type="number" step="0.001" min="0" class="input w-28" formControlName="purchaseUnitFactor" placeholder="adet" title="1 alış biriminde kaç satış birimi var" />
                  <span class="text-sm text-slate-400">{{ form.controls.unit.value || 'adet' }}</span>
                </div>
                <p class="mt-1 text-xs text-slate-400">1 {{ form.controls.purchaseUnit.value || 'koli' }} kaç {{ form.controls.unit.value || 'adet' }}? Mal kabulde stok bu katsayıyla çarpılır.</p>
              </div>
            }
            <div>
              <label class="label">Satış Fiyatı</label>
              <input type="number" step="0.01" class="input" formControlName="salePrice" />
            </div>
            <div>
              <label class="label">KDV %</label>
              <input type="number" step="1" class="input" formControlName="vatRate" />
            </div>
            @if (pf().stock) {
              <div>
                <label class="label">Kritik Stok</label>
                <input type="number" step="0.01" class="input" formControlName="minStock" />
              </div>
              <div>
                <label class="label">Son Kullanma Tarihi <span class="text-xs font-normal text-slate-400">(SKT — opsiyonel)</span></label>
                <input type="date" class="input" formControlName="expiryDate" />
                <p class="mt-1 text-xs text-slate-400">Yaklaşan/geçen SKT için bildirim üretilir.</p>
              </div>
            }
            <div class="sm:col-span-2">
              <label class="label">Açıklama{{ feat().menu ? ' (menüde görünür)' : '' }}</label>
              <textarea class="input min-h-[72px]" rows="3" formControlName="description" placeholder="Opsiyonel kısa açıklama"></textarea>
            </div>
            @if (pf().stock) {
              <div class="sm:col-span-2">
                <label class="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" formControlName="isService" class="rounded text-brand-600" />
                  Hizmet kalemi (stok takip edilmez — işçilik, hizmet vb.)
                </label>
              </div>
            }
            @if (!editingId() && !form.controls.isService.value && pf().stock) {
              <div class="sm:col-span-2">
                <label class="label">Açılış Stoğu</label>
                <input type="number" step="0.01" class="input" formControlName="openingStock" />
              </div>
            }
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="formOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">{{ saving() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Varyantlı ürün oluşturma sihirbazı (butik: beden/renk) -->
    @if (variantOpen()) {
      <app-modal title="Varyantlı Ürün Oluştur" maxWidth="46rem" (dismiss)="variantOpen.set(false)">
        <form [formGroup]="vform" (ngSubmit)="saveVariants()" class="space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="sm:col-span-2">
              <label class="label">Ürün Adı *</label>
              <input class="input" formControlName="name" placeholder="Örn. Basic Tişört" />
            </div>
            <div>
              <label class="label">Kategori</label>
              <select class="input" formControlName="categoryId">
                <option value="">— Yok —</option>
                @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Birim</label>
              <input class="input" formControlName="unit" placeholder="adet" />
            </div>
            <div>
              <label class="label">Alış Fiyatı</label>
              <input type="number" step="0.01" class="input" formControlName="purchasePrice" />
            </div>
            <div>
              <label class="label">Satış Fiyatı</label>
              <input type="number" step="0.01" class="input" formControlName="salePrice" />
            </div>
            <div>
              <label class="label">KDV %</label>
              <input type="number" step="1" class="input" formControlName="vatRate" />
            </div>
            <div>
              <label class="label">Kritik Stok</label>
              <input type="number" step="0.01" class="input" formControlName="minStock" />
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-3">
            <p class="mb-2 text-sm font-medium text-slate-700">Özellikler</p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label class="label">1. Özellik Adı</label>
                <input class="input" formControlName="attr1Name" placeholder="Beden" />
              </div>
              <div>
                <label class="label">Değerler <span class="text-xs font-normal text-slate-400">(virgülle)</span></label>
                <input class="input" formControlName="attr1Values" placeholder="S, M, L, XL" />
              </div>
              <div>
                <label class="label">2. Özellik Adı <span class="text-xs font-normal text-slate-400">(opsiyonel)</span></label>
                <input class="input" formControlName="attr2Name" placeholder="Renk" />
              </div>
              <div>
                <label class="label">Değerler <span class="text-xs font-normal text-slate-400">(virgülle)</span></label>
                <input class="input" formControlName="attr2Values" placeholder="Kırmızı, Mavi" />
              </div>
            </div>
            <button type="button" class="btn-outline mt-3" (click)="generateVariantMatrix()">
              <lucide-icon name="refresh-cw" class="h-4 w-4"></lucide-icon> Varyantları Oluştur
            </button>
          </div>

          @if (vRows().length) {
            <div class="rounded-xl border border-slate-200">
              <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                <span>{{ vRows().length }} varyant</span>
                <span class="text-xs font-normal text-slate-400">barkodlar otomatik üretilir</span>
              </div>
              <div class="max-h-64 overflow-y-auto">
                <table class="w-full text-sm">
                  <thead class="text-xs text-slate-400">
                    <tr>
                      <th class="px-3 py-1 text-left font-medium">Varyant</th>
                      <th class="px-3 py-1 text-right font-medium">Açılış Stoğu</th>
                      <th class="px-3 py-1 text-right font-medium">Fiyat <span class="font-normal">(boş=varsayılan)</span></th>
                      <th class="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of vRows(); track r.label; let i = $index) {
                      <tr class="border-t border-slate-50">
                        <td class="px-3 py-1.5 text-slate-700">{{ r.label }}</td>
                        <td class="px-3 py-1.5 text-right">
                          <input type="number" step="0.01" class="input h-8 w-24 text-right" [value]="r.openingStock"
                                 (input)="setVarStock(i, $any($event.target).value)" />
                        </td>
                        <td class="px-3 py-1.5 text-right">
                          <input type="number" step="0.01" class="input h-8 w-24 text-right" [value]="r.salePrice ?? ''"
                                 (input)="setVarPrice(i, $any($event.target).value)" [placeholder]="vform.controls.salePrice.value" />
                        </td>
                        <td class="px-1">
                          <button type="button" class="text-rose-500 hover:text-rose-700" (click)="removeVarRow(i)" title="Kaldır">×</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="variantOpen.set(false)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="vSaving() || !vRows().length">{{ vSaving() ? 'Kaydediliyor...' : 'Kaydet' }}</button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Şubeler arası stok transferi -->
    @if (transferOpen()) {
      <app-modal title="Şubeler Arası Stok Transferi" maxWidth="44rem" (dismiss)="transferOpen.set(false)">
        <div class="space-y-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label class="label">Kaynak Şube</label>
              <select class="input" [value]="tFrom()" (change)="tFrom.set($any($event.target).value)">
                <option value="">— Seç —</option>
                @for (b of branchStore.branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Hedef Şube</label>
              <select class="input" [value]="tTo()" (change)="tTo.set($any($event.target).value)">
                <option value="">— Seç —</option>
                @for (b of branchStore.branches(); track b.id) { <option [value]="b.id" [disabled]="b.id === tFrom()">{{ b.name }}</option> }
              </select>
            </div>
          </div>

          <div class="space-y-2">
            @for (l of tLines(); track $index; let i = $index) {
              <div class="flex items-center gap-2">
                <select class="input flex-1" [value]="l.productId" (change)="setTransferProduct(i, $any($event.target).value)">
                  <option value="">— Ürün —</option>
                  @for (p of tProducts(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
                </select>
                <input type="number" step="0.01" min="0" class="input w-28 text-right" [value]="l.quantity"
                       (input)="setTransferQty(i, $any($event.target).value)" placeholder="Miktar" />
                <button type="button" class="text-rose-500 hover:text-rose-700" (click)="removeTransferLine(i)" title="Kaldır">×</button>
              </div>
            }
            <button type="button" class="btn-outline btn-sm" (click)="addTransferLine()">
              <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Satır Ekle
            </button>
          </div>

          <div>
            <label class="label">Not <span class="text-xs font-normal text-slate-400">(opsiyonel)</span></label>
            <input class="input" [value]="tNote()" (input)="tNote.set($any($event.target).value)" placeholder="Sevkiyat açıklaması" />
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="transferOpen.set(false)">İptal</button>
            <button type="button" class="btn-primary" [disabled]="tSaving()" (click)="saveTransfer()">{{ tSaving() ? 'Aktarılıyor...' : 'Transfer Et' }}</button>
          </div>
        </div>
      </app-modal>
    }

    <!-- Toplu fiyat güncelleme modal -->
    @if (bulkOpen()) {
      <app-modal title="Toplu Fiyat Güncelleme" maxWidth="34rem" (dismiss)="bulkOpen.set(false)">
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Hangi fiyat</label>
              <select class="select" [value]="bTarget()" (change)="setBulk('target', $any($event.target).value)">
                <option value="Sale">Satış fiyatı</option>
                <option value="Purchase">Alış fiyatı</option>
              </select>
            </div>
            <div>
              <label class="label">Yöntem</label>
              <select class="select" [value]="bMode()" (change)="setBulk('mode', $any($event.target).value)">
                <option value="Percent">Yüzde (%)</option>
                <option value="Amount">Tutar (₺)</option>
              </select>
            </div>
          </div>

          <div>
            <label class="label">Değişim <span class="text-xs font-normal text-slate-400">(indirim için eksi yazın)</span></label>
            <div class="flex items-center gap-2">
              <input type="number" step="0.01" class="input" [value]="bValue()" (input)="setBulk('value', $any($event.target).value)" />
              <span class="text-sm font-semibold text-slate-500">{{ bMode() === 'Percent' ? '%' : '₺' }}</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Kapsam</label>
              <select class="select" [value]="bCategoryId()" (change)="setBulk('categoryId', $any($event.target).value)">
                <option value="">Tüm ürünler</option>
                @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
              </select>
            </div>
            <div>
              <label class="label">Yuvarlama</label>
              <select class="select" [value]="bRounding()" (change)="setBulk('rounding', $any($event.target).value)">
                <option value="">Kuruşlu (2 hane)</option>
                <option value="whole">Tam sayı (₺45)</option>
                <option value="fifty">Yarım (₺45,50)</option>
                <option value="ninety">Sonu 90 (₺45,90)</option>
              </select>
            </div>
          </div>

          @if (bPreview(); as pv) {
            <div class="rounded-xl bg-slate-50 px-4 py-3">
              <p class="text-sm font-semibold text-slate-700">{{ pv.affectedCount }} ürün etkilenecek</p>
              @if (pv.sample.length) {
                <ul class="mt-2 space-y-1 text-xs text-slate-500">
                  @for (s of pv.sample; track s.id) {
                    <li class="flex justify-between gap-3">
                      <span class="truncate">{{ s.name }}</span>
                      <span class="shrink-0 font-medium">{{ money(s.oldPrice) }} → <b class="text-brand-600">{{ money(s.newPrice) }}</b></span>
                    </li>
                  }
                </ul>
                @if (pv.affectedCount > pv.sample.length) {
                  <p class="mt-1.5 text-xs text-slate-400">…ve {{ pv.affectedCount - pv.sample.length }} ürün daha</p>
                }
              }
            </div>
          }

          <div class="flex justify-end gap-2 pt-1">
            <button type="button" class="btn-outline" (click)="bulkOpen.set(false)">İptal</button>
            <button type="button" class="btn-outline" [disabled]="bSaving()" (click)="previewBulk()">Önizle</button>
            <button type="button" class="btn-primary" [disabled]="bSaving() || !bPreview()" (click)="applyBulk()">
              {{ bSaving() ? 'Uygulanıyor…' : 'Uygula' }}
            </button>
          </div>
        </div>
      </app-modal>
    }

    <!-- Stok hareket modal -->
    @if (movementProduct(); as mp) {
      <app-modal [title]="mp.name + ' · Stok Hareketi'" (dismiss)="movementProduct.set(null)">
        <form [formGroup]="movementForm" (ngSubmit)="saveMovement()" class="space-y-4">
          <p class="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Mevcut stok: <b class="text-slate-700">{{ stockOf(mp) }} {{ mp.unit }}</b></p>
          <div>
            <label class="label">Hareket Tipi</label>
            <select class="select" formControlName="type">
              <option value="In">Giriş (+)</option>
              <option value="Out">Çıkış (−)</option>
              <option value="Adjustment">Düzeltme (sayım)</option>
              <option value="Waste">Fire / Zayi (−)</option>
            </select>
          </div>
          @if (movementForm.controls.type.value === 'Waste') {
            <div>
              <label class="label">Fire Nedeni</label>
              <select class="select" formControlName="wasteReason">
                @for (r of wasteReasons; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
              </select>
              <p class="mt-1 text-xs text-slate-400">Fire maliyeti Raporlar → Fire/Zayi bölümünde ayrıca izlenir.</p>
            </div>
          }
          <div>
            <label class="label">Miktar</label>
            <input type="number" step="0.01" class="input" formControlName="quantity" />
          </div>
          <div>
            <label class="label">Not</label>
            <input class="input" formControlName="note" placeholder="Opsiyonel" />
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" class="btn-outline" (click)="movementProduct.set(null)">İptal</button>
            <button type="submit" class="btn-primary" [disabled]="saving()">Uygula</button>
          </div>
        </form>
      </app-modal>
    }

    @if (cameraOpen()) {
      <app-barcode-camera (scanned)="onBarcodeScan($event)" (closed)="cameraOpen.set(false)" />
    }

    @if (importOpen()) {
      <app-modal title="Ürünleri İçe Aktar (CSV)" maxWidth="44rem" (dismiss)="importOpen.set(false)">
        <div class="space-y-4">
          <p class="text-sm text-slate-500">
            Excel/Sheets'ten <b>CSV</b> olarak kaydedip yükleyin. Sütunlar:
            <span class="font-mono text-xs">ad, kategori, barkod, birim, alisFiyati, satisFiyati, kdv, acilisStok, minStok, hizmet</span>.
            Kategori yoksa otomatik oluşturulur.
            <button type="button" class="ml-1 font-semibold text-brand-600 hover:underline" (click)="downloadTemplate()">Örnek şablon indir</button>
          </p>

          <label class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-brand-300">
            <lucide-icon name="upload" class="h-8 w-8 text-slate-400"></lucide-icon>
            <span class="text-sm font-medium text-slate-600">{{ importFileName() || 'CSV dosyası seçin' }}</span>
            <span class="text-xs text-slate-400">.csv — virgül (,) veya noktalı virgül (;) ayraçlı</span>
            <input type="file" accept=".csv,text/csv" class="hidden" (change)="onFile($event)" />
          </label>

          @if (importError()) {
            <p class="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ importError() }}</p>
          }

          @if (importRows().length) {
            <div>
              <p class="mb-2 text-sm font-semibold text-slate-700">{{ importRows().length }} satır okundu — önizleme:</p>
              <div class="max-h-48 overflow-auto rounded-xl border border-slate-100">
                <table class="w-full text-left text-xs">
                  <thead class="sticky top-0 bg-slate-50 text-slate-500">
                    <tr><th class="p-2">Ad</th><th class="p-2">Kategori</th><th class="p-2 text-right">Satış</th><th class="p-2 text-right">Stok</th></tr>
                  </thead>
                  <tbody>
                    @for (r of importPreview(); track $index) {
                      <tr class="border-t border-slate-50">
                        <td class="p-2 font-medium text-slate-700">{{ r.name }}</td>
                        <td class="p-2 text-slate-500">{{ r.categoryName || '—' }}</td>
                        <td class="p-2 text-right">{{ r.salePrice ?? '—' }}</td>
                        <td class="p-2 text-right">{{ r.openingStock ?? 0 }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @if (importResult(); as res) {
            <div class="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <b>{{ res.imported }}</b> ürün eklendi.@if (res.skipped) { {{ res.skipped }} satır atlandı. }
            </div>
            @if (res.errors.length) {
              <div class="max-h-32 space-y-0.5 overflow-auto rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                @for (e of res.errors; track $index) {
                  <p>Satır {{ e.row }}<span class="text-amber-600"> ({{ e.name }})</span>: {{ e.reason }}</p>
                }
              </div>
            }
          }

          <div class="flex justify-end gap-2">
            <button class="btn-outline" (click)="importOpen.set(false)">Kapat</button>
            <button class="btn-primary" [disabled]="!importRows().length || importing()" (click)="doImport()">
              {{ importing() ? 'Aktarılıyor…' : 'İçe Aktar (' + importRows().length + ')' }}
            </button>
          </div>
        </div>
      </app-modal>
    }

    <!-- Trendyol ilan açma sihirbazı -->
    @if (listingProduct(); as lp) {
      <app-listing-wizard [product]="lp" (closed)="onListingClosed($event)" />
    }

    <!-- Ürün alt-editörleri (seçenek / reçete / tedarikçi) -->
    @if (optionsFor(); as p) {
      <app-product-options-modal [productId]="p.id" [productName]="p.name" (close)="optionsFor.set(null)" />
    }
    @if (recipeFor(); as p) {
      <app-product-recipe-modal [productId]="p.id" [productName]="p.name" (close)="recipeFor.set(null)" />
    }
    @if (suppliersFor(); as p) {
      <app-product-suppliers-modal [productId]="p.id" [productName]="p.name" (close)="suppliersFor.set(null)" />
    }
  `,
})
export class ProductsComponent implements OnInit {
  private api = inject(StockApi);
  private marketplace = inject(MarketplaceApi);
  private settingsApi = inject(SettingsApi);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);
  protected branchStore = inject(BranchStore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected term = computed(() => this.auth.profile().terminology);
  protected pf = computed(() => this.auth.profile().productFields);
  protected feat = computed(() => this.auth.profile().features);
  /** Tedarikçi eşleme (#37) yalnız Owner/Admin (backend de kısıtlar). */
  protected isAdmin = computed(() => ['Owner', 'Admin'].includes(this.auth.role() ?? ''));
  /** Ürün alt-editör modalları için hedef ürün (null = kapalı). */
  protected optionsFor = signal<ProductDto | null>(null);
  protected recipeFor = signal<ProductDto | null>(null);
  protected suppliersFor = signal<ProductDto | null>(null);
  protected cameraSupported = barcodeCameraSupported();
  protected cameraOpen = signal(false);

  // İçe aktarma (CSV)
  protected importOpen = signal(false);
  protected importFileName = signal('');
  protected importRows = signal<ImportProductRow[]>([]);
  protected importPreview = computed(() => this.importRows().slice(0, 8));
  protected importError = signal('');
  protected importing = signal(false);
  protected importResult = signal<ImportResultDto | null>(null);

  protected money = money;
  protected stockOf = stockOf;
  protected genBarcode = generateInternalEan13;
  protected readonly pageSize = 12;

  protected loading = signal(true);
  protected saving = signal(false);
  protected uploading = signal(false);
  protected products = signal<ProductDto[]>([]);
  protected categories = signal<CategoryDto[]>([]);
  protected total = signal(0);
  protected page = signal(1);
  protected search = signal('');
  protected categoryId = signal('');
  protected lowOnly = signal(false);
  protected totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  protected formOpen = signal(false);
  protected editingId = signal<string | null>(null);
  protected movementProduct = signal<ProductDto | null>(null);

  private searchTimer?: ReturnType<typeof setTimeout>;

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    sku: [''],
    barcode: [''],
    shelfLocation: [''],
    storageArea: [''],
    categoryId: [''],
    unit: ['adet'],
    purchasePrice: [0],
    salePrice: [0],
    vatRate: [20],
    minStock: [0],
    openingStock: [0],
    isService: [false],
    imageUrl: [''],
    brandName: [''],
    dimensionalWeight: [null as number | null],
    scaleItemCode: [''],
    expiryDate: [''],
    purchaseUnit: [''],
    purchaseUnitFactor: [null as number | null],
    description: [''],
    isVisibleOnMenu: [true],
    menuSortOrder: [0],
  });

  // ---- Varyantlı ürün sihirbazı (butik beden/renk) ----
  protected variantOpen = signal(false);
  protected vSaving = signal(false);
  protected vRows = signal<{ label: string; openingStock: number; salePrice: number | null }[]>([]);
  protected vform = this.fb.nonNullable.group({
    name: ['', Validators.required],
    categoryId: [''],
    unit: ['adet'],
    purchasePrice: [0],
    salePrice: [0],
    vatRate: [20],
    minStock: [0],
    attr1Name: ['Beden'],
    attr1Values: ['S, M, L'],
    attr2Name: ['Renk'],
    attr2Values: [''],
  });

  // ---- Şubeler arası transfer ----
  protected transferOpen = signal(false);
  protected tSaving = signal(false);
  protected tFrom = signal('');
  protected tTo = signal('');
  protected tNote = signal('');
  protected tProducts = signal<ProductDto[]>([]);
  protected tLines = signal<{ productId: string; quantity: number }[]>([{ productId: '', quantity: 1 }]);

  // Pazaryeri ilan açma: Zincir entitlement'ı + AKTİF bir Trendyol bağlantısı olmalı.
  // Trendyol'la işi olmayan işletmeler (bağlantı kurmamış) ilan butonunu/alanlarını görmesin.
  protected marketplaceEnabled = computed(() => this.auth.user()?.entitlements?.marketplaceIntegration ?? false);
  protected hasMarketplaceConnection = signal(false);
  protected marketplaceReady = computed(() => this.marketplaceEnabled() && this.hasMarketplaceConnection());
  /** Terazi barkodu ayarlardan açıksa ürün kartında terazi kodu alanı gösterilir. */
  protected scaleEnabled = signal(false);
  protected extraImages = signal<string[]>([]);
  protected uploadingExtra = signal(false);
  protected extraLink = signal('');
  protected listingProduct = signal<ProductDto | null>(null);

  // Toplu fiyat güncelleme durumu
  protected bulkOpen = signal(false);
  protected bSaving = signal(false);
  protected bTarget = signal<'Sale' | 'Purchase'>('Sale');
  protected bMode = signal<'Percent' | 'Amount'>('Percent');
  protected bValue = signal(0);
  protected bCategoryId = signal('');
  protected bRounding = signal('');
  protected bPreview = signal<BulkPriceResultDto | null>(null);

  protected movementForm = this.fb.nonNullable.group({
    type: ['In'],
    quantity: [0],
    note: [''],
    wasteReason: ['Spoiled'],
  });

  protected wasteReasons: { value: WasteReason; label: string }[] = [
    { value: 'Spoiled', label: 'Bozuldu' },
    { value: 'Broken', label: 'Kırıldı / hasar gördü' },
    { value: 'Expired', label: 'Son kullanma geçti' },
    { value: 'Complimentary', label: 'İkram edildi' },
    { value: 'Other', label: 'Diğer' },
  ];

  ngOnInit(): void {
    // Global aramadan / zil bildiriminden gelen ön filtreler (?q=, ?low=1)
    const qp = this.route.snapshot.queryParamMap;
    const q = qp.get('q');
    if (q) this.search.set(q);
    if (qp.get('low') === '1') this.lowOnly.set(true);

    this.api.getCategories().subscribe((c) => this.categories.set(c));
    // Trendyol ilan butonu yalnız aktif bağlantı varsa çıksın (yalnız Zincir planında sorgula).
    if (this.marketplaceEnabled()) {
      this.marketplace.listConnections().subscribe({
        next: (c) => this.hasMarketplaceConnection.set(c.some((x) => x.isActive)),
        error: () => this.hasMarketplaceConnection.set(false),
      });
    }
    // Terazi kodu alanı yalnız özellik açıkken görünsün (kafe/butik kullanıcısını gereksiz alanla yormayalım).
    this.settingsApi.get().subscribe({ next: (s) => this.scaleEnabled.set(s.scaleBarcodeEnabled ?? false), error: () => {} });
    this.load();
  }

  protected onBarcodeScan(code: string): void {
    this.cameraOpen.set(false);
    this.form.controls.barcode.setValue(code);
  }

  // ---- CSV içe aktarma ----
  protected openImport(): void {
    this.importOpen.set(true);
    this.importFileName.set('');
    this.importRows.set([]);
    this.importError.set('');
    this.importResult.set(null);
  }

  protected onFile(ev: Event): void {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.importFileName.set(file.name);
    this.importError.set('');
    this.importResult.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = this.parseCsv(String(reader.result ?? ''));
        if (!rows.length) {
          this.importRows.set([]);
          this.importError.set('Dosyada geçerli satır bulunamadı. Başlık satırı ve en az bir ürün olmalı.');
        } else {
          this.importRows.set(rows);
        }
      } catch {
        this.importError.set('CSV okunamadı. Dosya biçimini kontrol edin.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  protected doImport(): void {
    const rows = this.importRows();
    if (!rows.length || this.importing()) return;
    this.importing.set(true);
    this.api.importProducts(rows).subscribe({
      next: (res) => {
        this.importing.set(false);
        this.importResult.set(res);
        this.importRows.set([]);
        this.importFileName.set('');
        this.toast.success(`${res.imported} ürün eklendi.`);
        this.load();
      },
      error: () => this.importing.set(false),
    });
  }

  protected downloadTemplate(): void {
    const csv =
      '﻿' +
      [
        'ad;kategori;barkod;birim;alisFiyati;satisFiyati;kdv;acilisStok;minStok;hizmet',
        'Espresso;Sıcak İçecekler;;adet;12;40;10;100;10;hayir',
        'Latte;Sıcak İçecekler;8690000000001;adet;18;55;10;80;10;hayir',
        'Danışmanlık;Hizmet;;saat;0;500;20;0;0;evet',
      ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urun-sablonu.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  private parseCsv(text: string): ImportProductRow[] {
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim().length);
    if (lines.length < 2) return [];
    const delim = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ';' : ',';
    const headers = this.splitCsvLine(lines[0], delim).map((h) => this.normHeader(h));
    const idx = (keys: string[]) => headers.findIndex((h) => keys.includes(h));
    const iName = idx(['ad', 'isim', 'urunadi', 'name', 'urun']);
    const iSku = idx(['sku', 'stokkodu', 'kod']);
    const iBarcode = idx(['barkod', 'barcode']);
    const iCat = idx(['kategori', 'category', 'grup']);
    const iUnit = idx(['birim', 'unit']);
    const iPurchase = idx(['alisfiyati', 'alis', 'alisfiyat', 'purchaseprice', 'maliyet']);
    const iSale = idx(['satisfiyati', 'satis', 'satisfiyat', 'fiyat', 'saleprice', 'price']);
    const iVat = idx(['kdv', 'vat', 'vatrate']);
    const iStock = idx(['acilisstok', 'acilis', 'stok', 'openingstock', 'miktar']);
    const iMin = idx(['minstok', 'min', 'minstock', 'kritikstok']);
    const iService = idx(['hizmet', 'isservice', 'servis']);

    const rows: ImportProductRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const c = this.splitCsvLine(lines[i], delim);
      const get = (n: number) => (n >= 0 && n < c.length ? c[n].trim() : '');
      const name = get(iName);
      if (!name) continue;
      rows.push({
        name,
        sku: get(iSku) || null,
        barcode: get(iBarcode) || null,
        categoryName: get(iCat) || null,
        unit: get(iUnit) || null,
        purchasePrice: this.parseNum(get(iPurchase)),
        salePrice: this.parseNum(get(iSale)),
        vatRate: this.parseNum(get(iVat)),
        openingStock: this.parseNum(get(iStock)),
        minStock: this.parseNum(get(iMin)),
        isService: this.parseBool(get(iService)),
      });
    }
    return rows;
  }

  private splitCsvLine(line: string, delim: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  private normHeader(h: string): string {
    return h.trim().toLowerCase()
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
      .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9]/g, '');
  }

  private parseNum(s: string): number | null {
    let t = (s ?? '').trim();
    if (!t) return null;
    if (t.includes(',') && t.includes('.')) {
      if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
      else t = t.replace(/,/g, '');
    } else if (t.includes(',')) {
      t = t.replace(',', '.');
    }
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  private parseBool(s: string): boolean | null {
    const t = (s ?? '').trim().toLowerCase();
    if (!t) return null;
    return ['evet', 'yes', 'true', '1', 'e', 'x', 'var'].includes(t);
  }

  protected exporting = signal(false);

  /** Mevcut filtreyle TÜM ürünleri (sayfa sayfa, en çok 2000) CSV olarak indirir — TR Excel uyumlu (BOM + ;). */
  protected exportCsv(): void {
    const q: Record<string, unknown> = {
      page: 1,
      pageSize: 200,
      search: this.search(),
      categoryId: this.categoryId(),
      lowStock: this.lowOnly() ? true : '',
    };
    this.exporting.set(true);
    this.api.getProducts(q).subscribe({
      next: (first) => {
        const pages = Math.min(Math.ceil(first.total / 200), 10);
        const rest = [];
        for (let p = 2; p <= pages; p++) rest.push(this.api.getProducts({ ...q, page: p }));
        (rest.length ? forkJoin(rest) : of([])).subscribe({
          next: (others) => {
            this.downloadCsv([...first.items, ...others.flatMap((r) => r.items)]);
            this.exporting.set(false);
          },
          error: (e) => { this.exporting.set(false); this.toast.error(apiError(e)); },
        });
      },
      error: (e) => { this.exporting.set(false); this.toast.error(apiError(e)); },
    });
  }

  private downloadCsv(rows: ProductDto[]): void {
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'Ad;Stok Kodu;Barkod;Kategori;Birim;Alış Fiyatı;Satış Fiyatı;KDV %;Stok;Min Stok;Hizmet;Aktif';
    const lines = rows.map((p) =>
      [
        p.name, p.sku, p.barcode, p.categoryName, p.unit,
        p.purchasePrice, p.salePrice, p.vatRate, p.currentStock, p.minStock,
        p.isService ? 'Evet' : 'Hayır', p.isActive ? 'Evet' : 'Hayır',
      ].map(esc).join(';'));

    const csv = '﻿' + [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urunler_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.toast.success(`${rows.length} ürün dışa aktarıldı.`);
  }

  private load(): void {
    this.loading.set(true);
    this.api
      .getProducts({
        page: this.page(),
        pageSize: this.pageSize,
        search: this.search(),
        categoryId: this.categoryId(),
        lowStock: this.lowOnly() ? true : '',
      })
      .subscribe({
        next: (r) => {
          this.products.set(r.items);
          this.total.set(r.total);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected onSearch(v: string): void {
    this.search.set(v);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page.set(1);
      this.load();
    }, 350);
  }
  protected onCategory(v: string): void {
    this.categoryId.set(v);
    this.page.set(1);
    this.load();
  }
  protected onLow(v: boolean): void {
    this.lowOnly.set(v);
    this.page.set(1);
    this.load();
  }
  protected setPage(p: number): void {
    this.page.set(p);
    this.load();
  }

  protected onImage(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    this.api.uploadImage(file).subscribe({
      next: (r) => {
        this.form.controls.imageUrl.setValue(r.url);
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.toast.error(apiError(err));
      },
    });
    input.value = '';
  }

  protected onExtraImage(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingExtra.set(true);
    this.api.uploadImage(file).subscribe({
      next: (r) => { this.extraImages.update((imgs) => [...imgs, r.url].slice(0, 8)); this.uploadingExtra.set(false); },
      error: (err) => { this.uploadingExtra.set(false); this.toast.error(apiError(err)); },
    });
    input.value = '';
  }
  protected removeExtraImage(i: number): void {
    this.extraImages.update((imgs) => imgs.filter((_, idx) => idx !== i));
  }
  /** Ek görseli dosya yerine LİNK ile ekler (pazaryeri için dış URL de olur). */
  protected addExtraLink(): void {
    const url = this.extraLink().trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) { this.toast.error('Geçerli bir bağlantı girin (https:// ile başlamalı).'); return; }
    this.extraImages.update((imgs) => imgs.includes(url) ? imgs : [...imgs, url].slice(0, 8));
    this.extraLink.set('');
  }
  protected openListing(p: ProductDto): void { this.listingProduct.set(p); }
  protected onListingClosed(submitted: boolean): void {
    this.listingProduct.set(null);
    if (submitted) this.load();
  }

  // Barkod etiketi yazdırma: tek ürün (satırdan) ya da toplu (başlıktan) etiket ekranını açar.
  protected printLabel(p: ProductDto): void { this.router.navigate(['/etiket'], { queryParams: { id: p.id } }); }
  protected openLabelPrint(): void { this.router.navigate(['/etiket']); }

  // ---- Varyantlı ürün sihirbazı ----
  protected openVariant(): void {
    this.vform.reset({ name: '', categoryId: '', unit: 'adet', purchasePrice: 0, salePrice: 0, vatRate: 20, minStock: 0, attr1Name: 'Beden', attr1Values: 'S, M, L', attr2Name: 'Renk', attr2Values: '' });
    this.vRows.set([]);
    this.variantOpen.set(true);
  }

  private splitValues(s: string): string[] {
    return (s || '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  protected generateVariantMatrix(): void {
    const v = this.vform.getRawValue();
    const a1 = this.splitValues(v.attr1Values);
    if (a1.length === 0) { this.toast.error('En az bir özellik değeri girin (ör. S, M, L).'); return; }
    const a2 = this.splitValues(v.attr2Values);
    const labels = a2.length ? a1.flatMap((x) => a2.map((y) => `${x} · ${y}`)) : a1;
    // Mevcut satırların stok/fiyatını koru (yeniden üretimde kaybolmasın).
    const prev = new Map(this.vRows().map((r) => [r.label, r]));
    this.vRows.set(labels.map((label) => prev.get(label) ?? { label, openingStock: 0, salePrice: null }));
  }

  protected setVarStock(i: number, val: string): void {
    const rows = [...this.vRows()];
    rows[i] = { ...rows[i], openingStock: +val || 0 };
    this.vRows.set(rows);
  }
  protected setVarPrice(i: number, val: string): void {
    const rows = [...this.vRows()];
    rows[i] = { ...rows[i], salePrice: val === '' ? null : +val };
    this.vRows.set(rows);
  }
  protected removeVarRow(i: number): void {
    this.vRows.set(this.vRows().filter((_, ix) => ix !== i));
  }

  protected saveVariants(): void {
    const v = this.vform.getRawValue();
    if (!v.name.trim()) { this.vform.markAllAsTouched(); this.toast.error('Ürün adı girin.'); return; }
    const rows = this.vRows();
    if (rows.length === 0) { this.toast.error('Önce varyantları oluşturun.'); return; }

    const attributes: { name: string; values: string[] }[] = [];
    const a1 = this.splitValues(v.attr1Values);
    if (v.attr1Name.trim() && a1.length) attributes.push({ name: v.attr1Name.trim(), values: a1 });
    const a2 = this.splitValues(v.attr2Values);
    if (v.attr2Name.trim() && a2.length) attributes.push({ name: v.attr2Name.trim(), values: a2 });

    const body = {
      name: v.name.trim(),
      categoryId: v.categoryId || null,
      unit: v.unit || 'adet',
      purchasePrice: +v.purchasePrice,
      salePrice: +v.salePrice,
      vatRate: +v.vatRate,
      minStock: +v.minStock,
      attributes,
      variants: rows.map((r) => ({
        label: r.label,
        sku: null,
        barcode: null,
        salePrice: r.salePrice != null && +r.salePrice > 0 ? +r.salePrice : null,
        purchasePrice: null,
        openingStock: +r.openingStock || 0,
        minStock: null,
      })),
    };
    this.vSaving.set(true);
    this.api.createProductWithVariants(body).subscribe({
      next: (r) => {
        this.vSaving.set(false);
        this.variantOpen.set(false);
        this.toast.success(`${r.variants.length} varyant oluşturuldu.`);
        this.load();
      },
      error: (e) => {
        this.vSaving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Şubeler arası transfer ----
  protected openTransfer(): void {
    this.tFrom.set(this.branchStore.currentBranchId() ?? this.branchStore.branches()[0]?.id ?? '');
    this.tTo.set('');
    this.tNote.set('');
    this.tLines.set([{ productId: '', quantity: 1 }]);
    this.tProducts.set([]);
    // Tüm ürünleri getir (transfer seçici sayfalı listeyle sınırlı olmasın); varyant şablonu/hizmet hariç.
    this.api.getProducts({ pageSize: 500 }).subscribe((r) => this.tProducts.set(r.items.filter((p) => !p.isVariantParent && !p.isService)));
    this.transferOpen.set(true);
  }
  protected addTransferLine(): void { this.tLines.set([...this.tLines(), { productId: '', quantity: 1 }]); }
  protected removeTransferLine(i: number): void { this.tLines.set(this.tLines().filter((_, ix) => ix !== i)); }
  protected setTransferProduct(i: number, pid: string): void {
    const l = [...this.tLines()]; l[i] = { ...l[i], productId: pid }; this.tLines.set(l);
  }
  protected setTransferQty(i: number, val: string): void {
    const l = [...this.tLines()]; l[i] = { ...l[i], quantity: +val || 0 }; this.tLines.set(l);
  }

  protected saveTransfer(): void {
    const from = this.tFrom(), to = this.tTo();
    if (!from || !to) { this.toast.error('Kaynak ve hedef şube seçin.'); return; }
    if (from === to) { this.toast.error('Kaynak ve hedef şube farklı olmalı.'); return; }
    const items = this.tLines().filter((l) => l.productId && l.quantity > 0).map((l) => ({ productId: l.productId, quantity: l.quantity }));
    if (items.length === 0) { this.toast.error('Transfer edilecek ürün ve miktar girin.'); return; }
    this.tSaving.set(true);
    this.api.transferStock({ fromBranchId: from, toBranchId: to, items, note: this.tNote() || null }).subscribe({
      next: (r) => {
        this.tSaving.set(false);
        this.transferOpen.set(false);
        this.toast.success(`${r.itemCount} ürün: ${r.fromBranchName} → ${r.toBranchName}`);
        this.load();
      },
      error: (e) => {
        this.tSaving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.extraImages.set([]);
    this.form.reset({ name: '', sku: '', barcode: '', shelfLocation: '', storageArea: '', categoryId: '', unit: 'adet', purchasePrice: 0, salePrice: 0, vatRate: 20, minStock: 0, openingStock: 0, isService: !this.pf().stock, imageUrl: '', brandName: '', dimensionalWeight: null, scaleItemCode: '', expiryDate: '', purchaseUnit: '', purchaseUnitFactor: null, description: '', isVisibleOnMenu: true, menuSortOrder: 0 });
    this.formOpen.set(true);
  }

  protected openEdit(p: ProductDto): void {
    this.editingId.set(p.id);
    this.form.reset({
      name: p.name,
      sku: p.sku,
      barcode: p.barcode ?? '',
      shelfLocation: p.shelfLocation ?? '',
      storageArea: p.storageArea ?? '',
      categoryId: p.categoryId ?? '',
      unit: p.unit,
      purchasePrice: p.purchasePrice,
      salePrice: p.salePrice,
      vatRate: p.vatRate,
      minStock: p.minStock,
      openingStock: 0,
      isService: p.isService,
      imageUrl: p.imageUrl ?? '',
      brandName: p.brandName ?? '',
      dimensionalWeight: p.dimensionalWeight ?? null,
      scaleItemCode: p.scaleItemCode ?? '',
      expiryDate: p.expiryDate ? p.expiryDate.slice(0, 10) : '',
      purchaseUnit: p.purchaseUnit ?? '',
      purchaseUnitFactor: p.purchaseUnitFactor ?? null,
      description: p.description ?? '',
      isVisibleOnMenu: p.isVisibleOnMenu,
      menuSortOrder: p.menuSortOrder,
    });
    this.extraImages.set(p.imageUrls ?? []);
    this.formOpen.set(true);
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: Record<string, unknown> = {
      name: v.name,
      sku: v.sku || null,
      barcode: v.barcode || null,
      shelfLocation: v.shelfLocation || null,
      storageArea: v.storageArea || null,
      categoryId: v.categoryId || null,
      unit: v.unit,
      purchasePrice: +v.purchasePrice,
      salePrice: +v.salePrice,
      vatRate: +v.vatRate,
      minStock: +v.minStock,
      isService: v.isService,
      imageUrl: v.imageUrl || null,
      brandName: v.brandName || null,
      imageUrls: this.extraImages(),
      dimensionalWeight: v.dimensionalWeight != null && +v.dimensionalWeight > 0 ? +v.dimensionalWeight : null,
      scaleItemCode: v.scaleItemCode?.trim() || null,
      expiryDate: v.expiryDate || null,
      purchaseUnit: v.purchaseUnit?.trim() || null,
      purchaseUnitFactor: v.purchaseUnitFactor != null && +v.purchaseUnitFactor > 0 ? +v.purchaseUnitFactor : null,
      description: v.description || null,
      isVisibleOnMenu: v.isVisibleOnMenu,
      menuSortOrder: +v.menuSortOrder,
    };
    this.saving.set(true);
    const id = this.editingId();
    const req = id
      ? this.api.updateProduct(id, { ...payload, isActive: true })
      : this.api.createProduct({ ...payload, openingStock: +v.openingStock });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(id ? 'Ürün güncellendi.' : 'Ürün eklendi.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  // ---- Toplu fiyat güncelleme ----
  protected openBulkPrice(): void {
    this.bPreview.set(null);
    this.bValue.set(0);
    this.bulkOpen.set(true);
  }

  /** Tek giriş noktası: her ayar değişiminde bayat önizleme temizlenir (yanlışlıkla eski önizlemeyle uygulama olmaz). */
  protected setBulk(field: 'target' | 'mode' | 'value' | 'categoryId' | 'rounding', val: string): void {
    if (field === 'target') this.bTarget.set(val as 'Sale' | 'Purchase');
    else if (field === 'mode') this.bMode.set(val as 'Percent' | 'Amount');
    else if (field === 'value') this.bValue.set(+val || 0);
    else if (field === 'categoryId') this.bCategoryId.set(val);
    else this.bRounding.set(val);
    this.bPreview.set(null);
  }

  private bulkBody(preview: boolean) {
    return {
      target: this.bTarget(),
      mode: this.bMode(),
      value: this.bValue(),
      categoryId: this.bCategoryId() || null,
      rounding: this.bRounding() || null,
      preview,
    };
  }

  protected previewBulk(): void {
    if (!this.bValue()) {
      this.toast.error('Değişim miktarı 0 olamaz.');
      return;
    }
    this.bSaving.set(true);
    this.api.bulkPrice(this.bulkBody(true)).subscribe({
      next: (r) => {
        this.bSaving.set(false);
        this.bPreview.set(r);
        if (r.affectedCount === 0) this.toast.error('Bu kapsamda değişecek ürün yok.');
      },
      error: (e) => {
        this.bSaving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected applyBulk(): void {
    this.bSaving.set(true);
    this.api.bulkPrice(this.bulkBody(false)).subscribe({
      next: (r) => {
        this.bSaving.set(false);
        this.bulkOpen.set(false);
        this.toast.success(`${r.affectedCount} ürünün fiyatı güncellendi.`);
        this.load();
      },
      error: (e) => {
        this.bSaving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected openMovement(p: ProductDto): void {
    this.movementForm.reset({ type: 'In', quantity: 0, note: '', wasteReason: 'Spoiled' });
    this.movementProduct.set(p);
  }

  protected saveMovement(): void {
    const p = this.movementProduct();
    if (!p) return;
    const v = this.movementForm.getRawValue();
    this.saving.set(true);
    // Fire ayrı uç nokta: nedeni kaydeder ve fire raporuna düşer (düz "Çıkış" hareketi değil).
    const call =
      v.type === 'Waste'
        ? this.api.recordWaste({ productId: p.id, quantity: +v.quantity, reason: v.wasteReason as WasteReason, note: v.note || null })
        : this.api.createMovement({ productId: p.id, type: v.type, quantity: +v.quantity, note: v.note || null });
    call.subscribe({
      next: () => {
        this.saving.set(false);
        this.movementProduct.set(null);
        this.toast.success(v.type === 'Waste' ? 'Fire kaydedildi.' : 'Stok hareketi uygulandı.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected async remove(p: ProductDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${p.name}" pasife alınacak. Devam edilsin mi?`, danger: true, confirmText: 'Pasife Al' }))) return;
    this.api.deleteProduct(p.id).subscribe({
      next: () => {
        this.toast.success('Ürün pasife alındı.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
