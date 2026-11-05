// Aviso sonoro para o iPhone, onde o Safari não tem `navigator.vibrate`. O iOS só libera o áudio
// depois de um toque, então o AudioContext nasce no primeiro toque (`destravarAudio`) e fica.

type ContextoDeAudio = typeof AudioContext;

let contexto: AudioContext | null = null;

/** Chame dentro de um toque do usuário. Sem suporte ou com erro, não faz nada. */
export function destravarAudio(): void {
  try {
    if (!contexto) {
      const Ctx: ContextoDeAudio | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: ContextoDeAudio }).webkitAudioContext;
      if (!Ctx) return;
      contexto = new Ctx();
    }
    if (contexto.state === 'suspended') void contexto.resume().catch(() => {});
  } catch {
    contexto = null;
  }
}

const TOM_MS = 150;
const PAUSA_MS = 100;

/** Dois bipes curtos (~150 ms). Se o áudio não foi destravado por um toque, fica em silêncio. */
export function bipar(): void {
  try {
    const ctx = contexto;
    if (!ctx || ctx.state !== 'running') return;
    const inicio = ctx.currentTime;
    for (const [i, freq] of [880, 1100].entries()) {
      const t0 = inicio + (i * (TOM_MS + PAUSA_MS)) / 1000;
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.frequency.value = freq;
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + TOM_MS / 1000);
      osc.connect(ganho).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + TOM_MS / 1000 + 0.02);
    }
  } catch {
    // Sem áudio: segue só com a vibração (ou sem aviso).
  }
}
