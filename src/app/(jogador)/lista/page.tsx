import { Tela, Topo } from '@/components/topo';

export default function ListaPage() {
  return (
    <Tela>
      <Topo />
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Lista em breve</h1>
        <p className="mt-2 text-base text-apagado">A lista da quarta chega na próxima versão.</p>
      </main>
    </Tela>
  );
}
