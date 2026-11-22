import { expect, test } from '@playwright/test';
import { proximaQuarta } from '../../src/domain/tempo';
import { E2E } from './ambiente';
import { entrarComoNovato } from './jogador';

test('lista: entra com 1234, troca o PIN, confirma presença e copia a lista', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const nome = E2E.novatos.lista;
  await entrarComoNovato(page, nome);
  await page.waitForLoadState('networkidle');

  // Diarista: a lista da semana está aberta e tem vaga, então entra direto.
  await page.getByRole('button', { name: 'Entrar na fila' }).click();
  await expect(page.getByRole('heading', { name: 'Abriu vaga pra você' })).toBeVisible();
  await page.getByRole('button', { name: 'Vou', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Você vai' })).toBeVisible();

  await page.getByRole('button', { name: 'Copiar lista pro WhatsApp' }).click();
  await expect(page.getByText('Copiado. Agora é colar no grupo.')).toBeVisible();
  const [, mes, dia] = proximaQuarta(new Date()).split('-');
  const texto = await page.evaluate(() => navigator.clipboard.readText());
  expect(texto.startsWith(`Pelada ${dia}/${mes} - 20:30-22:30`)).toBe(true);
  expect(texto).toContain(`${nome} (D) ✅`);
});
