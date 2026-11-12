import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';

// Times sorteados fora daqui: colar a mensagem do WhatsApp, conferir a prévia, trocar um nome pela sugestão e salvar.
// Roda por último (ordem alfabética, 1 worker): a pelada já tem partidas jogadas, então salvar pede a confirmação.

test('importar times: cola, a prévia acha os nomes, "Você quis dizer" corrige e salva como definitivo', async ({ page }) => {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/sorteio', { waitUntil: 'networkidle' });

  const deNovo = page.getByRole('button', { name: 'Sortear de novo' });
  if (await deNovo.isVisible()) await deNovo.click();
  await page.getByRole('button', { name: 'Importar times' }).click();
  await expect(page.getByRole('heading', { name: 'Importar times' })).toBeVisible();

  const [a1, a2, a3] = E2E.azul;
  const [l1, l2] = E2E.laranja;
  const [s1, s2, s3] = E2E.sorteio;
  await page
    .getByRole('textbox', { name: /Cole a mensagem dos times/ })
    .fill(`Pelada 11/11 - 20:30-22:30\n\nTime 1 (12.0)\n1. ${a1} 4.5\n2. ${a2} 3.0\n3. ${a3.slice(0, 3)} 3.0\n\nTime 2 (11.5)\n1. ${l1} 4,0\n2. ${l2}\n3. Igr 3.0\n4. COMPLETE 3.0\n\nTime 3 (10)\n1. ${s1}\n2. ${s2}\n3. ${s3}`);

  const previa = page.getByRole('region', { name: 'Prévia dos times' });
  await expect(previa.getByRole('region', { name: /^(Azul|Laranja|Verde|Preto)$/ })).toHaveCount(3);
  await expect(previa.getByRole('region', { name: 'Azul' })).toContainText(a3); // começo do nome achou o cadastro
  const salvar = page.getByRole('button', { name: 'Salvar como definitivo' });
  await expect(salvar).toBeDisabled();
  await page.getByRole('button', { name: 'Você quis dizer Igor?' }).click();
  await expect(previa.getByRole('region', { name: 'Laranja' })).toContainText('COMPLETE');
  await expect(salvar).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await salvar.click();
  const usar = page.getByRole('button', { name: 'Usar os times novos' });
  const definido = page.getByText('Times definitivos');
  await expect(usar.or(definido)).toBeVisible();
  if (await usar.isVisible()) await usar.click();
  await expect(definido).toBeVisible();
  await expect(page.getByRole('region', { name: /^(Azul|Laranja|Verde|Preto)$/ })).toHaveCount(3);
  await expect(page.getByRole('region', { name: 'Laranja', exact: true })).toContainText('Igor');
});
