// Diário das conversas do robô: o que chegou e o que saiu, um arquivo por dia, só no Mac.
// Serve só para a auto-revisão melhorar o robô; por isso fica 7 dias e some.
import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { dataDe } from '@/domain/tempo';

export const PASTA_DO_DIARIO = join(homedir(), 'Library/Logs/PeladaRobo/conversas');

/** Uma conversa: nome de quem falou (nunca telefone), o texto que chegou e as mensagens que saíram. */
export type EntradaDoDiario = {
  quando: string;
  onde: 'grupo' | 'privado';
  quem: string | null;
  recebido: string;
  enviado: string[];
  erro?: string;
};

/** Acrescenta a conversa no arquivo do dia (de Recife). Nunca lança: o diário não pode atrapalhar a resposta. */
export function registrarConversa(pasta: string, e: EntradaDoDiario): void {
  try {
    mkdirSync(pasta, { recursive: true });
    appendFileSync(join(pasta, `${dataDe(new Date(e.quando))}.jsonl`), `${JSON.stringify(e)}\n`);
  } catch (err) {
    console.error(`diário não gravou: ${(err as Error).message}`);
  }
}

/** Apaga os dias com mais de `dias` dias; devolve os arquivos apagados. */
export function limparDiario(pasta: string, agora: Date, dias = 7): string[] {
  const limite = dataDe(new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000));
  let nomes: string[];
  try {
    nomes = readdirSync(pasta);
  } catch {
    return [];
  }
  const velhos = nomes.filter((n) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n) && n.slice(0, 10) < limite).sort();
  for (const n of velhos) rmSync(join(pasta, n), { force: true });
  return velhos;
}
