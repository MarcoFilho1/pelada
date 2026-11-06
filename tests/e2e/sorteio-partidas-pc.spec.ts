import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';

// Partidas e Corrigir no PC (1440×900): a próxima partida à esquerda (os times da fila numa linha), as já jogadas à
// direita; iniciar com COMPLETE passa por "Quem completa" na coluna da esquerda e chega ao anotador; Corrigir mostra
// os dois times lado a lado.
//
// Ordem: este arquivo roda por último (ordem alfabética, 1 worker), porque grava partidas e precisa de COMPLETE na
// pelada de hoje: o anotador.spec.ts conta com os times da semente. Depois do sorteio-complete.spec.ts a pelada já
// tem 4 times e um COMPLETE; rodando sozinho, este teste sorteia antes (como o teste do celular).
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

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

test('partidas no PC: fila numa linha, já jogadas ao lado, e iniciar com COMPLETE passa por quem completa até o anotador', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  if ((await cartoes(page).filter({ hasText: 'COMPLETE' }).count()) === 0) {
    await sortearComComplete(page);
    await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  }

  // Os 4 times da fila numa linha; "Já jogadas" na coluna da direita, no mesmo alto.
  await expect(cartoes(page)).toHaveCount(4);
  const caixas = await Promise.all((await cartoes(page).all()).map((c) => c.boundingBox()));
  expect(new Set(caixas.map((c) => Math.round(c!.y))).size).toBe(1);
  const proxima = await page.getByRole('heading', { name: 'Próxima partida' }).boundingBox();
  const jogadas = await page.getByRole('heading', { name: 'Já jogadas' }).boundingBox();
  expect(jogadas!.x).toBeGreaterThan(caixas[3]!.x + caixas[3]!.width);
  expect(Math.abs(jogadas!.y - proxima!.y)).toBeLessThanOrEqual(8);

  // Um time com COMPLETE contra um sem: Iniciar passa por "Quem completa", na coluna da esquerda.
  const marcados = cartoes(page).and(page.locator('[aria-pressed="true"]'));
  while ((await marcados.count()) > 0) await marcados.first().click();
  await cartoes(page).filter({ hasText: 'COMPLETE' }).first().click();
  await cartoes(page).filter({ hasNotText: 'COMPLETE' }).first().click();
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  const passo = page.getByRole('heading', { name: /^Quem completa o / });
  await expect(passo).toBeVisible();
  expect((await passo.boundingBox())!.x + (await passo.boundingBox())!.width).toBeLessThan(jogadas!.x);
  await expect(page.getByRole('heading', { name: 'Já jogadas' })).toBeVisible();
  while (await passo.isVisible()) {
    await page.getByRole('button', { name: /^.+, do \S+, nota \d,\d$/ }).first().click();
  }

  // Conferência e o anotador, que continua a tela cheia do celular (sem o menu lateral).
  await expect(page.getByRole('list', { name: 'Quem completa' })).toBeVisible();
  await page.getByRole('button', { name: /^Iniciar \S+ × \S+$/ }).click();
  await expect(page).toHaveURL(/\/admin\/partida\/\d+$/);
  await expect(page.getByText('completando', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Encerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Encerrar partida' }).click();
  await expect(page).toHaveURL(/\/admin\/partidas$/);

  // Corrigir: os dois times lado a lado.
  await page.getByRole('link', { name: 'Corrigir' }).first().click();
  await expect(page.getByRole('heading', { name: 'Corrigir partida' })).toBeVisible();
  const [a, b] = await Promise.all([page.locator('#lado-A').boundingBox(), page.locator('#lado-B').boundingBox()]);
  expect(Math.round(a!.y)).toBe(Math.round(b!.y));
  expect(b!.x).toBeGreaterThan(a!.x + a!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
