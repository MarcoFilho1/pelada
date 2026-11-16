import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';

// O link de anotar que o robô manda: sem login, abre as partidas da noite e mais nada.
// Só navega (não inicia partida: o anotador.spec usa a pelada de hoje).

test('link válido: abre as partidas sem login e sem o menu do admin; o resto da área continua fechado', async ({ page }) => {
  await page.goto(`/anotar/${E2E.linkAnotar}`);
  await expect(page).toHaveURL(/\/admin\/partidas$/);
  await expect(page.getByRole('heading', { name: 'Partidas' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);

  for (const fechada of ['/admin', '/admin/jogadores', '/admin/sorteio', '/admin/admins']) {
    await page.goto(fechada);
    await expect(page).toHaveURL(/\/admin\/entrar$/);
  }
  // A partida que não existe cai no aviso de link vencido (não é da pelada do link).
  await page.goto('/admin/partida/999999');
  await expect(page).toHaveURL(/\/anotar\/vencido$/);
});

test('link revogado ou inventado: aviso de link vencido', async ({ page }) => {
  for (const chave of [E2E.linkRevogado, 'qualquer-coisa']) {
    await page.goto(`/anotar/${chave}`);
    await expect(page).toHaveURL(/\/anotar\/vencido$/);
    await expect(page.getByRole('heading', { name: 'Esse link de anotar venceu' })).toBeVisible();
  }
  await page.goto('/admin/partidas');
  await expect(page).toHaveURL(/\/admin\/entrar$/);
});
