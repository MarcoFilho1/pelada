import { expect, type Page } from '@playwright/test';

/** O PIN que o jogador escolhe no primeiro acesso nos testes. */
export const PIN_NOVO = '2468';

/** Digita nas quatro placas do PIN (o campo é um só, pelo rótulo). */
export async function digitarPin(page: Page, rotulo: string, pin: string) {
  const campo = page.getByLabel(rotulo, { exact: true });
  await campo.click();
  await campo.pressSequentially(pin);
}

/**
 * Primeiro acesso de um jogador de PIN padrão: escolhe o nome, entra com 1234, é obrigado a trocar,
 * cria o PIN novo (duas vezes) e cai na lista.
 */
export async function entrarComoNovato(page: Page, nome: string) {
  await page.goto('/entrar', { waitUntil: 'networkidle' });
  await page.getByLabel('Seu nome').fill(nome);
  await page.getByRole('button', { name: nome }).click();
  await digitarPin(page, `PIN de ${nome}`, '1234');
  await expect(page).toHaveURL(/\/trocar-pin$/);
  await page.waitForLoadState('networkidle');
  await digitarPin(page, 'PIN novo de 4 números', PIN_NOVO);
  await digitarPin(page, 'Repita o PIN novo', PIN_NOVO);
  await expect(page).toHaveURL(/\/lista$/);
}
