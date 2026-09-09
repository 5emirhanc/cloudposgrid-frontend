import { Component, OnInit, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { AssistantApi } from '../../core/api/assistant.api';
import { AssistantContext, AssistantIntentDto, AssistantSuggestionDto, AssistantUnresolvedDto } from '../../core/models';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { apiError } from '../../core/utils';

/** Sohbetteki tek bir baloncuk. */
interface ChatMsg {
  role: 'user' | 'assistant';
  text: string;
  understood?: boolean;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <!-- Başlık + (yönetici) Eğitim/Sohbet geçişi -->
      <div class="mb-4 flex items-center gap-3">
        <span class="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
          <lucide-icon name="sparkles" class="h-6 w-6"></lucide-icon>
        </span>
        <div class="flex-1">
          <h1 class="text-xl font-black tracking-tight text-slate-900">AI Asistan</h1>
          <p class="text-xs text-slate-500">İşletmenizi doğal dille sorgulayın — gerçek verilerinizle yanıtlar</p>
        </div>
        @if (canTrain()) {
          <div class="flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-xs font-semibold">
            <button type="button" class="rounded-lg px-3 py-1.5 transition"
              [class]="view() === 'chat' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'"
              (click)="view.set('chat')">Sohbet</button>
            <button type="button" class="rounded-lg px-3 py-1.5 transition"
              [class]="view() === 'train' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'"
              (click)="showTraining()">
              Eğitim
              @if (unresolved().length) {
                <span class="ml-1 rounded-full bg-violet-100 px-1.5 text-violet-700">{{ unresolved().length }}</span>
              }
            </button>
          </div>
        }
      </div>

      @if (view() === 'chat') {
        <!-- Mesaj akışı -->
        <div #scroll class="flex-1 space-y-4 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
          @for (m of messages(); track $index) {
            @if (m.role === 'assistant') {
              <div class="flex items-start gap-2.5">
                <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                  <lucide-icon name="sparkles" class="h-4 w-4"></lucide-icon>
                </span>
                <div class="max-w-[80%] rounded-2xl rounded-tl-sm bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-700 shadow-sm" [innerHTML]="mdBold(m.text)"></div>
              </div>
            } @else {
              <div class="flex justify-end">
                <div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                  {{ m.text }}
                </div>
              </div>
            }
          }
          @if (sending()) {
            <div class="flex items-start gap-2.5">
              <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                <lucide-icon name="sparkles" class="h-4 w-4"></lucide-icon>
              </span>
              <div class="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
                <span class="text-sm text-slate-400">{{ thinkingText() }}</span>
                <div class="flex gap-1">
                  <span class="h-2 w-2 animate-bounce rounded-full bg-violet-300" style="animation-delay:0ms"></span>
                  <span class="h-2 w-2 animate-bounce rounded-full bg-violet-300" style="animation-delay:150ms"></span>
                  <span class="h-2 w-2 animate-bounce rounded-full bg-violet-300" style="animation-delay:300ms"></span>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Hazır soru chip'leri -->
        @if (suggestions().length) {
          <div class="mt-3 flex flex-wrap gap-2">
            @for (s of suggestions(); track s.question) {
              <button type="button" [disabled]="sending()"
                class="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
                (click)="send(s.question)">
                {{ s.label }}
              </button>
            }
          </div>
        }

        <!-- Yazı kutusu -->
        <div class="mt-3 flex items-center gap-2">
          <input class="input flex-1" [value]="input()" [disabled]="sending()"
            placeholder="Bir soru yazın… (ör. Bu ay en çok ne sattım?)"
            (input)="input.set($any($event.target).value)" (keyup.enter)="send(input())" />
          <button type="button" class="btn-primary shrink-0" [disabled]="sending() || !input().trim()" (click)="send(input())">
            <lucide-icon name="arrow-right" class="h-4 w-4"></lucide-icon>
          </button>
        </div>
      } @else {
        <!-- Eğitim paneli: anlaşılamayan soruları bir niyete atayarak asistanı eğit -->
        <div class="flex-1 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
          <div class="mb-3 rounded-xl bg-violet-50 px-4 py-3 text-xs text-violet-800">
            💡 Asistanın <b>anlayamadığı</b> sorular burada birikir. Her birini doğru konuya atadığında asistan
            o soruyu bir daha anlar — böylece <b>sora sora</b> akıllanır.
          </div>

          @if (loadingTrain()) {
            <p class="py-8 text-center text-sm text-slate-400">Yükleniyor…</p>
          } @else if (!unresolved().length) {
            <div class="py-12 text-center">
              <p class="text-sm font-semibold text-slate-600">Bekleyen soru yok 🎉</p>
              <p class="mt-1 text-xs text-slate-400">Asistanın anlayamadığı yeni sorular burada görünecek.</p>
            </div>
          } @else {
            <div class="space-y-2">
              @for (u of unresolved(); track u.id) {
                <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div class="mb-2 flex items-start justify-between gap-2">
                    <p class="text-sm font-medium text-slate-800">"{{ u.question }}"</p>
                    @if (u.count > 1) {
                      <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{{ u.count }}× soruldu</span>
                    }
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <select class="input h-9 min-w-40 flex-1 text-sm"
                      [value]="picked()[u.id] ?? ''"
                      (change)="pick(u.id, $any($event.target).value)">
                      <option value="" disabled>Konu seç…</option>
                      @for (it of intents(); track it.code) {
                        <option [value]="it.code">{{ it.label }}</option>
                      }
                    </select>
                    <button type="button" class="btn-primary btn-sm shrink-0"
                      [disabled]="!picked()[u.id] || busyId() === u.id" (click)="teach(u)">
                      Öğret
                    </button>
                    <button type="button" class="btn-outline btn-sm shrink-0"
                      [disabled]="busyId() === u.id" (click)="dismiss(u)">
                      Yok say
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AiAssistantComponent implements OnInit {
  private api = inject(AssistantApi);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private scrollBox = viewChild<ElementRef<HTMLElement>>('scroll');

  protected view = signal<'chat' | 'train'>('chat');
  protected canTrain = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'Owner' || r === 'Admin';
  });

  // Sohbet durumu
  protected messages = signal<ChatMsg[]>([]);
  protected suggestions = signal<AssistantSuggestionDto[]>([]);
  protected input = signal('');
  protected sending = signal(false);
  protected thinkingText = signal('Düşünüyorum…');
  private thinkTimer?: number;
  /** Son konuşma bağlamı (hafıza) — bir sonraki soruyla geri gönderilir; takip sorularını bağlar. */
  private lastContext = signal<AssistantContext | null>(null);

  // Eğitim durumu
  protected unresolved = signal<AssistantUnresolvedDto[]>([]);
  protected intents = signal<AssistantIntentDto[]>([]);
  protected picked = signal<Record<string, string>>({});
  protected loadingTrain = signal(false);
  protected busyId = signal<string | null>(null);

  constructor() {
    // Yeni mesaj/typing geldikçe en alta kaydır.
    effect(() => {
      this.messages();
      this.sending();
      queueMicrotask(() => {
        const el = this.scrollBox()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  ngOnInit(): void {
    this.messages.set([
      {
        role: 'assistant',
        text: 'Merhaba! 👋 Ben CloudPosGrid asistanınım. Satış, kâr ve stok hakkında soru sorabilirsiniz. Aşağıdaki hazır sorulardan biriyle başlayabilirsiniz.',
      },
    ]);
    this.api.suggestions().subscribe({ next: (s) => this.suggestions.set(s), error: () => {} });
    // Yöneticiyse bekleyen soru sayısını rozet için sessizce çek.
    if (this.canTrain()) this.refreshUnresolved();
  }

  /** Asistan cevabındaki `**...**` kalıbını kalın yazıya çevirir. Önce HTML'i escape eder
   * (ürün adı vb. içindeki `<`/`&` zararsızlaşır) → XSS'e kapalı; sonra yalnız <strong> ekler. */
  protected mdBold(text: string): string {
    const esc = (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return esc.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // ---- Sohbet ----

  protected send(text: string): void {
    const q = text.trim();
    if (!q || this.sending()) return;

    this.messages.update((m) => [...m, { role: 'user', text: q }]);
    this.input.set('');
    this.sending.set(true);

    // "Düşünüyor" hissi: mesajı birkaç aşamada değiştir + cevabı en az ~1 sn beklet.
    this.thinkingText.set('Düşünüyorum…');
    clearTimeout(this.thinkTimer);
    this.thinkTimer = setTimeout(() => this.thinkingText.set('Verilerine bakıyorum…'), 650) as unknown as number;
    const started = Date.now();

    this.api.ask(q, this.lastContext()).subscribe({
      next: (r) =>
        this.finishThinking(started, () => {
          this.messages.update((m) => [...m, { role: 'assistant', text: r.answer, understood: r.understood }]);
          // Konuşma bağlamını sakla → sonraki takip sorusu ("ürün olarak", "peki geçen ay") buna bağlanır.
          this.lastContext.set(r.context ?? null);
          // Anlaşılmadıysa eğitim rozetini tazele.
          if (!r.understood && this.canTrain()) this.refreshUnresolved();
        }),
      error: (e) => this.finishThinking(started, () => this.toast.error(apiError(e))),
    });
  }

  /** Cevap hızlı gelse bile en az ~1 sn "düşünüyor" göster, sonra uygula (gerçekten düşünmüş gibi). */
  private finishThinking(started: number, apply: () => void): void {
    const wait = Math.max(0, 1000 - (Date.now() - started));
    setTimeout(() => {
      clearTimeout(this.thinkTimer);
      this.sending.set(false);
      apply();
    }, wait);
  }

  // ---- Eğitim ----

  protected showTraining(): void {
    this.view.set('train');
    this.loadingTrain.set(true);
    // Niyet kataloğu ZORUNLU (dropdown olmadan öğretilemez) → hatası sessizce yutulmaz.
    if (!this.intents().length) {
      this.api.intents().subscribe({
        next: (i) => this.intents.set(i),
        error: (e) => this.toast.error('Konu listesi yüklenemedi: ' + apiError(e)),
      });
    }
    this.refreshUnresolved(() => this.loadingTrain.set(false));
  }

  private refreshUnresolved(done?: () => void): void {
    this.api.unresolved().subscribe({
      next: (u) => {
        this.unresolved.set(u);
        done?.();
      },
      error: () => done?.(),
    });
  }

  protected pick(id: string, intent: string): void {
    this.picked.update((p) => ({ ...p, [id]: intent }));
  }

  protected teach(u: AssistantUnresolvedDto): void {
    const intent = this.picked()[u.id];
    if (!intent) return;
    this.busyId.set(u.id);
    this.api.resolve(u.id, intent).subscribe({
      next: () => {
        this.busyId.set(null);
        this.unresolved.update((list) => list.filter((x) => x.id !== u.id));
        // Seçim durumunu da temizle (satır listeden düşse de picked kaydı birikmesin).
        this.picked.update((p) => {
          const copy = { ...p };
          delete copy[u.id];
          return copy;
        });
        this.toast.success('Öğrenildi ✓ Asistan bu soruyu artık anlıyor.');
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }

  protected dismiss(u: AssistantUnresolvedDto): void {
    this.busyId.set(u.id);
    this.api.dismiss(u.id).subscribe({
      next: () => {
        this.busyId.set(null);
        this.unresolved.update((list) => list.filter((x) => x.id !== u.id));
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(apiError(e));
      },
    });
  }
}
