import { desc, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { peladas } from '@/db/schema';
import { CORES, diferenca, formatarNota, sortearComCompletes } from '@/domain/sorteio';
import { dataDe, proximaQuarta } from '@/domain/tempo';
import { mensagemParaUsuario } from '@/server/erros';
import { participantesPadrao, salvarTimesDefinitivos } from '@/server/times';

export const TEXTO_SO_ADMIN = 'Só os organizadores podem sortear pelo WhatsApp.';

/** Mesma regra do site: o sorteio completa cada time com COMPLETE até 4. */
const POR_TIME = 4;
const VALIDADE_MS = 10 * 60_000;

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

export function ehAdmin(telefone: string, admins: string[]): boolean {
  const t = canonico(telefone);
  return t !== '' && admins.some((a) => canonico(a) === t);
}

const maiuscula = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Propõe os times da noite (mesma regra do site) sem gravar nada. */
export async function proporSorteio(
  db: DB,
  now: Date,
  adminTelefone: string,
  rng: () => number = Math.random,
): Promise<Proposta | { erro: string }> {
  const hoje = dataDe(now);
  // Só lê: o `peladaDoDia` do site cria a pelada da quarta se ninguém abriu a lista, e aqui isso seria escrita.
  const [p] = await db.select().from(peladas).where(lte(peladas.data, hoje)).orderBy(desc(peladas.data)).limit(1);
  if (!p || (p.data !== hoje && proximaQuarta(now) === hoje)) return { erro: 'Hoje não tem pelada para sortear.' };

  const participantes = await participantesPadrao(db, p.id, now);
  if (participantes.length < 2) return { erro: 'Poucos confirmados para sortear.' };

  const sorteados = sortearComCompletes(participantes, { times: Math.min(CORES.length, participantes.length), porTime: POR_TIME, rng });
  const blocos = sorteados.map((t, i) =>
    [
      `${maiuscula(CORES[i])} (${formatarNota(t.soma)})`,
      ...t.jogadores.map((j) => `- ${j.nome} ${formatarNota(j.nota)}`),
      ...t.completes.map((n) => `- COMPLETE ${formatarNota(n)}`),
    ].join('\n'),
  );
  const texto = `${blocos.join('\n\n')}\n\nDiferença: ${formatarNota(diferenca(sorteados))}\nConfirma? Responda *sim* em até 10 minutos.`;
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
  if (!proposta) return { erro: 'Não tem sorteio esperando confirmação.' };
  const quem = canonico(telefone);
  if (quem === '' || quem !== canonico(proposta.adminTelefone)) return { erro: 'Só quem pediu o sorteio pode confirmar.' };
  if (now.getTime() - proposta.criadaEm.getTime() >= VALIDADE_MS) return { erro: 'A proposta expirou. Peça *sortear* de novo.' };
  try {
    await salvarTimesDefinitivos(db, proposta.peladaId, proposta.elencos, proposta.completes, now);
  } catch (e) {
    return { erro: mensagemParaUsuario(e) };
  }
  return { ok: 'Times definitivos salvos.' };
}
