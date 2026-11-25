import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { chaveDoSinalConfere, lerSinal, limparSinal, problemaDoSinal, registrarSinal } from '@/server/sinal';

// Sinal de vida do robô que roda num celular (docs/android.md).
//   POST  o app manda como está, de minuto em minuto.
//   GET   quem cuida (ou um vigia) pergunta: 200 se está tudo certo, 503 se sumiu ou há problema.
// As duas pedem a mesma chave (ROBO_SINAL_CHAVE, 24+ caracteres) em "Authorization: Bearer".

const TAMANHO_MAXIMO = 16 * 1024;
const semCache = { 'Cache-Control': 'no-store' };

function autorizado(req: NextRequest): boolean {
  return chaveDoSinalConfere(req.headers.get('authorization'), process.env.ROBO_SINAL_CHAVE);
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
  const sinal = limparSinal(bruto);
  if (!sinal) return NextResponse.json({ erro: 'formato' }, { status: 400, headers: semCache });
  await registrarSinal(getDb(), sinal, new Date());
  return NextResponse.json({ ok: true }, { headers: semCache });
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'chave' }, { status: 401, headers: semCache });
  const estado = await lerSinal(getDb(), new Date());
  const problema = problemaDoSinal(estado);
  return NextResponse.json({ ok: problema === null, problema, ...estado }, { status: problema === null ? 200 : 503, headers: semCache });
}
