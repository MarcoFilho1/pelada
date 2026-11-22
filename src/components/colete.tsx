import type { Cor } from '@/domain/sorteio';

/** Nome do time pela cor do colete. */
export const NOME_DA_COR: Record<Cor, string> = { azul: 'Azul', laranja: 'Laranja', verde: 'Verde', preto: 'Preto' };

const FUNDO: Record<Cor, string> = {
  azul: 'bg-colete-azul',
  laranja: 'bg-colete-laranja',
  verde: 'bg-colete-verde',
  preto: 'bg-chao ring-2 ring-inset ring-apagado',
};

/** Bolinha com a cor do colete. O preto ganha contorno para aparecer no fundo preto. */
export function Colete({ cor }: { cor: Cor }) {
  return <span aria-hidden="true" className={`size-4 shrink-0 rounded-full ${FUNDO[cor]}`} />;
}
