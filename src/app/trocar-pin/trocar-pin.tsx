'use client';

import { useState, useTransition } from 'react';
import { SetaEsquerda } from '@/components/icones';
import { PlacasPin } from '@/components/placas-pin';
import { MSG_ALGO_DEU_ERRADO } from '@/domain/mensagens';
import { PIN_PADRAO } from '@/domain/pin';
import { sairDoPerfil, salvarPin } from './actions';

type Etapa = 'novo' | 'confirmar';

const ERROS = {
  padrao: `${PIN_PADRAO} é o PIN inicial de todo mundo. Escolha outro.`,
  diferente: 'Os dois PINs não batem. Crie de novo.',
  servidor: 'Não deu para salvar esse PIN. Crie de novo.',
  falha: MSG_ALGO_DEU_ERRADO,
} as const;

export function TrocarPin({ nome }: { nome: string }) {
  const [etapa, setEtapa] = useState<Etapa>('novo');
  const [primeiro, setPrimeiro] = useState('');
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<keyof typeof ERROS | null>(null);
  const [salvando, startSalvar] = useTransition();

  function recomecar(motivo: keyof typeof ERROS) {
    setErro(motivo);
    setEtapa('novo');
    setPrimeiro('');
    setPin('');
  }

  function digitar(v: string) {
    if (v.length > 0) setErro(null);
    setPin(v);
    if (v.length < 4) return;

    if (etapa === 'novo') {
      if (v === PIN_PADRAO) return recomecar('padrao');
      setPrimeiro(v);
      setEtapa('confirmar');
      setPin('');
      return;
    }

    if (v !== primeiro) return recomecar('diferente');
    startSalvar(async () => {
      const r = await salvarPin(v);
      if (r?.erro) recomecar(r.erro === 'falha' ? 'falha' : 'servidor');
    });
  }

  const confirmando = etapa === 'confirmar';

  return (
    <main className="flex flex-1 flex-col">
      {/* No primeiro dia todo perfil é 1234: quem tocou no nome errado sai daqui sem tomar o perfil de outro. */}
      <form action={sairDoPerfil}>
        <button
          type="submit"
          disabled={salvando}
          className="-mx-3 mt-2 flex h-12 w-fit items-center gap-1 px-3 text-base font-medium text-apagado transition-colors hover:text-tinta disabled:opacity-60"
        >
          <SetaEsquerda />
          Não é você? Sair
        </button>
      </form>
      <h1 className="mt-4 font-placa text-titulo font-semibold break-words">
        {confirmando ? 'Digite de novo' : `Crie seu PIN, ${nome}`}
      </h1>
      <p className="mt-2 text-base text-apagado">
        {confirmando ? 'Só para conferir que está certo.' : `4 números que só você sabe. Não pode ser ${PIN_PADRAO}.`}
      </p>

      <div className="mt-8">
        <PlacasPin
          id="novo-pin"
          rotulo={confirmando ? 'Repita o PIN novo' : 'PIN novo de 4 números'}
          valor={pin}
          onChange={digitar}
          estado={erro ? 'erro' : salvando ? 'ok' : 'normal'}
          travado={salvando}
          autoFocus
          descricaoId="novo-pin-ajuda"
        />
      </div>

      <p id="novo-pin-ajuda" role="status" aria-live="polite" className="mt-6 min-h-6 text-center text-base">
        {erro ? (
          <span className="font-medium text-erro">{ERROS[erro]}</span>
        ) : salvando ? (
          <span className="text-apagado">Salvando…</span>
        ) : confirmando ? null : (
          <span className="text-meta">Depois você digita de novo para conferir.</span>
        )}
      </p>

      {confirmando && !salvando && (
        <button
          type="button"
          onClick={() => {
            setEtapa('novo');
            setPrimeiro('');
            setPin('');
          }}
          className="mx-auto mt-2 h-12 px-4 text-base font-medium text-apagado underline underline-offset-4 transition-colors hover:text-tinta"
        >
          Começar de novo
        </button>
      )}
    </main>
  );
}
