// Ferramentas de organizador no privado do robô: ver e mudar notas e o link do site.
// Só os números de `ROBO_ADMINS` chegam aqui (quem confere é o `responder`).
import type { DB } from '@/db/client';
import { acharJogador, sugerirNome } from '@/domain/nome';
import { formatarNota } from '@/domain/sorteio';
import { atualizarJogador, listarJogadores, notaValida } from '@/server/jogadores';
import { juntarNomes } from './foto';

export const URL_SITE_PADRAO = 'https://pelada-black.vercel.app';
const MAX_ECO = 30;
const eco = (t: string) => (t.length > MAX_ECO ? `${t.slice(0, MAX_ECO)}…` : t);
const notaZap = (n: number) => String(n).replace('.', ',');

/** `ROBO_URL_SITE` (opcional), sem a barra do fim; sem ele, o endereço do site no ar. */
export function urlDoSite(env: Record<string, string | undefined>): string {
  return (env.ROBO_URL_SITE?.trim() || URL_SITE_PADRAO).replace(/\/+$/, '');
}

export const textoDoSite = (url: string) => `🌐 Site da pelada: ${url}\n🔐 Área dos organizadores: ${url}/admin`;

/** Todos os jogadores ativos com a nota, em ordem alfabética. */
export async function textoDasNotas(db: DB): Promise<string> {
  const ativos = await listarJogadores(db, { incluirInativos: false });
  if (!ativos.length) return '📋 Nenhum jogador ativo cadastrado.';
  return [`📋 Notas (${ativos.length} jogadores):`, ...ativos.map((j) => `${j.nome} ${formatarNota(j.nota)}`)].join('\n');
}

/** Muda a nota de um jogador ativo achado pelo nome (como o `adicionar`), pela mesma função do site. */
export async function mudarNota(db: DB, texto: string, nota: number): Promise<{ texto: string; mudou: boolean }> {
  if (!notaValida(nota)) return { texto: `⚠️ Nota inválida: ${notaZap(nota)}. Use de 0 a 5, de 0,5 em 0,5.`, mudou: false };
  const ativos = await listarJogadores(db, { incluirInativos: false });
  const achado = acharJogador(texto, ativos);
  if (!achado) {
    const sugestao = sugerirNome(texto, ativos);
    return { texto: sugestao ? `🤔 Não achei "${eco(texto)}". Você quis dizer ${sugestao.nome}?` : `🤔 ${eco(texto)} não está cadastrado.`, mudou: false };
  }
  if ('varios' in achado) return { texto: `🤔 Tem mais de um jogador com esse nome: ${juntarNomes(achado.varios.map((j) => j.nome))}. Mande o nome inteiro.`, mudou: false };
  const j = achado.jogador;
  if (j.nota === nota) return { texto: `👍 ${j.nome} já está com nota ${formatarNota(nota)}.`, mudou: false };
  await atualizarJogador(db, j.id, { nota });
  return { texto: `✅ Nota de ${j.nome}: ${formatarNota(j.nota)} → ${formatarNota(nota)}.`, mudou: true };
}
