import Link from 'next/link';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { SetaEsquerda } from '@/components/icones';
import { PILULA_SEGUNDA } from '@/components/pilula';
import type { EventoDaLinha } from '@/domain/linha-do-tempo';
import { minutoDoLance, relogio, type Lado } from '@/domain/partida';
import { diaMes, horaDe } from '@/domain/tempo';
import type { DetalhesDaPartida } from '@/server/partidas';

const LADOS: Lado[] = ['A', 'B'];

/**
 * Uma partida já encerrada: placar, goleiros e a linha do tempo no meio (os lances do lado A à
 * esquerda e do B à direita, como no placar), com o caminho para corrigir.
 */
export function Detalhes({ d }: { d: DetalhesDaPartida }) {
  const nome = (id: number) => d.nomes[id] ?? '?';
  const temGoleiro = d.lados.A.goleiro !== null || d.lados.B.goleiro !== null;
  return (
    <main className="flex flex-1 flex-col pb-8">
      <div className="mt-2 grid grid-cols-[3rem_1fr_3rem] items-center">
        <Link
          href="/admin/partidas"
          className="-ml-3 flex size-12 items-center justify-center rounded-placa text-apagado transition-colors hover:text-tinta"
        >
          <SetaEsquerda className="size-6" />
          <span className="sr-only">Voltar para partidas</span>
        </Link>
        <h1 className="text-center text-base font-semibold">Partida {d.numero}</h1>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {LADOS.map((l) => (
          <div key={l} className={`flex min-w-0 items-center gap-2 ${l === 'B' ? 'order-3 flex-row-reverse' : ''}`}>
            <Colete cor={d.lados[l].cor} />
            <span className={`min-w-0 flex-1 truncate text-base font-semibold ${l === 'B' ? 'text-right' : ''}`}>{NOME_DA_COR[d.lados[l].cor]}</span>
            <span className="font-placa text-placar-baixo font-semibold tabular-nums">{d.placar[l]}</span>
          </div>
        ))}
        <span aria-hidden="true" className="order-2 font-placa text-subtitulo font-semibold text-meta">
          ×
        </span>
      </div>
      <p className="mt-1 text-center text-sm text-meta">
        Quarta, {diaMes(d.peladaData)} · {horaDe(d.iniciadaEm)} · durou {relogio(d.tempoDeJogoMs)}
      </p>
      {temGoleiro && (
        <div className="mt-2 flex justify-between gap-3 text-sm text-apagado">
          <span>{d.lados.A.goleiro ? `Goleiro: ${d.lados.A.goleiro}` : 'Sem goleiro'}</span>
          <span className="text-right">{d.lados.B.goleiro ? `Goleiro: ${d.lados.B.goleiro}` : 'Sem goleiro'}</span>
        </div>
      )}

      <section aria-label="Linha do tempo" className="relative mt-5 py-1">
        <span aria-hidden="true" className="absolute top-0 bottom-0 left-1/2 w-0.5 -translate-x-1/2 bg-placa-alta" />
        <ol className="relative flex flex-col gap-3">
          <Marco texto="Início" minuto="0'" />
          {d.eventos.length === 0 && <li className="py-2 text-center text-sm text-meta">Nenhum gol nem assistência.</li>}
          {d.eventos.map((e, i) => (
            <Evento key={i} e={e} nome={nome} />
          ))}
          <Marco texto={d.encerrada ? 'Fim' : 'Em andamento'} minuto={`${minutoDoLance(d.tempoDeJogoMs)}'`} />
        </ol>
      </section>

      <Link href={`/admin/partida/${d.id}/corrigir`} className={`mt-8 ${PILULA_SEGUNDA}`}>
        Corrigir
      </Link>
    </main>
  );
}

function Marco({ texto, minuto }: { texto: string; minuto: string }) {
  return (
    <li className="grid grid-cols-[1fr_3rem_1fr] items-center">
      <span />
      <span className="justify-self-center rounded-full border-2 border-meta bg-chao px-2 font-placa text-sm font-semibold text-meta tabular-nums">
        {minuto}
      </span>
      <span className="pl-2 text-sm text-meta">{texto}</span>
    </li>
  );
}

function Evento({ e, nome }: { e: EventoDaLinha; nome: (id: number) => string }) {
  const texto = (
    <span className="block text-base leading-tight">
      {e.tipo === 'gol' ? (
        <>
          <b className="font-semibold">{nome(e.autor)}</b>
          <span className="block text-sm text-meta">
            {e.assistencia !== null ? `ast. ${nome(e.assistencia)}` : 'sem assistência'} · {e.placar.A}–{e.placar.B}
          </span>
        </>
      ) : (
        <>
          <span className="font-medium text-apagado">Assistência de {nome(e.autor)}</span>
          <span className="block text-sm text-meta">sem gol ligado</span>
        </>
      )}
    </span>
  );
  return (
    <li className="grid grid-cols-[1fr_3rem_1fr] items-center">
      <div className="pr-2 text-right">{e.lado === 'A' && texto}</div>
      <span
        className={`justify-self-center rounded-full border-2 bg-chao px-2 font-placa text-base font-semibold tabular-nums ${
          e.tipo === 'gol' ? 'border-placa-alta text-tinta' : 'border-placa-alta text-apagado'
        }`}
      >
        {e.tempoMs === null ? <span aria-label="sem minuto">–</span> : `${minutoDoLance(e.tempoMs)}'`}
      </span>
      <div className="pl-2">{e.lado === 'B' && texto}</div>
    </li>
  );
}
