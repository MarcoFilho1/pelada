import { createHash, timingSafeEqual } from 'node:crypto';
import { desc } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { roboSinais } from '@/db/schema';

// Sinal de vida do robô que roda num celular. O app manda de minuto em minuto; quem cuida do robô
// consulta (ou um vigia consulta por ele) e fica sabendo quando o aparelho some.

/** Sem sinal há mais que isto, o robô é dado como sumido. */
export const SUMIDO_APOS_S = 5 * 60;

/** O que o app conta. Tudo opcional: um app antigo ou novo não quebra a rota. */
export type Sinal = {
  aparelho: string;
  /** "connected", "unpaired", "logged_out"… (o estado da conta no ZapGate) */
  conta: string;
  envio: string;
  roboRodando: boolean;
  quedasDoRobo: number;
  quedasDaConexao: number;
  versaoDoRobo: string;
  versaoDoApp: string;
  simulado: boolean;
  bateria: number | null;
  carregando: boolean | null;
  /** As últimas linhas que o próprio app escreveu (ligou, caiu, atualizou). Nunca conversas. */
  notas: string[];
};

const texto = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const inteiro = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1_000_000, Math.trunc(v))) : 0);

/** Fica só com os campos conhecidos, com tamanho limitado. `null` se nem o nome do aparelho veio. Pura. */
export function limparSinal(bruto: unknown): Sinal | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  const aparelho = texto(b.aparelho, 64).trim();
  if (!aparelho) return null;
  return {
    aparelho,
    conta: texto(b.conta, 32),
    envio: texto(b.envio, 32),
    roboRodando: b.roboRodando === true,
    quedasDoRobo: inteiro(b.quedasDoRobo),
    quedasDaConexao: inteiro(b.quedasDaConexao),
    versaoDoRobo: texto(b.versaoDoRobo, 64),
    versaoDoApp: texto(b.versaoDoApp, 32),
    simulado: b.simulado === true,
    bateria: typeof b.bateria === 'number' && b.bateria >= 0 && b.bateria <= 100 ? Math.round(b.bateria) : null,
    carregando: typeof b.carregando === 'boolean' ? b.carregando : null,
    notas: Array.isArray(b.notas) ? b.notas.filter((n): n is string => typeof n === 'string').slice(-20).map((n) => n.slice(0, 300)) : [],
  };
}

/** Confere o cabeçalho `Authorization: Bearer <chave>` sem vazar tempo. Sem chave configurada, ninguém passa. Pura. */
export function chaveDoSinalConfere(cabecalho: string | null, esperada: string | undefined): boolean {
  if (!esperada || esperada.length < 24 || !cabecalho?.startsWith('Bearer ')) return false;
  const resumo = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(resumo(cabecalho.slice(7)), resumo(esperada));
}

export async function registrarSinal(db: DB, sinal: Sinal, agora: Date): Promise<void> {
  const dados = JSON.stringify(sinal);
  await db
    .insert(roboSinais)
    .values({ aparelho: sinal.aparelho, vistoEm: agora, dados })
    .onConflictDoUpdate({ target: roboSinais.aparelho, set: { vistoEm: agora, dados } });
}

export type EstadoDoSinal = { vistoEm: string; haSegundos: number; sumido: boolean; sinal: Sinal };

/** O sinal mais recente (de qualquer aparelho), ou `null` se nunca chegou nenhum. */
export async function lerSinal(db: DB, agora: Date): Promise<EstadoDoSinal | null> {
  const [linha] = await db.select().from(roboSinais).orderBy(desc(roboSinais.vistoEm)).limit(1);
  if (!linha) return null;
  const haSegundos = Math.max(0, Math.round((agora.getTime() - linha.vistoEm.getTime()) / 1000));
  return { vistoEm: linha.vistoEm.toISOString(), haSegundos, sumido: haSegundos > SUMIDO_APOS_S, sinal: JSON.parse(linha.dados) as Sinal };
}

/** Uma frase sobre o que precisa de atenção, ou `null` se está tudo certo. Pura. */
export function problemaDoSinal(e: EstadoDoSinal | null): string | null {
  if (!e) return 'O robô do celular nunca mandou sinal.';
  if (e.sumido) return `O robô do celular sumiu: o último sinal foi há ${Math.round(e.haSegundos / 60)} min.`;
  if (e.sinal.conta !== 'connected') return `O celular está no ar, mas o WhatsApp não está conectado (${e.sinal.conta || 'sem estado'}).`;
  if (!e.sinal.roboRodando) return 'O WhatsApp está conectado, mas o robô não está rodando.';
  return null;
}
