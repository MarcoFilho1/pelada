'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { SetaEsquerda } from '@/components/icones';
import { PILULA } from '@/components/pilula';
import { PlacasPin } from '@/components/placas-pin';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { PIN_PADRAO } from '@/domain/pin';
import { trocarMeuPin } from '../acoes';

type Etapa = 'atual' | 'novo' | 'confirmar' | 'feito';
type Erro =
  | { tipo: 'atual_errado' | 'padrao' | 'diferente' | 'servidor' | 'falha' }
  | { tipo: 'bloqueado'; ate: string };

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });

function mensagem(e: Erro): string {
  switch (e.tipo) {
    case 'atual_errado':
      return 'PIN atual errado. Tente de novo.';
    case 'bloqueado':
      return `Muitas tentativas. Tente de novo às ${HORA.format(new Date(e.ate))}.`;
    case 'padrao':
      return `${PIN_PADRAO} é o PIN inicial de todo mundo. Escolha outro.`;
    case 'diferente':
      return 'Os dois PINs novos não batem. Crie de novo.';
    case 'servidor':
      return 'Não deu para salvar esse PIN. Crie de novo.';
    case 'falha':
      return MSG_ALGO_DEU_ERRADO;
  }
}

const TEXTOS: Record<Exclude<Etapa, 'feito'>, { titulo: string; linha: string; rotulo: string }> = {
  atual: { titulo: 'Trocar PIN', linha: 'Primeiro, o PIN que você usa hoje.', rotulo: 'PIN atual' },
  novo: { titulo: 'PIN novo', linha: `4 números que só você sabe. Não pode ser ${PIN_PADRAO}.`, rotulo: 'PIN novo de 4 números' },
  confirmar: { titulo: 'Digite de novo', linha: 'Só para conferir que está certo.', rotulo: 'Repita o PIN novo' },
};

/** Troca de PIN pelo perfil: PIN atual, PIN novo, PIN novo de novo. Envia sozinho no último dígito. */
export function TrocarMeuPin() {
  const [etapa, setEtapa] = useState<Etapa>('atual');
  const [atual, setAtual] = useState('');
  const [novo, setNovo] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<Erro | null>(null);
  const [entrarDeNovo, setEntrarDeNovo] = useState(false);
  const [salvando, startSalvar] = useTransition();

  const bloqueado = erro?.tipo === 'bloqueado';

  function irPara(e: Etapa, motivo: Erro | null = null) {
    setEtapa(e);
    setErro(motivo);
    setPin('');
    if (e === 'atual') setAtual('');
    if (e === 'atual' || e === 'novo') setNovo('');
  }

  function digitar(v: string) {
    if (v.length > 0 && !bloqueado) setErro(null);
    setPin(v);
    if (v.length < 4) return;

    if (etapa === 'atual') {
      setAtual(v);
      return irPara('novo');
    }
    if (etapa === 'novo') {
      if (v === PIN_PADRAO) return irPara('novo', { tipo: 'padrao' });
      setNovo(v);
      return irPara('confirmar');
    }
    if (v !== novo) return irPara('novo', { tipo: 'diferente' });
    startSalvar(async () => {
      const r = await trocarMeuPin(atual, v);
      if (r.ok) {
        setEntrarDeNovo(!!r.entrarDeNovo);
        return irPara('feito');
      }
      if (r.erro === 'bloqueado') return irPara('atual', { tipo: 'bloqueado', ate: r.bloqueadoAte });
      if (r.erro === 'pin_errado') return irPara('atual', { tipo: 'atual_errado' });
      if (r.erro === 'pin_invalido') return irPara('novo', { tipo: 'servidor' });
      irPara('atual', { tipo: 'falha' });
    });
  }

  if (etapa === 'feito' && entrarDeNovo) {
    // O PIN trocou, mas este aparelho ficou sem o cookie novo: a sessão antiga já caiu.
    return (
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">PIN trocado</h1>
        <p role="status" className="mt-2 text-base text-apagado">
          PIN trocado. Entre de novo.
        </p>
        <Link href="/entrar" className={`${PILULA} mt-8`}>
          Entrar de novo
        </Link>
      </main>
    );
  }

  if (etapa === 'feito') {
    return (
      <main className="flex flex-1 flex-col">
        <h1 className="mt-6 font-placa text-titulo font-semibold">PIN trocado</h1>
        <p role="status" className="mt-2 text-base text-apagado">
          Use o PIN novo da próxima vez. Se você tinha entrado em outro aparelho, lá ele vai pedir o PIN de novo.
        </p>
        <Link href="/perfil" className={`${PILULA} mt-8`}>
          Voltar ao perfil
        </Link>
      </main>
    );
  }

  const t = TEXTOS[etapa];
  return (
    <main className="flex flex-1 flex-col">
      <Link
        href="/perfil"
        className="-mx-3 mt-2 flex h-12 w-fit items-center gap-1 px-3 text-base font-medium text-apagado transition-colors hover:text-tinta"
      >
        <SetaEsquerda />
        Perfil
      </Link>
      <h1 className="mt-4 font-placa text-titulo font-semibold">{t.titulo}</h1>
      <p className="mt-2 text-base text-apagado">{t.linha}</p>

      <div className="mt-8">
        <PlacasPin
          id="pin-troca"
          rotulo={t.rotulo}
          valor={pin}
          onChange={digitar}
          estado={erro ? 'erro' : salvando ? 'ok' : 'normal'}
          desabilitado={bloqueado}
          travado={salvando}
          autoFocus
          descricaoId="pin-ajuda"
        />
      </div>

      <p id="pin-ajuda" role="status" aria-live="polite" className="mt-6 min-h-6 text-center text-base">
        {erro ? (
          <span className="font-medium text-erro">{mensagem(erro)}</span>
        ) : salvando ? (
          <span className="text-apagado">Salvando…</span>
        ) : null}
      </p>

      {etapa === 'confirmar' && !salvando && (
        <button
          type="button"
          onClick={() => irPara('novo')}
          className="mx-auto mt-2 h-12 px-4 text-base font-medium text-apagado underline underline-offset-4 transition-colors hover:text-tinta"
        >
          Começar de novo
        </button>
      )}
    </main>
  );
}
