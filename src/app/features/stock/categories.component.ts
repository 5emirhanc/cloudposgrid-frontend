import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StockApi } from '../../core/api/stock.api';
import { CategoryDto } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../core/confirm.service';
import { apiError } from '../../core/utils';

@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="mb-6">
      <h1 class="text-2xl font-black tracking-tight text-slate-900">Kategoriler</h1>
      <p class="text-sm text-slate-500">Ürün kategorilerinizi düzenleyin</p>
    </div>

    <div class="card mb-4 p-4">
      <form [formGroup]="form" (ngSubmit)="add()" class="flex gap-2">
        <input class="input flex-1" formControlName="name" placeholder="Yeni kategori adı" />
        <button class="btn-primary" [disabled]="saving()">
          <lucide-icon name="plus" class="h-4 w-4"></lucide-icon> Ekle
        </button>
      </form>
    </div>

    <div class="card overflow-hidden">
      @if (loading()) {
        <p class="py-10 text-center text-sm text-slate-400">Yükleniyor...</p>
      } @else if (!categories().length) {
        <p class="py-10 text-center text-sm text-slate-400">Henüz kategori yok.</p>
      } @else {
        <ul class="divide-y divide-slate-50">
          @for (c of categories(); track c.id) {
            <li class="flex items-center justify-between px-4 py-3 hover:bg-slate-50/60">
              <div class="flex items-center gap-3">
                <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <lucide-icon name="tags" class="h-4 w-4"></lucide-icon>
                </span>
                <div>
                  <p class="font-medium text-slate-800">{{ c.name }}</p>
                  <p class="text-xs text-slate-400">{{ c.productCount }} ürün</p>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <button class="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" (click)="rename(c)">
                  <lucide-icon name="pencil" class="h-4 w-4"></lucide-icon>
                </button>
                <button class="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="remove(c)">
                  <lucide-icon name="trash-2" class="h-4 w-4"></lucide-icon>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CategoriesComponent implements OnInit {
  private api = inject(StockApi);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  protected loading = signal(true);
  protected saving = signal(false);
  protected categories = signal<CategoryDto[]>([]);

  protected form = this.fb.nonNullable.group({ name: ['', Validators.required] });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.getCategories().subscribe({
      next: (c) => {
        this.categories.set(c);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected add(): void {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createCategory({ name: this.form.getRawValue().name }).subscribe({
      next: () => {
        this.saving.set(false);
        this.form.reset({ name: '' });
        this.toast.success('Kategori eklendi.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(apiError(e));
      },
    });
  }

  protected rename(c: CategoryDto): void {
    const name = prompt('Kategori adı', c.name);
    if (!name || name.trim() === c.name) return;
    this.api.updateCategory(c.id, { name: name.trim(), isActive: c.isActive }).subscribe({
      next: () => {
        this.toast.success('Güncellendi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }

  protected async remove(c: CategoryDto): Promise<void> {
    if (!(await this.confirm.confirm({ message: `"${c.name}" silinsin mi? Ürünler kategorisiz kalır.`, danger: true, confirmText: 'Sil' }))) return;
    this.api.deleteCategory(c.id).subscribe({
      next: () => {
        this.toast.success('Kategori silindi.');
        this.load();
      },
      error: (e) => this.toast.error(apiError(e)),
    });
  }
}
