'use client';

import { useActionState, useEffect, useRef } from 'react';
import { novoAdmin, trocarMinhaSenha, type EstadoForm } from './actions';

const INICIAL: EstadoForm = { ok: false, mensagem: null };
const CAMPO =
  'mt-2 h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta aria-invalid:ring-2 aria-invalid:ring-erro';
const ROTULO = 'text-base font-medium text-apagado';
const PILULA =
  'mt-4 h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado';

function Mensagem({ id, estado }: { id: string; estado: EstadoForm }) {
  return (
    <p
      id={id}
      role={estado.ok ? 'status' : 'alert'}
      className={`mt-4 min-h-6 text-base font-medium break-words ${estado.ok ? 'text-lima' : 'text-erro'}`}
    >
      {estado.mensagem}
    </p>
  );
}

export function FormsAdmins() {
  const [novo, criar, criando] = useActionState(novoAdmin, INICIAL);
  const [troca, trocar, trocando] = useActionState(trocarMinhaSenha, INICIAL);
  const formNovo = useRef<HTMLFormElement>(null);
  const formTroca = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (novo.ok) formNovo.current?.reset();
  }, [novo]);
  useEffect(() => {
    if (troca.ok) formTroca.current?.reset();
  }, [troca]);

  return (
    <>
      <section className="mt-10" aria-labelledby="h-novo">
        <h2 id="h-novo" className="font-placa text-2xl font-semibold">
          Novo admin
        </h2>
        <form ref={formNovo} action={criar} className="mt-2 flex flex-col" noValidate>
          <label htmlFor="novo-usuario" className={`mt-3 ${ROTULO}`}>
            Usuário
          </label>
          <input
            id="novo-usuario"
            name="usuario"
            defaultValue={novo.usuario}
            key={novo.usuario ?? 'ok'}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            aria-invalid={novo.campo === 'usuario' ? true : undefined}
            aria-describedby="novo-msg"
            className={CAMPO}
          />
          <label htmlFor="novo-senha" className={`mt-5 ${ROTULO}`}>
            Senha
          </label>
          <input
            id="novo-senha"
            name="senha"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            aria-invalid={novo.campo === 'senha' ? true : undefined}
            aria-describedby="novo-dica novo-msg"
            className={CAMPO}
          />
          <p id="novo-dica" className="mt-2 text-base text-meta">
            Pelo menos 10 caracteres.
          </p>
          <Mensagem id="novo-msg" estado={novo} />
          <button type="submit" disabled={criando} className={PILULA}>
            {criando ? 'Criando…' : 'Criar admin'}
          </button>
        </form>
      </section>

      <section className="mt-12" aria-labelledby="h-troca">
        <h2 id="h-troca" className="font-placa text-2xl font-semibold">
          Trocar minha senha
        </h2>
        <form ref={formTroca} action={trocar} className="mt-2 flex flex-col" noValidate>
          <label htmlFor="troca-atual" className={`mt-3 ${ROTULO}`}>
            Senha atual
          </label>
          <input
            id="troca-atual"
            name="atual"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={!troca.ok && troca.mensagem?.includes('atual') ? true : undefined}
            aria-describedby="troca-msg"
            className={CAMPO}
          />
          <label htmlFor="troca-nova" className={`mt-5 ${ROTULO}`}>
            Senha nova
          </label>
          <input
            id="troca-nova"
            name="nova"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            aria-invalid={!troca.ok && troca.mensagem && /nova|10/.test(troca.mensagem) ? true : undefined}
            aria-describedby="troca-dica troca-msg"
            className={CAMPO}
          />
          <p id="troca-dica" className="mt-2 text-base text-meta">
            Pelo menos 10 caracteres. Os outros aparelhos saem da conta.
          </p>
          <Mensagem id="troca-msg" estado={troca} />
          <button type="submit" disabled={trocando} className={PILULA}>
            {trocando ? 'Trocando…' : 'Trocar senha'}
          </button>
        </form>
      </section>
    </>
  );
}
