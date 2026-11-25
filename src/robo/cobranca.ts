// O Pix dos diaristas depois da pelada: o lembrete no grupo, quem já mandou comprovante e o aviso
// para o dono da pelada no privado (agrupado: um comprovante espera uns minutos pelos próximos).
// Tudo puro: quem lê o comprovante (IA) e quem envia ficam no `principal`.
import { normalizarNome } from '@/domain/nome';
import { diaMes } from '@/domain/tempo';

export type Diarista = { jogadorId: number; nome: string };

export type Pagamento = {
  /** `null`: comprovante que o robô não conseguiu ligar a um diarista. */
  jogadorId: number | null;
  /** O diarista ou, sem dono, como a pessoa aparece no WhatsApp. */
  nome: string;
  quando: string;
  mensagemId: string;
  /** Nome de quem pagou, lido no comprovante. */
  pagador?: string | null;
  valor?: number | null;
};

export type Cobranca = {
  /** A noite da pelada ('YYYY-MM-DD'). */
  data: string;
  /** Até quando um comprovante no grupo conta (ISO). */
  ate: string;
  diaristas: Diarista[];
  pagos: Pagamento[];
  /** Quando mandar o próximo aviso ao dono (ISO); `null`: nada novo para avisar. */
  avisarDonoEm: string | null;
  /** Imagens já olhadas pela IA (há um teto por noite). */
  analisadas: number;
};

export type Pix = { valor: string; chave: string };

/** Espera depois de um comprovante, juntando os que chegarem, antes de avisar o dono. */
export const ESPERA_AVISO_DONO_MS = 3 * 60_000;
/** Teto de imagens que a IA olha por noite (custo). */
export const MAX_ANALISES = 40;

// Recife é sempre UTC-03:00 (sem horário de verão), como em tempo.ts.
const OFFSET_RECIFE_MS = -3 * 60 * 60 * 1000;

/** Comprovante conta até as 23:00 (Recife) do dia seguinte à pelada. */
export function prazoDaCobranca(data: string): Date {
  return new Date(Date.parse(`${data}T23:00:00Z`) - OFFSET_RECIFE_MS + 24 * 60 * 60 * 1000);
}

/** O próximo 07:05 de Recife depois de `now` (o ZapGate não começa conversa entre 22:00 e 07:00). */
export function proximaManha(now: Date): Date {
  const local = new Date(now.getTime() + OFFSET_RECIFE_MS);
  const alvo = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 7, 5) - OFFSET_RECIFE_MS;
  return new Date(alvo > now.getTime() ? alvo : alvo + 24 * 60 * 60 * 1000);
}

/** "Ana", "Ana e Bia", "Ana, Bia e Caio". */
function nomes(ls: string[]): string {
  return ls.length <= 1 ? (ls[0] ?? '') : `${ls.slice(0, -1).join(', ')} e ${ls[ls.length - 1]}`;
}

export function novaCobranca(data: string, diaristas: Diarista[]): Cobranca {
  return { data, ate: prazoDaCobranca(data).toISOString(), diaristas, pagos: [], avisarDonoEm: null, analisadas: 0 };
}

export function cobrancaAtiva(c: Cobranca | null | undefined, now: Date): c is Cobranca {
  return !!c && now < new Date(c.ate);
}

export function textoDoLembrete(diaristas: Diarista[], pix: Pix, ontem = false): string {
  return [
    `💸 Diaristas de ${ontem ? 'ontem' : 'hoje'}: ${nomes(diaristas.map((d) => d.nome))}`,
    `Pix de R$ ${pix.valor} pra chave ${pix.chave}`,
    'Depois manda o comprovante aqui no grupo',
  ].join('\n');
}

const pedacos = (s: string) => normalizarNome(s).split(' ').filter(Boolean);

/**
 * O diarista desta mensagem. Tenta, em ordem, cada candidato (o nome do jogador pelo telefone, o
 * nome do WhatsApp, o pagador escrito no comprovante): vale o diarista cujo nome inteiro aparece
 * no candidato ("João Pedro" em "JOAO PEDRO DA SILVA"); se nenhum, o único diarista com aquele
 * primeiro nome. Dois possíveis: ninguém (melhor perguntar ao dono do que marcar errado).
 */
export function casarDiarista(c: Cobranca, candidatos: (string | null | undefined)[]): Diarista | null {
  for (const cand of candidatos) {
    if (!cand?.trim()) continue;
    const ps = new Set(pedacos(cand));
    const inteiro = c.diaristas.filter((d) => pedacos(d.nome).every((p) => ps.has(p)));
    if (inteiro.length === 1) return inteiro[0];
    if (inteiro.length > 1) {
      // "Caio" e "Caio Lima" no comprovante "CAIO LIMA": o nome mais completo.
      const maior = Math.max(...inteiro.map((d) => pedacos(d.nome).length));
      const melhores = inteiro.filter((d) => pedacos(d.nome).length === maior);
      if (melhores.length === 1) return melhores[0];
      continue;
    }
    const primeiro = pedacos(cand)[0];
    const mesmoPrimeiro = c.diaristas.filter((d) => pedacos(d.nome)[0] === primeiro);
    if (mesmoPrimeiro.length === 1) return mesmoPrimeiro[0];
  }
  return null;
}

export function jaPagou(c: Cobranca, jogadorId: number): boolean {
  return c.pagos.some((p) => p.jogadorId === jogadorId);
}

/** Guarda o comprovante e marca o aviso ao dono (o primeiro de uma leva espera os próximos). */
export function registrarPagamento(c: Cobranca, p: Pagamento, now: Date): Cobranca {
  return {
    ...c,
    pagos: [...c.pagos, p],
    avisarDonoEm: c.avisarDonoEm ?? new Date(now.getTime() + ESPERA_AVISO_DONO_MS).toISOString(),
  };
}

export function horaDeAvisarDono(c: Cobranca | null | undefined, now: Date): boolean {
  return !!c?.avisarDonoEm && now >= new Date(c.avisarDonoEm);
}

/** A situação para o dono: quem pagou, quem falta e comprovantes sem dono. */
export function textoParaODono(c: Cobranca): string {
  const pagaram = c.diaristas.filter((d) => jaPagou(c, d.jogadorId));
  const faltam = c.diaristas.filter((d) => !jaPagou(c, d.jogadorId));
  const semDono = c.pagos.filter((p) => p.jogadorId === null);
  const linhas = [
    `💰 Pix da pelada de ${diaMes(c.data)}`,
    `✅ Pagaram (${pagaram.length}): ${pagaram.length ? nomes(pagaram.map((d) => d.nome)) : 'ninguém ainda'}`,
    `⏳ Faltam (${faltam.length}): ${faltam.length ? nomes(faltam.map((d) => d.nome)) : 'ninguém, todo mundo pagou'}`,
  ];
  if (semDono.length) {
    linhas.push(`❓ Comprovante que não sei de quem é: ${nomes(semDono.map((p) => (p.pagador ? `${p.nome} (no comprovante: ${p.pagador})` : p.nome)))}`);
  }
  return linhas.join('\n');
}
