// Classes dos botões e do campo das telas de lista (DESIGN.md › Buttons, Inputs).

/** Ação primária: pílula branca de 56px com texto preto. Uma só por bloco. */
export const PILULA =
  'flex h-toque w-full items-center justify-center gap-2 rounded-full bg-tinta text-linha font-semibold text-chao transition-colors hover:bg-apagado active:bg-meta disabled:bg-placa-alta disabled:text-apagado';

/** Segunda ação grande do bloco: a mesma pílula em placa alta. */
export const PILULA_SEGUNDA =
  'flex h-toque w-full items-center justify-center gap-2 rounded-full bg-placa-alta text-linha font-semibold text-tinta transition-colors hover:bg-meta/40 active:bg-meta/60 disabled:text-meta';

/** Ação terciária: link de texto de 48px ("Cancelar", "Voltar"). */
export const TEXTO =
  'flex h-12 items-center justify-center rounded-placa px-3 text-base font-medium text-apagado transition-colors hover:text-tinta disabled:text-meta';

/** Campo de texto de 56px em placa, anel branco no foco. */
export const CAMPO =
  'h-toque w-full rounded-placa bg-placa px-4 text-linha text-tinta outline-none transition-shadow focus:ring-2 focus:ring-tinta';
