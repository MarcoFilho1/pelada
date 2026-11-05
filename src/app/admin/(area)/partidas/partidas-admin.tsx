'use client';

import Link from 'next/link';
import { useState, useTransition, type ReactNode } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Placar, Resultado } from '@/domain/partida';
import type { Cor } from '@/domain/sorteio';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { iniciar } from './acoes';

type Time = { id: number; cor: Cor; jogadores: string[] };
type Jogada = { id: number; corA: Cor; corB: Cor; placar: Placar; resultado: Resultado };

type Props = {
  peladaId: number;
  /** 'DD/MM' da quarta. */
  data: string;
  /** A pelada é a de hoje (senão é a última que teve, e não dá para iniciar). */
  hoje: boolean;
  cancelada: boolean;
  times: Time[];
  /** Ids dos times na ordem da fila: os dois primeiros são a próxima partida sugerida. */
  fila: number[];
  emAndamento: { id: number; corA: Cor; corB: Cor; placar: Placar } | null;
  historico: Jogada[];
  /** Partidas abertas de peladas anteriores ('DD/MM'): ninguém encerrou. */
  esquecidas: Esquecida[];
};

type Esquecida = { id: number; data: string; corA: Cor; corB: Cor; placar: Placar };

/** A noite das partidas: a que está rolando, a próxima (sugerida pela fila, escolha livre) e as já jogadas. */
export function PartidasAdmin(p: Props) {
  useAutoRefresh(5000);
  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Partidas</h1>
      <p className="mt-2 text-base text-apagado">
        Quarta, {p.data} · {p.hoje ? 'Hoje' : 'A última pelada'}
        {p.cancelada && <span className="font-medium text-tinta"> · Cancelada</span>}
      </p>

      <Esquecidas partidas={p.esquecidas} />

      {p.emAndamento ? (
        <EmAndamento partida={p.emAndamento} />
      ) : !p.hoje ? (
        <Aviso>Partida só se inicia no dia da pelada.</Aviso>
      ) : p.cancelada ? (
        <Aviso>
          A pelada de hoje foi cancelada. Para jogar, tire o cancelamento em{' '}
          <Link href="/admin/pelada" className="font-medium text-tinta underline underline-offset-4">
            Pelada
          </Link>
          .
        </Aviso>
      ) : p.times.length < 2 ? (
        <Aviso>
          Primeiro defina os times no{' '}
          <Link href="/admin/sorteio" className="font-medium text-tinta underline underline-offset-4">
            Sorteio
          </Link>
          .
        </Aviso>
      ) : (
        <ProximaPartida key={p.fila.join(',')} {...p} />
      )}

      <Historico jogadas={p.historico} />
    </main>
  );
}

/** Partida de outra noite que ficou aberta: "Partida de 04/11 ficou aberta" e o caminho para encerrar. */
export function Esquecidas({ partidas }: { partidas: Esquecida[] }) {
  if (!partidas.length) return null;
  return (
    <section aria-label="Partidas que ficaram abertas" className="mt-6 flex flex-col gap-2">
      {partidas.map((e) => (
        <div key={e.id} className="rounded-placa bg-placa p-4">
          <h2 className="text-base font-medium text-tinta">Partida de {e.data} ficou aberta</h2>
          <Confronto corA={e.corA} corB={e.corB} placar={e.placar} className="mt-1" />
          <p className="mt-1 text-base text-apagado">Ela só conta no ranking depois de encerrada.</p>
          <Link href={`/admin/partida/${e.id}`} className={`mt-3 ${PILULA_SEGUNDA}`}>
            Abrir anotador
          </Link>
        </div>
      ))}
    </section>
  );
}

function Aviso({ children }: { children: ReactNode }) {
  return <p className="mt-6 rounded-placa bg-placa px-4 py-3 text-base text-apagado">{children}</p>;
}

function EmAndamento({ partida }: { partida: NonNullable<Props['emAndamento']> }) {
  return (
    <section aria-labelledby="em-andamento" className="mt-6 rounded-placa bg-placa p-4">
      <h2 id="em-andamento" className="text-base font-medium text-apagado">
        Em andamento
      </h2>
      <Confronto corA={partida.corA} corB={partida.corB} placar={partida.placar} className="mt-2" />
      <Link href={`/admin/partida/${partida.id}`} className={`mt-4 ${PILULA}`}>
        Voltar ao anotador
      </Link>
    </section>
  );
}

function ProximaPartida(p: Props) {
  const ordem = new Map(p.fila.map((id, i) => [id, i]));
  const times = [...p.times].sort((a, b) => (ordem.get(a.id) ?? 99) - (ordem.get(b.id) ?? 99));
  const sugeridos = times.slice(0, 2).map((t) => t.id);
  const [escolhidos, setEscolhidos] = useState<number[]>(sugeridos);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, startIniciar] = useTransition();
  const [a, b] = times.filter((t) => escolhidos.includes(t.id)); // na ordem da fila
  const ehSugestao = sugeridos.every((id) => escolhidos.includes(id));

  function alternar(id: number) {
    setErro(null);
    setEscolhidos((es) => {
      if (es.includes(id)) return es.filter((e) => e !== id);
      // Com dois escolhidos, o novo entra no lugar do último tocado: quem fica (o primeiro) continua.
      return es.length < 2 ? [...es, id] : [es[0], id];
    });
  }

  function comecar() {
    if (!a || !b) return;
    startIniciar(async () => {
      const r = await iniciar(p.peladaId, a.id, b.id).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
      if (r && !r.ok) setErro(r.erro);
    });
  }

  return (
    <section aria-labelledby="proxima" className="mt-6">
      <h2 id="proxima" className="font-placa text-2xl font-semibold">
        Próxima partida
      </h2>
      <p className="mt-1 text-base text-meta">
        {ehSugestao ? 'Sugerida pela fila: quem perde sai; empate, saem os dois.' : 'Escolha livre. Toque para trocar.'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {times.map((t, i) => {
          const marcado = escolhidos.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={marcado}
              onClick={() => alternar(t.id)}
              className={`flex min-h-24 flex-col rounded-placa px-3 py-2.5 text-left transition-colors ${
                marcado ? 'bg-placa-alta ring-2 ring-lima ring-inset' : 'bg-placa hover:bg-placa-alta/60 active:bg-placa-alta'
              }`}
            >
              <span className="flex w-full items-center gap-2">
                <Colete cor={t.cor} />
                <span className="flex-1 text-base font-semibold text-tinta">{NOME_DA_COR[t.cor]}</span>
                <span className="text-sm text-meta tabular-nums">{i + 1}º</span>
              </span>
              <span className="mt-1 line-clamp-2 text-sm text-apagado">{t.jogadores.join(', ') || 'Ninguém.'}</span>
            </button>
          );
        })}
      </div>
      {!ehSugestao && (
        <button type="button" className={`-mx-3 mt-1 ${TEXTO}`} onClick={() => setEscolhidos(sugeridos)}>
          Voltar para a sugerida
        </button>
      )}
      <p role="alert" className={`text-base font-medium text-erro ${erro ? 'mt-3' : 'sr-only'}`}>
        {erro}
      </p>
      <button type="button" className={`mt-4 ${PILULA}`} disabled={!a || !b || iniciando} onClick={comecar}>
        {iniciando ? 'Iniciando…' : a && b ? `Iniciar ${NOME_DA_COR[a.cor]} × ${NOME_DA_COR[b.cor]}` : 'Escolha dois times'}
      </button>
    </section>
  );
}

function Historico({ jogadas }: { jogadas: Jogada[] }) {
  return (
    <section aria-labelledby="historico" className="mt-10 pb-8">
      <h2 id="historico" className="font-placa text-2xl font-semibold">
        Já jogadas
      </h2>
      {jogadas.length === 0 ? (
        <p className="mt-2 text-base text-meta">Nenhuma partida encerrada ainda.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {jogadas.map((j, i) => (
            <li key={j.id} className="flex items-center gap-3 rounded-placa bg-placa py-2 pr-1 pl-3">
              <span className="w-5 shrink-0 text-right font-placa text-xl text-meta tabular-nums">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <Confronto corA={j.corA} corB={j.corB} placar={j.placar} />
                <p className="text-sm text-apagado">
                  {j.resultado === 'empate' ? 'Empate' : `${NOME_DA_COR[j.resultado === 'A' ? j.corA : j.corB]} venceu`}
                </p>
              </div>
              <Link href={`/admin/partida/${j.id}/corrigir`} className={`shrink-0 ${TEXTO}`}>
                Corrigir
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** "● Azul 3 × 1 Laranja ●" numa linha, com o placar em números de placa. */
function Confronto({ corA, corB, placar, className = '' }: { corA: Cor; corB: Cor; placar: Placar; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-base font-medium text-tinta ${className}`}>
      <Colete cor={corA} />
      <span>{NOME_DA_COR[corA]}</span>
      <span className="font-placa text-2xl font-semibold tabular-nums">
        {placar.A} × {placar.B}
      </span>
      <span>{NOME_DA_COR[corB]}</span>
      <Colete cor={corB} />
    </p>
  );
}
