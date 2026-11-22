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

/**
 * Um toque tátil no iPhone: cria um interruptor (`<input switch>`) dentro de um `<label>` escondido,
 * clica no label (o iOS vibra ao mudar o interruptor) e tira tudo da página. Precisa estar dentro
 * de um toque do usuário e com "Tato do sistema" ligado no iPhone.
 */
function toqueDoIphone(): void {
  const label = document.createElement('label');
  label.ariaHidden = 'true';
  label.style.display = 'none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.head.appendChild(label);
  label.click();
  label.remove();
}

/** Vibra no padrão pedido. Sem suporte, não faz nada. */
export function vibrar(tipo: Vibracao): void {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(PADROES[tipo]);
      return;
    }
    // iPhone: toque tátil pelo interruptor (o fim, fora de um toque, não vibra). Assistência = dois toques.
    if (tipo === 'fim') return;
    toqueDoIphone();
    if (tipo === 'assistencia') setTimeout(toqueDoIphone, 90);
  } catch {
    // Sem vibração: segue em silêncio.
  }
}
