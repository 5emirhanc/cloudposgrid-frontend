// Backend DTO'larıyla birebir eşleşen tipler (JSON camelCase, enum'lar string).

export type UserRole = 'Owner' | 'Admin' | 'Accountant' | 'Staff' | 'Cashier' | 'Waiter';
export type TenantPlan = 'Starter' | 'Pro' | 'Enterprise' | 'Chain';
export type BusinessType = 'General' | 'Hospitality' | 'Retail' | 'Service' | 'Beauty';
export type StockMovementType = 'In' | 'Out' | 'Adjustment';
export type StockMovementReference = 'Manual' | 'Purchase' | 'Sale' | 'Adjustment';
export type ContactType = 'Customer' | 'Supplier' | 'Both';
export type TransactionDirection = 'Debit' | 'Credit';
export type CashAccountType = 'Cash' | 'Bank';
export type FinanceType = 'Income' | 'Expense';
export type InvoiceType = 'Sales' | 'Purchase';
export type InvoiceStatus = 'Draft' | 'Issued' | 'Paid' | 'Cancelled';
export type PaymentMethod = 'Cash' | 'Card' | 'Transfer' | 'Credit';
export type OrderType = 'DineIn' | 'Takeaway' | 'Delivery' | 'Service';
export type OrderStatus = 'Open' | 'Closed' | 'Cancelled';
export type OrderSource = 'Pos' | 'Qr';
export type WorkStatus = 'Received' | 'InProgress' | 'Ready';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Toplu içe aktarma ----
export interface ImportProductRow {
  name: string | null;
  sku?: string | null;
  barcode?: string | null;
  categoryName?: string | null;
  unit?: string | null;
  purchasePrice?: number | null;
  salePrice?: number | null;
  vatRate?: number | null;
  openingStock?: number | null;
  minStock?: number | null;
  isService?: boolean | null;
}
export interface ImportRowError {
  row: number;
  name: string;
  reason: string;
}
export interface ImportResultDto {
  imported: number;
  skipped: number;
  errors: ImportRowError[];
}

// ---- Şubeler (çok şube) ----
export interface BranchDto {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
  isDefault: boolean;
}

// ---- Auth ----
export interface EntitlementsDto {
  maxProducts: number | null;
  maxUsers: number | null;
  staffManagement: boolean;
  advancedReports: boolean;
  multiBranch: boolean;
  maxBranches: number | null; // toplam şube sınırı (Prof 1, Kurumsal 3, Zincir sınırsız)
  qrOrdering: boolean;
  marketplaceIntegration: boolean;
  loyaltyProgram: boolean;       // Sadakat / puan — Kurumsal + Zincir
  smartReplenishment: boolean;   // Akıllı sipariş önerisi — yalnız Zincir
  aiAssistant: boolean;          // Doğal dil AI asistanı — yalnız Zincir
  marketingTools: boolean;       // Kampanya + otomasyon + hediye çeki — Kurumsal + Zincir
}

// ---- AI Asistan ----
export interface AssistantSuggestionDto {
  label: string;
  question: string;
}
/** Kısa süreli konuşma bağlamı (hafıza) — son niyet + dönem; takip sorularını bağlamak için geri gönderilir. */
export interface AssistantContext {
  lastIntent: string | null;
  lastPeriod: string | null;
}
export interface AssistantReplyDto {
  answer: string;
  intent: string | null;
  understood: boolean;
  data?: unknown;
  context?: AssistantContext | null;
}
/** Anlaşılamamış soru (eğitim ekranında listelenir; yönetici bir niyete atar). */
export interface AssistantUnresolvedDto {
  id: string;
  question: string;
  count: number;
  createdAt: string;
  askedByEmail: string | null;
}
/** Niyet kodu + Türkçe etiket (eğitim ekranındaki seçim listesi). */
export interface AssistantIntentDto {
  code: string;
  label: string;
}
/** Proaktif içgörü/uyarı (dashboard AI özeti + asistan önerileri). severity: critical|warning|info|good */
export interface AssistantInsight {
  severity: string;
  icon: string;
  title: string;
  detail: string;
}

/** Kalıcı bildirim merkezi (zil) — düşük stok, geciken alacak, anomali vb. */
export interface NotificationDto {
  id: string;
  type: string;
  severity: string; // info | warning | critical
  title: string;
  message: string;
  link?: string | null;
  icon?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unreadCount: number;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  tenantId: string;
  tenantName: string;
  plan: TenantPlan;
  status: TenantStatus;
  businessType: BusinessType;
  slug: string;
  trialEndsAt?: string;
  /** Erişebildiği şubeler. BOŞ = kısıtsız (tüm şubeler) → şube seçicide hepsi görünür. */
  branchIds: string[];
  entitlements: EntitlementsDto;
  /** Çok-şirket (#47): bu hesabın eriştiği tüm işletmeler (geçiş menüsü için). */
  companies: CompanyDto[];
  /** 2FA açık mı — ayarlarda durum göstermek için. */
  twoFactorEnabled?: boolean;
}
/** Çok-şirket: hesabın eriştiği bir işletme (aktif işletme değiştirme menüsü). */
export interface CompanyDto {
  tenantId: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  businessType: BusinessType;
  role: UserRole;
}
export interface AuthResponse {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: UserDto;
  /** 2FA açık kullanıcıda şifre doğru ama kod gelmediyse true → istemci kod ister (token yok). */
  twoFactorRequired?: boolean;
}

/** Giriş kaydı (#46): başarılı/başarısız oturum açma izi — IP/cihaz ile şüpheli giriş görünürlüğü. */
export interface LoginEventDto {
  id: string;
  userId?: string | null;
  email: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  success: boolean;
  createdAt: string;
}
export interface TwoFactorSetupDto {
  secret: string;
  otpauthUri: string;
}
export interface TwoFactorEnabledDto {
  recoveryCodes: string[];
}

// ---- Pazaryeri (Trendyol) ----
export type MarketplaceSyncStatus = 'Imported' | 'NeedsMapping' | 'Error' | 'Pending' | 'Cancelled';

/** İşletme-içi denetim kaydı: kritik para/stok eylemini kimin yaptığı. */
export interface AuditEventDto {
  id: string;
  createdAt: string;
  actorEmail?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: string | null;
}

export interface MarketplaceConnectionDto {
  id: string;
  channel: string;
  supplierId: string;
  isActive: boolean;
  lastStockSyncAt?: string | null;
  lastOrderSyncAt?: string | null;
  lastStatus?: string | null;
  lastMessage?: string | null;
  hasCredentials: boolean;
  createdAt: string;
  /** Pazaryerinin ciro üzerinden aldığı komisyon (%). Kâr raporunda düşülür → NET kâr. */
  commissionRate: number;
  /** Sipariş başına sabit kargo maliyeti (₺). Kâr raporunda düşülür. */
  shippingCost: number;
}
export interface CreateConnectionRequest {
  channel: string;
  supplierId: string;
  apiKey: string;
  apiSecret: string;
  commissionRate?: number;
  shippingCost?: number;
}
export interface UpdateConnectionRequest {
  supplierId: string;
  apiKey?: string | null;
  apiSecret?: string | null;
  isActive: boolean;
  commissionRate?: number;
  shippingCost?: number;
}
export type MarketplaceListingStatus = 'External' | 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Failed';

export interface MarketplaceListingDto {
  id: string;
  productId: string;
  productName: string;
  productBarcode?: string | null;
  marketplaceBarcode: string;
  isActive: boolean;
  lastPushedStock?: number | null;
  lastPushedAt?: string | null;
  listingStatus: MarketplaceListingStatus;
  trendyolCategoryId?: number | null;
  listingError?: string | null;
  listedAt?: string | null;
}

// ---- İlan açma (createProducts) ----
export interface TrendyolCategory {
  id: number;
  name: string;
  parentId?: number | null;
  isLeaf: boolean;
}
export interface TrendyolAttributeValue {
  id: number;
  name: string;
}
export interface TrendyolCategoryAttribute {
  id: number;
  name: string;
  required: boolean;
  allowCustom: boolean;
  values: TrendyolAttributeValue[];
}
export interface TrendyolBrand {
  id: number;
  name: string;
}
export interface TrendyolCargoProvider {
  id: number;
  name: string;
}
export interface ListingAttributeInput {
  attributeId: number;
  attributeValueId?: number | null;
  customValue?: string | null;
}
export interface SubmitListingRequest {
  categoryId: number;
  brandId: number;
  cargoCompanyId: number;
  listPrice?: number | null;
  attributes: ListingAttributeInput[];
}
export interface CreateListingRequest {
  productId: string;
  marketplaceBarcode: string;
}
export interface UpdateListingRequest {
  marketplaceBarcode: string;
  isActive: boolean;
}
export interface MarketplaceOrderDto {
  id: string;
  channel: string;
  marketplaceOrderNumber: string;
  buyerName?: string | null;
  grandTotal: number;
  marketplaceStatus?: string | null;
  orderDate: string;
  invoiceId?: string | null;
  syncStatus: MarketplaceSyncStatus;
  syncError?: string | null;
  createdAt: string;
}
export interface SyncResultDto {
  success: boolean;
  message: string;
  ordersImported: number;
  stockPushed: number;
  syncedAt: string;
}

// ---- Personel (Staff) ----
export interface StaffDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  hasPin: boolean;
  /** Erişebildiği şubeler. BOŞ = kısıtsız (tüm şubeler). */
  branchIds: string[];
  createdAt: string;
  /** Granüler yetki (#28) — role'ün üstüne ek kısıtlar. Varsayılan true. */
  canVoid: boolean;
  canRefund: boolean;
  canViewCost: boolean;
}
export interface CreateStaffRequest {
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
  pin?: string | null;
  branchIds?: string[] | null;
}
export interface UpdateStaffRequest {
  fullName: string;
  role: UserRole;
  isActive: boolean;
  branchIds?: string[] | null;
  /** Granüler yetki (#28). Gönderilmezse backend true varsayar. */
  canVoid?: boolean;
  canRefund?: boolean;
  canViewCost?: boolean;
}

// ---- Stok ----
export interface CategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
}
export interface ProductDto {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  categoryId?: string;
  categoryName?: string;
  unit: string;
  purchasePrice: number;
  salePrice: number;
  vatRate: number;
  currentStock: number;
  minStock: number;
  isLowStock: boolean;
  isActive: boolean;
  isService: boolean;
  imageUrl?: string;
  description?: string;
  isVisibleOnMenu: boolean;
  menuSortOrder: number;
  /** Depo yeri: raf ve bölge (özellikle tamirci/servis parça takibi). */
  shelfLocation?: string;
  storageArea?: string;
  createdAt: string;
  /** Pazaryeri: marka + ek görseller (ilan açma için). */
  brandName?: string;
  imageUrls: string[];
  /** Desi / hacimsel ağırlık (pazaryeri kargo fiyatı için). Boş ise ilanda 1 varsayılır. */
  dimensionalWeight?: number | null;
  /** Terazi barkoduna gömülü ürün kodu — doluysa bu ürün tartılabilir kalemdir. */
  scaleItemCode?: string | null;
  /** En yakın son kullanma tarihi (SKT, #17) — yaklaşan/geçen SKT bildirimi üretir. */
  expiryDate?: string | null;
  /** Alış birimi (#26): koli/paket adı. Boşsa satış birimiyle aynı. */
  purchaseUnit?: string | null;
  /** 1 alış biriminde kaç satış birimi (#26). Mal kabulde stok bununla çarpılır. */
  purchaseUnitFactor?: number | null;
  /** Varyantlar (butik beden/renk): parent şablon + varyant satırları. */
  parentProductId?: string | null;
  isVariantParent?: boolean;
  variantValues?: string | null;
  variantAttributesJson?: string | null;
  /** Çok-şube TAM stok: AKTİF şubenin bakiyesi (şube seçiliyse). null = "tüm şubeler" → currentStock toplamı. */
  branchStock?: number | null;
}
export interface ReplenishmentItemDto {
  productId: string;
  productName: string;
  categoryName?: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  dailyVelocity: number;
  daysUntilStockout: number;
  suggestedReorderQty: number;
  salePrice: number;
}
export interface StockCountResultDto {
  totalItems: number;
  adjustedCount: number;
  unchangedCount: number;
}
export interface StockCountSessionItemDto {
  productId: string;
  productName: string;
  countedQuantity: number;
  currentStock: number;
}
export interface StockCountSessionDto {
  id: string;
  status: 'Open' | 'Applied' | 'Cancelled';
  createdAt: string;
  appliedAt?: string | null;
  createdByName?: string | null;
  countedCount: number;
  adjustedCount: number;
  items: StockCountSessionItemDto[];
}
export interface StockCountHistoryDto {
  id: string;
  status: 'Open' | 'Applied' | 'Cancelled';
  createdAt: string;
  appliedAt?: string | null;
  createdByName?: string | null;
  countedCount: number;
  adjustedCount: number;
}
export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number;
  reference: StockMovementReference;
  note?: string;
  stockAfter: number;
  createdAt: string;
}

// ---- Cari ----
export interface ContactDto {
  id: string;
  type: ContactType;
  name: string;
  taxOffice?: string;
  taxNo?: string;
  phone?: string;
  email?: string;
  address?: string;
  balance: number;
  discountRate: number;
  /** Sadakat puanı bakiyesi (₺ değerli; 1 puan = ₺1). */
  pointsBalance: number;
  isActive: boolean;
}
export interface AccountTransactionDto {
  id: string;
  contactId: string;
  direction: TransactionDirection;
  amount: number;
  balanceAfter: number;
  description?: string;
  docRef?: string;
  date: string;
}
export interface ContactLedgerDto {
  contact: ContactDto;
  transactions: AccountTransactionDto[];
}

export interface ContactPurchaseDto {
  productId: string;
  productName: string;
  quantity: number;
  total: number;
}
export interface ContactInvoiceBriefDto {
  id: string;
  number: string;
  date: string;
  grandTotal: number;
  paidAmount: number;
  status: string;
}
/** Müşteri 360 — LTV + sık alınan ürünler + son faturalar + randevu/teklif özeti. */
export interface Contact360Dto {
  contact: ContactDto;
  totalPurchases: number;
  invoiceCount: number;
  avgBasket: number;
  lastPurchaseAt?: string | null;
  openBalance: number;
  appointmentCount: number;
  lastAppointmentAt?: string | null;
  quoteCount: number;
  topProducts: ContactPurchaseDto[];
  recentInvoices: ContactInvoiceBriefDto[];
}

// ---- Finans ----
export interface CashAccountDto {
  id: string;
  name: string;
  type: CashAccountType;
  balance: number;
  isActive: boolean;
}
export interface FinanceTransactionDto {
  id: string;
  cashAccountId: string;
  cashAccountName: string;
  type: FinanceType;
  category?: string;
  amount: number;
  description?: string;
  paymentMethod: PaymentMethod;
  date: string;
}

export interface RecurringExpenseDto {
  id: string;
  name: string;
  amount: number;
  category?: string | null;
  cashAccountId: string;
  cashAccountName: string;
  dueDay: number;
  description?: string | null;
  isActive: boolean;
  lastPostedPeriod?: string | null;
  postedThisPeriod: boolean;
}

export interface CashShiftDto {
  id: string;
  cashAccountId: string;
  cashAccountName: string;
  status: string;
  openedAt: string;
  openedByName?: string | null;
  openingFloat: number;
  closedAt?: string | null;
  closedByName?: string | null;
  countedAmount?: number | null;
  expectedAmount?: number | null;
  difference?: number | null;
  note?: string | null;
}

// ---- Fatura ----
export interface InvoiceLineDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  vatAmount: number;
  refundedQuantity: number;
}

export interface RefundRequest {
  lines: { invoiceLineId: string; quantity: number }[];
  cashAccountId?: string | null;
  note?: string | null;
}
export interface InvoiceDto {
  id: string;
  type: InvoiceType;
  number: string;
  contactId?: string;
  contactName?: string;
  date: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  paidAmount: number;
  /** Sadakat puanı kullanımıyla uygulanan ₺ indirim (satır fiyatlarına yansımaz). */
  discount?: number;
  pointsEarned?: number;
  /** Kasiyerin elle uyguladığı ₺ indirim — satır fiyatlarına ZATEN işlenmiştir (bilgi amaçlı). */
  manualDiscount?: number;
  discountReason?: string | null;
  status: InvoiceStatus;
  note?: string;
  lines: InvoiceLineDto[];
}
export interface InvoiceListItemDto {
  id: string;
  type: InvoiceType;
  number: string;
  contactName?: string;
  date: string;
  grandTotal: number;
  paidAmount: number;
  status: InvoiceStatus;
}

// ---- Ayarlar ----
export interface SettingsDto {
  companyName: string;
  taxOffice?: string;
  taxNo?: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  defaultVatRate: number;
  logoUrl?: string;
  /** Sadakat/puan sistemi açık mı? */
  loyaltyEnabled: boolean;
  /** Satıştan kazanılan puan yüzdesi (0-100). 1 puan = ₺1. */
  loyaltyEarnPercent: number;
  /** Kasiyer satış anında elle indirim uygulayabilir mi? */
  manualDiscountEnabled?: boolean;
  /** Kasiyerin azami indirim oranı (0-100). Owner/Admin bu sınıra tabi değildir. */
  maxManualDiscountPercent?: number;
  // Terazi barkodu (market): [ön ek][ürün kodu][değer][kontrol]
  scaleBarcodeEnabled?: boolean;
  scaleBarcodePrefixes?: string;
  scaleBarcodeItemDigits?: number;
  scaleBarcodeValueDigits?: number;
  scaleBarcodeDecimals?: number;
  scaleBarcodeEmbeds?: ScaleEmbedMode;
  scaleBarcodePriceIncludesVat?: boolean;
}

// ---- Adisyon (Orders) ----
export interface ServiceAreaDto {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}
export interface DiningTableDto {
  id: string;
  name: string;
  areaId?: string;
  areaName?: string;
  sortOrder: number;
  isActive: boolean;
  openOrderId?: string;
  openTotal: number;
}
export interface OrderLineDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  note?: string;
}
export interface OrderDto {
  id: string;
  type: OrderType;
  status: OrderStatus;
  source: OrderSource;
  tableId?: string;
  tableName?: string;
  contactId?: string;
  label?: string;
  note?: string;
  assetInfo?: string;
  workStatus?: WorkStatus;
  openedAt: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  invoiceId?: string;
  lines: OrderLineDto[];
}
export interface OrderListItemDto {
  id: string;
  type: OrderType;
  status: OrderStatus;
  source: OrderSource;
  tableId?: string;
  tableName?: string;
  label?: string;
  assetInfo?: string;
  workStatus?: WorkStatus;
  openedAt: string;
  grandTotal: number;
  lineCount: number;
}

// ---- Public QR Menü ----
export interface MenuItemDto {
  id: string;
  name: string;
  description?: string;
  salePrice: number;
  imageUrl?: string;
}
export interface MenuCategoryDto {
  name: string;
  items: MenuItemDto[];
}
export interface MenuDto {
  companyName: string;
  logoUrl?: string;
  currency: string;
  categories: MenuCategoryDto[];
  orderingEnabled: boolean; // masadan sipariş açık mı (yalnız Kurumsal)
}

// ---- Randevu (Appointments) ----
export type AppointmentStatus = 'Scheduled' | 'Done' | 'Cancelled';
export interface AppointmentDto {
  id: string;
  customerName: string;
  phone?: string;
  serviceName?: string;
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  price: number;
  note?: string;
  staffId?: string;
  /** Bağlı cari — tahsilatta fatura bu cariye kesilir (ekstre/bakiye/indirim/puan). */
  contactId?: string | null;
  contactName?: string | null;
}

// ---- Raporlar ----
export interface NamedAmountDto {
  name: string;
  amount: number;
  count: number;
}
export interface CategoryBreakdownDto {
  category: string;
  quantity: number;
  total: number;
}
export interface TopProductReportDto {
  productId: string;
  name: string;
  quantity: number;
  total: number;
}
export interface DailySalesDto {
  date: string;
  total: number;
  count: number;
}
export interface SalesReportDto {
  salesCount: number;
  salesTotal: number;
  salesSubtotal: number;
  vatTotal: number;
  avgBasket: number;
  estimatedProfit: number;
  byPaymentMethod: NamedAmountDto[];
  byCategory: CategoryBreakdownDto[];
  topProducts: TopProductReportDto[];
  dailyTrend: DailySalesDto[];
}
export interface FinancialReportDto {
  income: number;
  expense: number;
  net: number;
  incomeByCategory: NamedAmountDto[];
  expenseByCategory: NamedAmountDto[];
}
export interface ProfitBreakdownDto {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}
export interface ProfitTrendPointDto {
  date: string;
  profit: number;
}
export interface ProfitReportDto {
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;
  byChannel: ProfitBreakdownDto[];
  byCategory: ProfitBreakdownDto[];
  trend: ProfitTrendPointDto[];
}
export interface CashAccountCloseDto {
  name: string;
  in: number;
  out: number;
  balance: number;
}
/** Gün sonu (Z) raporu — tek günün satış, tahsilat ve kasa özeti. */
export interface DailyCloseDto {
  date: string;
  salesCount: number;
  salesTotal: number;
  salesSubtotal: number;
  vatTotal: number;
  byPaymentMethod: NamedAmountDto[];
  income: number;
  expense: number;
  net: number;
  cashAccounts: CashAccountCloseDto[];
  openOrdersCount: number;
  openOrdersTotal: number;
}

// ---- Cari yaşlandırma (aging) ----
export interface ContactAgingDto {
  contactId: string;
  name: string;
  type: string;
  phone?: string | null;
  balance: number;
  current: number;
  d31_60: number;
  d61_90: number;
  over90: number;
  oldestDays?: number | null;
}
export interface AgingReportDto {
  asOf: string;
  totalReceivable: number;
  totalPayable: number;
  current: number;
  d31_60: number;
  d61_90: number;
  over90: number;
  receivables: ContactAgingDto[];
  payables: ContactAgingDto[];
}

// ---- Tedarikçi siparişi + mal kabul ----
export type PurchaseOrderStatus = 'Draft' | 'Sent' | 'PartiallyReceived' | 'Received' | 'Cancelled';
export interface PurchaseOrderLineDto {
  id: string;
  productId: string;
  productName: string;
  orderedQuantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
}
export interface PurchaseOrderReceiptDto {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  grandTotal: number;
  isCancelled: boolean;
}
export interface PurchaseOrderDto {
  id: string;
  number: string;
  contactId: string;
  contactName: string;
  contactPhone?: string | null;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate?: string | null;
  note?: string | null;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  receivedRatio: number;
  lines: PurchaseOrderLineDto[];
  receipts: PurchaseOrderReceiptDto[];
}
export interface PurchaseOrderListItemDto {
  id: string;
  number: string;
  contactName: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDate?: string | null;
  grandTotal: number;
  lineCount: number;
  receivedRatio: number;
}
export interface CreatePurchaseOrderRequest {
  contactId: string;
  orderDate?: string | null;
  expectedDate?: string | null;
  note?: string | null;
  lines: { productId: string; quantity: number; unitPrice: number; vatRate: number }[];
}
export interface ReceivePurchaseOrderRequest {
  lines: { purchaseOrderLineId: string; quantity: number; unitPrice?: number | null }[];
  date?: string | null;
  note?: string | null;
  payment?: { cashAccountId: string; amount: number; method: string } | null;
  allowOverReceipt?: boolean;
}
export interface ReceivePurchaseOrderResultDto {
  order: PurchaseOrderDto;
  invoiceId: string;
  invoiceNumber: string;
  invoiceGrandTotal: number;
}

// ---- Teklif / Proforma ----
export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Converted';
export interface QuoteLineDto {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  vatAmount: number;
}
export interface QuoteDto {
  id: string;
  number: string;
  status: QuoteStatus;
  /** Durum alanı değil — geçerlilik tarihinden türetilir. */
  isExpired: boolean;
  contactId?: string | null;
  contactName?: string | null;
  customerName?: string | null;
  date: string;
  validUntil: string;
  subtotal: number;
  vatTotal: number;
  grandTotal: number;
  note?: string | null;
  invoiceId?: string | null;
  lines: QuoteLineDto[];
}
export interface QuoteListItemDto {
  id: string;
  number: string;
  status: QuoteStatus;
  isExpired: boolean;
  contactName?: string | null;
  customerName?: string | null;
  date: string;
  validUntil: string;
  grandTotal: number;
  invoiceId?: string | null;
}
export interface SaveQuoteRequest {
  contactId?: string | null;
  customerName?: string | null;
  date?: string | null;
  validUntil?: string | null;
  note?: string | null;
  lines: { productId: string; quantity: number; unitPrice: number; vatRate: number }[];
}

// ---- Terazi barkodu ----
export type ScaleEmbedMode = 'Weight' | 'Price';
/** Barkod okutma sonucu. isScaleBarcode=false ise normal ürün (quantity=1, unitPrice=null). */
export interface ScanResultDto {
  product: ProductDto;
  quantity: number;
  unitPrice: number | null;
  isScaleBarcode: boolean;
}

// ---- Elle indirim ----
export type DiscountReason = 'Complimentary' | 'Damaged' | 'Rounding' | 'Negotiation' | 'Other';

// ---- Toplu fiyat güncelleme ----
export interface BulkPricePreviewItem {
  id: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}
export interface BulkPriceResultDto {
  affectedCount: number;
  applied: boolean;
  sample: BulkPricePreviewItem[];
}

// ---- Fire / zayi ----
export type WasteReason = 'Spoiled' | 'Broken' | 'Expired' | 'Complimentary' | 'Other';
export interface WasteItemDto {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
}
export interface WasteReportDto {
  totalCost: number;
  totalQuantity: number;
  items: WasteItemDto[];
  byReason: NamedAmountDto[];
}

// ---- Dashboard ----
export interface DashboardSummaryDto {
  totalProducts: number;
  lowStockCount: number;
  totalStockValue: number;
  contactCount: number;
  totalReceivable: number;
  totalPayable: number;
  cashTotal: number;
  todayIncome: number;
  todayExpense: number;
}
export interface FinanceTrendPointDto {
  date: string;
  income: number;
  expense: number;
}
export interface TopProductDto {
  productId: string;
  name: string;
  quantity: number;
  total: number;
}
export interface PeriodKpiDto {
  period: string; // today | week | month | year
  revenue: number;
  prevRevenue: number;
  revenueDeltaPct: number;
  salesCount: number;
  prevSalesCount: number;
  avgBasket: number;
  expense: number;
  net: number;
}

/** Reçete/BOM — bileşik ürünün bileşenleri (satışta stoktan düşer). */
export interface RecipeComponentDto {
  componentProductId: string;
  componentName: string;
  unit: string;
  quantity: number;
  unitCost: number;
}
export interface RecipeDto {
  productId: string;
  components: RecipeComponentDto[];
  totalCost: number;
}

// ---- Platform yönetimi / Abonelik ----
export type TenantStatus = 'Trial' | 'Active' | 'Suspended' | 'Cancelled';
export type BillingCycle = 'Monthly' | 'Yearly';
export type SubscriptionRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface TenantAdminDto {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  plan: TenantPlan;
  status: TenantStatus;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  billingCycle?: BillingCycle;
  lastPaymentAt?: string;
  userCount: number;
  createdAt: string;
  adminNote?: string;
  /** Kullanım takibi: son giriş/oturum yenileme anı + şemadan okunan sayılar. */
  lastLoginAt?: string;
  productCount: number;
  salesCount: number;
  /** Bu müşteriyi getiren bayi (varsa). Bağ hep vardı ama panelde hiç görünmüyordu. */
  dealerId?: string | null;
  dealerName?: string | null;
}
export interface AdminStatsDto {
  totalTenants: number;
  activeTrials: number;
  trialsExpiringSoon: number;
  payingCustomers: number;
  suspended: number;
  estimatedMrr: number;
}
export interface SubscriptionRequestDto {
  id: string;
  tenantId: string;
  tenantName: string;
  requestedPlan: TenantPlan;
  billingCycle: BillingCycle;
  amount: number;
  status: SubscriptionRequestStatus;
  note?: string;
  createdAt: string;
  decidedAt?: string;
  decidedByEmail?: string;
}
export interface ActivateSubscriptionRequest {
  plan: TenantPlan;
  billingCycle: BillingCycle;
  amount?: number | null;
  note?: string | null;
}

// Müşteri tarafı abonelik
export interface PackageDto {
  plan: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  custom: boolean;
}
export interface BankInfoDto {
  accountName: string;
  iban: string;
  bank: string;
}
export interface SubscriptionInfoDto {
  plan: TenantPlan;
  status: TenantStatus;
  trialEndsAt?: string;
  subscriptionEndsAt?: string;
  daysLeft: number;
  isLocked: boolean;
  hasPendingRequest: boolean;
  packages: PackageDto[];
  banks: BankInfoDto[];
}

// ============================================================================
// Frontend pass — yeni ekranların DTO'ları (backend sözleşmeleriyle birebir)
// ============================================================================

// ---- Garanti Kayıtları (#49) ----
/** Garanti kaydı görünüm modeli. expiryDate ve isExpired backend'de kayıttan hesaplanır. */
export interface WarrantyRecordDto {
  id: string;
  customerName: string;
  contactId?: string | null;
  contactName?: string | null;
  productName: string;
  serialNo?: string | null;
  /** Satın alma tarihi (ISO) — garanti bu tarihten başlar. */
  purchaseDate: string;
  /** Garanti süresi (ay). */
  warrantyMonths: number;
  note?: string | null;
  branchId?: string | null;
  /** Garanti bitiş tarihi = purchaseDate + warrantyMonths ay (hesaplanmış). */
  expiryDate: string;
  /** Garanti süresi doldu mu (hesaplanmış). */
  isExpired: boolean;
}
export interface CreateWarrantyRecordRequest {
  customerName: string;
  productName: string;
  purchaseDate: string;
  warrantyMonths: number;
  serialNo?: string | null;
  note?: string | null;
  contactId?: string | null;
}
export type UpdateWarrantyRecordRequest = CreateWarrantyRecordRequest;

// ---- Otomasyon Kuralları (#41) ----
export type AutomationTriggerType = 'low_stock' | 'overdue_receivable' | 'daily_summary' | 'appointment_soon';
export type AutomationActionType = 'notify' | 'sms' | 'email' | 'task';
export interface AutomationRuleDto {
  id: string;
  name: string;
  triggerType: string;
  conditionJson: string | null;
  actionType: string;
  actionConfigJson: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface CreateAutomationRuleRequest {
  name: string;
  triggerType: string;
  conditionJson: string | null;
  actionType: string;
  actionConfigJson: string | null;
  isActive: boolean;
}
export interface UpdateAutomationRuleRequest {
  name: string;
  triggerType: string;
  conditionJson: string | null;
  actionType: string;
  actionConfigJson: string | null;
  isActive: boolean;
}
export interface AutomationTemplate {
  triggerType: string;
  actionType: string;
  name: string;
  description: string;
}

// ---- Hediye Çekleri (#35) ----
export interface GiftCardDto {
  id: string;
  code: string;
  initialBalance: number;
  balance: number;
  /** "Active" | "Used" | "Cancelled" */
  status: string;
  contactId?: string | null;
  contactName?: string | null;
  expiresAt?: string | null;
  note?: string | null;
  createdAt: string;
}
export interface IssueGiftCardRequest {
  initialBalance: number;
  contactId?: string | null;
  expiresAt?: string | null;
  note?: string | null;
}
export interface RedeemGiftCardRequest {
  amount: number;
}

// ---- Çek / Senet (#22) ----
export type ChequeKind = 'Cheque' | 'PromissoryNote';
export type ChequeDirection = 'Received' | 'Given';
export type ChequeStatus = 'Portfolio' | 'Collected' | 'Endorsed' | 'Bounced' | 'Paid' | 'Cancelled';
export interface ChequeDto {
  id: string;
  kind: ChequeKind;
  direction: ChequeDirection;
  contactId: string | null;
  contactName: string | null;
  amount: number;
  /** Vade tarihi (ISO). */
  dueDate: string;
  bank: string | null;
  serialNo: string | null;
  status: ChequeStatus;
  note: string | null;
}
export interface ChequeSummaryDto {
  portfolioReceived: number;
  portfolioGiven: number;
  overdueReceived: number;
  dueSoonReceived: number;
}
export interface ChequeListDto {
  items: ChequeDto[];
  summary: ChequeSummaryDto;
}
export interface CreateChequeRequest {
  kind: ChequeKind;
  direction: ChequeDirection;
  contactId: string | null;
  amount: number;
  dueDate: string;
  bank: string | null;
  serialNo: string | null;
  note: string | null;
}
export interface UpdateChequeStatusRequest {
  status: ChequeStatus;
}

// ---- Kampanyalar (#16) ----
/** Kampanya türü: kategori %, ürün %, mutlu saatler (happy hour), X al Y bedava. */
export type CampaignType = 'category_percent' | 'product_percent' | 'happy_hour' | 'buy_x_get_y';
/** daysMask: virgüllü hafta günü indeksleri, 0=Pzt..6=Paz. */
export interface CampaignDto {
  id: string;
  name: string;
  type: CampaignType;
  categoryId?: string | null;
  productId?: string | null;
  percent?: number | null;
  buyQty?: number | null;
  getQty?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  startHour?: number | null;
  endHour?: number | null;
  daysMask?: string | null;
  isActive: boolean;
}
export interface SaveCampaignRequest {
  name: string;
  type: CampaignType;
  categoryId?: string | null;
  productId?: string | null;
  percent?: number | null;
  buyQty?: number | null;
  getQty?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  startHour?: number | null;
  endHour?: number | null;
  daysMask?: string | null;
  isActive: boolean;
}

// ---- Referans Programı (#50) ----
export interface ReferralDto {
  id: string;
  referrerContactId: string;
  /** Tavsiye eden cari adı (cari silinmişse null). */
  referrerName?: string | null;
  /** Otomatik üretilen benzersiz 8 haneli referans kodu. */
  code: string;
  referredContactId?: string | null;
  /** Tavsiye edilen cari adı (backend join'iyle gelir; eski kayıt/bounce öncesi boş olabilir). */
  referredName?: string | null;
  rewardAmount: number;
  /** "Pending" | "Rewarded" | "Cancelled" */
  status: string;
  note?: string | null;
  createdAt: string;
}
export interface CreateReferralRequest {
  referrerContactId: string;
  referredContactId?: string | null;
  rewardAmount: number;
  note?: string | null;
}

// ---- Analitik merkezi (#38 anomali, #21 nakit akışı, #44 envanter, #27 çok-şube, #39 pazaryeri komisyon, #32 saatlik, #20 personel) ----
/** Anomali / suistimal sinyali. severity: critical | warning | info; type makine-okunur kod. */
export interface AnomalyDto {
  type: string;
  severity: string;
  title: string;
  detail: string;
}
/** Nakit akışı haftalık projeksiyon noktası (date = haftanın yerel başlangıç günü). */
export interface CashflowPoint {
  date: string;
  inflow: number;
  outflow: number;
  projectedBalance: number;
}
/** Nakit akışı kaynak kırılımı (ör. "Vadeli alacak tahsilatı"). */
export interface CashflowSourceDto {
  source: string;
  amount: number;
  count: number;
}
/** İleriye dönük nakit akışı tahmini: özet + haftalık projeksiyon + kaynak kırılımı. */
export interface CashflowForecastDto {
  generatedAt: string;
  days: number;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  projectedEndBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string | null;
  points: CashflowPoint[];
  inflows: CashflowSourceDto[];
  outflows: CashflowSourceDto[];
}
/** Envanter değerleme + stok devir hızı özeti. */
export interface InventoryValuationDto {
  totalValue: number;
  totalUnits: number;
  productCount: number;
  periodCogs: number;
  turnoverRate: number;
  daysOfInventory: number;
}
/** ABC (Pareto) sınıflandırma satırı. class: A | B | C. */
export interface AbcItemDto {
  productId: string;
  name: string;
  revenue: number;
  cumulativePercent: number;
  class: string;
}
/** Ölü stok satırı: dönemde hiç satılmamış ama elde stoğu olan ürün. */
export interface DeadStockItemDto {
  productId: string;
  name: string;
  currentStock: number;
  tiedCapital: number;
  daysSinceLastSale: number | null;
}
/** Envanter analitiği birleşik sonucu: değerleme + ABC + ölü stok. */
export interface InventoryAnalyticsDto {
  days: number;
  valuation: InventoryValuationDto;
  abc: AbcItemDto[];
  deadStock: DeadStockItemDto[];
  deadStockValue: number;
}
/** Çok-şube konsolide panel satırı (branchId null = Genel/Şubesiz). */
export interface BranchKpiDto {
  branchId: string | null;
  branchName: string;
  revenue: number;
  salesCount: number;
  expense: number;
  net: number;
}
/** Çok-şube konsolide panel sonucu: şubeler + genel toplamlar. */
export interface ConsolidatedDto {
  branches: BranchKpiDto[];
  totalRevenue: number;
  totalNet: number;
}
/** Pazaryeri komisyon satırı (kanal başına brüt − komisyon − kargo = net). */
export interface MarketplaceCommissionRow {
  channel: string;
  orderCount: number;
  gross: number;
  commissionRate: number;
  commission: number;
  shipping: number;
  net: number;
}
/** Pazaryeri komisyon & hakediş mutabakatı sonucu. */
export interface MarketplaceCommissionDto {
  rows: MarketplaceCommissionRow[];
  totalGross: number;
  totalCommission: number;
  totalShipping: number;
  totalNet: number;
}
/** Saatlik satış ısı haritası hücresi (weekday: 0=Pzt..6=Paz, hour: 0-23). */
export interface HourlySalesCellDto {
  weekday: number;
  hour: number;
  count: number;
  revenue: number;
}
/** Personel bazlı satış (sellerUserId ad istemcide personel listesinden eşlenir). */
export interface StaffSalesDto {
  sellerUserId: string | null;
  salesCount: number;
  revenue: number;
  avgBasket: number;
}

// ---- Ürün Seçenekleri (#29) ----
export interface ProductOptionDto {
  id: string;
  productId: string;
  groupName: string;
  name: string;
  priceDelta: number;
  sortOrder: number;
}
export interface ProductOptionItem {
  groupName: string;
  name: string;
  priceDelta: number;
  sortOrder: number;
}

// ---- Ürün–Tedarikçi eşleme (#37) ----
export interface ProductSupplierItem {
  contactId: string;
  supplierSku: string | null;
  lastPurchasePrice: number;
  leadTimeDays: number;
  minOrderQuantity: number;
  isPreferred: boolean;
}
export interface ProductSupplierDto extends ProductSupplierItem {
  id: string;
  productId: string;
  productName: string;
  contactName: string;
}

// ---- Bayi / yeniden-satıcı (#25) ----
export interface DealerDto {
  id: string;
  name: string;
  email: string;
  code: string;
  commissionRate: number;
  isActive: boolean;
  createdAt: string;
  tenantCount: number;
}
/** Bayinin onboard ettiği müşteri işletmesi (panel listesi). */
export interface DealerTenantDto {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  businessType: BusinessType;
  createdAt: string;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
}
export interface DealerSummaryDto {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  commissionRate: number;
  /** Bayinin para durumu — önceden panelde yalnız oran yazıyordu, kazanç hiç görünmüyordu. */
  totalEarned: number;
  totalPaid: number;
  balance: number;
}

/**
 * Bayinin para durumu. Komisyon ödeme ANINDA dondurulmuş tutarlardan toplanır; oran sonradan
 * değişse bile geçmiş hakediş değişmez.
 */
export interface DealerEarningsDto {
  totalEarned: number;
  totalPaid: number;
  /** Kalan borç: kazanılan − ödenen. */
  balance: number;
  paidInvoiceCount: number;
}
export interface DealerPayoutDto {
  id: string;
  amount: number;
  paidAt: string;
  note?: string | null;
}
/** Süper-admin'in bir bayi hakkında gördüğü her şey. */
export interface DealerDetailDto {
  dealer: DealerDto;
  earnings: DealerEarningsDto;
  tenants: DealerTenantDto[];
  payouts: DealerPayoutDto[];
}
export interface OnboardTenantRequest {
  companyName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  businessType: BusinessType;
}
export interface OnboardResultDto {
  tenantId: string;
  companyName: string;
  ownerEmail: string;
}
export interface CreateDealerRequest {
  name: string;
  email: string;
  password: string;
  commissionRate: number;
}
