import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';

// O admin no PC (≥1024px): menu lateral fixo no lugar das abas, e nenhuma tela rola de lado.
// Só navega e lê: não muda nada no banco que os outros testes usam.
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const SECOES = [
  { rotulo: 'Painel', url: /\/admin$/ },
  { rotulo: 'Pelada', url: /\/admin\/pelada$/ },
  { rotulo: 'Sorteio', url: /\/admin\/sorteio$/ },
  { rotulo: 'Partidas', url: /\/admin\/partidas$/ },
  { rotulo: 'Jogadores', url: /\/admin\/jogadores$/ },
  { rotulo: 'Mensalistas', url: /\/admin\/mensalistas$/ },
  { rotulo: 'Admins', url: /\/admin\/admins$/ },
];

test('admin no PC: menu lateral com as 7 seções, marca a atual e nada rola de lado', async ({ page }) => {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Um menu só (as abas do celular somem), vertical, com as 7 seções e o "Sair" no pé.
  const menu = page.getByRole('navigation', { name: 'Admin' });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('link')).toHaveText(SECOES.map((s) => s.rotulo));
  const [primeiro, ultimo] = [await menu.getByRole('link').first().boundingBox(), await menu.getByRole('link').last().boundingBox()];
  expect(ultimo!.y).toBeGreaterThan(primeiro!.y);
  expect(ultimo!.x).toBe(primeiro!.x);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  // No Painel, o bloco da lista mostra a conta "x/16".
  await expect(page.getByRole('link', { name: /Lista de quarta/ })).toContainText(/\d+\/16/);

  for (const { rotulo, url } of SECOES) {
    await menu.getByRole('link', { name: rotulo, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(menu.getByRole('link', { name: rotulo, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  // O anotador (e a tela de partida que não existe, na mesma rota) continua sem menu, também no PC.
  await page.goto('/admin/partida/999999');
  await expect(page.getByRole('heading', { name: 'Partida não encontrada' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  // Sem o menu, a coluna volta a ficar centrada na tela (sem a calha vazia do menu).
  const coluna = await page.locator('main').boundingBox();
  expect(Math.abs(coluna!.x + coluna!.width / 2 - 720)).toBeLessThanOrEqual(1);
});
