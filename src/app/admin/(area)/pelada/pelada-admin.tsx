'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Ampulheta, Marca, Mais, SetaDireita } from '@/components/icones';
import { CAMPO, PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import type { EstadoManual, ItemLista } from '@/domain/lista';
import { useAutoRefresh } from '@/lib/useAutoRefresh';
import { adicionar, buscar, confirmarPor, mudarEstado, tirar, type EstadoEscolhido, type Resposta } from './acoes';

type Props = {
  peladaId: number | null;
  dataQuarta: string;
  abertura: string;
  estadoManual: EstadoManual;
  aberta: boolean;
  principal: ItemLista[];
  fila: ItemLista[];
  foraDoPrazo: ItemLista[];
  vagas: number;
};

const OPCOES: { valor: EstadoEscolhido; rotulo: string; dica: string }[] = [
  { valor: 'automatico', rotulo: 'Automático', dica: 'Abre segunda 00:00 e fecha no fim do jogo.' },
  { valor: 'aberta', rotulo: 'Aberta', dica: 'Aberta até você mudar, mesmo fora do horário.' },
  { valor: 'fechada', rotulo: 'Fechada', dica: 'Ninguém entra nem confirma mais; os jogadores ainda podem sair. Aqui você mexe em tudo.' },
  { valor: 'cancelada', rotulo: 'Cancelada', dica: 'A lista e o texto do WhatsApp mostram a pelada cancelada.' },
];

const ESPERA_BUSCA_MS = 150;

type Grupo = 'principal' | 'fila' | 'prazo';

export function PeladaAdmin(p: Props) {
  useAutoRefresh(5000);
  const escolhido: EstadoEscolhido = p.estadoManual ?? 'automatico';
  const [estadoLocal, setEstadoLocal] = useState<EstadoEscolhido | null>(null);
  const [erroEstado, setErroEstado] = useState<string | null>(null);
  const [mudando, startMudar] = useTransition();
  const [aberto, setAberto] = useState<string | null>(null);
  const atual = estadoLocal ?? escolhido;
  const confirmados = p.principal.filter((i) => i.confirmado).length;
  const naLista = new Set([...p.principal, ...p.fila].map((i) => i.jogadorId));

  function escolher(valor: EstadoEscolhido) {
    if (valor === atual || mudando) return;
    setErroEstado(null);
    setEstadoLocal(valor);
    startMudar(async () => {
      const r = await mudarEstado(p.peladaId, valor);
      if (!r.ok) setErroEstado(r.erro);
      setEstadoLocal(null);
    });
  }

  const resumo = p.estadoManual === 'cancelada' ? 'Cancelada' : p.aberta ? 'Lista aberta' : p.estadoManual === 'fechada' ? 'Lista fechada' : `Abre segunda, ${p.abertura}`;

  return (
    <main className="flex flex-1 flex-col pb-8">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Pelada</h1>
      <p className="mt-2 text-base text-apagado">
        Quarta, {p.dataQuarta} · <span className="font-medium text-tinta">{resumo}</span>
      </p>

      <Adicionar peladaId={p.peladaId} naLista={naLista} />

      <section aria-labelledby="titulo-principal" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-principal" className="font-placa text-2xl font-semibold">
            Lista
          </h2>
          <p className="text-base text-apagado">
            <span className="font-placa text-subtitulo leading-none font-semibold text-tinta tabular-nums">
              {confirmados}/{p.vagas}
            </span>{' '}
            confirmados
          </p>
        </div>
        {p.principal.length === 0 ? (
          <p className="mt-3 text-base text-meta">Ninguém na lista ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {p.principal.map((item, i) => (
              <LinhaAdmin key={item.jogadorId} grupo="principal" numero={i + 1} item={item} peladaId={p.peladaId} aberto={aberto} setAberto={setAberto} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-fila" className="mt-10">
        <h2 id="titulo-fila" className="font-placa text-2xl font-semibold">
          Fila
        </h2>
        {p.fila.length === 0 ? (
          <p className="mt-3 text-base text-meta">Ninguém na fila.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {p.fila.map((item, i) => (
              <LinhaAdmin key={item.jogadorId} grupo="fila" numero={i + 1} item={item} peladaId={p.peladaId} aberto={aberto} setAberto={setAberto} />
            ))}
          </ul>
        )}
      </section>

      {p.foraDoPrazo.length > 0 && (
        <section aria-labelledby="titulo-prazo" className="mt-10">
          <h2 id="titulo-prazo" className="font-placa text-2xl font-semibold">
            Perderam o prazo
          </h2>
          <p className="mt-1 text-base text-apagado">Mensalistas que não confirmaram até 14h.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {p.foraDoPrazo.map((item) => (
              <LinhaAdmin key={item.jogadorId} grupo="prazo" item={item} peladaId={p.peladaId} aberto={aberto} setAberto={setAberto} />
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby="titulo-estado" className="mt-12">
        <h2 id="titulo-estado" className="font-placa text-2xl font-semibold">
          Estado da lista
        </h2>
        <div role="radiogroup" aria-labelledby="titulo-estado" className="mt-3 grid grid-cols-2 gap-2">
          {OPCOES.map((o) => {
            const marcado = atual === o.valor;
            return (
              <button
                key={o.valor}
                type="button"
                role="radio"
                aria-checked={marcado}
                onClick={() => escolher(o.valor)}
                className={`flex h-toque items-center justify-between gap-2 rounded-placa px-4 text-left text-linha font-medium transition-colors ${
                  marcado ? 'bg-placa-alta text-tinta' : 'bg-placa text-tinta hover:bg-placa-alta/60 active:bg-placa-alta'
                }`}
              >
                <span className="truncate">{o.rotulo}</span>
                <span className="flex size-6 shrink-0 items-center justify-center text-lima">
                  {marcado && <Marca className="size-6" />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-base text-apagado">{OPCOES.find((o) => o.valor === atual)?.dica}</p>
        <p role="alert" className={`text-base font-medium text-erro ${erroEstado ? 'mt-2' : 'sr-only'}`}>
          {erroEstado}
        </p>
      </section>

    </main>
  );
}

function LinhaAdmin({
  grupo,
  numero,
  item,
  peladaId,
  aberto,
  setAberto,
}: {
  grupo: Grupo;
  numero?: number;
  item: ItemLista;
  peladaId: number | null;
  aberto: string | null;
  setAberto: (v: string | null) => void;
}) {
  const chave = `${grupo}-${item.jogadorId}`;
  const estaAberta = aberto === chave;
  const [tirando, setTirando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startAcao] = useTransition();
  const idPainel = `acoes-${chave}`;

  function rodar(fn: () => Promise<Resposta>) {
    setErro(null);
    startAcao(async () => {
      const r = await fn();
      if (r.ok) {
        setTirando(false);
        setAberto(null);
      } else {
        setErro(r.erro);
      }
    });
  }

  return (
    <li className={`rounded-placa ${estaAberta ? 'bg-placa-alta' : 'bg-placa'}`}>
      <button
        type="button"
        aria-expanded={estaAberta}
        aria-controls={idPainel}
        onClick={() => {
          setTirando(false);
          setErro(null);
          setAberto(estaAberta ? null : chave);
        }}
        className="flex h-toque w-full items-center gap-3 rounded-placa px-4 text-left"
      >
        {numero !== undefined && (
          <span className="w-6 shrink-0 text-right font-placa text-xl font-semibold text-meta tabular-nums">{numero}</span>
        )}
        <span className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">{item.nome}</span>
        <span className="shrink-0 text-base text-meta">
          <span aria-hidden="true">{item.tipo}</span>
          <span className="sr-only">{item.tipo === 'M' ? 'mensalista' : 'diarista'}</span>
        </span>
        {grupo === 'principal' && (
          <span className="flex w-6 shrink-0 justify-center">
            {item.confirmado ? <Marca className="size-6 text-lima" /> : <Ampulheta className="size-5 text-meta" />}
            <span className="sr-only">{item.confirmado ? 'confirmado' : 'pendente'}</span>
          </span>
        )}
        <SetaDireita className={`size-5 shrink-0 text-meta transition-transform ${estaAberta ? 'rotate-90' : ''}`} />
      </button>

      {estaAberta && (
        <div id={idPainel} className="px-4 pt-1 pb-4">
          {tirando ? (
            <div>
              <p className="text-base text-tinta">
                Tirar {item.nome} {grupo === 'fila' ? 'da fila' : 'da lista'}? Se voltar, entra no fim da fila.
              </p>
              <div className="mt-3 flex flex-col gap-1">
                <button type="button" className={PILULA} disabled={pendente} onClick={() => rodar(() => tirar(peladaId, item.jogadorId))}>
                  {pendente ? 'Tirando…' : 'Tirar'}
                </button>
                <button type="button" className={TEXTO} disabled={pendente} onClick={() => setTirando(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {grupo === 'principal' && !item.confirmado && (
                <button type="button" className={PILULA} disabled={pendente} onClick={() => rodar(() => confirmarPor(peladaId, item.jogadorId))}>
                  {pendente ? 'Confirmando…' : 'Confirmar presença'}
                </button>
              )}
              {grupo === 'prazo' ? (
                <button type="button" className={PILULA} disabled={pendente} onClick={() => rodar(() => adicionar(peladaId, item.jogadorId))}>
                  {pendente ? 'Pondo na fila…' : 'Pôr no fim da fila'}
                </button>
              ) : (
                <button type="button" className={PILULA_SEGUNDA} disabled={pendente} onClick={() => setTirando(true)}>
                  {grupo === 'fila' ? 'Tirar da fila' : 'Tirar da lista'}
                </button>
              )}
            </div>
          )}
          <p role="alert" className={`text-base font-medium text-erro ${erro ? 'mt-3' : 'sr-only'}`}>
            {erro}
          </p>
        </div>
      )}
    </li>
  );
}

function Adicionar({ peladaId, naLista }: { peladaId: number | null; naLista: Set<number> }) {
  const [termo, setTermo] = useState('');
  const [sugestoes, setSugestoes] = useState<{ id: number; nome: string }[] | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [pendente, startAcao] = useTransition();
  const pedido = useRef(0);

  useEffect(() => {
    const t = termo.trim();
    const meu = ++pedido.current;
    if (!t) return;
    const timer = setTimeout(async () => {
      const r = await buscar(t);
      if (meu === pedido.current) setSugestoes(r);
    }, ESPERA_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [termo]);

  function por(j: { id: number; nome: string }) {
    setAviso(null);
    startAcao(async () => {
      const r = await adicionar(peladaId, j.id);
      if (r.ok) {
        setAviso({ tipo: 'ok', texto: `${j.nome} entrou.` });
        setTermo('');
        setSugestoes(null);
      } else {
        setAviso({ tipo: 'erro', texto: r.erro });
      }
    });
  }

  const lista = termo.trim() ? sugestoes : null;

  return (
    <section aria-label="Pôr alguém na lista" className="mt-6">
      <label htmlFor="busca-jogador" className="block text-base font-medium text-apagado">
        Pôr alguém na lista
      </label>
      <input
        id="busca-jogador"
        value={termo}
        onChange={(e) => {
          setTermo(e.target.value);
          setAviso(null);
          if (!e.target.value.trim()) setSugestoes(null);
        }}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Digite o nome"
        className={`mt-2 ${CAMPO}`}
      />
      <p className="mt-2 text-base text-meta">Quem não é mensalista entra no fim da fila, ou direto na lista se tiver vaga.</p>
      {lista && (
        <ul className="mt-2 flex flex-col">
          {lista.length === 0 && <li className="py-3 text-base text-meta">Ninguém com esse nome. Cadastre em Jogadores.</li>}
          {lista.map((j) => {
            const ja = naLista.has(j.id);
            return (
              <li key={j.id}>
                <button
                  type="button"
                  disabled={ja || pendente}
                  onClick={() => por(j)}
                  className="-mx-4 flex h-toque w-[calc(100%+2rem)] items-center justify-between gap-3 rounded-placa px-4 text-left transition-colors hover:bg-placa active:bg-placa-alta disabled:hover:bg-transparent"
                >
                  <span className={`min-w-0 truncate text-linha font-medium ${ja ? 'text-meta' : 'text-tinta'}`}>{j.nome}</span>
                  {ja ? <span className="shrink-0 text-base text-meta">Já está</span> : <Mais className="size-5 shrink-0 text-apagado" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p
        role={aviso?.tipo === 'erro' ? 'alert' : 'status'}
        className={`text-base font-medium ${aviso?.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${aviso ? 'mt-2' : 'sr-only'}`}
      >
        {aviso?.texto}
      </p>
    </section>
  );
}
