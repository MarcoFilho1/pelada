'use client';

import { useMemo, useRef, useState, useTransition, type ReactNode } from 'react';
import { Marca, Mais } from '@/components/icones';
import { CAMPO, PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { normalizarNome } from '@/domain/nome';
import { CORES, diferenca, diferencaMedia, formatarNota, type Cor, type JogadorNota } from '@/domain/sorteio';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import type { TimeDaPelada } from '@/server/times';
import { cadastrarRapido, marcarDefinitivo, mover, sortear } from './acoes';

type Props = {
  peladaId: number;
  /** 'DD/MM' da quarta. */
  data: string;
  /** A pelada é a de hoje (senão é a última que teve). */
  hoje: boolean;
  cancelada: boolean;
  ativos: JogadorNota[];
  /** Quem começa marcado: os confirmados da lista, ou quem já está nos times salvos. */
  marcados: number[];
  /** Na lista sem confirmar ou na fila: aparecem desmarcados. */
  sugeridos: number[];
  times: TimeDaPelada[];
  temPartida: boolean;
  /** Tem partida rolando: o que mudar aqui só vale para a próxima. */
  emAndamento: boolean;
};

const NOME_DA_COR: Record<Cor, string> = { azul: 'Azul', laranja: 'Laranja', verde: 'Verde', preto: 'Preto' };
const MAX_SUGESTOES = 6;

const somar = (js: JogadorNota[]) => js.reduce((s, j) => s + j.nota, 0);
const comSoma = (js: JogadorNota[]) => ({ jogadores: js, soma: somar(js) });

export function SorteioAdmin(p: Props) {
  const [refazendo, setRefazendo] = useState(false);
  const definitivo = p.times.length > 0 && !refazendo;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Quarta, {p.data}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-base text-apagado">
        <span>{p.hoje ? 'Hoje' : 'A última pelada'}</span>
        {p.cancelada && <span className="font-medium text-tinta">· Cancelada</span>}
        {definitivo && (
          <span className="flex items-center gap-1 font-medium text-tinta">
            · Times definitivos
            <Marca className="size-5 shrink-0 text-lima" />
          </span>
        )}
      </p>
      {p.emAndamento && (
        <p role="status" className="mt-3 rounded-placa bg-placa px-4 py-3 text-base font-medium text-tinta">
          Partida em andamento — mudanças valem para a próxima.
        </p>
      )}
      {definitivo ? (
        <Definitivo {...p} onRefazer={() => setRefazendo(true)} />
      ) : (
        <Sorteio {...p} onVoltar={p.times.length ? () => setRefazendo(false) : undefined} onSalvo={() => setRefazendo(false)} />
      )}
    </main>
  );
}

// ---- Antes de definir: quem joga, sortear, trocar --------------------------------------

type Selecao = { time: number; id: number };

function Sorteio(p: Props & { onVoltar?: () => void; onSalvo: () => void }) {
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const todos = useMemo(() => [...p.ativos, ...cadastrados], [p.ativos, cadastrados]);
  const porId = useMemo(() => new Map(todos.map((j) => [j.id, j])), [todos]);
  const [linhas, setLinhas] = useState<number[]>(() => [...p.marcados, ...p.sugeridos]);
  const [marcados, setMarcados] = useState<Set<number>>(() => new Set(p.marcados));
  const [proposta, setProposta] = useState<JogadorNota[][] | null>(null);
  const [selecao, setSelecao] = useState<Selecao | null>(null);
  const [troca, setTroca] = useState<{ ids: number[]; n: number }>({ ids: [], n: 0 });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();
  const [acao, setAcao] = useState<'sortear' | 'definir' | null>(null);

  const visiveis = linhas.filter((id) => porId.has(id));
  const escolhidos = visiveis.filter((id) => marcados.has(id));
  const nTimes = Math.min(CORES.length, escolhidos.length);

  function alternar(id: number) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function incluir(j: JogadorNota) {
    setLinhas((ls) => (ls.includes(j.id) ? ls : [...ls, j.id]));
    setMarcados((m) => new Set(m).add(j.id));
  }

  function rodarSorteio() {
    setErro(null);
    setSelecao(null);
    setAcao('sortear');
    startAcao(async () => {
      const r = await sortear(escolhidos);
      if (r.ok) {
        setProposta(r.times.map((t) => t.jogadores));
        setTroca({ ids: [], n: troca.n + 1 });
      } else setErro(r.erro);
      setAcao(null);
    });
  }

  function definir() {
    if (!proposta) return;
    setErro(null);
    setSelecao(null);
    setAcao('definir');
    startAcao(async () => {
      const r = await marcarDefinitivo(
        p.peladaId,
        proposta.map((t) => t.map((j) => j.id)),
      );
      if (r.ok) p.onSalvo();
      else setErro(r.erro);
      setAcao(null);
    });
  }

  function tocar(time: number, id: number) {
    if (!proposta || pendente) return;
    if (!selecao || selecao.time === time) {
      setSelecao(selecao?.id === id ? null : { time, id });
      return;
    }
    const outro = selecao;
    const times = proposta.map((t) => [...t]);
    const a = times[outro.time].findIndex((j) => j.id === outro.id);
    const b = times[time].findIndex((j) => j.id === id);
    [times[outro.time][a], times[time][b]] = [times[time][b], times[outro.time][a]];
    const ordenar = (t: JogadorNota[]) => t.sort((x, y) => y.nota - x.nota || x.nome.localeCompare(y.nome, 'pt-BR'));
    ordenar(times[outro.time]);
    ordenar(times[time]);
    setProposta(times);
    setSelecao(null);
    setTroca({ ids: [outro.id, id], n: troca.n + 1 });
  }

  if (proposta) {
    const times = proposta.map(comSoma);
    const selecionado = selecao ? porId.get(selecao.id) : undefined;
    return (
      <>
        <Equilibrio
          times={times}
          dica="Toque em dois de times diferentes para trocar."
          acao={
            <button
              type="button"
              className={`-mr-3 ${TEXTO}`}
              disabled={pendente}
              onClick={() => {
                setProposta(null);
                setSelecao(null);
                setErro(null);
              }}
            >
              Mudar quem joga
            </button>
          }
        />
        <GradeDeTimes
          times={times}
          selecionado={selecao?.id ?? null}
          animados={troca}
          onToque={(t, j) => tocar(t, j.id)}
        />
        <Barra folha={!!selecionado}>
          {selecionado ? (
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-base text-apagado">
                <span className="block truncate text-linha font-medium text-tinta">Trocar {selecionado.nome}</span>
                com alguém de outro time
              </p>
              <button type="button" className={`-mr-3 ${TEXTO}`} onClick={() => setSelecao(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button type="button" className={PILULA} disabled={pendente} onClick={definir}>
                {acao === 'definir' ? 'Salvando…' : 'Marcar como definitivo'}
              </button>
              <button type="button" className={PILULA_SEGUNDA} disabled={pendente} onClick={rodarSorteio}>
                {acao === 'sortear' ? 'Sorteando…' : 'Sortear de novo'}
              </button>
            </div>
          )}
          <Erro texto={erro} />
        </Barra>
      </>
    );
  }

  return (
    <>
      {p.onVoltar && (
        <p className="mt-4 text-base text-apagado">
          Os times salvos continuam valendo até você marcar um sorteio novo como definitivo.
        </p>
      )}
      <BuscaDeJogador
        id="busca-sorteio"
        rotulo="Pôr mais alguém"
        todos={todos}
        jaEstao={marcados}
        textoJaEsta="Já marcado"
        onEscolher={incluir}
        onCadastrado={(j) => {
          setCadastrados((cs) => [...cs, j]);
          incluir(j);
        }}
      />

      <section aria-labelledby="titulo-quem-joga" className="mt-8">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-quem-joga" className="font-placa text-2xl font-semibold">
            Quem joga
          </h2>
          <p className="text-base text-apagado">
            <span className="font-placa text-subtitulo leading-none font-semibold text-tinta tabular-nums">{escolhidos.length}</span>{' '}
            {escolhidos.length === 1 ? 'marcado' : 'marcados'}
          </p>
        </div>
        {visiveis.length === 0 ? (
          <p className="mt-3 text-base text-meta">Ninguém confirmou na lista. Busque pelo nome quem está na quadra.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {visiveis.map((id) => {
              const j = porId.get(id)!;
              const marcado = marcados.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={marcado}
                    onClick={() => alternar(id)}
                    className={`flex h-toque w-full items-center gap-3 rounded-placa px-4 text-left text-linha font-medium transition-colors ${
                      marcado ? 'bg-placa-alta text-tinta' : 'bg-placa text-apagado hover:bg-placa-alta/60 active:bg-placa-alta'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{j.nome}</span>
                    <span className="shrink-0 text-base text-meta tabular-nums">
                      <span className="sr-only">nota </span>
                      {formatarNota(j.nota)}
                    </span>
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-placa text-lima ${marcado ? '' : 'bg-chao'}`}>
                      {marcado && <Marca className="size-6" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Barra>
        <button type="button" className={PILULA} disabled={pendente || escolhidos.length < 2} onClick={rodarSorteio}>
          {acao === 'sortear'
            ? 'Sorteando…'
            : escolhidos.length < 2
              ? 'Marque pelo menos 2'
              : `Sortear ${escolhidos.length} em ${nTimes} times`}
        </button>
        {p.onVoltar && (
          <button type="button" className={`mx-auto mt-1 ${TEXTO}`} disabled={pendente} onClick={p.onVoltar}>
            Voltar aos times salvos
          </button>
        )}
        <Erro texto={erro} />
      </Barra>
    </>
  );
}

// ---- Depois de definir: mexer nos times entre as partidas -------------------------------

type Escolhido = { id: number; nome: string; de: number | null };

function Definitivo(p: Props & { onRefazer: () => void }) {
  useAutoRefresh(5000);
  const [escolhido, setEscolhido] = useState<Escolhido | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [cadastrados, setCadastrados] = useState<JogadorNota[]>([]);
  const [pendente, startAcao] = useTransition();
  const emTime = new Set(p.times.flatMap((t) => t.jogadores.map((j) => j.id)));
  const todos = [...p.ativos, ...cadastrados.filter((c) => !p.ativos.some((a) => a.id === c.id))];
  const corDoTime = new Map(p.times.map((t) => [t.id, t.cor]));
  const times = p.times.map((t) => comSoma(t.jogadores));

  function levar(para: number | null) {
    if (!escolhido) return;
    const e = escolhido;
    setAviso(null);
    startAcao(async () => {
      const r = await mover(e.id, e.de, para);
      if (r.ok) {
        const destino = para === null ? null : NOME_DA_COR[corDoTime.get(para)!];
        const origem = e.de === null ? null : NOME_DA_COR[corDoTime.get(e.de)!];
        setAviso({ tipo: 'ok', texto: destino ? `${e.nome} agora é do ${destino}.` : `${e.nome} saiu do ${origem}.` });
        setEscolhido(null);
      } else setAviso({ tipo: 'erro', texto: r.erro });
    });
  }

  return (
    <>
      <Equilibrio times={times} dica="Toque num jogador para mudar de time ou tirar." />
      <GradeDeTimes
        times={times}
        cores={p.times.map((t) => t.cor)}
        selecionado={escolhido?.id ?? null}
        onToque={(i, j) => {
          setAviso(null);
          setEscolhido(escolhido?.id === j.id ? null : { id: j.id, nome: j.nome, de: p.times[i].id });
        }}
      />

      <BuscaDeJogador
        id="busca-definitivo"
        rotulo="Pôr alguém num time"
        todos={todos}
        jaEstao={emTime}
        textoJaEsta="Já tem time"
        onEscolher={(j) => {
          setAviso(null);
          setEscolhido({ id: j.id, nome: j.nome, de: null });
        }}
        onCadastrado={(j) => {
          setCadastrados((cs) => [...cs, j]);
          setEscolhido({ id: j.id, nome: j.nome, de: null });
        }}
      />

      <section aria-label="Sortear de novo" className="mt-10">
        {p.temPartida ? (
          <p className="text-base text-meta">Já tem partida jogada: os times mudam só por aqui, jogador por jogador.</p>
        ) : (
          <>
            <button type="button" className={PILULA_SEGUNDA} onClick={p.onRefazer}>
              Sortear de novo
            </button>
            <p className="mt-2 text-base text-meta">Os times salvos só mudam quando você marcar o novo sorteio como definitivo.</p>
          </>
        )}
      </section>

      {(escolhido || aviso) && (
        <Barra folha={!!escolhido}>
          {escolhido && (
            <div>
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">
                  {escolhido.de === null ? `Pôr ${escolhido.nome} no` : `Levar ${escolhido.nome} para`}
                </p>
                <button type="button" className={`-mr-3 ${TEXTO}`} disabled={pendente} onClick={() => setEscolhido(null)}>
                  Cancelar
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {p.times
                  .filter((t) => t.id !== escolhido.de)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={pendente}
                      onClick={() => levar(t.id)}
                      className="flex h-toque items-center gap-3 rounded-placa bg-placa-alta px-4 text-left text-linha font-medium text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta"
                    >
                      <Colete cor={t.cor} />
                      {NOME_DA_COR[t.cor]}
                    </button>
                  ))}
              </div>
              {escolhido.de !== null && (
                <button type="button" className={`mt-2 ${PILULA_SEGUNDA}`} disabled={pendente} onClick={() => levar(null)}>
                  Tirar do time
                </button>
              )}
            </div>
          )}
          {aviso && (
            <p
              role={aviso.tipo === 'erro' ? 'alert' : 'status'}
              className={`text-base font-medium ${aviso.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${escolhido ? 'mt-3' : ''}`}
            >
              {aviso.texto}
            </p>
          )}
        </Barra>
      )}
    </>
  );
}

// ---- Peças -------------------------------------------------------------------------------

/**
 * A diferença de força dita com todas as letras (maior soma menos a menor), o que dá para fazer
 * nos cartões e, à direita, uma ação de texto opcional.
 */
function Equilibrio({ times, dica, acao }: { times: { jogadores: JogadorNota[]; soma: number }[]; dica: string; acao?: ReactNode }) {
  const tamanhos = new Set(times.map((t) => t.jogadores.length));
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-placa text-subtitulo font-semibold tabular-nums">Diferença: {formatarNota(diferenca(times))}</p>
        {acao}
      </div>
      {tamanhos.size > 1 && (
        <p className="text-base text-apagado">
          Times de tamanhos diferentes: por jogador, a diferença é {diferencaMedia(times).toFixed(2).replace('.', ',')}.
        </p>
      )}
      <p className="mt-1 text-base text-meta">{dica}</p>
    </div>
  );
}

/** Bolinha com a cor do colete. O preto ganha contorno para aparecer no fundo preto. */
function Colete({ cor }: { cor: Cor }) {
  const fundo: Record<Cor, string> = {
    azul: 'bg-colete-azul',
    laranja: 'bg-colete-laranja',
    verde: 'bg-colete-verde',
    preto: 'bg-chao ring-2 ring-inset ring-apagado',
  };
  return <span aria-hidden="true" className={`size-4 shrink-0 rounded-full ${fundo[cor]}`} />;
}

function GradeDeTimes({
  times,
  cores = CORES.slice(0, times.length),
  selecionado,
  animados,
  onToque,
}: {
  times: { jogadores: JogadorNota[]; soma: number }[];
  cores?: readonly Cor[];
  selecionado: number | null;
  animados?: { ids: number[]; n: number };
  onToque: (time: number, j: JogadorNota) => void;
}) {
  return (
    <section aria-label="Times" className="mt-4">
      <div className="grid grid-cols-2 gap-2">
        {times.map((t, i) => {
          const cor = cores[i];
          const idTitulo = `time-${cor}`;
          return (
            <section key={cor} aria-labelledby={idTitulo} className="flex flex-col rounded-placa bg-placa p-1.5">
              <div className="flex h-12 items-center gap-2 px-2">
                <Colete cor={cor} />
                <h3 id={idTitulo} className="min-w-0 flex-1 truncate text-base font-semibold">
                  {NOME_DA_COR[cor]}
                </h3>
                <span className="font-placa text-subtitulo leading-none font-semibold tabular-nums">
                  <span className="sr-only">soma </span>
                  {formatarNota(t.soma)}
                </span>
              </div>
              {t.jogadores.length === 0 ? (
                <p className="px-2 pb-3 text-base text-meta">Ninguém.</p>
              ) : (
                <ul className="flex flex-col">
                  {t.jogadores.map((j) => {
                    const marcado = selecionado === j.id;
                    const animar = animados?.ids.includes(j.id);
                    return (
                      <li key={animar ? `${j.id}-${animados!.n}` : j.id}>
                        <button
                          type="button"
                          aria-pressed={marcado}
                          onClick={() => onToque(i, j)}
                          className={`flex h-12 w-full items-center gap-2 rounded-placa px-2 text-left transition-colors ${
                            marcado ? 'bg-placa-alta ring-2 ring-lima ring-inset' : 'hover:bg-placa-alta/60 active:bg-placa-alta'
                          } ${animar ? 'animate-pendurar' : ''}`}
                        >
                          <span className="min-w-0 flex-1 truncate text-base font-medium text-tinta">{j.nome}</span>
                          <span className="shrink-0 text-base text-meta tabular-nums">
                            <span className="sr-only">nota </span>
                            {formatarNota(j.nota)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Barra de baixo, presa no rodapé da tela: as ações ficam no alcance do polegar. `folha` = a
 * pergunta de um jogador escolhido: sobe em placa com sombra, porque flutua sobre os times.
 */
function Barra({ children, folha = false }: { children: ReactNode; folha?: boolean }) {
  return (
    <div
      className={`sticky bottom-0 mt-auto ${
        folha ? '-mx-3 rounded-t-cartao bg-placa px-4 pt-3 pb-4 shadow-[0_-12px_32px_rgba(0,0,0,0.7)]' : '-mx-5 bg-chao px-5 pt-3 pb-4'
      }`}
    >
      {children}
    </div>
  );
}

function Erro({ texto }: { texto: string | null }) {
  return (
    <p role="alert" className={`text-base font-medium text-erro ${texto ? 'mt-3' : 'sr-only'}`}>
      {texto}
    </p>
  );
}

/** Busca qualquer jogador ativo pelo nome (Joao acha João) e, se não existir, cadastra na hora. */
function BuscaDeJogador({
  id,
  rotulo,
  todos,
  jaEstao,
  textoJaEsta,
  onEscolher,
  onCadastrado,
}: {
  id: string;
  rotulo: string;
  todos: JogadorNota[];
  jaEstao: Set<number>;
  textoJaEsta: string;
  onEscolher: (j: JogadorNota) => void;
  onCadastrado: (j: JogadorNota) => void;
}) {
  const [termo, setTermo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const t = normalizarNome(termo);

  const achados = useMemo(() => {
    if (!t) return [];
    return todos
      .map((j) => ({ j, chave: normalizarNome(j.nome) }))
      .filter((x) => x.chave.includes(t))
      .sort((x, y) => Number(y.chave.startsWith(t)) - Number(x.chave.startsWith(t)) || x.chave.localeCompare(y.chave, 'pt-BR'))
      .slice(0, MAX_SUGESTOES)
      .map((x) => x.j);
  }, [t, todos]);
  const existe = !!t && todos.some((j) => normalizarNome(j.nome) === t);

  function escolher(j: JogadorNota) {
    onEscolher(j);
    setTermo('');
    campo.current?.blur(); // fecha o teclado para a escolha do time aparecer inteira
  }

  function cadastrar() {
    const nome = termo.trim();
    startAcao(async () => {
      const r = await cadastrarRapido(nome);
      if (r.ok) {
        onCadastrado(r.jogador);
        setTermo('');
        campo.current?.blur();
      } else setErro(r.erro);
    });
  }

  return (
    <section aria-label={rotulo} className="mt-6">
      <label htmlFor={id} className="block text-base font-medium text-apagado">
        {rotulo}
      </label>
      <input
        id={id}
        ref={campo}
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setErro(null);
        }}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Digite o nome"
        className={`mt-2 ${CAMPO}`}
      />
      {t && (
        <ul className="mt-2 flex flex-col">
          {achados.map((j) => {
            const ja = jaEstao.has(j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  disabled={ja || pendente}
                  onClick={() => escolher(j)}
                  className="-mx-4 flex h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
                >
                  <span className={`min-w-0 truncate text-linha font-medium ${ja ? 'text-meta' : 'text-tinta'}`}>{j.nome}</span>
                  {ja ? <span className="shrink-0 text-base text-meta">{textoJaEsta}</span> : <Mais className="size-5 shrink-0 text-apagado" />}
                </button>
              </li>
            );
          })}
          {!existe && (
            <li>
              <button
                type="button"
                disabled={pendente}
                onClick={cadastrar}
                className="-mx-4 flex min-h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 py-2 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-linha font-medium text-tinta">
                    {pendente ? 'Cadastrando…' : `Cadastrar “${termo.trim()}”`}
                  </span>
                  <span className="block text-base text-meta">Jogador novo, nota 3,0</span>
                </span>
                <Mais className="size-5 shrink-0 text-apagado" />
              </button>
            </li>
          )}
        </ul>
      )}
      <Erro texto={erro} />
    </section>
  );
}
