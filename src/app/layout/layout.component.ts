import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { filter, forkJoin } from 'rxjs';
import { StockApi } from '../core/api/stock.api';
import { ContactsApi } from '../core/api/contacts.api';
import { OrdersApi } from '../core/api/orders.api';
import { AppointmentsApi } from '../core/api/appointments.api';
import { MarketplaceApi } from '../core/api/marketplace.api';
import { NotificationsApi } from '../core/api/notifications.api';
import { BranchStore } from '../core/branch.store';
import { PageHelpService } from '../core/page-help.service';
import { AppointmentReminderComponent } from '../shared/appointment-reminder.component';
import { QrOrderAlertComponent } from '../shared/qr-order-alert.component';
import { PushToggleComponent } from '../shared/push-toggle.component';
import { AuthService } from '../core/auth.service';
import { ToastService } from '../core/toast.service';
import { ROLE_LABELS, canManageStaff, filterNav } from '../core/permissions';
import { NavItem, NAV_GROUP_ORDER } from '../core/business-profile';
import { AppointmentDto, CompanyDto, ContactDto, MarketplaceOrderDto, NotificationDto, OrderListItemDto, ProductDto, ReplenishmentItemDto } from '../core/models';
import { apiError, money, wallClock } from '../core/utils';

@Component({
  selector: 'app-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, AppointmentReminderComponent, QrOrderAlertComponent, PushToggleComponent],
  template: `
    <div class="min-h-screen bg-slate-50 lg:flex">
      <!-- Mobil overlay -->
      @if (mobileOpen()) {
        <div class="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" (click)="mobileOpen.set(false)"></div>
      }

      <!-- Sidebar -->
      <aside
        class="fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:static lg:translate-x-0"
        [class.-translate-x-full]="!mobileOpen()"
      >
        <div class="flex items-center gap-2.5 px-5 py-5">
          <img src="/logo.svg" alt="CloudPosGrid" class="h-9 w-9 rounded-xl shadow-lg" />
          <div>
            <p class="text-sm font-extrabold leading-tight text-white">CloudPosGrid</p>
            <p class="text-[10px] font-medium uppercase tracking-wider text-slate-400">{{ profile().label }}</p>
          </div>
        </div>

        <nav class="flex-1 overflow-y-auto px-3 py-2">
          @for (section of navSections(); track section.label) {
            @if (section.items.length) {
              <div class="space-y-1" [class.mt-4]="section.label">
                @if (section.label) {
                  <p class="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400/90">{{ section.label }}</p>
                }
                @for (item of section.items; track item.path) {
                  <a
                    [routerLink]="item.path"
                    [routerLinkActiveOptions]="{ exact: item.path === '/' }"
                    routerLinkActive="nav-link-active"
                    class="nav-link"
                    (click)="mobileOpen.set(false)"
                  >
                    <lucide-icon [name]="item.icon" class="h-[18px] w-[18px]"></lucide-icon>
                    {{ item.label }}
                  </a>
                }
              </div>
            }
          }
        </nav>

        <div class="border-t border-white/10 p-3 space-y-1">
          <!-- İşletme değiştirici (#47 çok-şirket) -->
          <div class="relative" (click)="$event.stopPropagation()">
            <button (click)="bizOpen.set(!bizOpen())"
                    class="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition hover:bg-white/10">
              <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
                <lucide-icon name="building-2" class="h-4 w-4"></lucide-icon>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-white">{{ user()?.tenantName }}</span>
                <span class="block text-[11px] text-slate-400">İşletme değiştir</span>
              </span>
              <lucide-icon name="chevron-down" class="h-4 w-4 shrink-0 text-slate-400"></lucide-icon>
            </button>
            @if (bizOpen()) {
              <div class="absolute bottom-full left-0 z-50 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div class="max-h-64 overflow-y-auto py-1">
                  @for (c of user()?.companies ?? []; track c.tenantId) {
                    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                            [class.bg-brand-50]="c.tenantId === user()?.tenantId" (click)="switchBusiness(c)">
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium text-slate-800">{{ c.name }}</span>
                        <span class="block text-xs text-slate-400">{{ roleLabels[c.role] }} · {{ c.plan }}</span>
                      </span>
                      @if (c.tenantId === user()?.tenantId) { <lucide-icon name="check" class="h-4 w-4 text-brand-600"></lucide-icon> }
                    </button>
                  }
                </div>
                <button class="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-brand-600 hover:bg-slate-50"
                        (click)="openNewBusiness()">
                  <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Yeni işletme ekle
                </button>
              </div>
            }
          </div>

          <div class="flex items-center gap-3 rounded-xl px-2 py-2">
            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
              {{ initials() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-white">{{ user()?.fullName }}</p>
              <p class="truncate text-xs text-slate-400">{{ roleLabel() }}</p>
            </div>
            <button (click)="pinOpen.set(true)" class="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Personel değiştir (PIN)">
              <lucide-icon name="key-round" class="h-[18px] w-[18px]"></lucide-icon>
            </button>
            <button (click)="logout()" class="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Çıkış">
              <lucide-icon name="log-out" class="h-[18px] w-[18px]"></lucide-icon>
            </button>
          </div>
        </div>
      </aside>

      <!-- İçerik -->
      <div class="flex min-h-screen flex-1 flex-col">
        <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:px-8">
          <button class="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" (click)="mobileOpen.set(true)">
            <lucide-icon name="menu" class="h-5 w-5"></lucide-icon>
          </button>

          <!-- Şube seçici (yalnızca çok şubeli) -->
          @if (branchStore.multi()) {
            <div class="relative" (click)="$event.stopPropagation()">
              <button class="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                (click)="branchOpen.set(!branchOpen()); bellOpen.set(false); searchOpen.set(false)">
                <lucide-icon name="building-2" class="h-4 w-4 text-brand-600"></lucide-icon>
                <span class="max-w-[130px] truncate">{{ branchLabel() }}</span>
                <lucide-icon name="chevron-down" class="h-4 w-4 text-slate-400"></lucide-icon>
              </button>
              @if (branchOpen()) {
                <div class="absolute left-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                  @if (canSeeAllBranches()) {
                    <button class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      [class]="!branchStore.currentBranchId() ? 'font-semibold text-brand-600' : 'text-slate-600'"
                      (click)="pickBranch(null)">
                      <lucide-icon name="layout-grid" class="h-4 w-4"></lucide-icon> Tüm şubeler (birleşik)
                    </button>
                    <div class="my-1 border-t border-slate-100"></div>
                  }
                  @for (b of visibleBranches(); track b.id) {
                    <button class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                      [class]="branchStore.currentBranchId() === b.id ? 'font-semibold text-brand-600' : 'text-slate-700'"
                      (click)="pickBranch(b.id)">
                      <span class="truncate">{{ b.name }}</span>
                      @if (b.isDefault) { <span class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Merkez</span> }
                    </button>
                  }
                </div>
              }
            </div>
          }

          <div class="flex-1"></div>
          <!-- Global arama -->
          <div class="relative hidden w-72 md:block" (click)="$event.stopPropagation()">
            <lucide-icon name="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></lucide-icon>
            <input class="input py-2 pl-10 pr-8 text-sm" placeholder="Ara — ürün, cari…"
              [value]="searchQ()"
              (input)="onSearchInput($any($event.target).value)"
              (focus)="searchQ().trim().length >= 2 && searchOpen.set(true)"
              (keyup.enter)="submitSearch()"
              (keyup.escape)="closeSearch()" />
            @if (searchQ()) {
              <button class="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" (click)="closeSearch()">
                <lucide-icon name="x" class="h-4 w-4"></lucide-icon>
              </button>
            }
            @if (searchOpen() && searchQ().trim().length >= 2) {
              <div class="absolute right-0 top-full z-50 mt-2 w-96 max-w-[80vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                @if (searching()) {
                  <p class="p-4 text-center text-sm text-slate-400">Aranıyor…</p>
                } @else if (!productHits().length && !contactHits().length) {
                  <p class="p-4 text-center text-sm text-slate-400">Sonuç bulunamadı.</p>
                } @else {
                  <div class="max-h-[70vh] overflow-y-auto py-1">
                    @if (productHits().length) {
                      <p class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Ürünler</p>
                      @for (p of productHits(); track p.id) {
                        <button class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" (click)="goProduct(p)">
                          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><lucide-icon name="package" class="h-4 w-4"></lucide-icon></span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ p.name }}</span>
                            <span class="block text-xs" [class]="p.isLowStock ? 'text-rose-600' : 'text-slate-400'">Stok: {{ p.currentStock }} {{ p.unit }}</span>
                          </span>
                          <span class="shrink-0 text-sm font-semibold text-brand-600">{{ money(p.salePrice) }}</span>
                        </button>
                      }
                    }
                    @if (contactHits().length) {
                      <p class="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Cariler</p>
                      @for (c of contactHits(); track c.id) {
                        <button class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-slate-50" (click)="goContact(c)">
                          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><lucide-icon name="users" class="h-4 w-4"></lucide-icon></span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ c.name }}</span>
                            <span class="block text-xs text-slate-400">{{ c.phone || (c.type === 'Customer' ? 'Müşteri' : 'Tedarikçi') }}</span>
                          </span>
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Bu sayfa nasıl çalışır? (yardım bandını yeniden açar) -->
          @if (pageHelp.active()) {
            <button class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-600"
                    (click)="pageHelp.reopen()" title="Bu sayfa nasıl çalışır?">
              <lucide-icon name="circle-help" class="h-5 w-5"></lucide-icon>
            </button>
          }

          <!-- Bildirimler: kritik stok + açık adisyonlar + yaklaşan randevular -->
          <div class="relative" (click)="$event.stopPropagation()">
            <button class="relative rounded-lg p-2 hover:bg-slate-100"
              [class]="bellUrgent() ? 'text-rose-600' : bellCount() > 0 ? 'text-amber-500' : 'text-slate-500'"
              (click)="toggleBell()" title="Bildirimler">
              <lucide-icon name="bell" class="h-5 w-5"></lucide-icon>
              @if (bellCount() > 0) {
                <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2 ring-white"
                      [class]="bellUrgent() ? 'bg-rose-500' : 'bg-amber-500'">{{ bellCount() > 9 ? '9+' : bellCount() }}</span>
              }
            </button>
            @if (bellOpen()) {
              <div class="absolute right-0 top-full z-50 mt-2 w-80 max-w-[85vw] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><lucide-icon name="bell" class="h-4 w-4 text-brand-600"></lucide-icon> Bildirimler</p>
                  <div class="flex items-center gap-2">
                    @if (notifItems().length) {
                      <button class="text-xs font-medium text-slate-400 hover:text-brand-600" (click)="markAllNotifRead($event)">Tümünü okundu</button>
                    }
                    @if (bellCount() > 0) {
                      <span class="rounded-full px-2 py-0.5 text-xs font-bold" [class]="bellUrgent() ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'">{{ bellCount() }}</span>
                    }
                  </div>
                </div>
                <app-push-toggle />
                @if (bellCount() === 0) {
                  <p class="p-6 text-center text-sm text-slate-400">Her şey yolunda 🎉</p>
                } @else {
                  <div class="max-h-96 overflow-y-auto py-1">
                    @if (notifItems().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-slate-500">Bildirimler</p>
                      @for (n of notifItems(); track n.id) {
                        <button class="flex w-full items-start gap-3 px-4 py-2 text-left hover:bg-slate-50"
                                [class.bg-slate-50]="!n.isRead" (click)="openNotif(n)">
                          <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                                [class]="n.isRead ? 'bg-transparent' : (n.severity === 'critical' ? 'bg-rose-500' : n.severity === 'warning' ? 'bg-amber-500' : 'bg-brand-500')"></span>
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ n.title }}</span>
                            <span class="block text-xs text-slate-400">{{ n.message }}</span>
                          </span>
                        </button>
                      }
                    }
                    @if (lowStock().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-rose-500">Kritik Stok</p>
                      @for (p of lowStock(); track p.id) {
                        <button class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50" (click)="goLowProduct(p)">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ p.name }}</span>
                            <span class="block text-xs font-medium" [class]="p.currentStock <= 0 ? 'text-rose-600' : 'text-amber-600'">
                              {{ p.currentStock <= 0 ? 'Tükendi' : 'Kalan: ' + p.currentStock + ' ' + p.unit }} · min {{ p.minStock }}
                            </span>
                          </span>
                          <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-slate-300"></lucide-icon>
                        </button>
                      }
                    }
                    @if (staleOrders().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-amber-600">Bekleyen Açık Hesap</p>
                      @for (o of staleOrders(); track o.id) {
                        <a [routerLink]="['/adisyon', o.id]" (click)="bellOpen.set(false)"
                           class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ o.tableName || o.label || 'Adisyon' }}</span>
                            <span class="block text-xs font-medium text-amber-600">{{ openFor(o) }} açık · {{ money(o.grandTotal) }}</span>
                          </span>
                          <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-slate-300"></lucide-icon>
                        </a>
                      }
                    }
                    @if (upcomingAppts().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-brand-600">Yaklaşan Randevu</p>
                      @for (a of upcomingAppts(); track a.id) {
                        <a routerLink="/randevular" (click)="bellOpen.set(false)"
                           class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ apptTime(a) }} · {{ a.customerName }}</span>
                            @if (a.serviceName) { <span class="block truncate text-xs text-slate-400">{{ a.serviceName }}</span> }
                          </span>
                          <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-slate-300"></lucide-icon>
                        </a>
                      }
                    }
                    @if (marketplaceOrders().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-fuchsia-600">Yeni Pazaryeri Siparişi</p>
                      @for (o of marketplaceOrders(); track o.id) {
                        <a routerLink="/pazaryeri-siparisleri" (click)="bellOpen.set(false)"
                           class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ o.channel }} · {{ o.marketplaceOrderNumber }}</span>
                            <span class="block text-xs font-medium"
                                  [class]="o.syncStatus === 'Imported' ? 'text-slate-400' : 'text-rose-600'">
                              @if (o.syncStatus === 'NeedsMapping') { Eşleşme gerekiyor · }
                              @else if (o.syncStatus === 'Error') { Hata · }
                              {{ money(o.grandTotal) }}
                            </span>
                          </span>
                          <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-slate-300"></lucide-icon>
                        </a>
                      }
                    }
                    @if (stockRiskShown().length) {
                      <p class="px-4 pb-1 pt-2 text-xs font-bold uppercase text-amber-600">Tükenme Riski</p>
                      @for (r of stockRiskShown(); track r.productId) {
                        <a routerLink="/siparis-onerisi" (click)="bellOpen.set(false)"
                           class="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-slate-50">
                          <span class="min-w-0 flex-1">
                            <span class="block truncate text-sm font-medium text-slate-800">{{ r.productName }}</span>
                            <span class="block text-xs font-medium text-amber-600">
                              ~{{ r.daysUntilStockout }} gün içinde tükenir · öneri {{ r.suggestedReorderQty }} {{ r.unit }}
                            </span>
                          </span>
                          <lucide-icon name="chevron-right" class="h-4 w-4 shrink-0 text-slate-300"></lucide-icon>
                        </a>
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>
          @if (user()?.status === 'Trial') {
            <span class="badge-amber">Deneme</span>
          } @else {
            <span class="badge-blue">{{ user()?.plan }}</span>
          }
        </header>

        @if (trialBanner(); as b) {
          <div class="flex items-center gap-3 px-4 py-2.5 text-sm lg:px-8"
               [class]="b.urgent ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'">
            <lucide-icon name="triangle-alert" class="h-4 w-4 shrink-0"></lucide-icon>
            <span class="flex-1">{{ b.text }}</span>
            <a routerLink="/yukselt" class="shrink-0 rounded-lg px-3 py-1 text-xs font-bold"
               [class]="b.urgent ? 'bg-white text-rose-600' : 'bg-amber-600 text-white'">Paketi Yükselt</a>
          </div>
        }

        <main class="flex-1 px-4 py-6 lg:px-8">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>

    <!-- PIN ile personel değiştirme -->
    @if (pinOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" (click)="closePin()">
        <div class="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl" (click)="$event.stopPropagation()">
          <div class="mb-4 text-center">
            <div class="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <lucide-icon name="key-round" class="h-6 w-6"></lucide-icon>
            </div>
            <h2 class="font-bold text-slate-800">Personel Değiştir</h2>
            <p class="text-xs text-slate-500">PIN'inizi girin</p>
          </div>
          <input
            #pinInput
            class="input mb-3 text-center text-2xl tracking-[0.5em]"
            type="password"
            inputmode="numeric"
            maxlength="6"
            autocomplete="off"
            [value]="pin()"
            (input)="pin.set($any($event.target).value)"
            (keyup.enter)="submitPin()"
            placeholder="••••"
          />
          <button class="btn-primary w-full justify-center" [disabled]="pinBusy() || !pin()" (click)="submitPin()">
            Giriş Yap
          </button>
          <button class="btn-ghost mt-2 w-full justify-center" (click)="closePin()">Vazgeç</button>
        </div>
      </div>
    }

    <!-- Randevu saati yaklaşınca/gelince uyarı modalı (yalnızca kuaför/güzellik) -->
    <app-appointment-reminder />
    <app-qr-order-alert />
  `,
})
export class LayoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private stockApi = inject(StockApi);
  private contactsApi = inject(ContactsApi);
  private ordersApi = inject(OrdersApi);
  private apptsApi = inject(AppointmentsApi);
  private marketplaceApi = inject(MarketplaceApi);
  private notifsApi = inject(NotificationsApi);
  private destroyRef = inject(DestroyRef);
  protected branchStore = inject(BranchStore);
  protected pageHelp = inject(PageHelpService);
  protected user = this.auth.user;

  /** Kullanıcının erişebildiği şubeler (boş = kısıtsız). Sunucu da bunu zorlar; UI yalnız hizalanır. */
  private allowedBranchIds = computed(() => this.auth.user()?.branchIds ?? []);
  /** Kısıtlı kullanıcı yalnız kendi şubelerini görür. */
  protected visibleBranches = computed(() => {
    const allowed = this.allowedBranchIds();
    const all = this.branchStore.branches();
    return allowed.length ? all.filter((b) => allowed.includes(b.id)) : all;
  });
  /** "Tüm şubeler (birleşik)" yalnız kısıtsız kullanıcıya sunulur (kısıtlı zaten göremez). */
  protected canSeeAllBranches = computed(() => this.allowedBranchIds().length === 0);
  protected branchLabel = computed(() =>
    this.branchStore.current()?.name
      ?? (this.canSeeAllBranches() ? 'Tüm şubeler' : (this.visibleBranches()[0]?.name ?? 'Şube')));
  protected profile = this.auth.profile;
  protected mobileOpen = signal(false);
  protected money = money;

  // Global arama (ürün + cari)
  protected searchQ = signal('');
  protected searchOpen = signal(false);
  protected searching = signal(false);
  protected productHits = signal<ProductDto[]>([]);
  protected contactHits = signal<ContactDto[]>([]);
  private searchTimer?: ReturnType<typeof setTimeout>;

  // Bildirimler: kritik stok + 2+ saattir açık adisyonlar + bugünkü yaklaşan randevular
  protected bellOpen = signal(false);
  protected lowStock = signal<ProductDto[]>([]);
  protected criticalCount = computed(() => this.lowStock().length);
  protected staleOrders = signal<OrderListItemDto[]>([]);
  protected upcomingAppts = signal<AppointmentDto[]>([]);
  protected marketplaceOrders = signal<MarketplaceOrderDto[]>([]);
  /** Tükenme riski (satış hızına göre yakında bitecek ürünler). */
  protected stockRisk = signal<ReplenishmentItemDto[]>([]);
  /** Çanda gösterilecek: zaten kritik stok listesinde olanları ele (çift satır olmasın), ilk 5. */
  protected stockRiskShown = computed(() => {
    const low = new Set(this.lowStock().map((p) => p.id));
    return this.stockRisk().filter((r) => !low.has(r.productId)).slice(0, 5);
  });
  /** Kalıcı bildirim merkezi (zil): düşük stok/geciken alacak/anomali vb. — okundu/dismiss takipli. */
  protected notifItems = signal<NotificationDto[]>([]);
  private notifUnread = signal(0);
  protected bellCount = computed(
    () => this.criticalCount() + this.staleOrders().length + this.upcomingAppts().length
      + this.marketplaceOrders().length + this.stockRiskShown().length + this.notifUnread()
  );
  /** Acil (kırmızı) durum: kritik stok, unutulmuş açık adisyon, bekleyen pazaryeri siparişi veya kritik bildirim.
   * Tükenme riski uyarıdır (henüz bitmedi) → acil değil, amber kalır. */
  protected bellUrgent = computed(
    () => this.criticalCount() > 0 || this.staleOrders().length > 0 || this.marketplaceOrders().length > 0
      || this.notifItems().some((n) => !n.isRead && n.severity === 'critical')
  );

  // Çok şube
  protected branchOpen = signal(false);

  constructor() {
    this.refreshBell();
    this.branchStore.load();
    // Her sayfa geçişinde bildirimleri tazele + açık menüleri kapat.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => {
        this.refreshBell();
        this.closeAll();
      });
    // Hafif polling: kullanıcı gezinmese de yeni pazaryeri siparişi 60 sn içinde çanda belirir.
    const poll = setInterval(() => this.refreshBell(), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(poll));
  }

  /** Dropdown'ları dış tıkla kapat (container'larda stopPropagation var). */
  @HostListener('document:click')
  protected closeAll(): void {
    this.searchOpen.set(false);
    this.bellOpen.set(false);
    this.branchOpen.set(false);
    this.bizOpen.set(false);
  }

  protected pickBranch(id: string | null): void {
    this.branchStore.setCurrent(id);
    this.branchOpen.set(false);
    // Şube değişince açık ekranı tazelemek için mevcut rotayı yeniden yükle.
    const url = this.router.url;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigateByUrl(url));
  }

  private refreshLowStock(): void {
    this.stockApi.getLowStock().subscribe({
      next: (p) => this.lowStock.set(p ?? []),
      error: () => {},
    });
  }

  /** Zildeki tüm bildirim kaynaklarını tazeler (sektöre göre yalnızca ilgili olanlar). */
  private refreshBell(): void {
    this.refreshLowStock();
    // Kalıcı bildirim merkezi (tüm sektörler + roller).
    this.notifsApi.list(false, 20).subscribe({
      next: (r) => { this.notifItems.set(r?.items ?? []); this.notifUnread.set(r?.unreadCount ?? 0); },
      error: () => {},
    });
    const f = this.profile().features;

    if (f.adisyon || f.services) {
      this.ordersApi.getOpen().subscribe({
        next: (list) => {
          const cutoff = Date.now() - 2 * 3600_000; // 2 saatten eski açık hesaplar
          this.staleOrders.set((list ?? []).filter((o) => new Date(o.openedAt).getTime() < cutoff));
        },
        error: () => {},
      });
    } else {
      this.staleOrders.set([]);
    }

    if (f.appointments) {
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      this.apptsApi.getRange(`${day}T00:00:00`, `${day}T23:59:59`).subscribe({
        next: (list) =>
          this.upcomingAppts.set(
            (list ?? [])
              .filter((a) => a.status === 'Scheduled' && wallClock(a.startsAt).getTime() >= Date.now())
              .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
              .slice(0, 5)
          ),
        error: () => {},
      });
    } else {
      this.upcomingAppts.set([]);
    }

    // Pazaryeri siparişleri: yalnız Kurumsal (entitlement). Endpoint kilitli değilse boş döner.
    if (this.user()?.entitlements?.marketplaceIntegration) {
      this.marketplaceApi.getPending().subscribe({
        next: (list) => this.marketplaceOrders.set((list ?? []).slice(0, 5)),
        error: () => {},
      });
    } else {
      this.marketplaceOrders.set([]);
    }

    // Tükenme riski: stok tutan sektör + akıllı sipariş önerisi yetkisi (Zincir) varsa çek
    // (yetkisiz planda 403 → error interceptor'ın /yukselt yönlendirmesini önlemek için gate şart).
    if (f.stockTracking && (this.user()?.entitlements?.smartReplenishment ?? false)) {
      this.stockApi.getReplenishment({ horizonDays: 7 }).subscribe({
        next: (list) => this.stockRisk.set(list ?? []),
        error: () => {},
      });
    } else {
      this.stockRisk.set([]);
    }
  }

  /** Açık adisyonun ne kadar süredir beklediğini kısa metinle verir (ör. "3s 20dk"). */
  protected openFor(o: OrderListItemDto): string {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(o.openedAt).getTime()) / 60000));
    const h = Math.floor(mins / 60);
    return h > 0 ? `${h}s ${mins % 60}dk` : `${mins}dk`;
  }

  /** Randevu saatini SS:dd biçiminde verir (girilen yerel duvar-saati). */
  protected apptTime(a: AppointmentDto): string {
    const d = wallClock(a.startsAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  protected onSearchInput(v: string): void {
    this.searchQ.set(v);
    clearTimeout(this.searchTimer);
    const q = v.trim();
    if (q.length < 2) {
      this.searchOpen.set(false);
      this.productHits.set([]);
      this.contactHits.set([]);
      return;
    }
    this.searchOpen.set(true);
    this.searching.set(true);
    this.searchTimer = setTimeout(() => this.runSearch(q), 300);
  }

  private runSearch(q: string): void {
    forkJoin({
      products: this.stockApi.getProducts({ search: q, pageSize: 6 }),
      contacts: this.contactsApi.getContacts({ search: q, pageSize: 5 }),
    }).subscribe({
      next: (r) => {
        this.productHits.set(r.products.items);
        this.contactHits.set(r.contacts.items);
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  protected goProduct(p: ProductDto): void {
    this.router.navigate(['/stok/urunler'], { queryParams: { q: p.name } });
    this.closeSearch();
  }
  protected goContact(c: ContactDto): void {
    this.router.navigate(['/cariler'], { queryParams: { q: c.name } });
    this.closeSearch();
  }
  protected submitSearch(): void {
    const q = this.searchQ().trim();
    if (!q) return;
    this.router.navigate(['/stok/urunler'], { queryParams: { q } });
    this.closeSearch();
  }
  protected closeSearch(): void {
    this.searchOpen.set(false);
    this.searchQ.set('');
    this.productHits.set([]);
    this.contactHits.set([]);
  }

  protected toggleBell(): void {
    const open = !this.bellOpen();
    this.bellOpen.set(open);
    if (open) this.refreshBell();
    this.searchOpen.set(false);
  }
  protected goLowProduct(p: ProductDto): void {
    this.router.navigate(['/stok/urunler'], { queryParams: { q: p.name } });
    this.bellOpen.set(false);
  }

  /** Kalıcı bildirime tıkla: okundu işaretle + (varsa) bağlantısına git. */
  protected openNotif(n: NotificationDto): void {
    if (!n.isRead) {
      this.notifsApi.markRead(n.id).subscribe({ next: () => {}, error: () => {} });
      this.notifItems.update((list) => list.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      this.notifUnread.update((c) => Math.max(0, c - 1));
    }
    if (n.link) {
      this.router.navigateByUrl(n.link);
      this.bellOpen.set(false);
    }
  }

  /** Tüm kalıcı bildirimleri okundu işaretle. */
  protected markAllNotifRead(ev: Event): void {
    ev.stopPropagation();
    this.notifsApi.markAllRead().subscribe({ next: () => {}, error: () => {} });
    this.notifItems.update((list) => list.map((x) => ({ ...x, isRead: true })));
    this.notifUnread.set(0);
  }

  protected pinOpen = signal(false);
  protected pin = signal('');
  protected pinBusy = signal(false);

  // ---- Çok-şirket (#47): işletme değiştirici ----
  protected bizOpen = signal(false);
  protected roleLabels = ROLE_LABELS;

  /** Aktif işletmeyi değiştir: yeni token+cookie al, şube seçimini temizle, tam yeniden yükle (temiz durum). */
  protected switchBusiness(c: CompanyDto): void {
    this.bizOpen.set(false);
    if (c.tenantId === this.user()?.tenantId) return;
    this.auth.switchTenant(c.tenantId).subscribe({
      next: () => { localStorage.removeItem('cpg_branch'); window.location.assign('/'); },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  /** Mevcut hesaba yeni işletme ekle (adı sorulur; sektör sonra Ayarlar'dan değişebilir), ona geç. */
  protected openNewBusiness(): void {
    this.bizOpen.set(false);
    const name = prompt('Yeni işletme adı:');
    if (!name || !name.trim()) return;
    this.auth.createBusiness(name.trim(), 'General').subscribe({
      next: () => { localStorage.removeItem('cpg_branch'); window.location.assign('/'); },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected roleLabel = computed(() => {
    const r = this.user()?.role;
    return r ? ROLE_LABELS[r] : '';
  });

  /** Role göre süzülmüş nav; Sahip/Yönetici için "Personel" öğesi eklenir. */
  protected navItems = computed(() => {
    const role = this.user()?.role;
    let items = filterNav(this.profile().nav, role);
    // Pazaryeri öğeleri yalnız Kurumsal pakette görünür (entitlement kilidi).
    if (!this.user()?.entitlements?.marketplaceIntegration) {
      items = items.filter((n) => n.path !== '/pazaryeri' && n.path !== '/pazaryeri-siparisleri');
    }
    // Akıllı sipariş önerisi yalnız Zincir pakette (entitlement kilidi).
    if (!this.user()?.entitlements?.smartReplenishment) {
      items = items.filter((n) => n.path !== '/siparis-onerisi');
    }
    // AI Asistan yalnız Zincir pakette VE finansal rollerde (Owner/Admin/Accountant) — geri-ofis verisi döndürür.
    const financeRole = role === 'Owner' || role === 'Admin' || role === 'Accountant';
    if (!this.user()?.entitlements?.aiAssistant || !financeRole) {
      items = items.filter((n) => n.path !== '/ai-asistan');
    }
    // Frontend pass — hazır backend özelliklerinin geri-ofis ekranları. Ayarlar'dan önce eklenir; rol bazlı süzülür.
    const isAdmin = role === 'Owner' || role === 'Admin';
    const ent = this.user()?.entitlements;
    const backOffice: NavItem[] = [];
    if (financeRole) {
      // Analitik = gelişmiş rapor/analitik → yalnız Kurumsal + Zincir.
      if (ent?.advancedReports) backOffice.push({ label: 'Analitik', path: '/analitik', icon: 'line-chart', group: 'rapor' });
      backOffice.push({ label: 'Çek / Senet', path: '/cek-senet', icon: 'banknote', group: 'finans' });
      // Hediye çekleri = pazarlama aracı → yalnız Kurumsal + Zincir.
      if (ent?.marketingTools) backOffice.push({ label: 'Hediye Çekleri', path: '/hediye-cekleri', icon: 'gift', group: 'pazarlama' });
      backOffice.push({ label: 'Referans Programı', path: '/referanslar', icon: 'user-plus', group: 'pazarlama' });
    }
    backOffice.push({ label: 'Garanti Kayıtları', path: '/garanti-kayitlari', icon: 'shield-check', group: 'pazarlama' });
    // Kampanyalar + otomasyon = pazarlama araçları → yalnız Kurumsal + Zincir (ve admin rol).
    if (isAdmin && ent?.marketingTools) {
      backOffice.push(
        { label: 'Kampanyalar', path: '/kampanyalar', icon: 'megaphone', group: 'pazarlama' },
        { label: 'Otomasyon', path: '/otomasyon', icon: 'workflow', group: 'pazarlama' },
      );
    }
    if (backOffice.length) {
      const idx = items.findIndex((n) => n.path === '/ayarlar');
      if (idx >= 0) items.splice(idx, 0, ...backOffice);
      else items.push(...backOffice);
    }
    if (canManageStaff(role)) {
      const extra: NavItem[] = [
        { label: 'Personel', path: '/ayarlar/personel', icon: 'user-cog', group: 'ayarlar' },
        { label: 'Şubeler', path: '/ayarlar/subeler', icon: 'building-2', group: 'ayarlar' },
        { label: 'Güvenlik & Yedek', path: '/ayarlar/guvenlik', icon: 'shield', group: 'ayarlar' },
      ];
      const idx = items.findIndex((n) => n.path === '/ayarlar');
      if (idx >= 0) items.splice(idx, 0, ...extra);
      else items.push(...extra);
    }
    return items;
  });

  /**
   * Menüyü başlıklı gruplara böler. Grup SIRASI sabittir (NAV_GROUP_ORDER — işin akışı: satış → stok →
   * finans → … → yönetim); grup İÇİ sıra sektör profilinin kendi diziliminden gelir, yani profiller
   * değişmeden düzen korunur. Grupsuz öğeler (Panel) başlıksız olarak en üstte çıkar. Boş gruplar
   * (rol/paket kilidi yüzünden öğesi kalmayanlar) hiç çizilmez.
   */
  protected navSections = computed(() => {
    const items = this.navItems();
    const loose = items.filter((n) => !n.group);
    const sections = NAV_GROUP_ORDER
      .map((g) => ({ label: g.label, items: items.filter((n) => n.group === g.key) }))
      .filter((s) => s.items.length > 0);
    // Tek öğelik menülerde (dar sektör profili) başlık göstermek gürültü olur → düz liste.
    const grouped = sections.reduce((sum, s) => sum + s.items.length, 0);
    if (grouped <= 3) return [{ label: '', items }];
    return [{ label: '', items: loose }, ...sections];
  });

  /** Deneme/askı durumunda üst uyarı bandı (yükseltme çağrısı). */
  protected trialBanner = computed(() => {
    const u = this.user();
    if (!u || u.status === 'Active') return null;
    if (u.status === 'Suspended' || u.status === 'Cancelled')
      return { text: 'Hesabınız askıya alındı. Devam etmek için paketinizi yükseltin.', urgent: true };
    if (u.status === 'Trial') {
      const end = u.trialEndsAt ? new Date(u.trialEndsAt) : null;
      if (!end) return null;
      const days = Math.ceil((end.getTime() - Date.now()) / 86400000);
      if (days <= 0) return { text: 'Deneme süreniz doldu. Devam etmek için paketinizi yükseltin.', urgent: true };
      if (days <= 5) return { text: `Deneme süreniz bitiyor — ${days} gün kaldı.`, urgent: false };
    }
    return null;
  });

  protected initials = computed(() => {
    const name = this.user()?.fullName ?? '';
    return name
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  protected closePin(): void {
    this.pinOpen.set(false);
    this.pin.set('');
  }

  protected submitPin(): void {
    const pin = this.pin().trim();
    if (!pin || this.pinBusy()) return;
    this.pinBusy.set(true);
    this.auth.pinLogin(pin).subscribe({
      next: () => {
        this.pinBusy.set(false);
        this.pinOpen.set(false);
        this.pin.set('');
        this.toast.success('Hoş geldiniz, ' + (this.user()?.fullName ?? ''));
        this.router.navigateByUrl(this.profile().defaultRoute);
      },
      error: () => {
        this.pinBusy.set(false);
        this.toast.error('PIN hatalı.');
      },
    });
  }

  protected logout(): void {
    this.branchStore.clear();
    this.auth.logout();
  }
}
