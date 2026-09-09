import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/toast-container.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { PwaStatusComponent } from './shared/pwa-status.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastContainerComponent, ConfirmDialogComponent, PwaStatusComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast-container></app-toast-container>
    <app-confirm-dialog></app-confirm-dialog>
    <app-pwa-status></app-pwa-status>
  `,
})
export class App {}
