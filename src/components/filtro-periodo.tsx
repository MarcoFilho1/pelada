import Link from 'next/link';
import { SetaDireita, SetaEsquerda } from '@/components/icones';
import { alvoDaAba, nomeDoPeriodo, parametroDoPeriodo, vizinhos, type Aba, type PeriodosDisponiveis } from '@/domain/periodo';
import type { Periodo } from '@/domain/ranking';

const ABAS: { aba: Aba; rotulo: string }[] = [
  { aba: 'geral', rotulo: 'Geral' },
  { aba: 'ano', rotulo: 'Ano' },
  { aba: 'mes', rotulo: 'Mês' },
];

const SETA = 'flex size-toque shrink-0 items-center justify-center rounded-placa';
const SETA_ON = `${SETA} bg-placa-alta text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60`;
const SETA_OFF = `${SETA} bg-placa text-meta`;

/**
 * Filtro Geral / Ano / Mês. O período vive na URL (`?p=`), para o link poder ir pro grupo:
 * as abas e as setas são links comuns. Ano e Mês só existem se houver partida encerrada.
 */
export function FiltroPeriodo({ base, periodo, disp }: { base: string; periodo: Periodo; disp: PeriodosDisponiveis }) {
  const href = (p: Periodo) => `${base}?p=${parametroDoPeriodo(p)}`;
  const { anterior, seguinte } = vizinhos(periodo, disp);
  const unidade = periodo.tipo === 'ano' ? 'Ano' : 'Mês';

  return (
    <div className="mt-5">
      <nav aria-label="Período" className="grid grid-cols-3 gap-1 rounded-placa bg-placa p-1">
        {ABAS.map(({ aba, rotulo }) => {
          const alvo = alvoDaAba(aba, periodo, disp);
          const atual = periodo.tipo === aba;
          if (!alvo) {
            return (
              <span key={aba} aria-disabled="true" className="flex h-12 items-center justify-center text-base font-medium text-meta">
                {rotulo}
              </span>
            );
          }
          return (
            <Link
              key={aba}
              href={href(alvo)}
              scroll={false}
              aria-current={atual ? 'true' : undefined}
              className={`flex h-12 items-center justify-center rounded-[7px] text-base font-medium transition-colors ${
                atual ? 'bg-placa-alta text-tinta' : 'text-apagado hover:text-tinta'
              }`}
            >
              {rotulo}
            </Link>
          );
        })}
      </nav>

      {periodo.tipo !== 'geral' && (
        <div className="mt-3 flex items-center gap-3">
          {anterior ? (
            <Link href={href(anterior)} scroll={false} className={SETA_ON} aria-label={`${unidade} anterior: ${nomeDoPeriodo(anterior)}`}>
              <SetaEsquerda />
            </Link>
          ) : (
            <span className={SETA_OFF} aria-hidden="true">
              <SetaEsquerda />
            </span>
          )}
          <p className="min-w-0 flex-1 text-center text-linha font-medium">{nomeDoPeriodo(periodo)}</p>
          {seguinte ? (
            <Link href={href(seguinte)} scroll={false} className={SETA_ON} aria-label={`Próximo ${unidade.toLowerCase()}: ${nomeDoPeriodo(seguinte)}`}>
              <SetaDireita />
            </Link>
          ) : (
            <span className={SETA_OFF} aria-hidden="true">
              <SetaDireita />
            </span>
          )}
        </div>
      )}
    </div>
  );
}
