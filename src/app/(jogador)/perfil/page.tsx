import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FiltroPeriodo } from '@/components/filtro-periodo';
import { PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { TelaJogador } from '@/components/topo';
import { getDb } from '@/db/client';
import { nomeDoPeriodo, periodoDaUrl } from '@/domain/periodo';
import { NOME_DA_COR, Colete } from '@/components/colete';
import { pontosDe, type LinhaRanking, type PartidaDoJogador, type QuartaDoJogador } from '@/domain/ranking';
import { dataDe, diaMes } from '@/domain/tempo';
import { notaDoJogador } from '@/server/jogadores';
import { estatisticasDoJogador, periodosDisponiveis } from '@/server/ranking';
import { lerSessaoJogador } from '@/server/sessao';
import { sairDaConta } from './acoes';

export const metadata: Metadata = { title: 'Perfil · Pelada' };

const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const duasCasas = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Espaço que não quebra: o número nunca fica numa linha e a palavra na outra.
const plural = (n: number, um: string, varios: string) => `${n}\u00a0${n === 1 ? um : varios}`;

function Numeros({ linha }: { linha: LinhaRanking }) {
  const itens: [string, string][] = [
    ['Jogos', String(linha.jogos)],
    ['Vitórias', String(linha.vitorias)],
    ['Empates', String(linha.empates)],
    ['Derrotas', String(linha.derrotas)],
    ['Aproveit.', `${Math.round(linha.aproveitamento)}%`],
    ['Presenças', String(linha.presencas)],
    ['Gols', String(linha.gols)],
    ['Assist.', String(linha.assistencias)],
    ['Gols/jogo', duasCasas.format(linha.golsPorJogo)],
  ];
  return (
    <section aria-label="Seus números" className="mt-6 rounded-placa bg-placa p-5">
      <p className="flex items-baseline gap-2">
        <span className="font-placa text-numero font-semibold tabular-nums">{linha.pontos}</span>
        <span className="text-linha font-medium text-apagado">{linha.pontos === 1 ? 'ponto' : 'pontos'}</span>
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-4">
        {itens.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex flex-col-reverse">
            <dt className="text-sm text-apagado">{rotulo}</dt>
            <dd className="font-placa text-subtitulo font-semibold tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function resumo(q: QuartaDoJogador): string {
  const resultados = [
    q.vitorias && plural(q.vitorias, 'vitória', 'vitórias'),
    q.empates && plural(q.empates, 'empate', 'empates'),
    q.derrotas && plural(q.derrotas, 'derrota', 'derrotas'),
  ].filter(Boolean);
  const lances = [q.gols && plural(q.gols, 'gol', 'gols'), q.assistencias && `${q.assistencias}\u00a0ast`].filter(Boolean);
  return `${plural(q.jogos, 'jogo', 'jogos')}: ${resultados.join(', ')}${lances.length ? ` · ${lances.join(', ')}` : ''}`;
}

const RESULTADO: Record<PartidaDoJogador['resultado'], string> = { V: 'vitória', E: 'empate', D: 'derrota' };

/** "● Azul 3×1 Laranja ●   V · 1 gol": o time do jogador primeiro. */
function LinhaPartida({ p }: { p: PartidaDoJogador }) {
  const lances = [p.gols && plural(p.gols, 'gol', 'gols'), p.assistencias && `${p.assistencias}\u00a0ast`].filter(Boolean);
  const meu = NOME_DA_COR[p.corDoTime];
  const deles = NOME_DA_COR[p.corAdversario];
  return (
    <li
      className="flex min-h-9 items-center gap-2 text-sm"
      aria-label={`${meu} ${p.placarTime} a ${p.placarAdversario} ${deles}, ${RESULTADO[p.resultado]}${lances.length ? `, ${lances.join(', ')}` : ''}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-1.5" aria-hidden="true">
        <Colete cor={p.corDoTime} />
        <span className="truncate text-tinta">{meu}</span>
        <span className="shrink-0 font-semibold tabular-nums text-tinta">
          {p.placarTime}×{p.placarAdversario}
        </span>
        <span className="truncate text-apagado">{deles}</span>
        <Colete cor={p.corAdversario} />
      </span>
      <span className="shrink-0 text-right text-apagado" aria-hidden="true">
        <span className="font-semibold text-tinta">{p.resultado}</span>
        {lances.length > 0 && ` · ${lances.join(', ')}`}
      </span>
    </li>
  );
}

function Historico({ historico, anoAtual }: { historico: QuartaDoJogador[]; anoAtual: string }) {
  return (
    <section aria-labelledby="titulo-quartas" className="mt-10 lg:col-start-2! lg:row-span-5 lg:row-start-1 lg:mt-6">
      <h2 id="titulo-quartas" className="font-placa text-2xl font-semibold">
        Quartas
      </h2>
      <ol className="mt-3 flex flex-col gap-2">
        {historico.map((q) => {
          const pontos = pontosDe(q);
          const ano = q.peladaData.slice(0, 4);
          return (
            <li key={q.peladaData} className="rounded-placa bg-placa px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-linha font-medium">
                    Quarta, {diaMes(q.peladaData)}
                    {ano !== anoAtual && `/${ano}`}
                  </p>
                  <p className="mt-0.5 text-base text-apagado">{resumo(q)}</p>
                </div>
                <p className="shrink-0 text-right" aria-label={plural(pontos, 'ponto', 'pontos')}>
                  <span className="block font-placa text-subtitulo font-semibold tabular-nums">{pontos}</span>
                  <span className="block text-sm text-meta" aria-hidden="true">
                    pts
                  </span>
                </p>
              </div>
              <ol aria-label="Partidas da noite" className="mt-2">
                {q.partidas.map((p) => (
                  <LinhaPartida key={p.partidaId} p={p} />
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default async function PerfilPage({ searchParams }: PageProps<'/perfil'>) {
  // O perfil é só do dono: o id vem da sessão, nunca da URL.
  const db = getDb();
  const sessao = await lerSessaoJogador(db);
  if (!sessao) redirect('/entrar');
  if (sessao.precisaTrocar) redirect('/trocar-pin');

  const now = new Date();
  const disp = await periodosDisponiveis(db);
  const periodo = periodoDaUrl((await searchParams).p, disp, now);
  const [nota, { linha, historico }] = await Promise.all([
    notaDoJogador(db, sessao.jogadorId),
    estatisticasDoJogador(db, sessao.jogadorId, periodo),
  ]);

  return (
    <TelaJogador>
      {/* No PC, duas colunas: à esquerda (448px) o nome, o filtro, os números e a conta; à direita as Quartas, que
          ocupam as 5 linhas da esquerda (a última, `1fr`, absorve a sobra, para a conta ficar logo abaixo dos números). */}
      <main className="lg:grid lg:grid-cols-[28rem_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_auto_1fr] lg:content-start lg:gap-x-10 lg:[&>*]:col-start-1">
        <div className="mt-6 flex items-end justify-between gap-4">
          <h1 className="min-w-0 font-placa text-titulo font-semibold break-words">{sessao.nome}</h1>
          {nota !== null && (
            <p className="flex shrink-0 items-baseline gap-1.5">
              <span className="text-base text-apagado">nota</span>
              <span className="font-placa text-subtitulo font-semibold tabular-nums">{umaCasa.format(nota)}</span>
            </p>
          )}
        </div>
        <p className="mt-1 text-base text-apagado">Só você vê esta página.</p>

        <FiltroPeriodo base="/perfil" periodo={periodo} disp={disp} />

        {linha ? (
          <Numeros linha={linha} />
        ) : (
          <div className="mt-6 rounded-placa bg-placa p-5">
            <p className="text-linha font-medium">Sem jogos no período.</p>
            <p className="mt-2 text-base text-apagado">
              {periodo.tipo === 'geral'
                ? 'Seus números aparecem depois da primeira partida encerrada em que você jogar.'
                : `Você não jogou nenhuma partida encerrada em ${nomeDoPeriodo(periodo).toLowerCase()}.`}
            </p>
          </div>
        )}

        {historico.length > 0 && <Historico historico={historico} anoAtual={dataDe(now).slice(0, 4)} />}

        <section aria-label="Conta" className="mt-10 flex flex-col gap-2">
          <Link href="/perfil/pin" className={PILULA_SEGUNDA}>
            Trocar PIN
          </Link>
          <form action={sairDaConta}>
            <button type="submit" className={`${TEXTO} w-full`}>
              Sair deste aparelho
            </button>
          </form>
        </section>
      </main>
    </TelaJogador>
  );
}
