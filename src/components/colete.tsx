import type { Cor } from '@/domain/sorteio';

/** Nome do time pela cor do colete. */
export const NOME_DA_COR: Record<Cor, string> = { branco: 'Branco', preto: 'Preto', verde: 'Verde', amarelo: 'Amarelo', azul: 'Azul', laranja: 'Laranja' };

const FUNDO: Record<Cor, string> = {
  branco: 'bg-colete-branco',
  preto: 'bg-chao ring-2 ring-inset ring-apagado',
  verde: 'bg-colete-verde',
  amarelo: 'bg-colete-amarelo',
  azul: 'bg-colete-azul',
  laranja: 'bg-colete-laranja',
};

/** Bolinha com a cor do colete. O preto ganha contorno para aparecer no fundo preto. */
export function Colete({ cor }: { cor: Cor }) {
  return <span aria-hidden="true" className={`size-4 shrink-0 rounded-full ${FUNDO[cor]}`} />;
}
