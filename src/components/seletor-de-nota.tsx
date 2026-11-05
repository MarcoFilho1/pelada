import { Mais, Menos } from '@/components/icones';
import { formatarNota } from '@/domain/sorteio';

/**
 * Seletor de nota (DESIGN.md › Seletor de nota): menos, valor, mais, de 0 a 5 em passos de 0,5.
 * Botões 56×56 em placa alta, valor em Barlow 44px sobre o chão; o botão do limite fica desabilitado.
 */
export function SeletorDeNota({
  valor,
  rotulo,
  onPasso,
  desabilitado = false,
}: {
  valor: number;
  /** Nome do grupo para o leitor de tela ("Nota de Fulano"). */
  rotulo: string;
  /** -0,5 ou +0,5; quem usa limita e salva. */
  onPasso: (passo: number) => void;
  desabilitado?: boolean;
}) {
  return (
    <div role="group" aria-label={rotulo} className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Diminuir nota em 0,5"
        onClick={() => onPasso(-0.5)}
        disabled={desabilitado || valor <= 0}
        className="grid size-14 place-items-center rounded-placa bg-placa-alta transition-colors hover:bg-chao active:bg-chao disabled:text-meta"
      >
        <Menos />
      </button>
      <output
        aria-live="polite"
        className="grid h-14 w-24 place-items-center rounded-placa bg-chao font-placa text-numero font-semibold tabular-nums"
      >
        {formatarNota(valor)}
      </output>
      <button
        type="button"
        aria-label="Aumentar nota em 0,5"
        onClick={() => onPasso(0.5)}
        disabled={desabilitado || valor >= 5}
        className="grid size-14 place-items-center rounded-placa bg-placa-alta transition-colors hover:bg-chao active:bg-chao disabled:text-meta"
      >
        <Mais />
      </button>
      <span className="ml-1 text-base text-meta">de 0 a 5</span>
    </div>
  );
}
