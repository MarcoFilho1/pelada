import { eq, sql } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { admins, jogadores } from '@/db/schema';
import { normalizarNome } from '@/domain/nome';
import { estaBloqueado, PIN_PADRAO, pinNovoValido, pinValido, registrarErro } from '@/domain/pin';
import { conferirSegredo, hashSegredo } from './senha';
import type { TokenAdmin, TokenJogador } from './token';

const MAX_SUGESTOES = 8;

// Hash bem formado que nunca confere: usado quando o usuário admin não existe,
// para a resposta levar o mesmo tempo e não revelar quais usuários existem.
const HASH_FALSO = `${'00'.repeat(16)}:${'00'.repeat(32)}`;

/**
 * Jogadores ativos cujo nome contém o termo, sem diferenciar acento nem maiúsculas
 * (quem começa com ele vem primeiro). São umas 40 linhas: filtra em JS.
 */
export async function buscarJogadoresPorNome(db: DB, termo: string): Promise<{ id: number; nome: string }[]> {
  const t = normalizarNome(termo);
  if (!t) return [];
  const ativos = await db
    .select({ id: jogadores.id, nome: jogadores.nome })
    .from(jogadores)
    .where(eq(jogadores.ativo, true));
  return ativos
    .map((j) => ({ ...j, chave: normalizarNome(j.nome) }))
    .filter((j) => j.chave.includes(t))
    .sort((x, y) => Number(y.chave.startsWith(t)) - Number(x.chave.startsWith(t)) || (x.chave < y.chave ? -1 : x.chave > y.chave ? 1 : 0))
    .slice(0, MAX_SUGESTOES)
    .map(({ id, nome }) => ({ id, nome }));
}

/** Com `pin_hash` nulo o PIN é o padrão, então a troca é obrigatória de qualquer jeito. */
function precisaTrocarPin(j: { pinPrecisaTrocar: boolean; pinHash: string | null }): boolean {
  return j.pinPrecisaTrocar || j.pinHash === null;
}

export type ResultadoEntrada =
  | { ok: true; precisaTrocar: boolean }
  | { ok: false; motivo: 'pin_errado' }
  | { ok: false; motivo: 'bloqueado'; bloqueadoAte: Date };

type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
type LinhaJogador = typeof jogadores.$inferSelect;
type Conferencia = { ok: true } | { ok: false; motivo: 'pin_errado' } | { ok: false; motivo: 'bloqueado'; bloqueadoAte: Date };

/**
 * Regra única do PIN (entrada e troca): bloqueado responde `bloqueado` sem olhar o PIN;
 * certo zera a contagem; errado conta, e o 5º seguido bloqueia por 15 min.
 * `pin_hash` nulo vale como PIN padrão. Rodar dentro da transação que travou a linha.
 */
async function conferirPin(tx: Tx, j: LinhaJogador, pin: string, now: Date): Promise<Conferencia> {
  if (j.bloqueadoAte && estaBloqueado(j.bloqueadoAte, now)) {
    return { ok: false, motivo: 'bloqueado', bloqueadoAte: j.bloqueadoAte };
  }

  const certo = pinValido(pin) && (j.pinHash === null ? pin === PIN_PADRAO : await conferirSegredo(pin, j.pinHash));

  if (certo) {
    if (j.pinErros !== 0 || j.bloqueadoAte !== null) {
      await tx.update(jogadores).set({ pinErros: 0, bloqueadoAte: null }).where(eq(jogadores.id, j.id));
    }
    return { ok: true };
  }

  const erro = registrarErro(j.pinErros, now);
  await tx.update(jogadores).set({ pinErros: erro.erros, bloqueadoAte: erro.bloqueadoAte }).where(eq(jogadores.id, j.id));
  return erro.bloqueadoAte ? { ok: false, motivo: 'bloqueado', bloqueadoAte: erro.bloqueadoAte } : { ok: false, motivo: 'pin_errado' };
}

/** Linha do jogador travada para a conferência do PIN (tentativas simultâneas contam uma de cada vez). */
async function jogadorTravado(tx: Tx, jogadorId: number): Promise<LinhaJogador | undefined> {
  const [j] = await tx.select().from(jogadores).where(eq(jogadores.id, jogadorId)).for('update');
  return j;
}

/**
 * Confere o PIN do jogador. Bloqueado: responde `bloqueado` sem olhar o PIN.
 * Até o bloqueio começar, erro é sempre `pin_errado` (não avisa quantas tentativas restam).
 * `pin_hash` nulo vale como PIN padrão (jogador novo ou PIN zerado).
 */
export async function entrarJogador(db: DB, jogadorId: number, pin: string, now: Date): Promise<ResultadoEntrada> {
  return db.transaction(async (tx) => {
    const j = await jogadorTravado(tx, jogadorId);
    if (!j || !j.ativo) return { ok: false, motivo: 'pin_errado' };
    const r = await conferirPin(tx, j, pin, now);
    return r.ok ? { ok: true, precisaTrocar: precisaTrocarPin(j) } : r;
  });
}

export type ResultadoTrocaPin = Conferencia | { ok: false; motivo: 'pin_invalido' };

/**
 * Troca pedida pelo perfil: confere o PIN atual com a mesma regra da entrada (o erro conta
 * para o bloqueio de 5 erros / 15 min) e só então grava o novo, como `trocarPin`
 * (derruba as outras sessões; quem chamou reemite o cookie deste aparelho).
 * PIN novo inválido é recusado antes, sem conferir nem contar erro.
 */
export async function trocarPinComAtual(
  db: DB,
  jogadorId: number,
  atual: string,
  novo: string,
  now: Date,
): Promise<ResultadoTrocaPin> {
  if (!pinNovoValido(novo)) return { ok: false, motivo: 'pin_invalido' };
  return db.transaction(async (tx) => {
    const j = await jogadorTravado(tx, jogadorId);
    if (!j || !j.ativo) return { ok: false, motivo: 'pin_errado' };
    const r = await conferirPin(tx, j, atual, now);
    if (!r.ok) return r;
    await tx
      .update(jogadores)
      .set({
        pinHash: await hashSegredo(novo),
        pinPrecisaTrocar: false,
        pinErros: 0,
        bloqueadoAte: null,
        sessaoVersao: sql`${jogadores.sessaoVersao} + 1`,
      })
      .where(eq(jogadores.id, j.id));
    return { ok: true };
  });
}

/**
 * Grava o PIN novo (4 dígitos, diferente de 1234) e tira a obrigação de trocar.
 * Também derruba as sessões abertas: quem entrou no perfil com 1234 antes do dono criar o
 * PIN sai. O aparelho que trocou recebe um cookie novo (`criarSessaoJogador`).
 */
export async function trocarPin(db: DB, jogadorId: number, novoPin: string): Promise<void> {
  if (!pinNovoValido(novoPin)) {
    throw new Error(`PIN novo inválido: precisa ter 4 números e não pode ser ${PIN_PADRAO}`);
  }
  const atualizados = await db
    .update(jogadores)
    .set({
      pinHash: await hashSegredo(novoPin),
      pinPrecisaTrocar: false,
      pinErros: 0,
      bloqueadoAte: null,
      sessaoVersao: sql`${jogadores.sessaoVersao} + 1`,
    })
    .where(eq(jogadores.id, jogadorId))
    .returning({ id: jogadores.id });
  if (atualizados.length === 0) throw new Error(`Jogador ${jogadorId} não encontrado`);
}

export type ResultadoEntradaAdmin =
  | { ok: true; adminId: number }
  | { ok: false; motivo: 'credenciais' }
  | { ok: false; motivo: 'bloqueado'; bloqueadoAte: Date };

/**
 * Confere usuário e senha do admin, com a mesma regra de bloqueio dos jogadores
 * (5 erros seguidos, 15 min). Usuário desconhecido gasta o mesmo tempo (hash falso)
 * e responde igual a senha errada.
 */
export async function entrarAdmin(
  db: DB,
  usuario: string,
  senha: string,
  now: Date = new Date(),
): Promise<ResultadoEntradaAdmin> {
  return db.transaction(async (tx) => {
    const [adm] = await tx.select().from(admins).where(eq(admins.usuario, usuario.trim())).for('update');
    if (!adm) {
      await conferirSegredo(senha, HASH_FALSO);
      return { ok: false, motivo: 'credenciais' };
    }
    if (adm.bloqueadoAte && estaBloqueado(adm.bloqueadoAte, now)) {
      return { ok: false, motivo: 'bloqueado', bloqueadoAte: adm.bloqueadoAte };
    }
    if (await conferirSegredo(senha, adm.senhaHash)) {
      if (adm.erros !== 0 || adm.bloqueadoAte !== null) {
        await tx.update(admins).set({ erros: 0, bloqueadoAte: null }).where(eq(admins.id, adm.id));
      }
      return { ok: true, adminId: adm.id };
    }
    const erro = registrarErro(adm.erros, now);
    await tx.update(admins).set({ erros: erro.erros, bloqueadoAte: erro.bloqueadoAte }).where(eq(admins.id, adm.id));
    return erro.bloqueadoAte
      ? { ok: false, motivo: 'bloqueado', bloqueadoAte: erro.bloqueadoAte }
      : { ok: false, motivo: 'credenciais' };
  });
}

// ---- Sessões conferidas no banco -------------------------------------------------
// O cookie (JWT) só prova quem assinou; aqui se confere se ele ainda vale.

export type SessaoJogador = { jogadorId: number; nome: string; precisaTrocar: boolean };

/** O que vai no token de um jogador que acabou de entrar; `null` se inativo ou inexistente. */
export async function dadosSessaoJogador(
  db: DB,
  jogadorId: number,
): Promise<{ nome: string; versao: number; precisaTrocar: boolean } | null> {
  const [j] = await db
    .select({
      nome: jogadores.nome,
      ativo: jogadores.ativo,
      versao: jogadores.sessaoVersao,
      pinHash: jogadores.pinHash,
      pinPrecisaTrocar: jogadores.pinPrecisaTrocar,
    })
    .from(jogadores)
    .where(eq(jogadores.id, jogadorId));
  if (!j || !j.ativo) return null;
  return { nome: j.nome, versao: j.versao, precisaTrocar: precisaTrocarPin(j) };
}

/**
 * A sessão vale se o jogador existe, está ativo e a versão do token é a atual.
 * `precisaTrocar` sai do banco (o admin pode ter zerado o PIN depois do login).
 */
export async function validarSessaoJogador(
  db: DB,
  token: TokenJogador,
): Promise<SessaoJogador | null> {
  const atual = await dadosSessaoJogador(db, token.jogadorId);
  if (!atual || atual.versao !== token.versao) return null;
  return { jogadorId: token.jogadorId, nome: atual.nome, precisaTrocar: atual.precisaTrocar };
}

/** Derruba todas as sessões do jogador, em todos os aparelhos (zerar PIN, desativar). */
export async function revogarSessoesJogador(db: DB, jogadorId: number): Promise<void> {
  const atualizados = await db
    .update(jogadores)
    .set({ sessaoVersao: sql`${jogadores.sessaoVersao} + 1` })
    .where(eq(jogadores.id, jogadorId))
    .returning({ id: jogadores.id });
  if (atualizados.length === 0) throw new Error(`Jogador ${jogadorId} não encontrado`);
}

/** Versão de sessão atual do admin; `null` se ele não existe. */
export async function versaoSessaoAdmin(db: DB, adminId: number): Promise<number | null> {
  const [adm] = await db.select({ versao: admins.sessaoVersao }).from(admins).where(eq(admins.id, adminId));
  return adm ? adm.versao : null;
}

/** A sessão vale se o admin existe e a versão do token é a atual (troca de senha derruba as outras). */
export async function validarSessaoAdmin(db: DB, token: TokenAdmin): Promise<{ adminId: number } | null> {
  const versao = await versaoSessaoAdmin(db, token.adminId);
  return versao !== null && versao === token.versao ? { adminId: token.adminId } : null;
}
