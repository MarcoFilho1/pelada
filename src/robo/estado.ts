import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { rodadaDe, type EstadoDoRobo, type TipoMensagem } from './agenda';
import type { FotoDaLista } from './foto';

/** Pasta do robô no Mac (fora do repositório): `estado.json`, `auth/` e `.env`. */
export function pastaDoRobo(env: Record<string, string | undefined>, home: string): string {
  return env.PELADA_ROBO_DIR || join(home, 'Library', 'Application Support', 'PeladaRobo');
}

const VAZIO: EstadoDoRobo = { ultimo: null, aberturaEnviada: null, grupoId: null, grupoNome: null };

/** Lê o estado. Sem arquivo → estado vazio. Arquivo estragado → erro (nunca zera em silêncio). */
export function lerEstado(arquivo: string): EstadoDoRobo {
  if (!existsSync(arquivo)) return { ...VAZIO };
  const texto = readFileSync(arquivo, 'utf8');
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error(`O arquivo de estado do robô está corrompido: ${arquivo}. Confira ou apague o arquivo (o robô vai tratar a próxima mensagem como a primeira da semana).`);
  }
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) {
    throw new Error(`O arquivo de estado do robô está corrompido (não é um objeto): ${arquivo}.`);
  }
  const d = dados as Partial<EstadoDoRobo>;
  return {
    ultimo: d.ultimo ?? null,
    aberturaEnviada: d.aberturaEnviada ?? null,
    grupoId: d.grupoId ?? null,
    grupoNome: d.grupoNome ?? null,
  };
}

/** Grava de forma atômica: escreve num temporário na mesma pasta e renomeia por cima. */
export function gravarEstado(arquivo: string, estado: EstadoDoRobo): void {
  mkdirSync(dirname(arquivo), { recursive: true });
  const temporario = `${arquivo}.${process.pid}.tmp`;
  try {
    writeFileSync(temporario, JSON.stringify(estado, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporario, arquivo);
  } catch (err) {
    rmSync(temporario, { force: true });
    throw err;
  }
}

/** Estado depois de um envio confirmado. Pura. */
export function aposEnvio(estado: EstadoDoRobo, now: Date, tipo: TipoMensagem, foto: FotoDaLista): EstadoDoRobo {
  return {
    ...estado,
    ultimo: { quando: now.toISOString(), rodada: rodadaDe(now).toISOString(), tipo, foto },
    aberturaEnviada: tipo === 'abertura' ? foto.dataQuarta : estado.aberturaEnviada,
  };
}

/** Como mostrar o grupo escolhido ao usuário (instalar e log do laço). */
export function nomeDoGrupo(estado: EstadoDoRobo): string {
  if (!estado.grupoId) return 'nenhum grupo (rode `pnpm robo:configurar`)';
  return estado.grupoNome ? `"${estado.grupoNome}"` : `grupo ${estado.grupoId} (nome não guardado; rode \`pnpm robo:configurar\` para ver)`;
}
