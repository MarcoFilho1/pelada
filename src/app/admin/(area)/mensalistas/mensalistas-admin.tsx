'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { MAX_MENSALISTAS as MAX, nomeDoMes } from '@/domain/tempo';
import { Marca, SetaDireita, SetaEsquerda } from '@/components/icones';
import { salvarMensalistas } from './actions';

function deslocar(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  const i = a * 12 + (m - 1) + delta;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}

const BOTAO_MES =
  'flex size-toque shrink-0 items-center justify-center rounded-placa bg-placa-alta text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60';
const BOTAO_MES_OFF = 'flex size-toque shrink-0 items-center justify-center rounded-placa bg-placa text-meta';

type Props = { mes: string; jogadores: { id: number; nome: string }[]; marcados: number[]; copiadoDe: string | null };

export function MensalistasAdmin({ mes, jogadores, marcados, copiadoDe }: Props) {
  const [salvos, setSalvos] = useState(() => new Set(marcados));
  // Mês copiado do anterior ainda não existe no banco: salvar o grava, mesmo sem mudança.
  const [pendenteDeGravar, setPendente] = useState(copiadoDe !== null);
  const [escolhidos, setEscolhidos] = useState(() => new Set(marcados));
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, startSalvar] = useTransition();

  const total = escolhidos.size;
  const cheio = total >= MAX;
  const mudou = total !== salvos.size || [...escolhidos].some((id) => !salvos.has(id));

  function alternar(id: number) {
    setAviso(null);
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else if (novo.size < MAX) novo.add(id);
      return novo;
    });
  }

  function salvar() {
    startSalvar(async () => {
      const r = await salvarMensalistas(mes, [...escolhidos]);
      if (r.ok) {
        setSalvos(new Set(escolhidos));
        setPendente(false);
        setAviso({ tipo: 'ok', texto: `Mensalistas de ${nomeDoMes(mes)} salvos.` });
      } else {
        setAviso({ tipo: 'erro', texto: r.erro });
      }
    });
  }

  // Desfazer e Salvar: no celular, na barra presa no rodapé; no PC, na linha de cima, ao lado do mês
  // (duas cópias, uma escondida em cada largura, para o Tab seguir a ordem que se vê).
  const acoes = (
    <>
      {mudou && (
        <button
          type="button"
          onClick={() => {
            setEscolhidos(new Set(salvos));
            setAviso(null);
          }}
          disabled={salvando}
          className="flex h-12 shrink-0 items-center rounded-placa px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
        >
          Desfazer
        </button>
      )}
      <button
        type="button"
        onClick={salvar}
        disabled={!(mudou || pendenteDeGravar) || total === 0 || salvando}
        className="h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado lg:w-auto lg:px-8"
      >
        {salvando ? 'Salvando…' : 'Salvar mensalistas'}
      </button>
    </>
  );

  return (
    // No PC (lg) vira grade: o mês e o Salvar dividem a linha de cima, o contador e os avisos logo
    // abaixo, e os nomes em colunas (sem a barra presa no rodapé).
    <main className="flex flex-1 flex-col pb-8 lg:grid lg:grid-cols-[20rem_minmax(0,1fr)_auto] lg:content-start lg:gap-x-6">
      <h1 className="mt-6 font-placa text-titulo font-semibold lg:col-span-3">Mensalistas</h1>

      <div className="mt-4 flex items-center gap-3 lg:col-start-1 lg:row-start-2">
        {mudou ? (
          <span className={BOTAO_MES_OFF} aria-hidden="true">
            <SetaEsquerda />
          </span>
        ) : (
          <Link href={`/admin/mensalistas?mes=${deslocar(mes, -1)}`} className={BOTAO_MES} aria-label="Mês anterior">
            <SetaEsquerda />
          </Link>
        )}
        <p className="min-w-0 flex-1 text-center text-linha font-medium first-letter:uppercase" aria-live="polite">
          {nomeDoMes(mes)}
        </p>
        {mudou ? (
          <span className={BOTAO_MES_OFF} aria-hidden="true">
            <SetaDireita />
          </span>
        ) : (
          <Link href={`/admin/mensalistas?mes=${deslocar(mes, 1)}`} className={BOTAO_MES} aria-label="Próximo mês">
            <SetaDireita />
          </Link>
        )}
      </div>

      <div className="hidden lg:col-start-3 lg:row-start-2 lg:mt-4 lg:flex lg:items-center lg:justify-end lg:gap-3">{acoes}</div>

      <p className="mt-6 flex items-baseline gap-3 lg:col-span-3 lg:row-start-3">
        <span className="font-placa text-numero font-semibold tabular-nums" aria-label={`${total} de ${MAX} vagas`}>
          {total}/{MAX}
        </span>
        <span className="text-base text-apagado">
          {cheio ? (
            'Vagas cheias. Tire alguém para pôr outro.'
          ) : total === 0 ? (
            'Marque pelo menos 1 mensalista.'
          ) : (
            <>
              {/* No PC é com o mouse. */}
              <span className="lg:hidden">Toque</span>
              <span className="hidden lg:inline">Clique</span> no nome para marcar.
            </>
          )}
        </span>
      </p>

      <p className="mt-2 text-base text-apagado lg:col-span-3 lg:row-start-4">
        Mudanças valem a partir da próxima pelada. Para esta semana, ajuste em{' '}
        <Link href="/admin/pelada" className="-my-3 inline-block py-3 font-medium text-tinta underline underline-offset-4">
          Pelada
        </Link>
        .
      </p>

      {pendenteDeGravar && (
        <p className="mt-2 text-base text-apagado lg:col-span-3 lg:row-start-5">
          Copiado de {nomeDoMes(copiadoDe ?? mes)}, ainda não salvo.
        </p>
      )}

      {jogadores.length === 0 ? (
        <p className="mt-6 text-base text-apagado lg:col-span-3 lg:row-start-7">Nenhum jogador ativo. Cadastre em Jogadores.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2 lg:col-span-3 lg:row-start-7 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
          {jogadores.map((j) => {
            const marcado = escolhidos.has(j.id);
            const travado = cheio && !marcado;
            return (
              <li key={j.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  aria-disabled={travado || undefined}
                  onClick={() => !travado && alternar(j.id)}
                  className={`flex h-toque w-full items-center justify-between gap-3 rounded-placa px-4 text-left text-linha font-medium transition-colors ${
                    marcado ? 'bg-placa-alta text-tinta' : travado ? 'bg-placa text-meta' : 'bg-placa text-tinta hover:bg-placa-alta/60 active:bg-placa-alta'
                  }`}
                >
                  <span className="min-w-0 truncate">{j.nome}</span>
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-placa ${marcado ? 'text-lima' : 'bg-chao text-transparent'}`}>
                    <Marca className="size-6" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p
        role={aviso?.tipo === 'erro' ? 'alert' : 'status'}
        className={`mt-4 text-base font-medium break-words lg:col-span-3 lg:row-start-6 ${aviso?.tipo === 'erro' ? 'text-erro' : 'text-lima'} ${aviso ? '' : 'sr-only'}`}
      >
        {aviso?.texto}
      </p>

      <div className="sticky bottom-0 -mx-5 mt-4 flex items-center gap-3 bg-chao px-5 pt-3 pb-4 lg:hidden">{acoes}</div>
    </main>
  );
}
