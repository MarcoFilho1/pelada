'use client';

import { useActionState } from 'react';
import { entrarComoAdmin, type EstadoEntrarAdmin } from './actions';

const INICIAL: EstadoEntrarAdmin = { erro: null, usuario: '' };

const CAMPO =
  'mt-2 h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta aria-invalid:ring-2 aria-invalid:ring-erro';

export function EntrarAdmin({ aviso = null }: { aviso?: string | null }) {
  const [estado, acao, enviando] = useActionState(entrarComoAdmin, INICIAL);
  const invalido = estado.erro ? true : undefined;

  return (
    <main className="flex flex-1 flex-col">
      <h1 className="mt-6 font-placa text-titulo font-semibold">Área do admin</h1>
      <p className="mt-2 text-base text-apagado">Cadastro, lista e partidas.</p>
      {aviso && (
        <p role="status" className="mt-4 text-base font-medium text-lima">
          {aviso}
        </p>
      )}

      <form action={acao} className="mt-8 flex flex-col" noValidate>
        <label htmlFor="usuario" className="text-base font-medium text-apagado">
          Usuário
        </label>
        <input
          id="usuario"
          name="usuario"
          defaultValue={estado.usuario}
          key={estado.usuario}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-invalid={invalido}
          aria-describedby="admin-erro"
          className={CAMPO}
        />

        <label htmlFor="senha" className="mt-5 text-base font-medium text-apagado">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalido}
          aria-describedby="admin-erro"
          className={CAMPO}
        />

        <p id="admin-erro" role="alert" className="mt-4 min-h-6 text-base font-medium text-erro">
          {estado.erro}
        </p>

        <button
          type="submit"
          disabled={enviando}
          className="mt-4 h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
