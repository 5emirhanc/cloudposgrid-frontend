import { Routes } from '@angular/router';
import { authGuard, guestGuard, adminAuthGuard, adminGuestGuard, dealerAuthGuard, dealerGuestGuard, roleGuard, sectorGuard, entitlementGuard } from './core/auth.guard';

const FINANCE_ROLES = roleGuard(['Owner', 'Admin', 'Accountant']);
const ADMIN_ROLES = roleGuard(['Owner', 'Admin']);

export const routes: Routes = [
  {
    path: 'giris',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'kayit',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'sifremi-unuttum',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  // Tek tıkla demo: tanıtım sitesinden gelen ziyaretçiye örnek verili sandbox işletme açar
  {
    path: 'demo',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/demo-entry.component').then((m) => m.DemoEntryComponent),
  },
  // Public QR menü (kimlik doğrulaması yok, auth layout dışında)
  {
    path: 'menu/:slug',
    loadComponent: () => import('./features/public/public-menu.component').then((m) => m.PublicMenuComponent),
  },
  {
    path: 'menu/:slug/masa/:tableId',
    loadComponent: () => import('./features/public/public-menu.component').then((m) => m.PublicMenuComponent),
  },
  // Fiş yazdırma (tam sayfa, layout dışında)
  {
    path: 'fis/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/orders/receipt.component').then((m) => m.ReceiptComponent),
  },
  // Barkod etiketi yazdırma (tam sayfa, layout dışında)
  {
    path: 'etiket',
    canActivate: [authGuard],
    loadComponent: () => import('./features/stock/label-print.component').then((m) => m.LabelPrintComponent),
  },
  // Ayrı platform yönetim paneli (tenant layout DIŞINDA, kendi girişiyle)
  {
    path: 'yonetim/giris',
    canActivate: [adminGuestGuard],
    loadComponent: () => import('./features/admin/admin-login.component').then((m) => m.AdminLoginComponent),
  },
  {
    path: 'yonetim',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./features/admin/admin.component').then((m) => m.AdminComponent),
  },
  {
    // Süper-admin bayi (#25) yönetimi — admin oturumuyla.
    path: 'yonetim/bayiler',
    canActivate: [adminAuthGuard],
    loadComponent: () => import('./features/admin/dealers-admin.component').then((m) => m.DealersAdminComponent),
  },
  {
    // Bayi (#25) yeniden-satıcı paneli — kendi ayrı oturumu.
    path: 'bayi/giris',
    canActivate: [dealerGuestGuard],
    loadComponent: () => import('./features/dealer/dealer-login.component').then((m) => m.DealerLoginComponent),
  },
  {
    path: 'bayi',
    canActivate: [dealerAuthGuard],
    loadComponent: () => import('./features/dealer/dealer-panel.component').then((m) => m.DealerPanelComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'hizli-satis', canActivate: [sectorGuard((p) => p.type !== 'Beauty')], loadComponent: () => import('./features/pos/quick-sale.component').then((m) => m.QuickSaleComponent) },
      { path: 'masalar', canActivate: [sectorGuard((p) => p.features.tables)], loadComponent: () => import('./features/orders/tables.component').then((m) => m.TablesComponent) },
      { path: 'is-emirleri', canActivate: [sectorGuard((p) => p.type === 'Service')], loadComponent: () => import('./features/orders/work-orders.component').then((m) => m.WorkOrdersComponent) },
      { path: 'randevular', canActivate: [sectorGuard((p) => p.features.appointments)], loadComponent: () => import('./features/appointments/appointments.component').then((m) => m.AppointmentsComponent) },
      { path: 'adisyon/:id', loadComponent: () => import('./features/orders/order-detail.component').then((m) => m.OrderDetailComponent) },
      { path: 'stok/urunler', loadComponent: () => import('./features/stock/products.component').then((m) => m.ProductsComponent) },
      { path: 'stok/kategoriler', canActivate: [sectorGuard((p) => p.type !== 'Beauty')], loadComponent: () => import('./features/stock/categories.component').then((m) => m.CategoriesComponent) },
      { path: 'stok/hareketler', loadComponent: () => import('./features/stock/movements.component').then((m) => m.MovementsComponent) },
      { path: 'stok/sayim', canActivate: [sectorGuard((p) => p.productFields.stock)], loadComponent: () => import('./features/stock/stock-count.component').then((m) => m.StockCountComponent) },
      // Akıllı sipariş önerisi yalnız Zincir pakette (nav gizlemesiyle tutarlı; backend ayrıca 403 döner).
      // NOT: eski sectorGuard(p.features.stockTracking) ÖLÜ predikattı — stockTracking tüm sektörlerde true.
      { path: 'siparis-onerisi', canActivate: [entitlementGuard((e) => e?.smartReplenishment ?? false)], loadComponent: () => import('./features/replenishment/replenishment.component').then((m) => m.ReplenishmentComponent) },
      // AI Asistan geri-ofis finansal veri döndürür → Reports ile aynı rollerle (Owner/Admin/Accountant) + Zincir kilidi.
      { path: 'ai-asistan', canActivate: [FINANCE_ROLES, entitlementGuard((e) => e?.aiAssistant ?? false)], loadComponent: () => import('./features/ai-assistant/ai-assistant.component').then((m) => m.AiAssistantComponent) },
      { path: 'cariler', loadComponent: () => import('./features/contacts/contacts.component').then((m) => m.ContactsComponent) },
      { path: 'kasa', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/finance/finance.component').then((m) => m.FinanceComponent) },
      { path: 'faturalar', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/invoices/invoices.component').then((m) => m.InvoicesComponent) },
      { path: 'faturalar/yeni', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/invoices/invoice-form.component').then((m) => m.InvoiceFormComponent) },
      { path: 'teklifler', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/quotes/quotes.component').then((m) => m.QuotesComponent) },
      { path: 'tedarikci-siparisleri', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/purchasing/purchase-orders.component').then((m) => m.PurchaseOrdersComponent) },
      { path: 'faturalar/:id', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/invoices/invoice-detail.component').then((m) => m.InvoiceDetailComponent) },
      { path: 'raporlar', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/reports/reports.component').then((m) => m.ReportsComponent) },
      { path: 'pazaryeri', canActivate: [ADMIN_ROLES], loadComponent: () => import('./features/marketplace/marketplace.component').then((m) => m.MarketplaceComponent) },
      { path: 'pazaryeri-siparisleri', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/marketplace/marketplace-orders.component').then((m) => m.MarketplaceOrdersComponent) },
      // ---- Frontend pass: hazır backend özelliklerinin UI ekranları ----
      { path: 'analitik', canActivate: [FINANCE_ROLES, entitlementGuard((e) => e?.advancedReports ?? false)], loadComponent: () => import('./features/analytics/analytics.component').then((m) => m.AnalyticsComponent) },
      { path: 'cek-senet', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/cheques/cheques.component').then((m) => m.ChequesComponent) },
      { path: 'hediye-cekleri', canActivate: [FINANCE_ROLES, entitlementGuard((e) => e?.marketingTools ?? false)], loadComponent: () => import('./features/gift-cards/gift-cards.component').then((m) => m.GiftCardsComponent) },
      { path: 'referanslar', canActivate: [FINANCE_ROLES], loadComponent: () => import('./features/referrals/referrals.component').then((m) => m.ReferralsComponent) },
      { path: 'garanti-kayitlari', loadComponent: () => import('./features/warranties/warranties.component').then((m) => m.WarrantiesComponent) },
      { path: 'kampanyalar', canActivate: [ADMIN_ROLES, entitlementGuard((e) => e?.marketingTools ?? false)], loadComponent: () => import('./features/campaigns/campaigns.component').then((m) => m.CampaignsComponent) },
      { path: 'otomasyon', canActivate: [ADMIN_ROLES, entitlementGuard((e) => e?.marketingTools ?? false)], loadComponent: () => import('./features/automation/automation-rules.component').then((m) => m.AutomationRulesComponent) },
      { path: 'ayarlar/guvenlik', canActivate: [ADMIN_ROLES], loadComponent: () => import('./features/settings/security.component').then((m) => m.SecurityComponent) },
      { path: 'ayarlar', canActivate: [ADMIN_ROLES], loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent) },
      { path: 'ayarlar/personel', canActivate: [ADMIN_ROLES], loadComponent: () => import('./features/staff/staff.component').then((m) => m.StaffComponent) },
      { path: 'ayarlar/subeler', canActivate: [ADMIN_ROLES], loadComponent: () => import('./features/branches/branches.component').then((m) => m.BranchesComponent) },
      { path: 'yukselt', loadComponent: () => import('./features/subscription/upgrade.component').then((m) => m.UpgradeComponent) },
    ],
  },
  { path: '**', loadComponent: () => import('./features/not-found.component').then((m) => m.NotFoundComponent) },
];
