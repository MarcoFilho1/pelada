import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';
import { entrarComoNovato } from './jogador';

// O jogador no PC (≥1024px): o menu Lista · Ranking · Perfil sobe para a barra do topo (a barra de baixo
// some), a Lista fica em duas colunas (o bloco "sua vaga" à esquerda), o Ranking cabe inteiro e o Perfil põe as
// Quartas ao lado dos números. Só navega e lê (o novato tem uma quarta semeada só para ele).
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const SECOES = [
  { rotulo: 'Lista', url: /\/lista$/ },
  { rotulo: 'Ranking', url: /\/ranking/ },
  { rotulo: 'Perfil', url: /\/perfil$/ },
];

const semRolagemLateral = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('jogador no PC: menu no topo, lista em duas colunas, ranking inteiro e perfil em duas colunas', async ({ page }) => {
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

  // Ranking: a tabela inteira cabe (nem ela nem a página rolam de lado) e a dica de arrastar some.
  await page.goto('/ranking?p=geral', { waitUntil: 'networkidle' });
  const tabela = page.getByRole('region', { name: 'Tabela do ranking', exact: true });
  await expect(tabela).toBeVisible();
  expect(await tabela.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await expect(page.getByText('Arraste para o lado para ver mais colunas.')).toBeHidden();
  expect(await semRolagemLateral(page)).toBe(true);

  // Perfil: as Quartas numa coluna à direita dos números; "Trocar PIN" logo abaixo dos números.
  await page.goto('/perfil?p=geral', { waitUntil: 'networkidle' });
  const numeros = await page.getByRole('region', { name: 'Seus números' }).boundingBox();
  const quartas = await page.getByRole('region', { name: 'Quartas' }).boundingBox();
  const trocar = await page.getByRole('link', { name: 'Trocar PIN' }).boundingBox();
  expect(numeros!.x + numeros!.width).toBeLessThan(quartas!.x);
  expect(trocar!.x).toBe(numeros!.x);
  expect(trocar!.y).toBeGreaterThan(numeros!.y + numeros!.height);
  expect(await semRolagemLateral(page)).toBe(true);

  // Trocar o PIN (tela de uma tarefa) continua sem menu, também no PC.
  await page.goto('/perfil/pin');
  await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
});
