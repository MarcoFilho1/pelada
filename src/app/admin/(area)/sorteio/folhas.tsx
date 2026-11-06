'use client';

// O que aparece na barra de baixo do celular e, no PC, acima dos times ou no Painel ao lado: as ações do
// sorteio, a troca e a mudança de time de quem foi escolhido, o aviso e o "Sortear de novo" dos times salvos.
// Cada peça recebe `pc` quando muda de forma entre as larguras; o estado é sempre de quem chama.

import { Colete, NOME_DA_COR } from '@/components/colete';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import type { Cor } from '@/domain/sorteio';

/** No PC a pílula fica do tamanho do texto (ações lado a lado acima dos times). */
const DO_TAMANHO = 'lg:w-auto lg:px-8';

/** A consequência de marcar um sorteio novo depois de partidas jogadas. */
function fraseDasJogadas(n: number) {
  return n === 1
    ? 'A partida já jogada fica como está. Os times novos valem daqui pra frente.'
    : `As ${n} partidas já jogadas ficam como estão. Os times novos valem daqui pra frente.`;
}

/**
 * As ações antes de definir. `escolher`: a pílula que conta o sorteio ("Sortear 16 em 4 times"); `proposta`:
 * "Marcar como definitivo" e "Sortear de novo", ou a confirmação com partidas jogadas. No celular, empilhadas na
 * barra de baixo; no PC (`pc`), lado a lado e do tamanho do texto, acima dos times.
 */
export function AcoesDoSorteio({
  pc = false,
  fase,
  escolhidos,
  nTimes,
  viramComplete,
  pendente,
  acao,
  confirmando,
  jogadas,
  motivoTravado,
  onSortear,
  onDefinir,
  onVoltarDaConfirmacao,
  onVoltarAosSalvos,
}: {
  pc?: boolean;
  fase: 'escolher' | 'proposta';
  escolhidos: number;
  nTimes: number;
  viramComplete: number;
  pendente: boolean;
  acao: 'sortear' | 'definir' | null;
  confirmando: boolean;
  jogadas: number;
  motivoTravado: string | null;
  onSortear: () => void;
  onDefinir: () => void;
  onVoltarDaConfirmacao: () => void;
  onVoltarAosSalvos?: () => void;
}) {
  const idMotivo = pc ? 'motivo-travado-pc' : 'motivo-travado';
  const motivo = motivoTravado && (
    <p id={idMotivo} className={`text-base text-apagado ${confirmando ? 'mt-2' : pc ? 'mt-2 basis-full' : ''}`}>
      {motivoTravado}
    </p>
  );
  const travado = { disabled: pendente || motivoTravado !== null, 'aria-describedby': motivoTravado ? idMotivo : undefined };

  if (fase === 'escolher') {
    const complete =
      escolhidos >= 2 && viramComplete > 0 ? (viramComplete === 1 ? '1 vaga vira COMPLETE.' : `${viramComplete} vagas viram COMPLETE.`) : null;
    const pilula = (
      <button type="button" className={`${PILULA} ${DO_TAMANHO}`} disabled={pendente || escolhidos < 2} onClick={onSortear}>
        {acao === 'sortear' ? 'Sorteando…' : escolhidos < 2 ? 'Marque pelo menos 2' : `Sortear ${escolhidos} em ${nTimes} times`}
      </button>
    );
    const voltar = onVoltarAosSalvos && (
      <button type="button" className={`${pc ? '-mx-3' : 'mx-auto mt-1'} ${TEXTO}`} disabled={pendente} onClick={onVoltarAosSalvos}>
        Voltar aos times salvos
      </button>
    );
    return pc ? (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {pilula}
        {complete && <p className="text-base text-meta">{complete}</p>}
        {voltar}
      </div>
    ) : (
      <>
        {pilula}
        {complete && <p className="mt-2 text-center text-base text-meta">{complete}</p>}
        {voltar}
      </>
    );
  }

  if (confirmando) {
    const usar = (
      <button type="button" className={`${pc ? '' : 'mt-4'} ${PILULA} ${DO_TAMANHO}`} {...travado} onClick={onDefinir}>
        {acao === 'definir' ? 'Salvando…' : 'Usar os times novos'}
      </button>
    );
    const voltar = (
      <button type="button" className={`${pc ? '' : 'mx-auto mt-1'} ${TEXTO}`} disabled={pendente} onClick={onVoltarDaConfirmacao}>
        Voltar
      </button>
    );
    return (
      <div className={`rounded-placa bg-placa-alta p-4 ${pc ? 'max-w-md' : ''}`}>
        <p className="text-base font-medium text-tinta">{fraseDasJogadas(jogadas)}</p>
        {pc ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {usar}
              {voltar}
            </div>
            {motivo}
          </>
        ) : (
          <>
            {usar}
            {motivo}
            {voltar}
          </>
        )}
      </div>
    );
  }

  return (
    <div className={pc ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2'}>
      <button type="button" className={`${PILULA} ${DO_TAMANHO}`} {...travado} onClick={onDefinir}>
        {acao === 'definir' ? 'Salvando…' : 'Marcar como definitivo'}
      </button>
      {!pc && motivo}
      <button type="button" className={`${PILULA_SEGUNDA} ${DO_TAMANHO}`} disabled={pendente} onClick={onSortear}>
        {acao === 'sortear' ? 'Sorteando…' : 'Sortear de novo'}
      </button>
      {pc && motivo}
    </div>
  );
}

/** Na proposta, com um jogador escolhido: falta tocar em alguém de outro time. */
export function TrocarEscolhido({ nome, onCancelar }: { nome: string; onCancelar: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <p className="min-w-0 flex-1 text-base text-apagado">
        <span className="block truncate text-linha font-medium text-tinta">Trocar {nome}</span>
        com alguém de outro time
      </p>
      <button type="button" className={`-mr-3 ${TEXTO}`} onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}

/** Nos times salvos, com um jogador escolhido (ou achado na busca): para qual time ele vai, ou sair do time. */
export function LevarEscolhido({
  nome,
  de,
  times,
  pendente,
  onLevar,
  onCancelar,
}: {
  nome: string;
  /** O time de onde ele sai, ou null (achado na busca, sem time). */
  de: number | null;
  times: { id: number; cor: Cor }[];
  pendente: boolean;
  onLevar: (para: number | null) => void;
  onCancelar: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate text-linha font-medium text-tinta">{de === null ? `Pôr ${nome} no` : `Levar ${nome} para`}</p>
        <button type="button" className={`-mr-3 ${TEXTO}`} disabled={pendente} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {times
          .filter((t) => t.id !== de)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={pendente}
              onClick={() => onLevar(t.id)}
              className="flex h-toque items-center gap-3 rounded-placa bg-placa-alta px-4 text-left text-linha font-medium text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta"
            >
              <Colete cor={t.cor} />
              {NOME_DA_COR[t.cor]}
            </button>
          ))}
      </div>
      {de !== null && (
        <button type="button" className={`mt-2 ${PILULA_SEGUNDA}`} disabled={pendente} onClick={() => onLevar(null)}>
          Tirar do time
        </button>
      )}
    </div>
  );
}

export type Aviso = { tipo: 'ok' | 'erro'; texto: string; /** O mesmo aviso dito para o mouse ("Clique…"). */ textoPc?: string };

/** "Fulano agora é do Azul." em lima, ou o erro em vermelho. */
export function AvisoDoSorteio({ aviso, pc = false, className = '' }: { aviso: Aviso; pc?: boolean; className?: string }) {
  return (
    <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`text-base font-medium ${aviso.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${className}`}>
      {pc ? (aviso.textoPc ?? aviso.texto) : aviso.texto}
    </p>
  );
}

/** Times salvos: refazer o sorteio sem perder os times até o novo ser marcado como definitivo. */
export function SortearDeNovo({ jogadas, onRefazer, className }: { jogadas: number; onRefazer: () => void; className: string }) {
  return (
    <section aria-label="Sortear de novo" className={className}>
      <button type="button" className={PILULA_SEGUNDA} onClick={onRefazer}>
        Sortear de novo
      </button>
      <p className="mt-2 text-base text-meta">
        {jogadas > 0
          ? 'Os times salvos só mudam quando você marcar o novo sorteio como definitivo. As partidas já jogadas não mudam.'
          : 'Os times salvos só mudam quando você marcar o novo sorteio como definitivo.'}
      </p>
    </section>
  );
}
