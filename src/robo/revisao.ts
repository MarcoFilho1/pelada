// Auto-revisão: o robô conversa com a revisão agendada (Claude Code) e com o script de merge por
// arquivos numa pasta de troca. Aqui só a leitura desses arquivos e os textos para o dono.
//   resultado.json  a revisão escreve no fim (sempre: nada, pr ou falhou)
//   pendente.json   revisão com PR esperando o "pode mergear"
//   mergeando.json  o "pode mergear" chegou e o script de merge está rodando
//   merge.json      o script de merge escreve no fim (ok ou falhou)
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from '@/db/client';
import { normalizarNome } from '@/domain/nome';
import { apagarRecado, gravarRecado, lerRecado, tirarRecado } from '@/server/ponte-do-robo';

export type Problema = { vi: string; corrigi: string };
export type ResultadoDaRevisao = { quando: string; status: 'nada' | 'pr' | 'falhou'; pr?: number; url?: string; problemas?: Problema[]; motivo?: string };
export type ResultadoDoMerge = { quando: string; status: 'ok' | 'falhou'; pr: number; motivo?: string };

const ESPERA_DO_MERGE_MS = 30 * 60_000;

/** Só a frase "pode mergear" (sem ligar para acento, caixa, espaços e ponto no fim). */
export function ehPodeMergear(texto: string): boolean {
  return normalizarNome(texto).replace(/[!.\s]+/g, ' ').trim() === 'pode mergear';
}

/** As mensagens para o dono, uma por parte. */
export function avisoDaRevisao(r: ResultadoDaRevisao): string[] {
  if (r.status === 'nada') return ['🔎 Revisão de hoje: nada a melhorar. Tudo certo por aqui.'];
  if (r.status === 'falhou') return [`⚠️ A revisão de hoje falhou: ${r.motivo ?? 'sem motivo informado'}.`];
  const problemas = r.problemas ?? [];
  return [
    `🔎 Revisão de hoje: achei ${problemas.length} ${problemas.length === 1 ? 'coisa' : 'coisas'} para melhorar.`,
    ...problemas.map((p, i) => `${i + 1}. O que vi: ${p.vi}\nComo corrigi: ${p.corrigi}`),
    `PR: ${r.url ?? `#${r.pr}`}\n\nSe estiver bom, responda *pode mergear* que eu junto e me atualizo.`,
  ];
}

/** `noCelular`: o robô roda num celular e a correção chega pela atualização automática, não na hora. */
export function avisoDoMerge(r: ResultadoDoMerge, noCelular = false): string {
  if (r.status !== 'ok') return `⚠️ Não juntei o PR #${r.pr}: ${r.motivo ?? 'sem motivo informado'}. Nada mudou.`;
  return noCelular ? `✅ PR #${r.pr} juntado. A correção chega ao celular sozinha, na próxima busca por atualização.` : `✅ PR #${r.pr} juntado. Estou no ar com a correção.`;
}

function valido(v: unknown): v is ResultadoDaRevisao {
  if (!v || typeof v !== 'object') return false;
  const r = v as Partial<ResultadoDaRevisao>;
  if (r.status === 'nada' || r.status === 'falhou') return true;
  return r.status === 'pr' && typeof r.pr === 'number' && Array.isArray(r.problemas) && r.problemas.every((p) => typeof p?.vi === 'string' && typeof p?.corrigi === 'string');
}

export class CaixaDaRevisao {
  constructor(
    private readonly pasta: string,
    private readonly agora: () => Date,
  ) {}

  private caminho(nome: string) {
    return join(this.pasta, nome);
  }

  private lerJson(nome: string): unknown {
    return JSON.parse(readFileSync(this.caminho(nome), 'utf8'));
  }

  /** Lê e consome o resultado novo da revisão; com PR, ele fica pendente esperando o "pode mergear". */
  novoResultado(): ResultadoDaRevisao | null {
    if (!existsSync(this.caminho('resultado.json'))) return null;
    let lido: unknown = null;
    try {
      lido = this.lerJson('resultado.json');
    } catch {
      lido = null;
    }
    rmSync(this.caminho('resultado.json'), { force: true });
    if (!valido(lido)) return { quando: this.agora().toISOString(), status: 'falhou', motivo: 'o resultado da revisão veio ilegível' };
    if (lido.status === 'pr') writeFileSync(this.caminho('pendente.json'), JSON.stringify(lido));
    return lido;
  }

  /** O aviso não saiu: o resultado volta para o arquivo e a próxima volta tenta de novo. */
  devolverResultado(r: ResultadoDaRevisao): void {
    writeFileSync(this.caminho('resultado.json'), JSON.stringify(r));
  }

  /** O aviso do merge não saiu: volta para o arquivo e a próxima volta tenta de novo. */
  devolverMerge(r: ResultadoDoMerge): void {
    writeFileSync(this.caminho('merge.json'), JSON.stringify(r));
  }

  /** O "pode mergear" chegou: o PR pendente passa a "mergeando"; sem pendente, `null`. */
  comecarMerge(): number | null {
    if (!existsSync(this.caminho('pendente.json'))) return null;
    let pr: number | undefined;
    try {
      pr = (this.lerJson('pendente.json') as ResultadoDaRevisao).pr;
    } catch {
      pr = undefined;
    }
    if (typeof pr !== 'number') {
      rmSync(this.caminho('pendente.json'), { force: true });
      return null;
    }
    writeFileSync(this.caminho('mergeando.json'), JSON.stringify({ pr, desde: this.agora().toISOString() }));
    rmSync(this.caminho('pendente.json'), { force: true });
    return pr;
  }

  /** O fim do merge (ou o aviso de que ele não respondeu em 30 min); senão `null`. */
  resultadoDoMerge(): ResultadoDoMerge | null {
    if (existsSync(this.caminho('merge.json'))) {
      let r: ResultadoDoMerge | null = null;
      try {
        r = this.lerJson('merge.json') as ResultadoDoMerge;
      } catch {
        r = null;
      }
      rmSync(this.caminho('merge.json'), { force: true });
      rmSync(this.caminho('mergeando.json'), { force: true });
      return r && typeof r.pr === 'number' ? r : { quando: this.agora().toISOString(), status: 'falhou', pr: 0, motivo: 'o resultado do merge veio ilegível' };
    }
    if (!existsSync(this.caminho('mergeando.json'))) return null;
    let m: { pr?: number; desde?: string } = {};
    try {
      m = this.lerJson('mergeando.json') as typeof m;
    } catch {
      m = {};
    }
    const desde = m.desde ? new Date(m.desde).getTime() : 0;
    if (this.agora().getTime() - desde < ESPERA_DO_MERGE_MS) return null;
    rmSync(this.caminho('mergeando.json'), { force: true });
    return { quando: this.agora().toISOString(), status: 'falhou', pr: m.pr ?? 0, motivo: 'o merge não respondeu em 30 min' };
  }
}

/**
 * A mesma caixa, com o banco no lugar da pasta: é a que o robô usa quando roda num celular, longe
 * do Mac da revisão. Cada arquivo da pasta vira um recado de mesmo nome (sem o ".json").
 * A diferença está no "pode mergear": aqui o robô não roda script nenhum, só deixa o recado
 * 'pedido', que o Mac lê e atende.
 */
export class CaixaNoBanco {
  constructor(
    private readonly db: DB,
    private readonly agora: () => Date,
  ) {}

  private async ler<T>(nome: string): Promise<T | null> {
    const texto = await lerRecado(this.db, nome);
    if (texto === null) return null;
    try {
      return JSON.parse(texto) as T;
    } catch {
      return null;
    }
  }

  private gravar(nome: string, valor: unknown): Promise<void> {
    return gravarRecado(this.db, nome, JSON.stringify(valor), this.agora());
  }

  async novoResultado(): Promise<ResultadoDaRevisao | null> {
    const texto = await tirarRecado(this.db, 'resultado');
    if (texto === null) return null;
    let lido: unknown = null;
    try {
      lido = JSON.parse(texto);
    } catch {
      lido = null;
    }
    if (!valido(lido)) return { quando: this.agora().toISOString(), status: 'falhou', motivo: 'o resultado da revisão veio ilegível' };
    if (lido.status === 'pr') await this.gravar('pendente', lido);
    return lido;
  }

  devolverResultado(r: ResultadoDaRevisao): Promise<void> {
    return this.gravar('resultado', r);
  }

  devolverMerge(r: ResultadoDoMerge): Promise<void> {
    return this.gravar('merge', r);
  }

  /** O "pode mergear" chegou: o PR pendente vira o recado 'pedido' para o Mac; sem pendente, `null`. */
  async comecarMerge(): Promise<number | null> {
    const pendente = await this.ler<ResultadoDaRevisao>('pendente');
    if (!pendente) return null;
    await apagarRecado(this.db, 'pendente');
    if (typeof pendente.pr !== 'number') return null;
    const desde = this.agora().toISOString();
    await this.gravar('mergeando', { pr: pendente.pr, desde });
    await this.gravar('pedido', { pr: pendente.pr, desde });
    return pendente.pr;
  }

  async resultadoDoMerge(): Promise<ResultadoDoMerge | null> {
    const texto = await tirarRecado(this.db, 'merge');
    if (texto !== null) {
      await apagarRecado(this.db, 'mergeando');
      let r: ResultadoDoMerge | null = null;
      try {
        r = JSON.parse(texto) as ResultadoDoMerge;
      } catch {
        r = null;
      }
      return r && typeof r.pr === 'number' ? r : { quando: this.agora().toISOString(), status: 'falhou', pr: 0, motivo: 'o resultado do merge veio ilegível' };
    }
    const m = await this.ler<{ pr?: number; desde?: string }>('mergeando');
    if (!m) return null;
    const desde = m.desde ? new Date(m.desde).getTime() : 0;
    if (this.agora().getTime() - desde < ESPERA_DO_MERGE_MS) return null;
    await apagarRecado(this.db, 'mergeando');
    await apagarRecado(this.db, 'pedido');
    return { quando: this.agora().toISOString(), status: 'falhou', pr: m.pr ?? 0, motivo: 'o merge não respondeu em 30 min' };
  }
}
