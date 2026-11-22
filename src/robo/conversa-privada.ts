// Memória curta do privado de cada organizador: as últimas falas (para "troca o Caio pelo Jonas" e
// "desfaz" fazerem sentido) e as últimas mudanças na lista feitas por ali (para o "desfazer").
// Fica só na memória do robô: some quando ele reinicia ou depois de 30 minutos sem conversa.
import type { FotoDaPresenca } from '@/server/presencas';

/** Uma fala da conversa, como vai para a IA. */
export type Fala = { papel: 'user' | 'assistant'; texto: string };

/** Como a presença de um jogador estava antes de uma mudança feita pelo robô. */
export type Desfazer = { peladaId: number; jogadorId: number; nome: string; antes: FotoDaPresenca };

/** Sem conversa por 30 minutos: começa do zero. */
export const VALIDADE_CONVERSA_MS = 30 * 60_000;
/** As últimas 5 trocas (pergunta e resposta). */
export const MAX_FALAS = 10;
/** Cada fala vai cortada (a lista e os times inteiros ocupariam tokens à toa). */
export const MAX_TEXTO_FALA = 1500;
/** Quantas mensagens com mudança na lista dá para desfazer, da mais nova para a mais velha. */
export const MAX_DESFAZER = 5;

type Conversa = { falas: Fala[]; desfazer: Desfazer[][]; ultimaEm: number };

const cortar = (t: string) => (t.length > MAX_TEXTO_FALA ? `${t.slice(0, MAX_TEXTO_FALA - 1)}…` : t);

export class ConversasPrivadas {
  private conversas = new Map<string, Conversa>();

  constructor(private readonly validadeMs = VALIDADE_CONVERSA_MS) {}

  private viva(chave: string, now: Date): Conversa | null {
    const c = this.conversas.get(chave);
    if (!c) return null;
    if (now.getTime() - c.ultimaEm >= this.validadeMs) {
      this.conversas.delete(chave);
      return null;
    }
    return c;
  }

  private abrir(chave: string, now: Date): Conversa {
    const c = this.viva(chave, now) ?? { falas: [], desfazer: [], ultimaEm: now.getTime() };
    c.ultimaEm = now.getTime();
    this.conversas.set(chave, c);
    return c;
  }

  /** As falas anteriores, da mais velha para a mais nova (sempre começa por uma do usuário). */
  historico(chave: string, now: Date): Fala[] {
    return [...(this.viva(chave, now)?.falas ?? [])];
  }

  /** Guarda a pergunta e a resposta mandada; mantém só as últimas `MAX_FALAS`. */
  registrar(chave: string, pergunta: string, resposta: string, now: Date): void {
    if (!pergunta.trim() || !resposta.trim()) return;
    const c = this.abrir(chave, now);
    c.falas.push({ papel: 'user', texto: cortar(pergunta) }, { papel: 'assistant', texto: cortar(resposta) });
    if (c.falas.length > MAX_FALAS) c.falas.splice(0, c.falas.length - MAX_FALAS);
  }

  /** As mudanças na lista de uma mensagem (desfeitas juntas). */
  guardarDesfazer(chave: string, mudancas: Desfazer[], now: Date): void {
    if (!mudancas.length) return;
    const c = this.abrir(chave, now);
    c.desfazer.push(mudancas);
    if (c.desfazer.length > MAX_DESFAZER) c.desfazer.shift();
  }

  /** Tira e devolve as mudanças da última mensagem que mexeu na lista; `null` se não tem. */
  tirarDesfazer(chave: string, now: Date): Desfazer[] | null {
    return this.viva(chave, now)?.desfazer.pop() ?? null;
  }
}
