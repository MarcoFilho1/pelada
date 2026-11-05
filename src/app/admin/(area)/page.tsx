import { Tela, Topo } from '@/components/topo';

export default function AdminPage() {
  return (
    <Tela>
      <Topo inicio="/admin" />
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">Painel em breve</h1>
        <p className="mt-2 text-base text-apagado">O cadastro de jogadores chega na próxima versão.</p>
      </main>
    </Tela>
  );
}
