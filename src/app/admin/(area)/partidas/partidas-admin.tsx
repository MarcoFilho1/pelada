'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Placar, Resultado } from '@/domain/partida';
import type { Cor, JogadorNota } from '@/domain/sorteio';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { iniciar, quemCompleta } from './acoes';
import { ConferirQuemCompleta, QuemCompleta } from './escolher-quem-completa';
import { completamDe, escolhidosFora, proximaVaga, vagasDaPartida, type Completam, type Resposta, type Vaga } from './quem-completa';

type Time = { id: number; cor: Cor; jogadores: JogadorNota[]; completes: { id: number; nota: number }[] };
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

/**
 * A noite das partidas: a que está rolando, a próxima (sugerida pela fila, escolha livre) e as já jogadas. No PC, duas
 * colunas: a noite à esquerda (o que ficou aberto, a partida rolando ou a próxima, e os passos de quem completa) e as
 * já jogadas à direita.
 */
export function PartidasAdmin(p: Props) {
  useAutoRefresh(5000);
  return (
    <main className="flex flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_min(22rem,45%)] lg:content-start lg:items-start lg:gap-x-10">
      <h1 className="mt-6 font-placa text-titulo font-semibold lg:col-span-2">Partidas</h1>
      <p className="mt-2 text-base text-apagado lg:col-span-2">
        Quarta, {p.data} · {p.hoje ? 'Hoje' : 'A última pelada'}
        {p.cancelada && <span className="font-medium text-tinta"> · Cancelada</span>}
      </p>

      <div className="contents lg:col-start-1 lg:row-start-3 lg:block lg:@container">
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
      </div>

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

/**
 * O passo de quem completa, depois de tocar em Iniciar com COMPLETE num dos dois times. As vagas e os
 * candidatos ficam como estavam no toque: a página se atualiza a cada 5 s, mas o servidor confere tudo
 * ao iniciar.
 */
type Completando = {
  a: Time;
  b: Time;
  vagas: Vaga[];
  respostas: (Resposta | undefined)[];
  /** A vaga em escolha, ou a conferência. */
  atual: number | 'conferir';
  /** A vaga foi aberta pelo "Trocar" da conferência: "Voltar" volta para lá, com as respostas. */
  daConferencia: boolean;
  deFora: JogadorNota[];
  semTime: JogadorNota[];
};

function ProximaPartida(p: Props) {
  const ordem = new Map(p.fila.map((id, i) => [id, i]));
  const times = [...p.times].sort((a, b) => (ordem.get(a.id) ?? 99) - (ordem.get(b.id) ?? 99));
  const sugeridos = times.slice(0, 2).map((t) => t.id);
  const [escolhidos, setEscolhidos] = useState<number[]>(sugeridos);
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, startIniciar] = useTransition();
  const [carregando, startCarregar] = useTransition();
  const [completando, setCompletando] = useState<Completando | null>(null);
  const [a, b] = times.filter((t) => escolhidos.includes(t.id)); // na ordem da fila
  const ehSugestao = sugeridos.every((id) => escolhidos.includes(id));
  const comComplete = [a, b].filter((t) => t?.completes.length);

  function alternar(id: number) {
    setErro(null);
    setEscolhidos((es) => {
      if (es.includes(id)) return es.filter((e) => e !== id);
      // Com dois escolhidos, o novo entra no lugar do último tocado: quem fica (o primeiro) continua.
      return es.length < 2 ? [...es, id] : [es[0], id];
    });
  }

  function comecar(timeA: Time, timeB: Time, completam?: Completam) {
    setErro(null);
    startIniciar(async () => {
      const r = await iniciar(p.peladaId, timeA.id, timeB.id, completam).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
      if (r && !r.ok) setErro(r.erro);
    });
  }

  function tocarIniciar() {
    if (!a || !b) return;
    const vagas = vagasDaPartida(a, b);
    if (!vagas.length) return comecar(a, b);
    setErro(null);
    startCarregar(async () => {
      const r = await quemCompleta(p.peladaId, a.id, b.id).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
      if (!r.ok) return setErro(r.erro);
      setCompletando({ a, b, vagas, respostas: vagas.map(() => undefined), atual: 0, daConferencia: false, deFora: r.deFora, semTime: r.semTime });
    });
  }

  if (completando) {
    return (
      <PassosDeQuemCompleta
        c={completando}
        times={p.times}
        iniciando={iniciando}
        erro={erro}
        onMudar={(c) => {
          setErro(null);
          setCompletando(c);
        }}
        onIniciar={() => comecar(completando.a, completando.b, completamDe(completando.vagas, completando.respostas))}
        onSair={() => {
          setErro(null);
          setCompletando(null);
        }}
      />
    );
  }

  return (
    <section aria-labelledby="proxima" className="mt-6">
      <h2 id="proxima" className="font-placa text-2xl font-semibold">
        Próxima partida
      </h2>
      {ehSugestao ? (
        <p className="mt-1 text-base text-meta">Sugerida pela fila: quem perde sai; empate, saem os dois.</p>
      ) : (
        <>
          <p className="mt-1 text-base text-meta lg:hidden">Escolha livre. Toque para trocar.</p>
          <p className="mt-1 hidden text-base text-meta lg:block">Escolha livre. Clique para trocar.</p>
        </>
      )}
      {/* No PC, os times da fila numa linha só quando a coluna tem largura para quatro. */}
      <div className="mt-3 grid grid-cols-2 gap-2 @[40rem]:grid-cols-4">
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
              <span className="mt-1 line-clamp-2 text-sm text-apagado">{t.jogadores.map((j) => j.nome).join(', ') || 'Ninguém.'}</span>
              {t.completes.length > 0 && (
                // O COMPLETE é um buraco na placa, como no Sorteio.
                <span className="mt-1.5 flex-none self-start rounded-placa bg-chao px-1.5 text-sm leading-6 font-medium whitespace-nowrap text-apagado">
                  {t.completes.length === 1 ? 'COMPLETE' : `${t.completes.length} COMPLETE`}
                </span>
              )}
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
      <button type="button" className={`mt-4 ${PILULA} lg:w-auto lg:px-8`} disabled={!a || !b || iniciando || carregando} onClick={tocarIniciar}>
        {iniciando ? 'Iniciando…' : carregando ? 'Carregando…' : a && b ? `Iniciar ${NOME_DA_COR[a.cor]} × ${NOME_DA_COR[b.cor]}` : 'Escolha dois times'}
      </button>
      {a && b && comComplete.length > 0 && (
        <p className="mt-2 text-base text-meta">
          Antes de começar, você escolhe quem completa o {comComplete.map((t) => NOME_DA_COR[t.cor]).join(' e o ')}.
        </p>
      )}
    </section>
  );
}

/** Os passos "Quem completa o Azul?" (um por vaga) e a conferência com a pílula de iniciar. */
function PassosDeQuemCompleta({
  c,
  times,
  iniciando,
  erro,
  onMudar,
  onIniciar,
  onSair,
}: {
  c: Completando;
  times: Time[];
  iniciando: boolean;
  erro: string | null;
  onMudar: (c: Completando) => void;
  onIniciar: () => void;
  onSair: () => void;
}) {
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const corDe = useMemo(() => new Map(times.flatMap((t) => t.jogadores.map((j) => [j.id, t.cor] as const))), [times]);
  const timeDo = (lado: Vaga['lado']) => (lado === 'A' ? c.a : c.b);
  /** Quantos jogam por um lado, contando quem completa cada vaga respondida (e as abertas como cheias). */
  const jogaCom = (lado: Vaga['lado'], respostas: (Resposta | undefined)[]) =>
    timeDo(lado).jogadores.length + c.vagas.filter((v, i) => v.lado === lado && respostas[i]?.tipo !== 'sem').length;

  if (c.atual === 'conferir') {
    return (
      <ConferirQuemCompleta
        corA={c.a.cor}
        corB={c.b.cor}
        linhas={c.vagas.map((v, i) => ({ cor: timeDo(v.lado).cor, resposta: c.respostas[i]!, jogaCom: jogaCom(v.lado, c.respostas) }))}
        iniciando={iniciando}
        erro={erro}
        onTrocar={(vaga) => onMudar({ ...c, atual: vaga, daConferencia: true })}
        onIniciar={onIniciar}
        onVoltar={onSair}
      />
    );
  }

  const atual = c.atual;
  const vaga = c.vagas[atual];
  const ocupados = escolhidosFora(c.respostas, atual);
  const doJogo = new Set([...c.a.jogadores, ...c.b.jogadores].map((j) => j.id));
  const porId = new Map([...c.semTime, ...cadastrados, ...c.deFora, ...c.a.jogadores, ...c.b.jogadores].map((j) => [j.id, j]));

  function responder(r: Resposta) {
    const respostas = c.respostas.map((x, i) => (i === atual ? r : x));
    const proxima = proximaVaga(respostas, atual);
    onMudar({ ...c, respostas, atual: proxima ?? 'conferir', daConferencia: proxima === null ? false : c.daConferencia });
    window.scrollTo({ top: 0 });
  }

  return (
    <QuemCompleta
      key={atual}
      cor={timeDo(vaga.lado).cor}
      nota={vaga.nota}
      jaCompleta={c.vagas.flatMap((v, i) => {
        const r = c.respostas[i];
        return i !== atual && v.lado === vaga.lado && r?.tipo === 'jogador' ? [r.jogador.nome] : [];
      })}
      faltam={c.vagas.filter((v, i) => i !== atual && v.lado === vaga.lado && c.respostas[i] === undefined).length}
      jogaSemCom={jogaCom(vaga.lado, c.respostas.map((x, i) => (i === atual ? { tipo: 'sem' } : x)))}
      deFora={c.deFora.filter((j) => !ocupados.has(j.id))}
      corDe={(id) => corDe.get(id)}
      todos={[...porId.values()]}
      jaEstao={new Set([...doJogo, ...ocupados])}
      onEscolher={(j) => responder({ tipo: 'jogador', jogador: j })}
      onCadastrado={(j) => {
        setCadastrados((cs) => [...cs, j]);
        responder({ tipo: 'jogador', jogador: j });
      }}
      onJogarSem={() => responder({ tipo: 'sem' })}
      onVoltar={() =>
        c.daConferencia ? onMudar({ ...c, atual: 'conferir', daConferencia: false }) : atual > 0 ? onMudar({ ...c, atual: atual - 1 }) : onSair()
      }
    />
  );
}

function Historico({ jogadas }: { jogadas: Jogada[] }) {
  return (
    <section aria-labelledby="historico" className="mt-10 pb-8 lg:col-start-2 lg:row-start-3 lg:mt-6">
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
