import { BusinessType } from './models';

/** Sol menü grupları — sabit sırayla çizilir (bkz. NAV_GROUP_ORDER). 'panel' grupsuzdur, en üstte tek başına. */
export type NavGroup = 'satis' | 'stok' | 'finans' | 'pazaryeri' | 'pazarlama' | 'rapor' | 'ayarlar';

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  /** Menüde hangi başlık altında toplanacağı. Boşsa (Panel) başlıksız, en üstte gösterilir. */
  group?: NavGroup;
}

/** Grup başlıkları ve ÇİZİM SIRASI — işin günlük akışına göre: önce satış, sonra stok/finans, en sonda ayarlar. */
export const NAV_GROUP_ORDER: { key: NavGroup; label: string }[] = [
  { key: 'satis', label: 'Satış' },
  { key: 'stok', label: 'Stok' },
  { key: 'finans', label: 'Finans' },
  { key: 'pazaryeri', label: 'Pazaryeri' },
  { key: 'pazarlama', label: 'Müşteri & Pazarlama' },
  { key: 'rapor', label: 'Rapor & Analiz' },
  { key: 'ayarlar', label: 'Yönetim' },
];

export interface BusinessFeatures {
  adisyon: boolean;
  tables: boolean;
  takeaway: boolean;
  menu: boolean;
  qr: boolean;
  ordering: boolean;
  stockTracking: boolean;
  services: boolean;
  appointments: boolean;
}

export interface BusinessProfile {
  type: BusinessType;
  label: string;
  description: string;
  icon: string;
  defaultRoute: string;
  nav: NavItem[];
  terminology: {
    products: string;
    productSingular: string;
    sale: string;
    customers: string;
    customerSingular: string;
    /** Stok/ürün kodu alanının etiketi (tamirci/servis: "Ürün Kodu"). */
    productCode: string;
  };
  /** Cari/müşteri formunda hangi alanların gösterileceği (sektöre göre). */
  contactFields: { type: boolean; taxFields: boolean; address: boolean; openingBalance: boolean; email: boolean };
  /** Ürün formunda hangi alanların gösterileceği. stock=false ise kayıtlar hizmet sayılır.
   * location=true ise raf & depo bölgesi alanları gösterilir (tamirci/servis parça yeri). */
  productFields: { sku: boolean; barcode: boolean; stock: boolean; location: boolean };
  features: BusinessFeatures;
}

// Mevcut (var olan) rotalara karşılık gelen ortak nav öğeleri. Faz B/D'de
// adisyon/masalar/menü öğeleri eklenecek.
const NAV = {
  panel: { label: 'Panel', path: '/', icon: 'layout-dashboard' }, // grupsuz: en üstte tek başına
  masalar: { label: 'Masalar / Adisyon', path: '/masalar', icon: 'layout-grid', group: 'satis' },
  hizliSatis: { label: 'Hızlı Satış', path: '/hizli-satis', icon: 'shopping-cart', group: 'satis' },
  isEmirleri: { label: 'İş Emirleri', path: '/is-emirleri', icon: 'wrench', group: 'satis' },
  randevular: { label: 'Randevular', path: '/randevular', icon: 'calendar-days', group: 'satis' },
  urunler: { label: 'Ürünler', path: '/stok/urunler', icon: 'package', group: 'stok' },
  kategoriler: { label: 'Kategoriler', path: '/stok/kategoriler', icon: 'tags', group: 'stok' },
  hareketler: { label: 'Stok Hareketleri', path: '/stok/hareketler', icon: 'arrow-left-right', group: 'stok' },
  stokSayimi: { label: 'Stok Sayımı', path: '/stok/sayim', icon: 'clipboard-list', group: 'stok' },
  siparisOnerisi: { label: 'Sipariş Önerisi', path: '/siparis-onerisi', icon: 'package-check', group: 'stok' },
  cariler: { label: 'Cariler', path: '/cariler', icon: 'users', group: 'finans' },
  kasa: { label: 'Kasa & Gelir-Gider', path: '/kasa', icon: 'wallet', group: 'finans' },
  faturalar: { label: 'Faturalar', path: '/faturalar', icon: 'receipt-text', group: 'finans' },
  teklifler: { label: 'Teklifler', path: '/teklifler', icon: 'file-text', group: 'finans' },
  tedarikciSiparisleri: { label: 'Tedarikçi Siparişleri', path: '/tedarikci-siparisleri', icon: 'package-check', group: 'finans' },
  pazaryeri: { label: 'Pazaryeri', path: '/pazaryeri', icon: 'store', group: 'pazaryeri' },
  pazaryeriSiparisleri: { label: 'Pazaryeri Siparişleri', path: '/pazaryeri-siparisleri', icon: 'package-2', group: 'pazaryeri' },
  raporlar: { label: 'Raporlar', path: '/raporlar', icon: 'bar-chart-3', group: 'rapor' },
  aiAsistan: { label: 'AI Asistan', path: '/ai-asistan', icon: 'sparkles', group: 'rapor' },
  ayarlar: { label: 'Ayarlar', path: '/ayarlar', icon: 'settings', group: 'ayarlar' },
} satisfies Record<string, NavItem>;

const lbl = (item: NavItem, label: string): NavItem => ({ ...item, label });

const baseFeatures: BusinessFeatures = {
  adisyon: false, tables: false, takeaway: false, menu: false, qr: false,
  ordering: false, stockTracking: true, services: false, appointments: false,
};

export const BUSINESS_PROFILES: Record<BusinessType, BusinessProfile> = {
  General: {
    type: 'General',
    label: 'Butik',
    description: 'Giyim & tekstil — ürün, stok, barkod, cari ve satış.',
    icon: 'shirt',
    defaultRoute: '/',
    nav: [NAV.panel, NAV.hizliSatis, NAV.urunler, NAV.kategoriler, NAV.hareketler, NAV.stokSayimi, NAV.siparisOnerisi, NAV.cariler, NAV.kasa, NAV.faturalar, NAV.teklifler, NAV.tedarikciSiparisleri, NAV.pazaryeri, NAV.pazaryeriSiparisleri, NAV.raporlar, NAV.aiAsistan, NAV.ayarlar],
    terminology: { products: 'Ürünler', productSingular: 'Ürün', sale: 'Satış', customers: 'Cariler', customerSingular: 'Cari', productCode: 'Stok Kodu (SKU)' },
    contactFields: { type: true, taxFields: true, address: true, openingBalance: true, email: true },
    productFields: { sku: true, barcode: true, stock: true, location: false },
    features: { ...baseFeatures },
  },
  Hospitality: {
    type: 'Hospitality',
    label: 'Kafe / Bar / Restoran',
    description: 'Adisyon, masa düzeni ve QR menü ile hızlı servis.',
    icon: 'coffee',
    defaultRoute: '/masalar',
    nav: [NAV.panel, NAV.masalar, NAV.hizliSatis, NAV.urunler, NAV.kategoriler, NAV.hareketler, NAV.stokSayimi, NAV.siparisOnerisi, NAV.cariler, NAV.kasa, NAV.faturalar, NAV.tedarikciSiparisleri, NAV.raporlar, NAV.aiAsistan, NAV.ayarlar],
    terminology: { products: 'Ürünler', productSingular: 'Ürün', sale: 'Adisyon', customers: 'Cariler', customerSingular: 'Cari', productCode: 'Stok Kodu (SKU)' },
    contactFields: { type: true, taxFields: false, address: false, openingBalance: true, email: false },
    productFields: { sku: false, barcode: false, stock: true, location: false },
    features: { ...baseFeatures, adisyon: true, tables: true, takeaway: true, menu: true, qr: true, ordering: true },
  },
  Retail: {
    type: 'Retail',
    label: 'Bakkal / Market / Perakende',
    description: 'Barkodlu hızlı satış, veresiye (cari) ve stok takibi.',
    icon: 'store',
    defaultRoute: '/hizli-satis',
    nav: [NAV.panel, NAV.hizliSatis, NAV.urunler, NAV.kategoriler, NAV.hareketler, NAV.stokSayimi, NAV.siparisOnerisi, NAV.cariler, NAV.kasa, NAV.faturalar, NAV.teklifler, NAV.tedarikciSiparisleri, NAV.pazaryeri, NAV.pazaryeriSiparisleri, NAV.raporlar, NAV.aiAsistan, NAV.ayarlar],
    terminology: { products: 'Ürünler', productSingular: 'Ürün', sale: 'Satış', customers: 'Cariler', customerSingular: 'Cari', productCode: 'Stok Kodu (SKU)' },
    contactFields: { type: true, taxFields: true, address: true, openingBalance: true, email: true },
    productFields: { sku: true, barcode: true, stock: true, location: false },
    features: { ...baseFeatures },
  },
  Service: {
    type: 'Service',
    label: 'Tamirci / Usta / Servis',
    description: 'İşçilik + parça satışı, müşteri cari takibi.',
    icon: 'wrench',
    defaultRoute: '/is-emirleri',
    nav: [NAV.panel, NAV.isEmirleri, lbl(NAV.hizliSatis, 'Hızlı Satış'), lbl(NAV.urunler, 'Parça & Hizmet'), NAV.kategoriler, NAV.hareketler, NAV.stokSayimi, NAV.siparisOnerisi, lbl(NAV.cariler, 'Müşteriler'), NAV.kasa, NAV.faturalar, NAV.teklifler, NAV.tedarikciSiparisleri, NAV.raporlar, NAV.aiAsistan, NAV.ayarlar],
    terminology: { products: 'Parça & Hizmet', productSingular: 'Parça', sale: 'İş Emri', customers: 'Müşteriler', customerSingular: 'Müşteri', productCode: 'Ürün Kodu' },
    contactFields: { type: true, taxFields: true, address: true, openingBalance: true, email: true },
    productFields: { sku: true, barcode: true, stock: true, location: true },
    features: { ...baseFeatures, services: true },
  },
  Beauty: {
    type: 'Beauty',
    label: 'Kuaför / Güzellik',
    description: 'Hizmet satışı ve müşteri takibi.',
    icon: 'scissors',
    defaultRoute: '/randevular',
    nav: [NAV.panel, NAV.randevular, lbl(NAV.urunler, 'Hizmet & Ürün'), lbl(NAV.cariler, 'Müşteriler'), NAV.kasa, NAV.faturalar, NAV.raporlar, NAV.aiAsistan, NAV.ayarlar],
    terminology: { products: 'Hizmet & Ürün', productSingular: 'Hizmet', sale: 'Satış', customers: 'Müşteriler', customerSingular: 'Müşteri', productCode: 'Stok Kodu (SKU)' },
    contactFields: { type: false, taxFields: false, address: false, openingBalance: false, email: false },
    productFields: { sku: false, barcode: false, stock: false, location: false },
    features: { ...baseFeatures, services: true, appointments: true },
  },
};

export const SECTOR_OPTIONS: BusinessProfile[] = Object.values(BUSINESS_PROFILES);

export function profileFor(type: BusinessType | undefined | null): BusinessProfile {
  return (type && BUSINESS_PROFILES[type]) || BUSINESS_PROFILES.General;
}
