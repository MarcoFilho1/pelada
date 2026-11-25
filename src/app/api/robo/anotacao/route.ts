import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { lerParaAnotar, limparEnvio, receberEnvio } from '@/server/anotacao-do-app';
import { chaveConfere } from '@/server/sinal';

// A anotação feita no app do celular (docs/android.md).
//   GET  ?data=AAAA-MM-DD   os times e os jogadores da pelada, para o app guardar e anotar sem internet.
//   POST                    as partidas anotadas, inteiras; mandar a mesma duas vezes não grava duas.
// As duas pedem a chave do aparelho (ROBO_SINAL_CHAVE, a mesma do sinal de vida) em "Authorization: Bearer".

const TAMANHO_MAXIMO = 512 * 1024;
const semCache = { 'Cache-Control': 'no-store' };

function autorizado(req: NextRequest): boolean {
  return chaveConfere(req.headers.get('authorization'), process.env.ROBO_SINAL_CHAVE);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'chave' }, { status: 401, headers: semCache });
  const dados = await lerParaAnotar(getDb(), req.nextUrl.searchParams.get('data') ?? '');
  if (!dados) return NextResponse.json({ erro: 'sem_pelada' }, { status: 404, headers: semCache });
  return NextResponse.json(dados, { headers: semCache });
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'chave' }, { status: 401, headers: semCache });
  const corpo = await req.text();
  if (corpo.length > TAMANHO_MAXIMO) return NextResponse.json({ erro: 'grande' }, { status: 413, headers: semCache });
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: 'formato' }, { status: 400, headers: semCache });
  }
  const envio = limparEnvio(bruto);
  if (!envio) return NextResponse.json({ erro: 'formato' }, { status: 400, headers: semCache });
  const partidas = await receberEnvio(getDb(), envio);
  if (!partidas) return NextResponse.json({ erro: 'sem_pelada' }, { status: 404, headers: semCache });
  return NextResponse.json({ ok: true, partidas }, { headers: semCache });
}
