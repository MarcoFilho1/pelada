// O que fica e o que sai do armazenamento de arquivos depois de publicar.
// Cada versão do app ocupa uns 70 MB e o plano grátis da Vercel dá 1 GB: guardar tudo enche em
// poucos dias. Fica a versão que está no ar e a anterior a ela (a reserva, para voltar atrás).

/** 'app/pelada-0.12.0-FxWM…8G.apk' → 'app/pelada-0.12.0.apk': o nome sem o sufixo sorteado do envio. */
export function semSufixo(pathname) {
  return pathname.replace(/-[A-Za-z0-9]{16,}(\.[A-Za-z0-9]+)$/, '$1');
}

/**
 * Os arquivos a apagar. `arquivos`: o que há no armazenamento ({ pathname, url, uploadedAt }).
 * `noAr`: os endereços que o manifesto publicado usa. Em cada pasta ('app', 'robo') ficam os
 * arquivos no ar e o envio mais novo da versão anterior; o resto sai. Pasta em que nada está no
 * ar fica como está: sem saber o que é a versão atual, não se apaga nada.
 */
export function oQueApagar(arquivos, noAr, pastas = ['app', 'robo']) {
  const usados = new Set(noAr);
  const apagar = [];
  for (const pasta of pastas) {
    const daPasta = arquivos.filter((a) => a.pathname.startsWith(`${pasta}/`));
    const atuais = daPasta.filter((a) => usados.has(a.url));
    if (atuais.length === 0) continue;
    const versoesNoAr = new Set(atuais.map((a) => semSufixo(a.pathname)));
    const anteriores = daPasta
      .filter((a) => !versoesNoAr.has(semSufixo(a.pathname)))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    const reserva = anteriores[0];
    for (const a of daPasta) {
      if (usados.has(a.url) || a === reserva) continue;
      apagar.push(a);
    }
  }
  return apagar;
}
