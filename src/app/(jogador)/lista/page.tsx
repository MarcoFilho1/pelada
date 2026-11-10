import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { textoWhatsApp } from '@/domain/copiarLista';
import { situacaoDoJogador, travaDoJogador, travaParaSair } from '@/domain/lista';
import { aberturaLista, diaDaSemana, diaMes } from '@/domain/tempo';
import { estadoDaSemana } from '@/server/presencas';
import { lerSessaoJogador } from '@/server/sessao';
import { TelaJogador } from '@/components/topo';
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
    <TelaJogador>
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
    </TelaJogador>
  );
}
