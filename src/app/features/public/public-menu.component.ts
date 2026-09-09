import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MenuApi } from '../../core/api/menu.api';
import { MenuDto, MenuItemDto } from '../../core/models';
import { money } from '../../core/utils';

@Component({
  selector: 'app-public-menu',
  template: `
    <div class="min-h-screen bg-slate-50 pb-28">
      @if (loading()) {
        <div class="p-10 text-center text-sm text-slate-400">Menü yükleniyor...</div>
      } @else if (error()) {
        <div class="p-10 text-center text-sm text-rose-600">{{ error() }}</div>
      } @else if (menu(); as m) {
        <!-- Başlık -->
        <header class="bg-gradient-to-br from-slate-900 to-brand-950 px-5 py-8 text-center text-white">
          @if (m.logoUrl) {
            <img [src]="m.logoUrl" class="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover" alt="" />
          }
          <h1 class="text-2xl font-extrabold">{{ m.companyName }}</h1>
          @if (canOrder()) {
            <p class="mt-1 text-sm text-slate-300">Masa siparişi</p>
          } @else {
            <p class="mt-1 text-sm text-slate-300">Dijital Menü</p>
          }
        </header>

        <!-- Masa QR'ı okutuldu ama işletme masadan sipariş almıyor (Profesyonel paket): kibar not -->
        @if (tableId() && !canOrder()) {
          <div class="mx-auto mt-3 max-w-2xl px-4">
            <div class="rounded-xl bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800">
              Siparişiniz için lütfen garsonu çağırın.
            </div>
          </div>
        }

        <main class="mx-auto max-w-2xl px-4 py-5">
          @for (cat of m.categories; track cat.name) {
            <section class="mb-6">
              <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">{{ cat.name }}</h2>
              <div class="space-y-2">
                @for (it of cat.items; track it.id) {
                  <div class="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
                    @if (it.imageUrl) {
                      <img [src]="it.imageUrl" class="h-16 w-16 shrink-0 rounded-xl object-cover" alt="" />
                    }
                    <div class="min-w-0 flex-1">
                      <p class="font-semibold text-slate-800">{{ it.name }}</p>
                      @if (it.description) { <p class="line-clamp-2 text-xs text-slate-400">{{ it.description }}</p> }
                      <p class="mt-0.5 font-bold text-brand-600">{{ money(it.salePrice) }}</p>
                    </div>
                    @if (canOrder()) {
                      <div class="flex items-center gap-1">
                        @if (qty(it.id) > 0) {
                          <button class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-600" (click)="dec(it)">−</button>
                          <span class="w-6 text-center text-sm font-semibold">{{ qty(it.id) }}</span>
                        }
                        <button class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-lg text-white" (click)="inc(it)">+</button>
                      </div>
                    }
                  </div>
                }
              </div>
            </section>
          } @empty {
            <p class="p-10 text-center text-sm text-slate-400">Menüde henüz ürün yok.</p>
          }
        </main>

        <!-- Sipariş çubuğu (yalnızca masa siparişinde) -->
        @if (canOrder() && cartCount() > 0 && !done()) {
          <div class="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4 shadow-lg">
            <div class="mx-auto flex max-w-2xl items-center gap-3">
              <div class="flex-1">
                <p class="text-xs text-slate-400">{{ cartCount() }} ürün</p>
                <p class="text-lg font-bold text-slate-800">{{ money(cartTotal()) }}</p>
              </div>
              <button class="rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white disabled:opacity-50" [disabled]="submitting()" (click)="submit()">
                {{ submitting() ? 'Gönderiliyor...' : 'Siparişi Gönder' }}
              </button>
            </div>
          </div>
        }

        <!-- Başarı -->
        @if (done()) {
          <div class="fixed inset-0 z-50 flex items-center justify-center bg-white/95 p-6 text-center">
            <div>
              <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">✓</div>
              <h2 class="text-xl font-bold text-slate-800">Siparişiniz alındı!</h2>
              <p class="mt-2 text-sm text-slate-500">Garson siparişinizi en kısa sürede hazırlayacak.</p>
              <button class="btn-outline mt-6" (click)="done.set(false)">Menüye Dön</button>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class PublicMenuComponent implements OnInit {
  private api = inject(MenuApi);
  private route = inject(ActivatedRoute);

  protected money = money;

  protected loading = signal(true);
  protected submitting = signal(false);
  protected done = signal(false);
  protected error = signal('');
  protected menu = signal<MenuDto | null>(null);
  protected slug = signal('');
  protected tableId = signal<string | null>(null);
  protected cart = signal<Record<string, number>>({});

  // Sipariş verme: masa QR'ı (tableId) olmalı VE işletmenin planı masadan siparişe izin vermeli
  // (yalnız Kurumsal). Profesyonel/Deneme'de menü yalnızca görüntülenir.
  protected canOrder = computed(() => !!this.tableId() && (this.menu()?.orderingEnabled ?? false));
  protected cartCount = computed(() => Object.values(this.cart()).reduce((a, b) => a + b, 0));

  private itemPrice = new Map<string, number>();
  protected cartTotal = computed(() =>
    Object.entries(this.cart()).reduce((sum, [id, q]) => sum + (this.itemPrice.get(id) ?? 0) * q, 0)
  );

  ngOnInit(): void {
    this.slug.set(this.route.snapshot.paramMap.get('slug') ?? '');
    this.tableId.set(this.route.snapshot.paramMap.get('tableId'));
    this.api.getMenu(this.slug()).subscribe({
      next: (m) => {
        this.menu.set(m);
        for (const c of m.categories) for (const it of c.items) this.itemPrice.set(it.id, it.salePrice);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Menü bulunamadı.');
        this.loading.set(false);
      },
    });
  }

  protected qty(id: string): number {
    return this.cart()[id] ?? 0;
  }
  protected inc(it: MenuItemDto): void {
    this.cart.update((c) => ({ ...c, [it.id]: (c[it.id] ?? 0) + 1 }));
  }
  protected dec(it: MenuItemDto): void {
    this.cart.update((c) => {
      const next = { ...c };
      const v = (next[it.id] ?? 0) - 1;
      if (v <= 0) delete next[it.id];
      else next[it.id] = v;
      return next;
    });
  }

  protected submit(): void {
    const items = Object.entries(this.cart()).map(([productId, quantity]) => ({ productId, quantity }));
    if (!items.length) return;
    this.submitting.set(true);
    this.api
      .placeOrder(this.slug(), { type: 'DineIn', tableId: this.tableId(), items })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.cart.set({});
          this.done.set(true);
        },
        error: () => {
          this.submitting.set(false);
          this.error.set('Sipariş gönderilemedi, lütfen tekrar deneyin.');
        },
      });
  }
}
