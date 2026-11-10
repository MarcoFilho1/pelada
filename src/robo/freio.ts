import { dataDe } from '@/domain/tempo';

export const LIMITE_PERGUNTAS = 30;
export const TEXTO_LIMITE = 'Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.';

const MINUTO_MS = 60_000;

/** No máximo 1 resposta por minuto e 30 perguntas livres por dia (dia de Recife). */
export class Freio {
  private ultimaResposta: number | null = null;
  private dia = '';
  private perguntas = 0;

  constructor(private readonly agora: () => Date) {}

  podeResponder(): boolean {
    return this.ultimaResposta === null || this.agora().getTime() - this.ultimaResposta >= MINUTO_MS;
  }

  registrarResposta(): void {
    this.ultimaResposta = this.agora().getTime();
  }

  podePerguntar(): boolean {
    this.virarDia();
    return this.perguntas < LIMITE_PERGUNTAS;
  }

  registrarPergunta(): void {
    this.virarDia();
    this.perguntas += 1;
  }

  private virarDia(): void {
    const hoje = dataDe(this.agora());
    if (hoje !== this.dia) {
      this.dia = hoje;
      this.perguntas = 0;
    }
  }
}
