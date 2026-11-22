import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';
import { digitarPin, entrarComoNovato, PIN_NOVO } from './jogador';

test('perfil: troca o PIN pelo perfil e continua logado; quem já entrou pula as telas de login', async ({ page }) => {
  await entrarComoNovato(page, E2E.novatos.perfil);

  await page.goto('/perfil/pin', { waitUntil: 'networkidle' });
  await digitarPin(page, 'PIN atual', PIN_NOVO);
  await digitarPin(page, 'PIN novo de 4 números', '1357');
  await digitarPin(page, 'Repita o PIN novo', '1357');
  await expect(page.getByRole('heading', { name: 'PIN trocado' })).toBeVisible();

  // Trocar o PIN não derruba este aparelho.
  await page.goto('/perfil');
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole('heading', { name: E2E.novatos.perfil })).toBeVisible();

  // Jogador logado em /entrar vai direto para a lista.
  await page.goto('/entrar');
  await expect(page).toHaveURL(/\/lista$/);

  // Admin logado em /admin/entrar vai para o painel (a sessão de admin é outra, no mesmo aparelho).
  await page.goto('/admin/entrar', { waitUntil: 'networkidle' });
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/entrar');
  await expect(page).toHaveURL(/\/admin$/);
});
