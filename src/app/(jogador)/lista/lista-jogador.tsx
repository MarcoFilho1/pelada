'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Ampulheta, Copiar, Marca } from '@/components/icones';
import type { ItemLista, Situacao } from '@/domain/lista';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { naoVou, queroEntrar, vou, type Resposta } from './acoes';

/** Por que o jogador não mexe agora; `antes` = a lista ainda não abriu. */
export type TravaTela = 'antes' | 'fechada' | 'cancelada' | 'comecou' | null;

type Props = {
  dataQuarta: string;
  abertura: string;
  jogadorId: number;
  principal: ItemLista[];
  fila: ItemLista[];
  vagas: number;
  situacao: Situacao;
  trava: TravaTela;
  /** Sair ainda vale com a lista fechada ou antes de abrir; só cancelada e jogo começado travam. */
  podeSair: boolean;
  texto: string;
};

const PILULA =
  'flex h-toque w-full items-center justify-center gap-2 rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado';
const PILULA_SEGUNDA =
  'flex h-toque w-full items-center justify-center gap-2 rounded-full bg-placa-alta text-linha font-semibold text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta';
const TEXTO =
  'flex h-12 items-center justify-center rounded-placa px-3 text-base font-medium text-apagado transition-colors hover:text-tinta disabled:text-meta';

export function ListaJogador(p: Props) {
  useAutoRefresh(5000);
  const confirmados = p.principal.filter((i) => i.confirmado).length;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Quarta, {p.dataQuarta}</h1>
      <p className="mt-1 text-base text-apagado">{p.trava === 'cancelada' ? 'Cancelada' : '20:30 às 22:30'}</p>

      <MeuBloco
        situacao={p.situacao}
        trava={p.trava}
        podeSair={p.podeSair}
        abertura={p.abertura}
        cheia={p.principal.length >= p.vagas}
      />

      <section aria-labelledby="titulo-lista" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-lista" className="font-placa text-2xl font-semibold">
            Lista
          </h2>
          <p className="text-base text-apagado">
            <span className="font-placa text-subtitulo leading-none font-semibold text-tinta tabular-nums">
              {confirmados}/{p.vagas}
            </span>{' '}
            confirmados
          </p>
        </div>
        <ol className="mt-3 flex flex-col">
          {Array.from({ length: p.vagas }, (_, i) => (
            <Linha key={i} numero={i + 1} item={p.principal[i]} eu={p.principal[i]?.jogadorId === p.jogadorId} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="titulo-fila" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-fila" className="font-placa text-2xl font-semibold">
            Fila
          </h2>
          {p.fila.length > 0 && (
            <p className="text-base text-apagado">
              {p.fila.length} esperando
            </p>
          )}
        </div>
        {p.fila.length === 0 ? (
          <p className="mt-3 text-base text-meta">Ninguém na fila.</p>
        ) : (
          <ol className="mt-3 flex flex-col">
            {p.fila.map((item, i) => (
              <Linha key={item.jogadorId} numero={i + 1} item={item} eu={item.jogadorId === p.jogadorId} naFila />
            ))}
          </ol>
        )}
      </section>

      <CopiarLista texto={p.texto} />
    </main>
  );
}

function Linha({ numero, item, eu, naFila = false }: { numero: number; item?: ItemLista; eu: boolean; naFila?: boolean }) {
  return (
    <li
      className={`-mx-3 flex h-11 items-center gap-3 rounded-placa px-3 ${eu ? 'bg-placa-alta' : ''}`}
      aria-current={eu ? 'true' : undefined}
    >
      <span className="w-6 shrink-0 text-right font-placa text-xl font-semibold text-meta tabular-nums">{numero}</span>
      {item ? (
        <>
          <span className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">
            {item.nome}
            {eu && <span className="font-normal text-apagado"> · você</span>}
          </span>
          {!naFila && (
            <>
              <span className="shrink-0 text-base text-meta" title={item.tipo === 'M' ? 'Mensalista' : 'Diarista'}>
                <span aria-hidden="true">{item.tipo}</span>
                <span className="sr-only">{item.tipo === 'M' ? 'mensalista' : 'diarista'}</span>
              </span>
              <span className="flex w-6 shrink-0 justify-center">
                {item.confirmado ? <Marca className="size-6 text-lima" /> : <Ampulheta className="size-5 text-meta" />}
                <span className="sr-only">{item.confirmado ? 'confirmado' : 'pendente'}</span>
              </span>
            </>
          )}
        </>
      ) : (
        <span className="flex-1 text-base text-meta">Vaga aberta</span>
      )}
    </li>
  );
}

type Acao = { rotulo: string; fazendo: string; fn: () => Promise<Resposta>; primaria: boolean; confirmar?: { frase: string; verbo: string } };

const SAIR_DA_LISTA = { frase: 'Você perde a vaga. Se voltar, entra no fim da fila.', verbo: 'Não vou' };
const SAIR_DA_FILA = { frase: 'Você perde o lugar. Se voltar, entra no fim da fila.', verbo: 'Sair da fila' };

type Textos = { titulo: string; linha: string; acoes: Acao[]; confirmado?: boolean; ondeEstou?: string };

/** A única ação que sobra com a lista travada para entrar: sair. */
function acaoDeSair(s: Situacao): Acao[] {
  if (s.onde === 'principal') return [{ rotulo: 'Não vou', fazendo: 'Saindo…', fn: naoVou, primaria: false, confirmar: SAIR_DA_LISTA }];
  if (s.onde === 'fila') return [{ rotulo: 'Sair da fila', fazendo: 'Saindo…', fn: naoVou, primaria: false, confirmar: SAIR_DA_FILA }];
  return [];
}

function textos(s: Situacao, cheia: boolean): Textos {
  switch (s.onde) {
    case 'principal':
      if (s.confirmado) {
        return {
          titulo: 'Você vai',
          linha: `Confirmado na vaga ${s.posicao}.`,
          confirmado: true,
          acoes: [{ rotulo: 'Não vou', fazendo: 'Saindo…', fn: naoVou, primaria: false, confirmar: SAIR_DA_LISTA }],
        };
      }
      return {
        titulo: s.tipo === 'D' ? 'Abriu vaga pra você' : 'Você vai?',
        linha:
          s.tipo === 'D'
            ? 'Você subiu da fila. Confirme se vai.'
            : 'Mensalista confirma até quarta, 14h. Depois disso a vaga vai pra fila.',
        acoes: [
          { rotulo: 'Vou', fazendo: 'Confirmando…', fn: vou, primaria: true },
          { rotulo: 'Não vou', fazendo: 'Saindo…', fn: naoVou, primaria: false, confirmar: SAIR_DA_LISTA },
        ],
      };
    case 'fila':
      return {
        titulo: `Você é o ${s.posicao}º da fila`,
        linha: 'Se abrir vaga, você sobe e precisa confirmar.',
        acoes: [{ rotulo: 'Sair da fila', fazendo: 'Saindo…', fn: naoVou, primaria: false, confirmar: SAIR_DA_FILA }],
      };
    case 'perdeu_prazo':
      return {
        titulo: 'Você perdeu o prazo das 14h',
        linha: cheia
          ? 'Ainda dá para entrar no fim da fila, como diarista.'
          : 'Ainda tem vaga: você entra direto na lista, como diarista.',
        acoes: [{ rotulo: 'Entrar na fila', fazendo: 'Entrando…', fn: queroEntrar, primaria: true }],
      };
    case 'fora':
      return {
        titulo: 'Você não está na lista',
        linha: cheia ? 'A lista está cheia: você entra no fim da fila.' : 'Tem vaga: você entra direto na lista.',
        acoes: [{ rotulo: 'Entrar na fila', fazendo: 'Entrando…', fn: queroEntrar, primaria: true }],
      };
  }
}

/** Uma linha sobre a própria presença, para quando a lista está travada. */
function ondeEstou(s: Situacao): string {
  switch (s.onde) {
    case 'principal':
      return s.confirmado ? `Você está confirmado na vaga ${s.posicao}.` : `Você está na vaga ${s.posicao}, sem confirmar.`;
    case 'fila':
      return `Você é o ${s.posicao}º da fila.`;
    case 'perdeu_prazo':
      return 'Você perdeu o prazo das 14h.';
    case 'fora':
      return 'Você não está na lista.';
  }
}

const TRAVAS: Record<Exclude<TravaTela, null>, (abertura: string) => { titulo: string; linha: string }> = {
  antes: (abertura) => ({ titulo: 'A lista ainda não abriu', linha: `Abre ${abertura}, às 00:00.` }),
  fechada: () => ({ titulo: 'Lista fechada', linha: 'Ninguém entra nem confirma mais por aqui. Sair ainda pode.' }),
  cancelada: () => ({ titulo: 'Pelada cancelada', linha: 'Não tem jogo nesta quarta.' }),
  comecou: () => ({ titulo: 'A pelada já começou', linha: 'A lista não muda mais pelo site. Fale com o admin.' }),
};

function MeuBloco({
  situacao,
  trava,
  podeSair,
  abertura,
  cheia,
}: {
  situacao: Situacao;
  trava: TravaTela;
  podeSair: boolean;
  abertura: string;
  cheia: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Acao | null>(null);
  const [emAndamento, setEmAndamento] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();

  // A situação mudou (ação feita aqui ou atualização da lista): fecha a pergunta e o erro antigos.
  const chave = `${situacao.onde}-${'posicao' in situacao ? situacao.posicao : ''}-${'confirmado' in situacao ? situacao.confirmado : ''}-${trava}`;
  const ultimaChave = useRef(chave);
  useEffect(() => {
    if (ultimaChave.current !== chave) {
      ultimaChave.current = chave;
      setConfirmando(null);
      setErro(null);
    }
  }, [chave]);

  function executar(a: Acao) {
    setErro(null);
    setEmAndamento(a.rotulo);
    startAcao(async () => {
      const r = await a.fn();
      if (!r.ok) setErro(r.erro);
      setConfirmando(null);
      setEmAndamento(null);
    });
  }

  let t: Textos;
  if (trava) {
    const travada = TRAVAS[trava](abertura);
    t = {
      ...travada,
      // antes de abrir, quem não tem presença não precisa ouvir "você não está na lista"
      ondeEstou: trava !== 'antes' || situacao.onde !== 'fora' ? ondeEstou(situacao) : undefined,
      acoes: podeSair ? acaoDeSair(situacao) : [],
    };
  } else {
    t = textos(situacao, cheia);
  }
  return (
    <section aria-labelledby="meu-titulo" className="mt-6 rounded-placa bg-placa p-5">
      <h2 id="meu-titulo" className="flex items-center gap-2 font-placa text-subtitulo font-semibold">
        {t.titulo}
        {t.confirmado && <Marca className="size-7 shrink-0 text-lima" />}
      </h2>
      <p className="mt-2 text-base text-apagado">{t.linha}</p>
      {t.ondeEstou && <p className="mt-3 text-base font-medium text-tinta">{t.ondeEstou}</p>}

      {t.acoes.length === 0 ? null : confirmando?.confirmar ? (
        <div className="mt-5 rounded-placa bg-placa-alta p-4">
          <p className="text-base text-tinta">{confirmando.confirmar.frase}</p>
          <div className="mt-4 flex flex-col gap-1">
            <button type="button" className={PILULA} disabled={pendente} onClick={() => executar(confirmando)}>
              {pendente ? confirmando.fazendo : confirmando.confirmar.verbo}
            </button>
            <button type="button" className={TEXTO} disabled={pendente} onClick={() => setConfirmando(null)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {t.acoes.map((a) => (
            <button
              key={a.rotulo}
              type="button"
              className={a.primaria ? PILULA : PILULA_SEGUNDA}
              disabled={pendente}
              onClick={() => (a.confirmar ? setConfirmando(a) : executar(a))}
            >
              {pendente && emAndamento === a.rotulo ? a.fazendo : a.rotulo}
            </button>
          ))}
        </div>
      )}

      <p role="alert" className={`text-base font-medium text-erro ${erro ? 'mt-3' : 'sr-only'}`}>
        {erro}
      </p>
    </section>
  );
}

function CopiarLista({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'manual'>('parado');
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (estado === 'manual') area.current?.select();
  }, [estado]);

  async function copiar() {
    clearTimeout(timer.current);
    try {
      if (!navigator.clipboard) throw new Error('sem área de transferência');
      await navigator.clipboard.writeText(texto);
      setEstado('copiado');
      timer.current = setTimeout(() => setEstado('parado'), 2500);
    } catch {
      setEstado('manual');
    }
  }

  return (
    <section className="mt-10" aria-label="Copiar lista">
      <button type="button" className={PILULA_SEGUNDA} onClick={copiar}>
        <Copiar className="size-5" />
        Copiar lista pro WhatsApp
      </button>
      <p role="status" className={`text-center text-base font-medium text-lima ${estado === 'copiado' ? 'mt-3' : 'sr-only'}`}>
        {estado === 'copiado' ? 'Copiado. Agora é colar no grupo.' : ''}
      </p>
      {estado === 'manual' && (
        <div className="mt-4">
          <label htmlFor="texto-lista" className="block text-base text-apagado">
            Não deu para copiar sozinho. O texto está selecionado: copie e cole no grupo.
          </label>
          <textarea
            id="texto-lista"
            ref={area}
            readOnly
            value={texto}
            rows={12}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-placa bg-placa p-4 text-base text-tinta outline-none focus:ring-2 focus:ring-tinta"
          />
        </div>
      )}
    </section>
  );
}
