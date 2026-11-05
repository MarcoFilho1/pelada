import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';

const NOVA_SENHA = 'outra-senha-do-e2e-456';

async function trocarSenha(page: Page, atual: string, nova: string) {
  await page.getByLabel('Senha atual').fill(atual);
  await page.getByLabel('Senha nova').fill(nova);
  await page.getByRole('button', { name: 'Trocar senha' }).click();
  await expect(page.getByText('Senha trocada. Os outros aparelhos saíram da conta.')).toBeVisible();
}

test('admin: trocar a própria senha mantém este aparelho logado (e volta à senha do e2e)', async ({ page }) => {
  await page.goto('/admin/entrar', { waitUntil: 'networkidle' });
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/admins', { waitUntil: 'networkidle' });
  await trocarSenha(page, E2E.senha, NOVA_SENHA);

  // Este aparelho continua dentro: recarregar não manda para o login.
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/admins$/);
  await expect(page.getByRole('heading', { name: 'Trocar minha senha' })).toBeVisible();

  // Devolve a senha original: os outros testes entram com ela.
  await page.waitForLoadState('networkidle');
  await trocarSenha(page, NOVA_SENHA, E2E.senha);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/admins$/);
});
