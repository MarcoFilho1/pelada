// O estado otimista do anotador, sem React: a fila de escritas e a conta que a tela mostra.
//
// Toda escrita (toque em GOL/AST e Desfazer) entra numa fila única e vai ao servidor na ordem em
// que foi feita, uma de cada vez (decisão T12-1). Assim um Desfazer feito antes da resposta de um
// toque chega logo depois desse toque e antes de qualquer toque seguinte, e o `esperadoId` dele
// ainda é o último lance. O que a tela mostra = os lances da última resposta + as escritas que
// ainda estão na fila, aplicadas em ordem.

import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { placar as placarDe, tempoRestanteMs, type Lado, type Placar, type TipoLance } from '@/domain/partida';
import type { LanceDaPartida } from '@/server/partidas';
import type { EstadoDaPartida } from './estado';

type Falha = { ok: false; erro: string };
/** `estado: null`: gravou, mas a leitura depois falhou; a base se ajusta sozinha e a página confere em até 5 s. */
type RespostaDesfazer = { ok: true; estado: EstadoDaPartida | null; /** O servidor apagou o lance (false: já não era o último). */ desfeito: boolean };

/** As duas ações da tela, já presas à partida. */
export type Escritor = {
  anotar(jogadorId: number, tipo: TipoLance): Promise<{ ok: true; estado: EstadoDaPartida | null; lanceId: number } | Falha>;
  desfazer(esperadoId: number): Promise<RespostaDesfazer | Falha>;
};

/**
 * Escrita na fila. O Desfazer de um toque que ainda não voltou aponta para o toque (`toque`: a
 * chave dele); quando o toque volta com o id do lance, o alvo vira `lanceId`.
 */
export type Escrita =
  | { tipo: 'toque'; chave: number; jogadorId: number; lance: TipoLance }
  | { tipo: 'desfazer'; chave: number; alvo: { toque: number } | { lanceId: number } };

export type Aviso = { tipo: 'erro'; texto: string; n: number };

export type Vista = {
  /** Os lances como a tela mostra: os toques pendentes entram com id negativo (−chave). */
  lances: LanceDaPartida[];
  placar: Placar;
  conta: (jogadorId: number, tipo: TipoLance) => number;
  /** O que o Desfazer tira se for tocado agora, ou null. */
  alvo: LanceDaPartida | null;
  /** Jogadores com toque ainda não confirmado (os números deles ficam em lima). */
  salvando: Set<number>;
  /** Tem Desfazer na fila ("Desfazendo…"). */
  desfazendo: boolean;
};

const FALHA: Falha = { ok: false, erro: MSG_ALGO_DEU_ERRADO };

const idDoAlvo = (alvo: { toque: number } | { lanceId: number }) => ('toque' in alvo ? -alvo.toque : alvo.lanceId);

/** A conta da tela: os lances da base com as escritas pendentes aplicadas em ordem. */
export function derivar(base: EstadoDaPartida, escritas: Escrita[]): Vista {
  let lances: LanceDaPartida[] = [...base.lances];
  const desfeitos = new Set<number>();
  for (const e of escritas) {
    if (e.tipo === 'toque') {
      lances.push({ id: -e.chave, jogadorId: e.jogadorId, tipo: e.lance });
    } else {
      if ('toque' in e.alvo) desfeitos.add(e.alvo.toque);
      const id = idDoAlvo(e.alvo);
      lances = lances.filter((l) => l.id !== id);
    }
  }
  const lados = new Map<number, Lado>();
  for (const l of ['A', 'B'] as const) for (const j of base.lados[l].jogadores) lados.set(j.id, l);
  return {
    lances,
    placar: placarDe(lances, lados),
    conta: (jogadorId, tipo) => lances.filter((l) => l.jogadorId === jogadorId && l.tipo === tipo).length,
    alvo: lances.at(-1) ?? null,
    salvando: new Set(escritas.flatMap((e) => (e.tipo === 'toque' && !desfeitos.has(e.chave) ? [e.jogadorId] : []))),
    desfazendo: escritas.some((e) => e.tipo === 'desfazer'),
  };
}

/**
 * O cronômetro da tela. Em andamento: pela hora do servidor andando no relógio do aparelho
 * (`agora`; null antes de montar, aí vale o tempo que veio pronto). Encerrada: parado no que
 * faltava ao encerrar, sem correr até 0:00 (nem vibrar) ao abrir uma partida antiga.
 */
export function tempoNaTela(estado: EstadoDaPartida, agora: number | null): number {
  if (estado.encerrada || agora === null) return estado.tempoRestanteMs;
  return tempoRestanteMs(new Date(estado.iniciadaEm), new Date(agora));
}

/** Uma escrita sem resposta há mais que isto vira o aviso "Salvando há mais de 10 s". */
export const ESCRITA_LENTA_MS = 10_000;

export type Instantaneo = Vista & { estado: EstadoDaPartida; aviso: Aviso | null; /** Alguma escrita na fila há mais de 10 s. */ lento: boolean };

/**
 * A fila do anotador. A tela lê `instantaneo()` (com `useSyncExternalStore`) e chama `tocar`,
 * `desfazer` e `receberDaPagina` (a página recarregada a cada 5 s).
 *
 * A base é sempre a última resposta da fila (as respostas chegam na ordem das escritas). A leitura
 * da página só entra com a fila vazia e se for mais nova: durante a fila ela pode já trazer um toque
 * cuja resposta ainda não voltou, e aí o toque contaria duas vezes.
 */
export class Anotacoes {
  private base: EstadoDaPartida;
  private pagina: EstadoDaPartida;
  private escritas: Escrita[] = [];
  private chave = 0;
  private avisos = 0;
  private aviso: Aviso | null = null;
  private relogios = new Map<number, ReturnType<typeof setTimeout>>();
  private lentas = new Set<number>();
  // Lances que respostas sem leitura (estado null) confirmaram ou desfizeram: uma página só entra na
  // base se concordar com eles (senão uma leitura anterior ao commit derrubaria o número na tela).
  private confirmados = new Set<number>();
  private desfeitos = new Set<number>();
  private recusadas = 0;
  private ultimaRecusada: number | null = null;
  private cauda: Promise<void> = Promise.resolve();
  private ouvintes = new Set<() => void>();
  private atual: Instantaneo;

  constructor(
    estado: EstadoDaPartida,
    private readonly escritor: Escritor,
  ) {
    this.base = estado;
    this.pagina = estado;
    this.atual = this.montar();
  }

  assinar = (ouvinte: () => void) => {
    this.ouvintes.add(ouvinte);
    return () => {
      this.ouvintes.delete(ouvinte);
    };
  };

  instantaneo = (): Instantaneo => this.atual;

  /** Resolve quando tudo o que já está na fila voltou do servidor. */
  ocioso(): Promise<void> {
    return this.cauda;
  }

  receberDaPagina(estado: EstadoDaPartida): void {
    if (estado.lidoEm > this.pagina.lidoEm) this.pagina = estado;
    if (this.aceitarPagina()) this.emitir();
  }

  tocar(jogadorId: number, tipo: TipoLance): void {
    const e: Escrita = { tipo: 'toque', chave: ++this.chave, jogadorId, lance: tipo };
    this.escritas.push(e);
    this.aviso = null;
    this.emitir();
    this.enfileirar(() => this.enviarToque(e));
  }

  /** Enfileira um Desfazer do que a tela mostra como último. Devolve false se não havia o que desfazer. */
  desfazer(): boolean {
    const alvo = derivar(this.base, this.escritas).alvo;
    if (!alvo) return false;
    const chave = ++this.chave;
    this.escritas.push({ tipo: 'desfazer', chave, alvo: alvo.id < 0 ? { toque: -alvo.id } : { lanceId: alvo.id } });
    this.aviso = null;
    this.emitir();
    this.enfileirar(() => this.enviarDesfazer(chave));
    return true;
  }

  /** Some com o aviso `n` (a tela chama depois de alguns segundos). */
  limparAviso(n: number): void {
    if (this.aviso?.n !== n) return;
    this.aviso = null;
    this.emitir();
  }

  private enfileirar(enviar: () => Promise<void>) {
    this.cauda = this.cauda.then(enviar).catch(() => {});
  }

  private async enviarToque(e: Extract<Escrita, { tipo: 'toque' }>) {
    const r = await this.escritor.anotar(e.jogadorId, e.lance).catch(() => FALHA);
    const desteToque = (x: Escrita) => x.tipo === 'desfazer' && 'toque' in x.alvo && x.alvo.toque === e.chave;
    this.escritas = this.escritas.filter((x) => x.chave !== e.chave);
    if (r.ok) {
      if (r.estado) {
        this.base = r.estado;
        this.esquecerPendencias(); // leitura do servidor depois do commit: é a verdade
      } else {
        this.confirmados.add(r.lanceId);
        this.base = { ...this.base, lances: [...this.base.lances, { id: r.lanceId, jogadorId: e.jogadorId, tipo: e.lance }] };
      }
      // Desfazer pendente deste toque: agora se sabe o id do lance que ele vai tirar.
      this.escritas = this.escritas.map((x) => (desteToque(x) ? { ...x, alvo: { lanceId: r.lanceId } } : x));
    } else {
      // O toque não gravou: o Desfazer dele não tem o que tirar.
      this.escritas = this.escritas.filter((x) => !desteToque(x));
      this.avisar(r.erro);
    }
    this.aceitarPagina();
    this.emitir();
  }

  private async enviarDesfazer(chave: number) {
    const e = this.escritas.find((x) => x.chave === chave);
    if (!e || e.tipo !== 'desfazer' || 'toque' in e.alvo) return; // caiu junto com um toque recusado
    const id = e.alvo.lanceId;
    const r = await this.escritor.desfazer(id).catch(() => FALHA);
    this.escritas = this.escritas.filter((x) => x.chave !== chave);
    if (r.ok) {
      if (r.estado) {
        this.base = r.estado;
        this.esquecerPendencias();
      } else if (r.desfeito) {
        // Sem leitura, mas o servidor apagou: tira o lance da base.
        this.confirmados.delete(id);
        this.desfeitos.add(id);
        this.base = { ...this.base, lances: this.base.lances.filter((l) => l.id !== id) };
      }
      // Não era mais o último (o outro admin anotou depois): o servidor não mexeu em nada.
      if (this.base.lances.some((l) => l.id === id)) {
        this.avisar('Não deu para desfazer: entrou um lance depois desse. Confira o placar.');
      }
    } else {
      this.avisar(r.erro);
    }
    this.aceitarPagina();
    this.emitir();
  }

  private esquecerPendencias() {
    this.confirmados.clear();
    this.desfeitos.clear();
    this.recusadas = 0;
    this.ultimaRecusada = null;
  }

  private aceitarPagina(): boolean {
    if (this.escritas.length || this.pagina.lidoEm <= this.base.lidoEm) return false;
    const ids = new Set(this.pagina.lances.map((l) => l.id));
    // Página sem um lance confirmado (ou ainda com um desfeito) é anterior ao commit: espera outra.
    if ([...this.confirmados].some((id) => !ids.has(id)) || [...this.desfeitos].some((id) => ids.has(id))) {
      // A trava expira: se duas páginas seguidas (leituras diferentes) discordam, o servidor mudou
      // por outro caminho e a página vale mais que a memória daqui.
      if (this.ultimaRecusada !== this.pagina.lidoEm) {
        this.ultimaRecusada = this.pagina.lidoEm;
        if (++this.recusadas < 2) return false;
      } else return false;
    }
    this.base = this.pagina;
    this.esquecerPendencias();
    return true;
  }

  private avisar(texto: string) {
    this.aviso = { tipo: 'erro', texto, n: ++this.avisos };
  }

  private montar(): Instantaneo {
    return { ...derivar(this.base, this.escritas), estado: this.base, aviso: this.aviso, lento: this.lentas.size > 0 };
  }

  /** Um relógio de 10 s por escrita na fila; escrita que saiu da fila leva o relógio (e o aviso) embora. */
  private vigiarLentidao() {
    const naFila = new Set(this.escritas.map((e) => e.chave));
    for (const [chave, t] of this.relogios) {
      if (naFila.has(chave)) continue;
      clearTimeout(t);
      this.relogios.delete(chave);
      this.lentas.delete(chave);
    }
    for (const chave of naFila) {
      if (this.relogios.has(chave)) continue;
      this.relogios.set(
        chave,
        setTimeout(() => {
          if (!this.relogios.has(chave)) return;
          this.lentas.add(chave);
          this.emitir();
        }, ESCRITA_LENTA_MS),
      );
    }
  }

  private emitir() {
    this.vigiarLentidao();
    this.atual = this.montar();
    for (const o of this.ouvintes) o();
  }
}
