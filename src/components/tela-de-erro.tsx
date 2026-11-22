'use client';

/** Conteúdo das telas de erro inesperado: frase curta, a saída, e a pílula "Tentar de novo". */
export function TelaDeErro({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-8">
      <h1 className="mt-20 font-placa text-titulo font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-base text-apagado">
        Não foi culpa sua. Tente de novo; se continuar, avise o admin no grupo.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="mt-8 h-toque w-full rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta"
      >
        Tentar de novo
      </button>
    </main>
  );
}
