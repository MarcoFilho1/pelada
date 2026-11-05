import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E } from './ambiente';

// A pelada de hoje já tem os times definitivos da semente (Azul e Laranja, 8 jogadores). Este teste
// sorteia de novo com 14 (os 8 + 6 sem time), marca o sorteio com 2 COMPLETE como definitivo e põe um
// jogador sem time no lugar de um deles. Roda depois do anotador.spec.ts (ordem alfabética, 1 worker):
// aí a pelada já tem 1 partida jogada e marcar pede a confirmação na tela; rodando sozinho, não pede.

const lerNumero = (texto: string) => Number(texto.replace(/[^\d,]/g, '').replace(',', '.'));

async function somaDo(card: Locator) {
  return lerNumero(await card.locator('h3 + span').innerText());
}

async function semRolarDeLado(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

test('sorteio: 14 confirmados viram 4 times com 2 COMPLETE, definitivo, e alguém entra no lugar de um', async ({ page }) => {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/sorteio', { waitUntil: 'networkidle' });
  await expect(page.getByText('Times definitivos')).toBeVisible();

  // "Sortear de novo" está sempre à mão nos times definitivos, com ou sem partida jogada.
  await page.getByRole('button', { name: 'Sortear de novo' }).click();
  const busca = page.getByRole('textbox', { name: 'Pôr mais alguém' });
  for (const nome of E2E.sorteio) {
    await busca.fill(nome);
    await page.getByRole('button', { name: nome, exact: true }).click();
  }
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(14);
  await expect(page.getByText('2 vagas viram COMPLETE.')).toBeVisible();
  await page.getByRole('button', { name: 'Sortear 14 em 4 times' }).click();

  // 4 times: dois de 4 jogadores, dois de 3 + COMPLETE.
  const completes = page.getByRole('button', { name: /^COMPLETE do \w+, nota \d,\d$/ });
  await expect(completes).toHaveCount(2);
  expect(await semRolarDeLado(page)).toBe(true);

  // A nota do COMPLETE entra na soma do time: subir 0,5 sobe a soma em 0,5.
  const rotulo = (await completes.first().getAttribute('aria-label'))!;
  const time = rotulo.match(/^COMPLETE do (\w+),/)![1];
  const card = page.getByRole('region', { name: time, exact: true });
  const antes = await somaDo(card);
  await completes.first().click();
  await page.getByRole('button', { name: 'Aumentar nota em 0,5' }).click();
  await expect.poll(() => somaDo(card)).toBeCloseTo(antes + 0.5);
  await page.getByRole('button', { name: 'Fechar' }).click();

  // Marcar como definitivo; com partida já jogada, a confirmação aparece antes.
  await page.getByRole('button', { name: 'Marcar como definitivo' }).click();
  const confirmar = page.getByRole('button', { name: 'Usar os times novos' });
  const definido = page.getByText('Times definitivos');
  await expect(confirmar.or(definido)).toBeVisible();
  if (await confirmar.isVisible()) {
    await expect(page.getByText(/já jogadas? fic(a|am) como est(á|ão)\. Os times novos valem daqui pra frente\./)).toBeVisible();
    await confirmar.click();
  }
  await expect(definido).toBeVisible();
  await expect(completes).toHaveCount(2);

  // Tocar num COMPLETE → "Pôr alguém no lugar" → buscar quem não tem time.
  const rotuloFixo = (await completes.first().getAttribute('aria-label'))!;
  const timeFixo = rotuloFixo.match(/^COMPLETE do (\w+),/)![1];
  await completes.first().click();
  await page.getByRole('button', { name: 'Pôr alguém no lugar' }).click();
  await expect(page.getByRole('heading', { name: `Quem entra no ${timeFixo}?` })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar pelo nome' }).fill(E2E.semTime);
  await page.getByRole('button', { name: E2E.semTime, exact: true }).click();

  await expect(page.getByRole('status').filter({ hasText: `${E2E.semTime} entrou no ${timeFixo}.` })).toBeVisible();
  await expect(completes).toHaveCount(1);
  await expect(page.getByRole('region', { name: timeFixo, exact: true }).getByRole('button', { name: new RegExp(E2E.semTime) })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 640 });
  expect(await semRolarDeLado(page)).toBe(true);
});
