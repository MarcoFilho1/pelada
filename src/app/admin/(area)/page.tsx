import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Marca, SetaDireita } from '@/components/icones';
import { getDb } from '@/db/client';
import { diaDaSemana, diaMes } from '@/domain/tempo';
import { resumoDoPainel, type ResumoPainel } from '@/server/painel';
import { lerSessaoAdmin } from '@/server/sessao';

export const metadata: Metadata = { title: 'Painel · Pelada' };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function fraseDaLista({ estado, abertura, naFila }: ResumoPainel['lista']): string {
  const fila = naFila === 0 ? 'ninguém na fila' : `${naFila} na fila`;
  if (estado === 'antes') return `Abre segunda, ${diaMes(abertura)}, à meia-noite.`;
  if (estado === 'cancelada') return 'Cancelada. Não tem pelada essa semana.';
  return `${estado === 'aberta' ? 'Aberta' : 'Fechada'}, ${fila}.`;
}

/** Um assunto da semana: a placa inteira leva à seção, com o número pintado e uma frase. */
function Bloco({
  href,
  titulo,
  numero,
  frase,
  grande = false,
  className = '',
}: {
  href: string;
  titulo: string;
  numero?: ReactNode;
  frase: ReactNode;
  grande?: boolean;
  className?: string;
}) {
  return (
    <li className={className}>
      <Link
        href={href}
        className="flex h-full flex-col rounded-placa bg-placa p-5 transition-colors hover:bg-placa-alta/60 active:bg-placa-alta"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-linha font-medium text-tinta">{titulo}</h2>
          <SetaDireita className="size-5 shrink-0 text-meta" />
        </div>
        {numero && (
          <span
            className={`mt-3 flex items-baseline gap-2 font-placa font-semibold tabular-nums ${grande ? 'text-numero' : 'text-subtitulo'}`}
          >
            {numero}
          </span>
        )}
        <span className="mt-2 text-base text-apagado">{frase}</span>
      </Link>
    </li>
  );
}

/** "3/16 confirmados": o número em Barlow e a palavra em Inter. */
function Conta({ valor, de, rotulo }: { valor: number; de?: number; rotulo: string }) {
  return (
    <>
      {valor}
      {de !== undefined && `/${de}`}
      <span className="font-sans text-base font-normal text-apagado">{rotulo}</span>
    </>
  );
}

export default async function AdminPage() {
  const db = getDb();
  if (!(await lerSessaoAdmin(db))) redirect('/admin/entrar');
  const now = new Date();
  const { lista, sorteio, partidas, jogadores, mensalistas } = await resumoDoPainel(db, now);
  const nomeDoMes = MESES[Number(mensalistas.mes.slice(5)) - 1];
  const livres = mensalistas.vagas - mensalistas.marcados;

  return (
    <main className="flex flex-1 flex-col pb-8">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Painel</h1>
      <p className="mt-2 text-base text-apagado">Hoje é {diaDaSemana(now)}.</p>
      <ul className="mt-6 grid gap-2 lg:grid-cols-3">
        <Bloco
          href="/admin/pelada"
          titulo={`Lista de quarta, ${diaMes(lista.data)}`}
          numero={<Conta valor={lista.confirmados} de={lista.vagas} rotulo="confirmados" />}
          frase={fraseDaLista(lista)}
          grande
          className="lg:col-span-2"
        />
        <Bloco
          href="/admin/sorteio"
          titulo="Sorteio"
          numero={sorteio && (sorteio.hoje ? 'Hoje' : diaMes(sorteio.data))}
          frase={
            !sorteio ? (
              'Aparece no dia da pelada, depois que a lista abrir.'
            ) : sorteio.definidos ? (
              <span className="flex items-center gap-1">
                Times definitivos
                <Marca className="size-5 shrink-0 text-lima" />
              </span>
            ) : (
              'Times ainda não definidos.'
            )
          }
        />
        <Bloco
          href={partidas?.emAndamentoId ? `/admin/partida/${partidas.emAndamentoId}` : '/admin/partidas'}
          titulo="Partidas"
          numero={partidas && <Conta valor={partidas.jogadas} rotulo={partidas.jogadas === 1 ? 'jogada' : 'jogadas'} />}
          frase={
            !partidas
              ? 'Aparecem no dia, depois do sorteio.'
              : partidas.emAndamentoId
                ? 'Uma em andamento. Toque para voltar ao anotador.'
                : sorteio?.hoje
                  ? 'Nenhuma em andamento.'
                  : `Na última pelada, ${diaMes(sorteio?.data ?? '')}.`
          }
        />
        <Bloco
          href="/admin/jogadores"
          titulo="Jogadores"
          numero={<Conta valor={jogadores.ativos} rotulo={jogadores.ativos === 1 ? 'ativo' : 'ativos'} />}
          frase={
            jogadores.pinPadrao === 0
              ? 'Todos já trocaram o PIN.'
              : `${plural(jogadores.pinPadrao, 'ainda está', 'ainda estão')} com o PIN\u00a01234.`
          }
        />
        <Bloco
          href="/admin/mensalistas"
          titulo="Mensalistas"
          numero={<Conta valor={mensalistas.marcados} de={mensalistas.vagas} rotulo="marcados" />}
          frase={`De ${nomeDoMes}: ${livres === 0 ? 'vagas cheias' : plural(livres, 'vaga livre', 'vagas livres')}.`}
        />
      </ul>
    </main>
  );
}
