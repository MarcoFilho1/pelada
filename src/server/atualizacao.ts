import { eq } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { roboManifesto } from '@/db/schema';

// O manifesto das atualizações do robô que roda num celular. O site só guarda e entrega: quem
// garante que uma versão é legítima é a assinatura de cada item, conferida pelo app com a chave
// pública que ele tem. Os arquivos em si (o robô, o APK) ficam num armazenamento de arquivos, em
// endereços que só aparecem dentro do manifesto.

const ID = 'atual';
const HEX64 = /^[0-9a-f]{64}$/;

/** `novidades`: o que mudou, em palavras do dono, para o app mostrar. Só texto: fica fora da assinatura. */
type Item = { versao: string; numero: number; url: string; sha256: string; assinatura: string; novidades?: string[] };
const MAX_NOVIDADES = 8;
const MAX_LETRAS_DA_NOVIDADE = 200;

/** As novidades que vieram no item: só texto, sem linha vazia, no máximo 8 de 200 letras. */
function novidadesDe(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is string => typeof l === 'string')
    .map((l) => l.trim().slice(0, MAX_LETRAS_DA_NOVIDADE))
    .filter(Boolean)
    .slice(0, MAX_NOVIDADES);
}
export type Manifesto = { robo?: Item; app?: Item; app_minimo?: number };

function itemValido(v: unknown): v is Item {
  if (typeof v !== 'object' || v === null) return false;
  const i = v as Record<string, unknown>;
  return (
    typeof i.versao === 'string' &&
    /^[A-Za-z0-9._+-]{1,64}$/.test(i.versao) &&
    typeof i.numero === 'number' &&
    Number.isSafeInteger(i.numero) &&
    i.numero > 0 &&
    typeof i.url === 'string' &&
    i.url.startsWith('https://') &&
    i.url.length <= 500 &&
    typeof i.sha256 === 'string' &&
    HEX64.test(i.sha256) &&
    typeof i.assinatura === 'string' &&
    i.assinatura.length > 0 &&
    i.assinatura.length <= 200
  );
}

/** Confere o formato e fica só com os campos conhecidos. `null` se não é um manifesto. Pura. */
export function limparManifesto(bruto: unknown): Manifesto | null {
  if (typeof bruto !== 'object' || bruto === null || Array.isArray(bruto)) return null;
  const b = bruto as Record<string, unknown>;
  if (b.robo === undefined && b.app === undefined) return null;
  if (b.robo !== undefined && !itemValido(b.robo)) return null;
  if (b.app !== undefined && !itemValido(b.app)) return null;
  const item = (i: Item): Item => {
    const novidades = novidadesDe(i.novidades);
    return { versao: i.versao, numero: i.numero, url: i.url, sha256: i.sha256, assinatura: i.assinatura, ...(novidades.length ? { novidades } : {}) };
  };
  return {
    ...(b.robo ? { robo: item(b.robo as Item) } : {}),
    ...(b.app ? { app: item(b.app as Item) } : {}),
    ...(typeof b.app_minimo === 'number' && Number.isSafeInteger(b.app_minimo) && b.app_minimo > 0 ? { app_minimo: b.app_minimo } : {}),
  };
}

export async function gravarManifesto(db: DB, manifesto: Manifesto, agora: Date): Promise<void> {
  const conteudo = JSON.stringify(manifesto);
  await db
    .insert(roboManifesto)
    .values({ id: ID, conteudo, atualizadoEm: agora })
    .onConflictDoUpdate({ target: roboManifesto.id, set: { conteudo, atualizadoEm: agora } });
}

export async function lerManifesto(db: DB): Promise<Manifesto | null> {
  const [linha] = await db.select().from(roboManifesto).where(eq(roboManifesto.id, ID)).limit(1);
  return linha ? (JSON.parse(linha.conteudo) as Manifesto) : null;
}
