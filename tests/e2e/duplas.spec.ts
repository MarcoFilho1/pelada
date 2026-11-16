import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';

// Duplas separadas: o link fica no Sorteio; separa uma dupla, ela aparece e sai. A tela volta como estava.
test('duplas separadas: separa Pepe e Biel, aparece na lista, recusa repetida e tira', async ({ page }) => {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/sorteio');
  await page.getByRole('link', { name: 'Duplas separadas' }).click();
  await expect(page).toHaveURL(/\/admin\/sorteio\/duplas$/);
  await expect(page.getByText('Nenhuma dupla separada.')).toBeVisible();

  await page.getByLabel('Uma pessoa').selectOption({ label: 'Pepe' });
  await page.getByLabel('E a outra').selectOption({ label: 'Biel' });
  await page.getByRole('button', { name: 'Separar' }).click();
  await expect(page.getByRole('status')).toContainText('Dupla separada');
  await expect(page.getByRole('listitem').filter({ hasText: 'Biel e Pepe' })).toBeVisible();

  await page.getByLabel('Uma pessoa').selectOption({ label: 'Biel' });
  await page.getByLabel('E a outra').selectOption({ label: 'Pepe' });
  await page.getByRole('button', { name: 'Separar' }).click();
  await expect(page.getByText('Essa dupla já está separada.')).toBeVisible();

  await page.getByRole('listitem').filter({ hasText: 'Biel e Pepe' }).getByRole('button', { name: 'Tirar' }).click();
  await expect(page.getByText('Nenhuma dupla separada.')).toBeVisible();
});
