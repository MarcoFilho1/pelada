import { expect, test } from '@playwright/test';
import { E2E } from './ambiente';

const [pepe, rafa] = E2E.azul;

test('anotador: inicia, anota, desfaz, avisa no 3º gol, encerra e entra no histórico', async ({ page }) => {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Iniciar a partida sugerida pela fila (Azul × Laranja, os dois times da noite).
  // Espera a página hidratar (sem isso, um clique no HTML do servidor não faz nada).
  await page.goto('/admin/partidas', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Iniciar Azul × Laranja' }).click();
  await expect(page).toHaveURL(/\/admin\/partida\/\d+$/);

  const golsAzul = page.getByTestId('gols-A');
  const golsLaranja = page.getByTestId('gols-B');
  await expect(golsAzul).toHaveText(/0$/);

  // 4 contra 4 cabe sem rolar: na tela inteira (390×844), logo acima da tela baixa (390×764) e na
  // parte visível do navegador de celulares comuns (390×664, 360×640), com GOL e AST de pelo menos 48px.
  for (const tamanho of [
    { width: 390, height: 844 },
    { width: 390, height: 764 },
    { width: 390, height: 664 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(tamanho);
    const medida = await page.evaluate(() => {
      const lista = document.querySelector('main .overflow-y-auto');
      const botoes = [...document.querySelectorAll('main li button')].map((b) => b.getBoundingClientRect().height);
      return {
        pagina: document.documentElement.scrollHeight > innerHeight,
        lista: lista ? lista.scrollHeight > lista.clientHeight : true,
        menorBotao: Math.min(...botoes) >= 48,
      };
    });
    expect(medida, `${tamanho.width}×${tamanho.height}`).toEqual({ pagina: false, lista: false, menorBotao: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // GOL de dois jogadores do Azul → 2×0.
  await page.getByRole('button', { name: `GOL de ${pepe}` }).click();
  await page.getByRole('button', { name: `GOL de ${rafa}` }).click();
  await expect(golsAzul).toHaveText(/2$/);
  await expect(golsLaranja).toHaveText(/0$/);

  // Desfazer tira o último (o gol do Rafa) → 1×0.
  await page.getByRole('button', { name: `Desfazer: gol de ${rafa}` }).click();
  await expect(golsAzul).toHaveText(/1$/);
  await expect(page.getByRole('button', { name: `Desfazer: gol de ${pepe}` })).toBeVisible();

  // Servidor lento (as escritas demoram 11,5 s): a faixa "Salvando há mais de 10 s" aparece, pega o
  // toque sem anotar nada, e a última linha da lista continua ao alcance (rolando). 360×640, o pior caso.
  let lento = true;
  await page.route('**/*', async (route) => {
    if (lento && route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 11_500));
    await route.continue();
  });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole('button', { name: `GOL de ${rafa}` }).click();
  await expect(golsAzul).toHaveText(/2$/); // conta na hora, antes da resposta
  const faixa = page.getByRole('status').filter({ hasText: 'Salvando há mais de 10 s' });
  await expect(faixa).toBeVisible({ timeout: 15_000 });
  const caixa = (await faixa.boundingBox())!;
  const noMeio = { x: caixa.x + caixa.width / 2, y: caixa.y + caixa.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button, [role="status"]')?.getAttribute('role'), noMeio)).toBe('status');
  await page.mouse.click(noMeio.x, noMeio.y); // tocar na faixa não anota (nem abaixo dela)
  const alcance = await page.evaluate((topoDaFaixa) => {
    const lista = document.querySelector('main .overflow-y-auto')!;
    lista.scrollTop = lista.scrollHeight;
    const botoes = [...document.querySelectorAll('main li button')].map((b) => b.getBoundingClientRect().bottom);
    return Math.max(...botoes) <= topoDaFaixa;
  }, caixa.y);
  expect(alcance, 'última linha acima da faixa depois de rolar').toBe(true);
  lento = false;
  await expect(faixa).toBeHidden({ timeout: 20_000 });
  await expect(golsAzul).toHaveText(/2$/); // o toque na faixa não virou lance
  await page.setViewportSize({ width: 390, height: 844 });

  // Mais um gol → 3×0 e o aviso de encerrar, sem encerrar sozinho.
  await page.getByRole('button', { name: `GOL de ${pepe}` }).click();
  await expect(golsAzul).toHaveText(/3$/);
  await expect(page.getByText('Azul venceu 3×0 — encerrar?')).toBeVisible();

  // Encerrar → volta para a noite, com a partida no histórico como vitória do Azul.
  await page.getByRole('button', { name: 'Encerrar partida' }).click();
  await expect(page).toHaveURL(/\/admin\/partidas$/);
  const historico = page.getByRole('region', { name: 'Já jogadas' });
  await expect(historico.getByRole('listitem')).toHaveCount(1);
  await expect(historico.getByRole('listitem')).toContainText('Azul');
  await expect(historico.getByRole('listitem')).toContainText('3 × 0');
  await expect(historico.getByText('Azul venceu')).toBeVisible();
});
