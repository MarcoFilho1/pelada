import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E } from './ambiente';

// Partida com COMPLETE: alguém de um time de fora completa, a marca "completando" aparece no anotador
// (que continua cabendo sem rolar) e o gol dele sobe o placar. Depois, uma partida com "Jogar sem": o
// time entra com um a menos.
//
// Ordem: roda depois do sorteio-complete.spec.ts (ordem alfabética, 1 worker). O sorteio de lá cria 2
// COMPLETE e põe alguém no lugar de um, então a pelada de hoje chega aqui com 4 times e 1 COMPLETE.
// Rodando sozinho (sem COMPLETE na pelada), este teste faz antes o mesmo sorteio, que deixa 2 COMPLETE
// (num time só ou em dois). O teste aceita 1 ou 2 no time escolhido.

/** Tamanhos do teste de rolagem: tela inteira, entre a tela baixa e 808px (onde a marca pesa), e telas baixas. */
const TAMANHOS = [
  { width: 390, height: 844 },
  { width: 390, height: 800 },
  { width: 412, height: 790 },
  { width: 390, height: 780 },
  { width: 390, height: 770 },
  { width: 390, height: 664 },
  { width: 360, height: 640 },
];

async function entrar(page: Page) {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Sorteia 14 (os 8 dos times + 6 sem time): 4 times, 2 vagas viram COMPLETE. Marca como definitivo. */
async function sortearComComplete(page: Page) {
  await page.goto('/admin/sorteio', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sortear de novo' }).click();
  const busca = page.getByRole('textbox', { name: 'Pôr mais alguém' });
  for (const nome of E2E.sorteio) {
    await busca.fill(nome);
    await page.getByRole('button', { name: nome, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Sortear 14 em 4 times' }).click();
  await page.getByRole('button', { name: 'Marcar como definitivo' }).click();
  const confirmar = page.getByRole('button', { name: 'Usar os times novos' });
  const definido = page.getByText('Times definitivos');
  await expect(confirmar.or(definido)).toBeVisible();
  if (await confirmar.isVisible()) await confirmar.click();
  await expect(definido).toBeVisible();
}

const cartoes = (page: Page) => page.getByRole('region', { name: 'Próxima partida' }).locator('button[aria-pressed]');
/** O nome do time é a primeira linha do cartão. */
const corDo = async (cartao: Locator) => (await cartao.innerText()).split('\n')[0].trim();
const tituloDoPasso = (page: Page) => page.getByRole('heading', { name: /^Quem completa o / });
/** Os jogadores dos outros times: rótulo "Caio, do Verde, nota 3,0". */
const deFora = (page: Page) => page.getByRole('button', { name: /^.+, do \S+, nota \d,\d$/ });

/** Escolhe o time com COMPLETE e um sem, toca em Iniciar e devolve a cor e quantos COMPLETE ele tem. */
async function escolherTimes(page: Page) {
  const marcados = cartoes(page).and(page.locator('[aria-pressed="true"]'));
  while ((await marcados.count()) > 0) await marcados.first().click();
  const comComplete = cartoes(page).filter({ hasText: 'COMPLETE' }).first();
  const cor = await corDo(comComplete);
  const vagas = Number((await comComplete.getByText(/COMPLETE$/).innerText()).match(/^(\d+) /)?.[1] ?? 1);
  await comComplete.click();
  await cartoes(page).filter({ hasNotText: 'COMPLETE' }).first().click();
  await expect(page.getByText(`Antes de começar, você escolhe quem completa o ${cor}.`)).toBeVisible();
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  return { cor, vagas };
}

async function semRolar(page: Page) {
  for (const tamanho of TAMANHOS) {
    await page.setViewportSize(tamanho);
    const medida = await page.evaluate(() => {
      const lista = document.querySelector('main .overflow-y-auto');
      const botoes = [...document.querySelectorAll('main li button')].map((b) => b.getBoundingClientRect().height);
      return {
        pagina: document.documentElement.scrollHeight > innerHeight,
        lista: lista ? lista.scrollHeight > lista.clientHeight : true,
        menorBotao: Math.min(...botoes) >= 48,
      };
    });
    expect(medida, `${tamanho.width}×${tamanho.height}`).toEqual({ pagina: false, lista: false, menorBotao: true });
  }
  await page.setViewportSize(TAMANHOS[0]);
}

async function encerrar(page: Page) {
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar partida' }).click();
  await expect(page).toHaveURL(/\/admin\/partidas$/);
}

test('partida com COMPLETE: alguém de fora completa e marca gol; depois "Jogar sem" entra com um a menos', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  if ((await cartoes(page).filter({ hasText: 'COMPLETE' }).count()) === 0) {
    await sortearComComplete(page);
    await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  }

  // ---- 1ª partida: em cada passo, o primeiro de um time de fora completa ----
  const { cor, vagas } = await escolherTimes(page);
  const nomes: string[] = [];
  for (let i = 0; i < vagas; i++) {
    await expect(page.getByRole('heading', { name: `Quem completa o ${cor}?` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jogar sem' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Alguém sem time' })).toBeVisible();
    if (nomes.length) await expect(page.getByText(`${nomes.join(' e ')} já`)).toBeVisible();
    const primeiro = deFora(page).first();
    nomes.push((await primeiro.getAttribute('aria-label'))!.split(',')[0]);
    await primeiro.click();
  }

  // Conferência: uma linha por vaga. "Trocar" e "Voltar" voltam para cá sem perder as respostas.
  const linhas = page.getByRole('list', { name: 'Quem completa' }).getByRole('listitem');
  await expect(linhas).toHaveCount(vagas);
  for (const [i, n] of nomes.entries()) await expect(linhas.nth(i)).toContainText(`${n} completa o ${cor}`);
  await linhas.first().getByRole('button', { name: /^Trocar/ }).click();
  await expect(tituloDoPasso(page)).toBeVisible();
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(linhas).toHaveCount(vagas);
  for (const [i, n] of nomes.entries()) await expect(linhas.nth(i)).toContainText(`${n} completa o ${cor}`);

  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  await expect(page).toHaveURL(/\/admin\/partida\/\d+$/);

  // No anotador: quem completa tem GOL e AST e a marca "completando".
  const nome = nomes[0];
  const cartao = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `GOL de ${nome}`, exact: true }) });
  await expect(cartao.getByText('completando', { exact: true })).toBeVisible();
  await expect(cartao.getByRole('button', { name: `AST (assistência) de ${nome}` })).toBeVisible();
  await expect(page.getByRole('list', { name: cor }).getByText('completando', { exact: true })).toHaveCount(vagas);

  // A marca não faz o 4 contra 4 rolar, em nenhuma altura.
  await semRolar(page);

  // GOL de quem completa sobe o placar do time dele.
  const lado = (await page.getByTestId('gols-A').innerText()).includes(cor) ? 'A' : 'B';
  const gols = page.getByTestId(`gols-${lado}`);
  await expect(gols).toHaveText(/0$/);
  await cartao.getByRole('button', { name: `GOL de ${nome}`, exact: true }).click();
  await expect(gols).toHaveText(/1$/);
  await expect(cartao).toContainText('1 gol');
  await encerrar(page);

  // ---- 2ª partida: "Jogar sem" em todas as vagas: o time entra com um a menos por COMPLETE ----
  const segunda = await escolherTimes(page);
  for (let i = 0; i < segunda.vagas; i++) {
    await expect(page.getByRole('heading', { name: `Quem completa o ${segunda.cor}?` })).toBeVisible();
    await page.getByRole('button', { name: 'Jogar sem' }).click();
  }
  const semNinguem = page.getByRole('list', { name: 'Quem completa' }).getByRole('listitem');
  await expect(semNinguem).toHaveCount(segunda.vagas);
  const jogaCom = Number((await semNinguem.first().innerText()).match(/joga com (\d)/)![1]);
  await expect(semNinguem.first()).toContainText(`Ninguém: o ${segunda.cor} joga com ${jogaCom}`);
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  await expect(page).toHaveURL(/\/admin\/partida\/\d+$/);

  const doTime = page.getByRole('list', { name: segunda.cor }).getByRole('listitem');
  await expect(doTime).toHaveCount(jogaCom);
  await expect(page.getByText('completando', { exact: true })).toHaveCount(0);
  await encerrar(page);
});
