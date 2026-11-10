import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';
import { entrarComoNovato } from './jogador';

// O jogador no PC (≥1024px): o menu Lista · Ranking · Perfil sobe para a barra do topo (a barra de baixo
// some) e a Lista fica em duas colunas, o bloco "sua vaga" à esquerda. Só navega e lê.
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const SECOES = [
  { rotulo: 'Lista', url: /\/lista$/ },
  { rotulo: 'Ranking', url: /\/ranking/ },
  { rotulo: 'Perfil', url: /\/perfil$/ },
];

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('jogador no PC: menu no topo com as 3 seções e a lista em duas colunas', async ({ page }) => {
  await entrarComoNovato(page, E2E.novatos.jogadorPc);
  await page.waitForLoadState('networkidle');

  // Um menu só (a barra de baixo some), na barra do topo, acima do título, com a seção atual marcada.
  const menu = page.getByRole('navigation', { name: 'Principal' });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('link')).toHaveText(SECOES.map((s) => s.rotulo));
  const caixaMenu = await menu.boundingBox();
  const caixaTitulo = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(caixaMenu!.y + caixaMenu!.height).toBeLessThanOrEqual(caixaTitulo!.y);
  await expect(menu.getByRole('link', { name: 'Lista', exact: true })).toHaveAttribute('aria-current', 'page');

  // Lista em duas colunas: o bloco "sua vaga" à esquerda da lista, com o topo na mesma altura.
  const bloco = await page.getByRole('region').filter({ has: page.locator('#meu-titulo') }).boundingBox();
  const lista = await page.getByRole('region', { name: 'Lista', exact: true }).boundingBox();
  expect(bloco!.x + bloco!.width).toBeLessThan(lista!.x);
  expect(Math.abs(bloco!.y - lista!.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: 'Copiar lista pro WhatsApp' })).toHaveCount(1);
  expect(await semRolagemLateral(page)).toBe(true);

  for (const { rotulo, url } of SECOES) {
    await menu.getByRole('link', { name: rotulo, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(menu.getByRole('link', { name: rotulo, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await semRolagemLateral(page)).toBe(true);
  }

  // Trocar o PIN (tela de uma tarefa) continua sem menu, também no PC.
  await page.goto('/perfil/pin');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
});
