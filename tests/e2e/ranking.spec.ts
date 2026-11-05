import { expect, test } from '@playwright/test';
import { mesDe } from '../../src/domain/tempo';
import { E2E } from './ambiente';
import { entrarComoNovato } from './jogador';

// A semente joga duas partidas numa quarta de 14 dias atrás; este é o mês dela.
const mesDoHistorico = () => mesDe(new Date(Date.now() - 14 * 24 * 3_600_000));

test.use({ viewport: { width: 360, height: 640 } });

test('ranking: tabela sem rolar a página, filtro ?p= que volta e ?p= inválido sem erro', async ({ page }) => {
  await entrarComoNovato(page, E2E.novatos.ranking);
  const mes = mesDoHistorico();

  await page.goto(`/ranking?p=${mes}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  const larguras = await page.evaluate(() => ({ pagina: document.scrollingElement!.scrollWidth, janela: innerWidth }));
  expect(larguras.pagina).toBeLessThanOrEqual(larguras.janela);

  // Ida e volta: Geral e de volta ao mês pelo histórico do navegador mantém o filtro marcado.
  const abas = page.getByRole('navigation', { name: 'Período' });
  await expect(abas.getByRole('link', { name: 'Mês' })).toHaveAttribute('aria-current', 'true');
  await abas.getByRole('link', { name: 'Geral' }).click();
  await expect(page).toHaveURL(/\?p=geral/);
  await expect(abas.getByRole('link', { name: 'Geral' })).toHaveAttribute('aria-current', 'true');
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`\\?p=${mes}$`));
  await expect(abas.getByRole('link', { name: 'Mês' })).toHaveAttribute('aria-current', 'true');

  // ?p= sem sentido cai num período válido, sem tela de erro.
  for (const lixo of ['banana', '2099-13', '']) {
    const resposta = await page.goto(`/ranking?p=${lixo}`);
    expect(resposta?.status(), lixo).toBe(200);
    await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Período' }).locator('[aria-current="true"]')).toHaveCount(1);
  }
});
