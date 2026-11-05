import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';

// Partida com COMPLETE: escolher alguém de um time de fora para completar, ver a marca "completando"
// no anotador (que continua cabendo sem rolar) e o gol dele subir o placar.
//
// Ordem: roda depois do sorteio-complete.spec.ts (ordem alfabética, 1 worker), que deixa a pelada de
// hoje com 4 times e 1 COMPLETE. Rodando sozinho, este teste faz antes o mesmo sorteio com COMPLETE.

async function entrar(page: Page) {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Sorteia 14 (os 8 dos times + 6 sem time) em 4 times com 2 COMPLETE e marca como definitivo. */
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

test('partida com COMPLETE: alguém de um time de fora completa, aparece "completando" e o gol dele conta', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  if ((await cartoes(page).filter({ hasText: 'COMPLETE' }).count()) === 0) {
    await sortearComComplete(page);
    await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  }

  // Escolher o time com COMPLETE e um sem: primeiro solta os dois sugeridos.
  const marcados = cartoes(page).and(page.locator('[aria-pressed="true"]'));
  while ((await marcados.count()) > 0) await marcados.first().click();
  const comComplete = cartoes(page).filter({ hasText: 'COMPLETE' }).first();
  const cor = (await comComplete.locator('span.font-semibold').first().innerText()).trim();
  await comComplete.click();
  await cartoes(page).filter({ hasNotText: 'COMPLETE' }).first().click();
  await expect(page.getByText(`Antes de começar, você escolhe quem completa o ${cor}.`)).toBeVisible();
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();

  // "Quem completa o <Cor>?", um passo por COMPLETE: os dos outros times primeiro, depois a busca,
  // e "Jogar sem". Em cada um, o primeiro de um time de fora.
  const chip = await comComplete.getByText(/COMPLETE$/).innerText();
  const vagas = Number(chip.match(/^(\d+) /)?.[1] ?? 1);
  const nomes: string[] = [];
  const deFora = page.locator('h3:text-is("Dos outros times") + ul button');
  for (let i = 0; i < vagas; i++) {
    await expect(page.getByRole('heading', { name: `Quem completa o ${cor}?` })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Jogar sem' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Alguém sem time' })).toBeVisible();
    if (nomes.length) await expect(page.getByText(`${nomes.join(' e ')} já`)).toBeVisible();
    const primeiro = deFora.first();
    nomes.push((await primeiro.locator('span.text-linha').innerText()).trim());
    await primeiro.click();
  }

  // Conferência: uma linha por vaga, e iniciar.
  const linhas = page.getByRole('list', { name: 'Quem completa' }).getByRole('listitem');
  await expect(linhas).toHaveCount(vagas);
  for (const [i, n] of nomes.entries()) await expect(linhas.nth(i)).toContainText(`${n} completa o ${cor}`);
  const nome = nomes[0];
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  await expect(page).toHaveURL(/\/admin\/partida\/\d+$/);

  // No anotador: quem completa tem GOL e AST e a marca "completando".
  const cartao = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `GOL de ${nome}`, exact: true }) });
  await expect(cartao.getByText('completando', { exact: true })).toBeVisible();
  await expect(cartao.getByRole('button', { name: `AST (assistência) de ${nome}` })).toBeVisible();

  // A marca não faz o 4 contra 4 rolar, nem em tela baixa.
  for (const tamanho of [
    { width: 390, height: 844 },
    { width: 390, height: 664 },
    { width: 360, height: 640 },
  ]) {
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
  await page.setViewportSize({ width: 390, height: 844 });

  // GOL de quem completa sobe o placar do time dele.
  const lado = (await page.getByTestId('gols-A').innerText()).includes(cor) ? 'A' : 'B';
  const gols = page.getByTestId(`gols-${lado}`);
  await expect(gols).toHaveText(/0$/);
  await cartao.getByRole('button', { name: `GOL de ${nome}`, exact: true }).click();
  await expect(gols).toHaveText(/1$/);
  await expect(cartao).toContainText('1 gol');

  // Encerra para não deixar partida aberta.
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar partida' }).click();
  await expect(page).toHaveURL(/\/admin\/partidas$/);
});
