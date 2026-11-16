import type { Metadata } from 'next';
import { Tela, Topo } from '@/components/topo';

export const metadata: Metadata = { title: 'Link de anotar · Pelada' };

// Link de anotar vencido, revogado (alguém pediu um novo) ou de outra noite.
export default function LinkVencidoPage() {
  return (
    <Tela>
      <Topo inicio="/" />
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Esse link de anotar venceu</h1>
        <p className="mt-2 text-base text-apagado">
          Ele vale só na noite da pelada, e um link novo cancela o anterior. Peça outro a um organizador: no grupo, ele manda{' '}
          <strong className="font-medium text-tinta">@robô anotar</strong>.
        </p>
      </main>
    </Tela>
  );
}
