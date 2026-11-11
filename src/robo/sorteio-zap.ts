import { desc, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { peladas } from '@/db/schema';
import { CORES, diferenca, formatarNota, sortearComCompletes } from '@/domain/sorteio';
import { dataDe } from '@/domain/tempo';
import { mensagemParaUsuario } from '@/server/erros';
import { participantesPadrao, salvarTimesDefinitivos } from '@/server/times';

export const TEXTO_SO_ADMIN = '🔐 Só os organizadores podem sortear pelo WhatsApp.';

/** Mesma regra do site: o sorteio completa cada time com COMPLETE até 4. */
const POR_TIME = 4;
export const VALIDADE_MS = 10 * 60_000;

export type Proposta = {
  adminTelefone: string;
  criadaEm: Date;
  peladaId: number;
  /** Ids dos jogadores por time, na ordem das cores. */
  elencos: number[][];
  /** Notas dos COMPLETE de cada time, alinhadas com `elencos`. */
  completes: number[][];
  texto: string;
};

/** Forma única do número: só dígitos, sem 55 e sem o 9 extra do celular depois do DDD. */
function canonico(telefone: string): string {
  let d = telefone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d.length === 10 ? d : '';
}

/**
 * Quem manda vem do WhatsApp com código do país (12 ou 13 dígitos começando com 55); sem isso o DDD 81
 * se confundiria com o +81 do Japão. A tolerância (sem 55, sem o 9) vale só para o cadastro dos admins.
 */
function canonicoRemetente(telefone: string): string {
  const d = telefone.replace(/\D/g, '');
  return /^55\d{10,11}$/.test(d) ? canonico(d) : '';
}

export function ehAdmin(telefone: string, admins: string[]): boolean {
  const t = canonicoRemetente(telefone);
  return t !== '' && admins.some((a) => canonico(a) === t);
}

/** Textos de erro do site que mandam recarregar a página viram algo que faz sentido no WhatsApp. */
export function paraWhatsApp(texto: string): string {
  return `⚠️ ${texto.replace(/Recarregue a página\./g, 'Tente de novo.')}`;
}

export const EMOJI_COR: Record<string, string> = { azul: '🔵', laranja: '🟠', verde: '🟢', preto: '⚫' };
const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Propõe os times da noite (mesma regra do site) sem gravar nada. */
export async function proporSorteio(
  db: DB,
  now: Date,
  adminTelefone: string,
  rng: () => number = Math.random,
): Promise<Proposta | { erro: string }> {
  const hoje = dataDe(now);
  // Só lê e só a pelada de hoje: o `peladaDoDia` do site cria a da quarta e, nos outros dias, devolve a última.
  const [p] = await db.select().from(peladas).where(lte(peladas.data, hoje)).orderBy(desc(peladas.data)).limit(1);
  if (!p || p.data !== hoje) return { erro: '📅 Hoje não tem pelada para sortear.' };

  const participantes = await participantesPadrao(db, p.id, now);
  if (participantes.length < 2) return { erro: '👥 Poucos confirmados para sortear.' };

  const sorteados = sortearComCompletes(participantes, { times: Math.min(CORES.length, participantes.length), porTime: POR_TIME, rng });
  const blocos = sorteados.map((t, i) =>
    [
      `${EMOJI_COR[CORES[i]]} ${maiuscula(CORES[i])} (${formatarNota(t.soma)})`,
      ...t.jogadores.map((j) => `- ${j.nome} ${formatarNota(j.nota)}`),
      ...t.completes.map((n) => `- COMPLETE ${formatarNota(n)}`),
    ].join('\n'),
  );
  const texto = `🎲 Times sorteados:\n\n${blocos.join('\n\n')}\n\nDiferença: ${formatarNota(diferenca(sorteados))}\nConfirma? Responda *sim* em até 10 minutos ✅`;
  return {
    adminTelefone,
    criadaEm: now,
    peladaId: p.id,
    elencos: sorteados.map((t) => t.jogadores.map((j) => j.id)),
    completes: sorteados.map((t) => t.completes),
    texto,
  };
}

/** Grava a proposta como times definitivos, só se for o mesmo admin e dentro de 10 minutos. */
export async function confirmarSorteio(
  db: DB,
  now: Date,
  telefone: string,
  proposta: Proposta | null,
): Promise<{ ok: string } | { erro: string }> {
  if (!proposta) return { erro: '🤔 Não tem sorteio esperando confirmação.' };
  const quem = canonicoRemetente(telefone);
  if (quem === '' || quem !== canonico(proposta.adminTelefone)) return { erro: '🔐 Só quem pediu o sorteio pode confirmar.' };
  if (now.getTime() - proposta.criadaEm.getTime() >= VALIDADE_MS) return { erro: '⌛ A proposta expirou. Peça *sortear* de novo.' };
  try {
    const hoje = new Set((await participantesPadrao(db, proposta.peladaId, now)).map((j) => j.id));
    const propostos = proposta.elencos.flat();
    if (hoje.size !== propostos.length || !propostos.every((id) => hoje.has(id))) {
      return { erro: '🔄 A lista mudou desde o sorteio. Peça *sortear* de novo.' };
    }
    await salvarTimesDefinitivos(db, proposta.peladaId, proposta.elencos, proposta.completes, now);
  } catch (e) {
    return { erro: paraWhatsApp(mensagemParaUsuario(e)) };
  }
  return { ok: '🏆 Times definitivos salvos!' };
}
