import { ApplicationConfig, importProvidersFrom, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './core/auth.service';
import {
  LucideAngularModule,
  LayoutDashboard, Package, Boxes, Tags, ArrowLeftRight, Users, Wallet,
  ReceiptText, Settings, LogOut, Plus, Search, Pencil, Trash2, TrendingUp,
  TrendingDown, ArrowUpRight, ArrowDownRight, TriangleAlert, X, Menu,
  ChevronRight, ChevronDown, Building2, FileText, ShoppingCart, Check, CircleDollarSign,
  BookText, CreditCard, Banknote, Filter, Eye,
  Coffee, Store, Wrench, Scissors, LayoutGrid, Utensils, Package2, PackageCheck, QrCode, CalendarDays,
  UserCog, KeyRound, UserX, UserCheck, BarChart3, Camera,
  Shield, Crown, Copy, Ban, Clock, Rocket,
  Mail, Lock, EyeOff, ArrowRight, ArrowLeft, Minus, Sparkles, Bell, Download, Upload, WifiOff, MapPin, Info, CircleHelp, Printer, ClipboardList, RefreshCw, Shirt, Percent, MessageCircle,
  // Frontend pass — yeni ekranların ikonları (garanti, otomasyon, hediye çeki, kampanya, referans, güvenlik, PDF, push).
  DatabaseBackup, FileDown, Gift, Link, Megaphone, MinusCircle, ShieldCheck, UserPlus, Workflow, LineChart, BellOff,
} from 'lucide-angular';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { errorInterceptor } from './core/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' })
    ),
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    // Açılışta cookie ile sessiz oturum geri yükleme; router yönlendirmeden önce tamamlanır.
    provideAppInitializer(() => firstValueFrom(inject(AuthService).restoreSession())),
    // PWA: sadece production'da service worker (çevrimdışı önbellek + güncelleme).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    importProvidersFrom(
      LucideAngularModule.pick({
        LayoutDashboard, Package, Boxes, Tags, ArrowLeftRight, Users, Wallet,
        ReceiptText, Settings, LogOut, Plus, Search, Pencil, Trash2, TrendingUp,
        TrendingDown, ArrowUpRight, ArrowDownRight, TriangleAlert, X, Menu,
        ChevronRight, ChevronDown, Building2, FileText, ShoppingCart, Check, CircleDollarSign,
        BookText, CreditCard, Banknote, Filter, Eye,
        Coffee, Store, Wrench, Scissors, LayoutGrid, Utensils, Package2, PackageCheck, QrCode, CalendarDays,
        UserCog, KeyRound, UserX, UserCheck, BarChart3, Camera,
        Shield, Crown, Copy, Ban, Clock, Rocket,
        Mail, Lock, EyeOff, ArrowRight, ArrowLeft, Minus, Sparkles, Bell, Download, Upload, WifiOff, MapPin, Info, CircleHelp, Printer, ClipboardList, RefreshCw, Shirt, Percent, MessageCircle,
        DatabaseBackup, FileDown, Gift, Link, Megaphone, MinusCircle, ShieldCheck, UserPlus, Workflow, LineChart, BellOff,
      })
    ),
  ],
};
