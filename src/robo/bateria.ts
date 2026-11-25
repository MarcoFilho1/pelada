// Aviso de bateria baixa do aparelho onde o robô roda (docs/android.md). O app do celular escreve,
// de minuto em minuto, um arquivo pequeno com o nível e se está no carregador; o robô lê e avisa
// a cada degrau que a bateria desce. Se o aparelho desligar, o robô para: o aviso é para alguém pôr
// para carregar antes.

/** Os degraus do aviso, do mais alto ao mais baixo. */
export const DEGRAUS = [20, 15, 10, 5, 3, 2, 1] as const;

/** Leitura mais velha que isto não vale (o app parou de escrever): não avisa em cima de número antigo. */
export const VALIDADE_MS = 5 * 60_000;

export interface Leitura {
  nivel: number;
  carregando: boolean;
}

/** Lê o arquivo do app (`{"nivel":17,"carregando":false,"quando":<ms>}`). Null: ilegível ou velho. */
export function lerBateria(texto: string, agora: number): Leitura | null {
  let j: unknown;
  try {
    j = JSON.parse(texto);
  } catch {
    return null;
  }
  if (typeof j !== 'object' || j === null) return null;
  const { nivel, carregando, quando } = j as Record<string, unknown>;
  if (typeof nivel !== 'number' || !Number.isInteger(nivel) || nivel < 0 || nivel > 100) return null;
  if (typeof carregando !== 'boolean' || typeof quando !== 'number') return null;
  if (agora - quando > VALIDADE_MS || quando - agora > VALIDADE_MS) return null;
  return { nivel, carregando };
}

/** O degrau mais baixo que a bateria já alcançou (17% → 20; 4% → 5), ou null acima de 20%. */
export function degrauDe(nivel: number): number | null {
  let achado: number | null = null;
  for (const d of DEGRAUS) if (nivel <= d) achado = d;
  return achado;
}

/**
 * O que fazer com a leitura, sabendo o último degrau já avisado (null: nenhum desde a última carga).
 * No carregador ou acima de 20% a conta zera, e a próxima descida avisa tudo de novo.
 * Um aviso por degrau: de 20% a 16% é um só; ao chegar a 15% sai o seguinte.
 */
export function avisoDaBateria(l: Leitura, avisado: number | null): { avisado: number | null; texto: string | null } {
  const degrau = l.carregando ? null : degrauDe(l.nivel);
  if (degrau === null) return { avisado: null, texto: null };
  if (avisado !== null && degrau >= avisado) return { avisado, texto: null };
  return { avisado: degrau, texto: textoDaBateria(l.nivel) };
}

export function textoDaBateria(nivel: number): string {
  if (nivel <= 5) return `🪫 Bateria do celular do robô em ${nivel}%. Ponha para carregar agora: se o aparelho desligar, o robô para.`;
  return `🔋 Bateria do celular do robô em ${nivel}%. Ponha para carregar: se o aparelho desligar, o robô para.`;
}

/** Os números de `ROBO_BATERIA_AVISAR` (separados por vírgula), só os dígitos. */
export function quemAvisarDaBateria(env: Record<string, string | undefined>): string[] {
  return (env.ROBO_BATERIA_AVISAR ?? '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 10);
}
