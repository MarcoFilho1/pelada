import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FiltroPeriodo } from '@/components/filtro-periodo';
import { PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { Tela, Topo } from '@/components/topo';
import { getDb } from '@/db/client';
import { nomeDoPeriodo, periodoDaUrl } from '@/domain/periodo';
import type { LinhaRanking, QuartaDoJogador } from '@/domain/ranking';
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

function Historico({ historico, anoAtual }: { historico: QuartaDoJogador[]; anoAtual: string }) {
  return (
    <section aria-labelledby="titulo-quartas" className="mt-10">
      <h2 id="titulo-quartas" className="font-placa text-2xl font-semibold">
        Quartas
      </h2>
      <ol className="mt-3 flex flex-col gap-2">
        {historico.map((q) => {
          const pontos = 3 * q.vitorias + q.empates + q.gols + q.assistencias;
          const ano = q.peladaData.slice(0, 4);
          return (
            <li key={q.peladaData} className="flex items-center gap-3 rounded-placa bg-placa px-4 py-3">
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
    <Tela>
      <Topo inicio="/lista" />
      <main>
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
    </Tela>
  );
}
