// Lê o NOVIDADES.md: a primeira seção ("## AAAA-MM-DD") vira a lista que vai no manifesto e que o
// app mostra em Ajustes › Última atualização.

const MAX_LINHAS = 8;
const MAX_LETRAS = 200;

/** As novidades da seção mais nova: `{ dia, linhas }`. Sem seção ou sem linha: `null`. */
export function novidadesDoTopo(texto) {
  let dia = null;
  const linhas = [];
  for (const bruta of texto.split('\n')) {
    const titulo = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/.exec(bruta);
    if (titulo) {
      if (dia) break;
      dia = titulo[1];
      continue;
    }
    const item = dia ? /^-\s+(.+)$/.exec(bruta) : null;
    if (item && linhas.length < MAX_LINHAS) linhas.push(item[1].trim().replace(/`/g, '').slice(0, MAX_LETRAS));
  }
  return dia && linhas.length ? { dia, linhas } : null;
}
