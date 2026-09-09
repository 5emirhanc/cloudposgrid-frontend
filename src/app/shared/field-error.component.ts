import { Component, computed, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

/**
 * Reaktif form alanları için tutarlı hata mesajı gösterimi.
 * Kullanım: <field-error [control]="form.controls.name" label="Ürün adı" />
 */
@Component({
  selector: 'field-error',
  template: `
    @if (show()) {
      <p class="mt-1 text-xs text-rose-600">{{ message() }}</p>
    }
  `,
})
export class FieldErrorComponent {
  control = input<AbstractControl | null>(null);
  label = input('Bu alan');

  protected show = computed(() => {
    const c = this.control();
    return !!c && c.invalid && (c.touched || c.dirty);
  });

  protected message = computed(() => {
    const e = this.control()?.errors;
    if (!e) return '';
    if (e['required']) return `${this.label()} zorunlu.`;
    if (e['email']) return 'Geçerli bir e-posta girin.';
    if (e['minlength']) return `En az ${e['minlength'].requiredLength} karakter olmalı.`;
    if (e['maxlength']) return `En fazla ${e['maxlength'].requiredLength} karakter olabilir.`;
    if (e['min']) return `En az ${e['min'].min} olmalı.`;
    if (e['max']) return `En fazla ${e['max'].max} olabilir.`;
    return 'Geçersiz değer.';
  });
}
