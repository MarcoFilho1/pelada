'use client';

// "Goleiros (opcional)" na tela da próxima partida: uma linha por time, já com a sugestão. Tocar na
// linha abre a escolha embaixo dela: quem costuma agarrar primeiro (riscado se está num dos dois
// times), "Outro…" para o resto e "Sem goleiro".

import { useState } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import type { GoleiroPossivel } from '@/server/partidas';
import type { Cor } from '@/domain/sorteio';
import type { Goleiros } from './goleiros';

type Lado = 'A' | 'B';

const CHIP = 'h-11 rounded-full px-4 text-base font-medium transition-colors';

export function GoleirosDaPartida({
  cores,
  valor,
  jogadores,
  jogando,
  onMudar,
}: {
  cores: Record<Lado, Cor>;
  valor: Goleiros;
  /** Ativos: quem costuma agarrar primeiro, depois por nome. */
  jogadores: GoleiroPossivel[];
  /** Ids dos jogadores dos dois times: não podem agarrar. */
  jogando: Set<number>;
  onMudar: (g: Goleiros) => void;
}) {
  const [aberto, setAberto] = useState<Lado | null>(null);
  const [outros, setOutros] = useState(false);
  const nome = new Map(jogadores.map((j) => [j.id, j.nome]));

  function escolher(lado: Lado, id: number | null) {
    onMudar({ ...valor, [lado]: id });
    setAberto(null);
    setOutros(false);
  }

  return (
    <div className="mt-5">
      <h3 className="text-sm font-semibold tracking-[0.08em] text-meta uppercase">Goleiros (opcional)</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {(['A', 'B'] as const).map((lado) => {
          const id = valor[lado];
          const outroLado = valor[lado === 'A' ? 'B' : 'A'];
          const daVez = aberto === lado;
          const costume = jogadores.filter((j) => j.agarra && j.id !== outroLado);
          const resto = jogadores.filter((j) => !j.agarra && !jogando.has(j.id) && j.id !== outroLado);
          return (
            <li key={lado} className="rounded-placa bg-placa">
              <button
                type="button"
                aria-expanded={daVez}
                onClick={() => {
                  setAberto(daVez ? null : lado);
                  setOutros(false);
                }}
                className="flex min-h-toque w-full items-center gap-3 rounded-placa px-4 py-2 text-left transition-colors hover:bg-placa-alta/60"
              >
                <Colete cor={cores[lado]} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-meta">Agarra no {NOME_DA_COR[cores[lado]]}</span>
                  <span className={`block truncate text-base font-semibold ${id === null ? 'text-apagado' : 'text-tinta'}`}>
                    {id === null ? 'Sem goleiro' : nome.get(id)}
                  </span>
                </span>
                <span className="text-sm text-apagado underline underline-offset-4">{daVez ? 'fechar' : id === null ? 'escolher' : 'trocar'}</span>
              </button>
              {daVez && (
                <div className="px-4 pt-1 pb-4">
                  <div className="flex flex-wrap gap-2" role="group" aria-label={`Goleiro do ${NOME_DA_COR[cores[lado]]}`}>
                    {costume.map((j) =>
                      jogando.has(j.id) ? (
                        <span key={j.id} className={`${CHIP} flex items-center text-meta line-through ring-1 ring-placa-alta ring-inset`}>
                          {j.nome}
                          <span className="sr-only"> (está jogando)</span>
                        </span>
                      ) : (
                        <button
                          key={j.id}
                          type="button"
                          aria-pressed={id === j.id}
                          onClick={() => escolher(lado, j.id)}
                          className={`${CHIP} ${id === j.id ? 'bg-lima font-semibold text-chao' : 'bg-placa-alta text-tinta active:bg-meta/60'}`}
                        >
                          {j.nome}
                        </button>
                      ),
                    )}
                    {!outros && resto.length > 0 && (
                      <button type="button" onClick={() => setOutros(true)} className={`${CHIP} text-apagado ring-1 ring-placa-alta ring-inset`}>
                        Outro…
                      </button>
                    )}
                    {outros &&
                      resto.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          aria-pressed={id === j.id}
                          onClick={() => escolher(lado, j.id)}
                          className={`${CHIP} ${id === j.id ? 'bg-lima font-semibold text-chao' : 'bg-placa-alta text-tinta active:bg-meta/60'}`}
                        >
                          {j.nome}
                        </button>
                      ))}
                    <button
                      type="button"
                      aria-pressed={id === null}
                      onClick={() => escolher(lado, null)}
                      className={`${CHIP} ${id === null ? 'bg-tinta font-semibold text-chao' : 'text-apagado ring-1 ring-placa-alta ring-inset'}`}
                    >
                      Sem goleiro
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
