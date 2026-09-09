import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { InvoicesApi } from '../../core/api/invoices.api';
import { SettingsApi } from '../../core/api/settings.api';
import { InvoiceDto, SettingsDto } from '../../core/models';
import { formatDateTime, money } from '../../core/utils';

@Component({
  selector: 'app-receipt',
  template: `
    <div class="receipt-page">
      <div class="toolbar no-print">
        <button class="primary" (click)="print()">Yazdır</button>
        <button (click)="close()">Kapat</button>
      </div>

      @if (loading()) {
        <p>Fiş hazırlanıyor...</p>
      } @else if (invoice(); as inv) {
        <div class="receipt">
          <div class="center bold">{{ settings()?.companyName || 'CloudPosGrid' }}</div>
          @if (settings()?.address) { <div class="center small">{{ settings()?.address }}</div> }
          @if (settings()?.phone) { <div class="center small">{{ settings()?.phone }}</div> }
          @if (settings()?.taxNo) { <div class="center small">VKN: {{ settings()?.taxNo }}</div> }

          <div class="line"></div>
          <div class="row small"><span>{{ inv.number }}</span><span>{{ formatDateTime(inv.date) }}</span></div>
          @if (inv.contactName) { <div class="small">Cari: {{ inv.contactName }}</div> }
          <div class="line"></div>

          @for (l of inv.lines; track l.id) {
            <div class="row"><span>{{ l.quantity }} x {{ l.productName }}</span><span>{{ money(l.lineTotal + l.vatAmount) }}</span></div>
          }

          <div class="line"></div>
          <div class="row small"><span>Ara Toplam</span><span>{{ money(inv.subtotal) }}</span></div>
          <div class="row small"><span>KDV</span><span>{{ money(inv.vatTotal) }}</span></div>
          <div class="row bold big"><span>TOPLAM</span><span>{{ money(inv.grandTotal) }}</span></div>
          <div class="row small"><span>Ödenen</span><span>{{ money(inv.paidAmount) }}</span></div>
          @if (inv.grandTotal - inv.paidAmount > 0) {
            <div class="row small"><span>Kalan</span><span>{{ money(inv.grandTotal - inv.paidAmount) }}</span></div>
          }

          <div class="line"></div>
          <div class="center small">Bizi tercih ettiğiniz için teşekkürler!</div>
          <div class="center small">CloudPosGrid ile oluşturuldu</div>
        </div>
      } @else {
        <p>Fatura bulunamadı.</p>
      }
    </div>
  `,
  styles: [`
    .receipt-page { display:flex; flex-direction:column; align-items:center; padding:1.5rem 1rem; background:#f1f5f9; min-height:100vh; }
    .toolbar { display:flex; gap:.5rem; margin-bottom:1rem; }
    .toolbar button { padding:.5rem 1.25rem; border-radius:.5rem; border:1px solid #cbd5e1; background:#fff; cursor:pointer; font-weight:600; font-size:.875rem; }
    .toolbar button.primary { background:#2563eb; color:#fff; border-color:#2563eb; }
    .receipt { width:80mm; max-width:100%; background:#fff; padding:6mm 4mm; font-family:'Courier New',monospace; font-size:12px; line-height:1.5; color:#000; box-shadow:0 1px 8px rgba(0,0,0,.12); }
    .center { text-align:center; }
    .bold { font-weight:700; }
    .big { font-size:15px; margin:4px 0; }
    .small { font-size:11px; }
    .row { display:flex; justify-content:space-between; gap:8px; }
    .line { border-top:1px dashed #000; margin:6px 0; }
    @media print {
      .no-print { display:none !important; }
      .receipt-page { background:#fff; padding:0; min-height:0; }
      .receipt { box-shadow:none; width:auto; padding:0; }
      @page { margin:4mm; }
    }
  `],
})
export class ReceiptComponent implements OnInit {
  private invoicesApi = inject(InvoicesApi);
  private settingsApi = inject(SettingsApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected money = money;
  protected formatDateTime = formatDateTime;

  protected loading = signal(true);
  protected invoice = signal<InvoiceDto | null>(null);
  protected settings = signal<SettingsDto | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    forkJoin({ invoice: this.invoicesApi.getInvoice(id), settings: this.settingsApi.get() }).subscribe({
      next: (r) => {
        this.invoice.set(r.invoice);
        this.settings.set(r.settings);
        this.loading.set(false);
        setTimeout(() => window.print(), 400); // veriler gelince otomatik yazdırma diyaloğu
      },
      error: () => this.loading.set(false),
    });
  }

  protected print(): void {
    window.print();
  }
  protected close(): void {
    this.router.navigate(['/faturalar']);
  }
}
