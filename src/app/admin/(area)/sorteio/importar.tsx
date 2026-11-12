'use client';

// "Importar times": para as noites em que os times foram sorteados fora daqui. O admin cola a mensagem do WhatsApp, vê
// a prévia nos mesmos cartões do sorteio (com os nomes casados aos jogadores cadastrados) e salva como definitivo.
// Um estado só para o celular e o PC; no PC a área de texto fica à esquerda e a prévia à direita (DESIGN.md › Sorteio).

import { useEffect, useRef, useState, useTransition } from 'react';
import { Colete, NOME_DA_COR } from '@/components/colete';
import { PILULA, PILULA_SEGUNDA, TEXTO } from '@/components/pilula';
import { trocarNomeNaLinha, type NomeNaPrevia, type Previa } from '@/domain/importarTimes';
import { CORES, formatarNota } from '@/domain/sorteio';
import { importarTimes, previaDeImportar } from './acoes';
import { Erro } from './busca-de-jogador';
import { fraseDasJogadas } from './folhas';
import { Barra, SoNo } from './times-na-tela';

/** Espera a pessoa parar de digitar (ou terminar de colar) antes de pedir a prévia. */
const ESPERA_MS = 350;
/** No PC a pílula fica do tamanho do texto. */
const DO_TAMANHO = 'lg:w-auto lg:px-8';

/** A entrada na tela do sorteio: pílula secundária e a frase do que ela faz. */
export function EntradaDoImportar({ onImportar, className = '' }: { onImportar: () => void; className?: string }) {
  return (
    <section aria-label="Importar times" className={className}>
      <button type="button" className={`${PILULA_SEGUNDA} ${DO_TAMANHO}`} onClick={onImportar}>
        Importar times
      </button>
      <p className="mt-2 text-base text-meta">Times sorteados fora daqui? Cole a mensagem do WhatsApp.</p>
    </section>
  );
}

type Resultado = { texto: string } & ({ ok: true; previa: Previa } | { ok: false; erro: string });

const somaDoTime = (t: Previa['times'][number]) =>
  t.nomes.reduce((s, n) => s + (n.tipo === 'ok' ? n.jogador.nota : 0), 0) + t.completes.reduce((s, x) => s + x, 0);

export function ImportarTimes({
  peladaId,
  jogadas,
  emAndamento,
  onCancelar,
  onSalvo,
}: {
  peladaId: number;
  jogadas: number;
  emAndamento: number | null;
  onCancelar: () => void;
  onSalvo: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const pedido = useRef(0);

  useEffect(() => {
    const n = ++pedido.current;
    if (!texto.trim()) return;
    const t = setTimeout(async () => {
      let r: Awaited<ReturnType<typeof previaDeImportar>>;
      try {
        r = await previaDeImportar(texto);
      } catch {
        // Sem rede ou servidor fora: diz o que houve em vez de ficar em "Conferindo os nomes…".
        r = { ok: false, erro: 'Não consegui conferir os nomes. Tente de novo.' };
      }
      // Só vale a resposta do último pedido (a pessoa pode ter mudado o texto enquanto esperava).
      if (n === pedido.current) setResultado({ texto, ...r });
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto]);

  const atual = texto.trim() && resultado?.texto === texto ? resultado : null;
  const previa = atual?.ok ? atual.previa : null;
  const motivoTravado = emAndamento !== null ? 'Tem partida em andamento. Encerre no anotador para marcar os times novos.' : null;
  const podeSalvar = !!previa?.pronto && !salvando && motivoTravado === null;

  function mudarTexto(novo: string) {
    setTexto(novo);
    setErro(null);
    setConfirmando(false);
  }

  /** "Você quis dizer X?": troca o nome escrito pelo cadastrado na própria linha, e a prévia refaz sozinha. */
  function trocar(n: NomeNaPrevia, nome: string) {
    mudarTexto(trocarNomeNaLinha(texto, n.linha, n.escrito, nome));
  }

  function salvar() {
    if (!previa?.pronto) return;
    setErro(null);
    // Partidas jogadas ficam com os times da época: o admin lê isso antes de valer (como no "Sortear de novo").
    if (jogadas > 0 && !confirmando) {
      setConfirmando(true);
      return;
    }
    startSalvar(async () => {
      const r = await importarTimes(peladaId, texto);
      setConfirmando(false);
      if (r.ok) onSalvo();
      else setErro(r.erro);
    });
  }

  const acoes = (pc: boolean) => {
    const idMotivo = pc ? 'motivo-importar-pc' : 'motivo-importar';
    const motivo = motivoTravado && (
      <p id={idMotivo} className="mt-2 text-base text-apagado">
        {motivoTravado}
      </p>
    );
    const travado = { disabled: !podeSalvar, 'aria-describedby': motivoTravado ? idMotivo : undefined };
    if (confirmando) {
      return (
        <div className={`rounded-placa bg-placa-alta p-4 ${pc ? 'max-w-md' : ''}`}>
          <p className="text-base font-medium text-tinta">{fraseDasJogadas(jogadas)}</p>
          <div className={pc ? 'mt-4 flex flex-wrap items-center gap-2' : 'mt-4 flex flex-col'}>
            <button type="button" className={`${PILULA} ${DO_TAMANHO}`} {...travado} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Usar os times novos'}
            </button>
            <button type="button" className={`${pc ? '' : 'mx-auto mt-1'} ${TEXTO}`} disabled={salvando} onClick={() => setConfirmando(false)}>
              Voltar
            </button>
          </div>
          {motivo}
        </div>
      );
    }
    const falta = previa && !previa.pronto ? 'Resolva os nomes em vermelho para salvar.' : null;
    return (
      <div>
        <button type="button" className={`${PILULA} ${DO_TAMANHO}`} {...travado} onClick={salvar}>
          {salvando ? 'Salvando…' : 'Salvar como definitivo'}
        </button>
        {falta && <p className={`mt-2 text-base text-meta ${pc ? '' : 'text-center'}`}>{falta}</p>}
        {motivo}
      </div>
    );
  };

  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-3">
        <h2 className="font-placa text-2xl font-semibold">Importar times</h2>
        <button type="button" className={`-mr-3 ${TEXTO}`} disabled={salvando} onClick={onCancelar}>
          Cancelar
        </button>
      </div>

      <div className="contents lg:mt-4 lg:grid lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-x-10">
        <section aria-labelledby="importar-rotulo" className="mt-3 rounded-placa bg-placa p-4 lg:mt-0">
          <label id="importar-rotulo" htmlFor="importar-texto" className="block text-base text-apagado">
            Cole a mensagem dos times. Uma linha &ldquo;Time 1&rdquo; ou uma linha em branco separa os times; numeração e notas saem
            sozinhas.
          </label>
          <textarea
            id="importar-texto"
            value={texto}
            onChange={(e) => mudarTexto(e.target.value)}
            rows={8}
            autoFocus
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            placeholder={'Time 1 (12.0)\n1. Ronaldo 4.5\n2. Josa 3.5\n\nTime 2 (11.5)\n1. Rodrigo 4.0'}
            className="mt-3 w-full resize-y rounded-placa bg-chao p-4 text-linha leading-relaxed text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta"
          />
          <p aria-live="polite" className={`text-base font-medium text-erro ${atual && !atual.ok ? 'mt-2' : 'sr-only'}`}>
            {atual && !atual.ok ? atual.erro : ''}
          </p>
          {previa && previa.ignoradas.length > 0 && (
            <p className="mt-3 text-base break-words text-meta">Ignorei estas linhas: {previa.ignoradas.join(' · ')}</p>
          )}
        </section>

        <div className="lg:@container">
          <SoNo pc>
            <div className="hidden lg:block">
              {acoes(true)}
              <Erro texto={erro} />
            </div>
          </SoNo>
          {previa ? (
            <CartoesDaPrevia previa={previa} onTrocar={trocar} />
          ) : (
            <p className="mt-4 max-w-xl text-base text-apagado lg:mt-6">
              {texto.trim() ? 'Conferindo os nomes…' : 'Os times aparecem aqui, com os nomes do cadastro. Importar não muda a nota de ninguém.'}
            </p>
          )}
        </div>

        <SoNo pc={false}>
          <Barra>
            {acoes(false)}
            <Erro texto={erro} />
          </Barra>
        </SoNo>
      </div>
    </>
  );
}

/** Os cartões do sorteio, só para ler: quem foi achado (nome e nota do cadastro), os COMPLETE e o que falta resolver. */
function CartoesDaPrevia({ previa, onTrocar }: { previa: Previa; onTrocar: (n: NomeNaPrevia, nome: string) => void }) {
  const n = previa.times.length;
  return (
    <section aria-label="Prévia dos times" className="mt-4 lg:mt-6">
      <div className={`grid grid-cols-2 gap-2 ${n === 3 ? '@[42rem]:grid-cols-3' : n === 4 ? '@[42rem]:grid-cols-4' : ''}`}>
        {previa.times.map((t, i) => {
          const cor = CORES[i];
          const idTitulo = `previa-${cor}`;
          return (
            <section key={cor} aria-labelledby={idTitulo} className="flex flex-col rounded-placa bg-placa p-1.5">
              <div className="flex h-12 items-center gap-2 px-2">
                <Colete cor={cor} />
                <h3 id={idTitulo} className="min-w-0 flex-1 truncate text-base font-semibold">
                  {NOME_DA_COR[cor]}
                </h3>
                <span className="font-placa text-subtitulo leading-none font-semibold tabular-nums">
                  <span className="sr-only">soma </span>
                  {formatarNota(somaDoTime(t))}
                </span>
              </div>
              <ul className="flex flex-col">
                {t.nomes.map((nome) => (
                  <li key={nome.linha}>
                    <LinhaDaPrevia nome={nome} onTrocar={onTrocar} />
                  </li>
                ))}
                {t.completes.map((nota, k) => (
                  <li key={`c${k}`} className="pt-1">
                    <div className="flex h-12 items-center gap-2 rounded-placa bg-chao px-2">
                      <span className="min-w-0 flex-1 truncate text-base font-medium text-apagado">COMPLETE</span>
                      <span className="shrink-0 text-base text-meta tabular-nums">{formatarNota(nota)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function LinhaDaPrevia({ nome, onTrocar }: { nome: NomeNaPrevia; onTrocar: (n: NomeNaPrevia, nome: string) => void }) {
  if (nome.tipo === 'ok' && !nome.repetido) {
    return (
      <div className="flex h-12 items-center gap-2 px-2">
        <span className="min-w-0 flex-1 truncate text-base font-medium text-tinta">{nome.jogador.nome}</span>
        <span className="shrink-0 text-base text-meta tabular-nums">
          <span className="sr-only">nota </span>
          {formatarNota(nome.jogador.nota)}
        </span>
      </div>
    );
  }
  const opcoes = nome.tipo === 'nao_achei' ? (nome.sugestao ? [nome.sugestao] : []) : nome.tipo === 'varios' ? nome.opcoes : [];
  const motivo =
    nome.tipo === 'ok' ? 'Está em dois lugares.' : nome.tipo === 'varios' ? 'Mais de um com esse nome.' : opcoes.length ? null : 'Não está cadastrado.';
  return (
    <div className="px-2 py-2">
      <p className="truncate text-base font-medium text-erro">{nome.tipo === 'ok' ? nome.jogador.nome : nome.escrito}</p>
      {motivo && <p className="text-base text-apagado">{motivo}</p>}
      {opcoes.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onTrocar(nome, o)}
          className="-mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center rounded-placa px-2 text-left text-base font-medium text-tinta underline decoration-meta underline-offset-4 transition-colors hover:bg-placa-alta/60 active:bg-placa-alta"
        >
          Você quis dizer {o}?
        </button>
      ))}
    </div>
  );
}
