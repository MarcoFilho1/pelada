export type ResultadoSalvar = { ok: true } | { ok: false; erro: string };

/**
 * Salva notas com espera: vários toques seguidos no mesmo jogador viram um pedido só,
 * mas nada se perde: `descarregar()` manda na hora o que ainda espera (ao sair da tela
 * ou esconder a aba). Pedidos do mesmo jogador seguem em fila, na ordem dos toques.
 */
export class SalvadorDeNotas {
  private esperando = new Map<number, { nota: number; timer: ReturnType<typeof setTimeout> }>();
  private fila = new Map<number, Promise<void>>();
  private emVoo = new Map<number, number>();

  constructor(
    private salvar: (id: number, nota: number) => Promise<ResultadoSalvar>,
    private aoTerminar: (id: number, r: ResultadoSalvar) => void,
    private esperaMs = 500,
  ) {}

  agendar(id: number, nota: number): void {
    const antigo = this.esperando.get(id);
    if (antigo) clearTimeout(antigo.timer);
    const timer = setTimeout(() => this.enviar(id), this.esperaMs);
    this.esperando.set(id, { nota, timer });
  }

  /** Manda agora tudo que ainda espera. */
  descarregar(): void {
    for (const id of [...this.esperando.keys()]) this.enviar(id);
  }

  /** Há toque esperando ou pedido a caminho para este jogador. */
  ocupado(id: number): boolean {
    return this.esperando.has(id) || (this.emVoo.get(id) ?? 0) > 0;
  }

  private enviar(id: number): void {
    const item = this.esperando.get(id);
    if (!item) return;
    clearTimeout(item.timer);
    this.esperando.delete(id);
    this.emVoo.set(id, (this.emVoo.get(id) ?? 0) + 1);
    const anterior = this.fila.get(id) ?? Promise.resolve();
    const atual = anterior.then(async () => {
      let r: ResultadoSalvar;
      try {
        r = await this.salvar(id, item.nota);
      } catch {
        r = { ok: false, erro: 'Não deu para salvar a nota. Tente de novo.' };
      }
      const restam = (this.emVoo.get(id) ?? 1) - 1;
      if (restam > 0) this.emVoo.set(id, restam);
      else this.emVoo.delete(id);
      this.aoTerminar(id, r);
    });
    this.fila.set(id, atual);
  }
}
