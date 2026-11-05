'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { Mais, Menos, SetaEsquerda } from '@/components/icones';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import type { Lado, TipoLance } from '@/domain/partida';
import type { JogadorNaPartida } from '@/server/partidas';
import { corrigir } from '../acoes';
import type { EstadoDaPartida } from '../estado';

const LADOS: Lado[] = ['A', 'B'];

/**
 * Corrigir uma partida encerrada: os gols e assistências de cada jogador com menos e mais.
 * Cada toque grava na hora e o resultado é recalculado pelo placar.
 */
export function Correcao({ estado: inicial }: { estado: EstadoDaPartida }) {
  const [estado, setEstado] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const { A, B } = estado.placar;
  const nome = (l: Lado) => NOME_DA_COR[estado.lados[l].cor];

  function mudar(jogadorId: number, tipo: TipoLance, delta: 1 | -1) {
    setErro(null);
    startSalvar(async () => {
      const r = await corrigir(estado.id, jogadorId, tipo, delta).catch(() => ({ ok: false as const, erro: MSG_ALGO_DEU_ERRADO }));
      if (r.ok) setEstado(r.estado);
      else setErro(r.erro);
    });
  }

  return (
    <main className="flex flex-1 flex-col pb-8">
      <Link href="/admin/partidas" className="-ml-3 mt-2 flex h-12 items-center gap-1 self-start rounded-placa px-2 text-base font-medium text-apagado hover:text-tinta">
        <SetaEsquerda className="size-5" />
        Partidas
      </Link>
      <h1 className="mt-2 font-placa text-titulo font-semibold">Corrigir partida</h1>
      <p className="mt-3 flex items-center gap-2 text-linha font-medium">
        <Colete cor={estado.lados.A.cor} />
        {nome('A')}
        <span className="font-placa text-subtitulo font-semibold tabular-nums">
          {A} × {B}
        </span>
        {nome('B')}
        <Colete cor={estado.lados.B.cor} />
      </p>
      <p role="status" className="mt-1 text-base text-apagado">
        {A === B ? 'Empate' : `${nome(A > B ? 'A' : 'B')} venceu`}. Cada toque já fica salvo.
      </p>
      <p role="alert" className={`text-base font-medium text-erro ${erro ? 'mt-3' : 'sr-only'}`}>
        {erro}
      </p>

      {LADOS.map((l) => (
        <section key={l} aria-labelledby={`lado-${l}`} className="mt-8">
          <h2 id={`lado-${l}`} className="flex items-center gap-2 font-placa text-2xl font-semibold">
            <Colete cor={estado.lados[l].cor} />
            {nome(l)}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {estado.lados[l].jogadores.map((j) => (
              <LinhaDoJogador key={j.id} jogador={j} desabilitado={salvando} onMudar={(tipo, delta) => mudar(j.id, tipo, delta)} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function LinhaDoJogador({
  jogador,
  desabilitado,
  onMudar,
}: {
  jogador: JogadorNaPartida;
  desabilitado: boolean;
  onMudar: (tipo: TipoLance, delta: 1 | -1) => void;
}) {
  return (
    <li className="rounded-placa bg-placa p-3">
      <p className="truncate text-linha font-medium">{jogador.nome}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Contador rotulo="gols" nome={jogador.nome} valor={jogador.gols} desabilitado={desabilitado} onMudar={(d) => onMudar('gol', d)} />
        <Contador
          rotulo="ast"
          nome={jogador.nome}
          valor={jogador.assistencias}
          desabilitado={desabilitado}
          onMudar={(d) => onMudar('assistencia', d)}
        />
      </div>
    </li>
  );
}

/** Menos, valor, mais (o seletor de nota em ponto pequeno): botões 48×48 em placa alta. */
function Contador({
  rotulo,
  nome,
  valor,
  desabilitado,
  onMudar,
}: {
  rotulo: string;
  nome: string;
  valor: number;
  desabilitado: boolean;
  onMudar: (delta: 1 | -1) => void;
}) {
  const botao =
    'flex size-12 shrink-0 items-center justify-center rounded-placa bg-placa-alta text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:bg-placa disabled:text-meta';
  const qual = rotulo === 'gols' ? 'gol' : 'assistência';
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={botao} disabled={desabilitado || valor === 0} onClick={() => onMudar(-1)} aria-label={`Tirar um ${qual} de ${nome}`}>
        <Menos className="size-5" />
      </button>
      <span className="flex min-w-0 flex-1 flex-col items-center">
        <span className="font-placa text-subtitulo font-semibold tabular-nums">{valor}</span>
        <span className="text-sm text-apagado">{rotulo}</span>
      </span>
      <button type="button" className={botao} disabled={desabilitado} onClick={() => onMudar(1)} aria-label={`Pôr um ${qual} para ${nome}`}>
        <Mais className="size-5" />
      </button>
    </div>
  );
}
