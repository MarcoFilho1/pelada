// A IA olha uma foto ou PDF mandado no grupo e diz se é um comprovante de Pix concluído, quem
// pagou e quanto. Uma pergunta curta, sem ferramentas.
import type Anthropic from '@anthropic-ai/sdk';
import type { ClienteIA } from './ia';

export type LeituraDoComprovante = { ehComprovante: boolean; pagador: string | null; valor: number | null };

const NAO: LeituraDoComprovante = { ehComprovante: false, pagador: null, valor: null };

const IMAGENS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const PERGUNTA =
  'Esta imagem é um comprovante de Pix ou transferência bancária já concluída (não um QR code, nem uma cobrança, nem outra coisa)? ' +
  'Responda só com JSON, sem mais nada: {"comprovante": true ou false, "pagador": "nome de quem pagou (quem enviou o dinheiro) ou null", "valor": valor em reais como número ou null}';

/** O JSON da resposta (tolera texto em volta); qualquer coisa estranha vale "não é comprovante". */
export function lerResposta(texto: string): LeituraDoComprovante {
  const m = /\{[\s\S]*\}/.exec(texto);
  if (!m) return NAO;
  try {
    const j = JSON.parse(m[0]) as { comprovante?: unknown; pagador?: unknown; valor?: unknown };
    if (j.comprovante !== true) return NAO;
    const pagador = typeof j.pagador === 'string' && j.pagador.trim() ? j.pagador.trim().slice(0, 80) : null;
    const valor = typeof j.valor === 'number' && Number.isFinite(j.valor) ? j.valor : null;
    return { ehComprovante: true, pagador, valor };
  } catch {
    return NAO;
  }
}

export async function lerComprovante(cliente: ClienteIA, modelo: string, bytes: Buffer, mime: string): Promise<LeituraDoComprovante> {
  const tipo = mime.split(';')[0].trim().toLowerCase();
  let anexo: Anthropic.ContentBlockParam;
  if (IMAGENS.has(tipo)) {
    anexo = { type: 'image', source: { type: 'base64', media_type: tipo as 'image/jpeg', data: bytes.toString('base64') } };
  } else if (tipo === 'application/pdf') {
    anexo = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: bytes.toString('base64') } };
  } else {
    return NAO;
  }
  const r = await cliente.messages.create({
    model: modelo,
    max_tokens: 200,
    messages: [{ role: 'user', content: [anexo, { type: 'text', text: PERGUNTA }] }],
  });
  const texto = r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return lerResposta(texto);
}
