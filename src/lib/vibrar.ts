// Vibração do anotador, com um padrão para cada coisa: o toque em GOL, o toque em AST e o fim dos
// 8:00 (bem mais longo, para quem segura o celular sentir sem olhar).
//
// Android: `navigator.vibrate`. iPhone: o Safari não tem `vibrate`, mas desde o iOS 18 um
// `<input type="checkbox" switch>` dá um toque tátil quando muda. Só funciona dentro de um toque do
// usuário, então o fim do tempo no iPhone fica com o bipe (ver `bipe.ts`).

export type Vibracao = 'gol' | 'assistencia' | 'fim';

/** Os padrões em ms (vibra, pausa, vibra...). Exportado para os testes. */
export const PADROES: Record<Vibracao, number | number[]> = {
  gol: 45,
  assistencia: [15, 60, 15],
  fim: [500, 150, 500, 150, 700],
};

let interruptor: HTMLLabelElement | null = null;

/** O interruptor escondido do iPhone (criado uma vez). */
function interruptorDoIphone(): HTMLLabelElement | null {
  if (interruptor) return interruptor;
  try {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    interruptor = label;
  } catch {
    interruptor = null;
  }
  return interruptor;
}

/** Vibra no padrão pedido. Sem suporte, não faz nada. */
export function vibrar(tipo: Vibracao): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PADROES[tipo]);
      return;
    }
    // iPhone: um toque tátil por clique no interruptor (o fim, fora de um toque, não vibra).
    if (tipo !== 'fim') interruptorDoIphone()?.click();
  } catch {
    // Sem vibração: segue em silêncio.
  }
}
