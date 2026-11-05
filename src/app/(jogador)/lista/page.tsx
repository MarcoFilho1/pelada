import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { textoWhatsApp } from '@/domain/copiarLista';
import { situacaoDoJogador, travaDoJogador, travaParaSair } from '@/domain/lista';
import { aberturaLista, diaDaSemana, diaMes } from '@/domain/tempo';
import { estadoDaSemana } from '@/server/presencas';
import { lerSessaoJogador } from '@/server/sessao';
import { Tela, Topo } from '@/components/topo';
import { sairDaConta } from './acoes';
import { ListaJogador, type TravaTela } from './lista-jogador';

export const metadata: Metadata = { title: 'Lista · Pelada' };

export default async function ListaPage() {
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');

  const now = new Date();
  const estado = await estadoDaSemana(db, now);
  const trava = travaDoJogador(estado, estado.data, estado.estadoManual, now);
  const travaTela: TravaTela =
    trava === 'fechada' ? (estado.estadoManual === 'fechada' ? 'fechada' : 'antes') : trava;

  return (
    <Tela>
      <Topo
        inicio="/lista"
        direita={
          <form action={sairDaConta}>
            <button
              type="submit"
              className="-mx-3 flex h-12 items-center px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
            >
              Sair
            </button>
          </form>
        }
      />
      <ListaJogador
        dataQuarta={diaMes(estado.data)}
        abertura={diaDaSemana(aberturaLista(estado.data))}
        jogadorId={sessao.jogadorId}
        principal={estado.principal}
        fila={estado.fila}
        vagas={estado.vagas}
        situacao={situacaoDoJogador(estado, sessao.jogadorId)}
        trava={travaTela}
        podeSair={travaParaSair(estado, estado.data, estado.estadoManual, now) === null}
        texto={textoWhatsApp(estado, estado.data)}
      />
    </Tela>
  );
}
