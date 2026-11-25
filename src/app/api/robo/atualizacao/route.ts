import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { gravarManifesto, lerManifesto, limparManifesto } from '@/server/atualizacao';
import { chaveConfere } from '@/server/sinal';

// O manifesto das atualizações do robô do celular (docs/android.md).
//   GET  o app pergunta se há versão nova. Chave: ROBO_ATUALIZACAO_CHAVE (vai no pacote do aparelho).
//   PUT  quem cuida do robô publica um manifesto novo. Chave: ROBO_PUBLICAR_CHAVE (só no computador dele).
// São duas chaves de propósito: a do aparelho só lê. E mesmo quem publica não consegue empurrar
// código sem a chave de assinatura, que o site nunca vê.

const TAMANHO_MAXIMO = 8 * 1024;
const semCache = { 'Cache-Control': 'no-store' };
const cabecalho = (req: NextRequest) => req.headers.get('authorization');

export async function GET(req: NextRequest) {
  const podeLer = chaveConfere(cabecalho(req), process.env.ROBO_ATUALIZACAO_CHAVE) || chaveConfere(cabecalho(req), process.env.ROBO_PUBLICAR_CHAVE);
  if (!podeLer) return NextResponse.json({ erro: 'chave' }, { status: 401, headers: semCache });
  const manifesto = await lerManifesto(getDb());
  if (!manifesto) return NextResponse.json({ erro: 'nada_publicado' }, { status: 404, headers: semCache });
  return NextResponse.json(manifesto, { headers: semCache });
}

export async function PUT(req: NextRequest) {
  if (!chaveConfere(cabecalho(req), process.env.ROBO_PUBLICAR_CHAVE)) return NextResponse.json({ erro: 'chave' }, { status: 401, headers: semCache });
  const corpo = await req.text();
  if (corpo.length > TAMANHO_MAXIMO) return NextResponse.json({ erro: 'grande' }, { status: 413, headers: semCache });
  let bruto: unknown;
  try {
    bruto = JSON.parse(corpo);
  } catch {
    return NextResponse.json({ erro: 'formato' }, { status: 400, headers: semCache });
  }
  const manifesto = limparManifesto(bruto);
  if (!manifesto) return NextResponse.json({ erro: 'formato' }, { status: 400, headers: semCache });
  await gravarManifesto(getDb(), manifesto, new Date());
  return NextResponse.json({ ok: true }, { headers: semCache });
}
