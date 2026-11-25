// Lê uma conversa exportada pelo WhatsApp ("Exportar conversa", sem mídia) e devolve as falas de
// alguns dias, no formato do ouvido do caderno. Serve para o caderno da resenha começar com os dias
// de antes de ele existir. Pura: quem chama a IA e grava é `scripts/caderno/importar.ts`.
import { citaORobo, type FalaDoGrupo } from './caderno';

// "[25/11/26, 17:55:53] Fulano: texto" (iPhone) e "25/11/2026 17:55 - Fulano: texto" (Android).
const DO_IPHONE = /^\[(\d{2})\/(\d{2})\/(\d{2,4}),? (\d{2}):(\d{2})(?::(\d{2}))?\] ([^:]+): (.*)$/;
const DO_ANDROID = /^(\d{2})\/(\d{2})\/(\d{2,4}),? (\d{2}):(\d{2})(?::(\d{2}))? - ([^:]+): (.*)$/;
/** Linhas que o WhatsApp põe no lugar de uma mídia, de uma mensagem apagada ou de um aviso do sistema. */
const SEM_TEXTO = /^(<?(mídia|midia|media) (oculta|omitted)>?|(image|video|audio|sticker|gif|document|imagem|vídeo|áudio|figurinha|documento) (omitted|ocultad[oa])|this message was deleted\.?|you deleted this message\.?|(esta|essa) mensagem foi apagada\.?|mensagem apagada\.?|você apagou esta mensagem\.?|<attached: .*>|null)$/i;
const TELEFONE = /\+?\d[\d\s().-]{7,}\d/g;

const limpo = (t: string) => t.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/ /g, ' ');

/**
 * As falas dos `dias` pedidos ('AAAA-MM-DD'), por dia. Saem as do próprio robô (`nomeDoRobo`), as
 * mídias e as mensagens apagadas. Quem aparece só pelo telefone vira "alguém", e telefone no meio
 * do texto vira "(telefone)": nenhum número vai para a IA.
 */
export function falasDaExportacao(texto: string, dias: string[], nomeDoRobo: string): Map<string, FalaDoGrupo[]> {
  const quero = new Set(dias);
  const saida = new Map<string, FalaDoGrupo[]>(dias.map((d) => [d, []]));
  const robo = nomeDoRobo.trim().toLowerCase();
  let atual: (FalaDoGrupo & { dia: string }) | null = null;
  const fechar = () => {
    if (!atual) return;
    const texto = atual.texto.trim().replace(/\s+/g, ' ').replace(TELEFONE, '(telefone)').slice(0, 300);
    if (texto && !SEM_TEXTO.test(texto)) saida.get(atual.dia)!.push({ quando: atual.quando, quem: atual.quem, texto, cita: citaORobo(texto) });
    atual = null;
  };
  for (const bruta of limpo(texto).replace(/\r/g, '').split('\n')) {
    const m = DO_IPHONE.exec(bruta) ?? DO_ANDROID.exec(bruta);
    if (!m) {
      // Linha sem data: continuação da mensagem anterior.
      if (atual) atual.texto += `\n${bruta}`;
      continue;
    }
    fechar();
    const [, dd, mm, aa, h, min, s, quemBruto, resto] = m;
    const dia = `${aa.length === 2 ? `20${aa}` : aa}-${mm}-${dd}`;
    const quem = quemBruto.replace(/^~\s*/, '').trim();
    if (!quero.has(dia) || quem.toLowerCase() === robo) continue;
    atual = {
      dia,
      quando: `${dia}T${h}:${min}:${s ?? '00'}-03:00`,
      quem: /\d{4}/.test(quem) ? 'alguém' : quem.slice(0, 40),
      texto: resto,
      cita: false,
    };
  }
  fechar();
  return saida;
}
