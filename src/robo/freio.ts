import { dataDe } from '@/domain/tempo';

export const LIMITE_PERGUNTAS = 30;
export const TEXTO_LIMITE = '🛑 Por hoje acabaram as perguntas livres. Os comandos continuam: lista, falta confirmar, fila.';

/** Contra enxurrada: no máximo 10 respostas em 60 s corridos no grupo. */
export const LIMITE_RESPOSTAS = 10;
export const TEXTO_MUITA_GENTE = '🙏 Muita gente me chamando agora. Mande de novo daqui a pouco.';

const MINUTO_MS = 60_000;

/**
 * Sem espera entre uma resposta e outra: só um teto de 10 respostas em 60 s corridos, um aviso de
 * "muita gente" por 60 s (que não conta nas 10) e 30 perguntas livres por dia (dia de Recife).
 */
export class Freio {
  private respostas: number[] = [];
  private ultimoAviso: number | null = null;
  private dia = '';
  private perguntas = 0;

  constructor(private readonly agora: () => Date) {}

  podeResponder(): boolean {
    const agora = this.agora().getTime();
    this.respostas = this.respostas.filter((t) => agora - t < MINUTO_MS);
    return this.respostas.length < LIMITE_RESPOSTAS;
  }

  registrarResposta(): void {
    this.respostas.push(this.agora().getTime());
  }

  /** O aviso de "muita gente" sai no máximo uma vez a cada 60 s. */
  podeAvisar(): boolean {
    return this.ultimoAviso === null || this.agora().getTime() - this.ultimoAviso >= MINUTO_MS;
  }

  registrarAviso(): void {
    this.ultimoAviso = this.agora().getTime();
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
