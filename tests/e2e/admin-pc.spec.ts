import { expect, test, type Page } from '@playwright/test';
import { E2E } from './ambiente';

// O admin no PC (≥1024px): menu lateral fixo no lugar das abas, e nenhuma tela rola de lado; Pelada em
// duas colunas e Jogadores em tabela. Só navega e lê, menos a nota mudada em Jogadores, que volta ao valor
// de antes no fim do teste (o sorteio dos outros testes depende das notas).
test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });

const SECOES = [
  { rotulo: 'Painel', url: /\/admin$/ },
  { rotulo: 'Pelada', url: /\/admin\/pelada$/ },
  { rotulo: 'Sorteio', url: /\/admin\/sorteio$/ },
  { rotulo: 'Partidas', url: /\/admin\/partidas$/ },
  { rotulo: 'Jogadores', url: /\/admin\/jogadores$/ },
  { rotulo: 'Mensalistas', url: /\/admin\/mensalistas$/ },
  { rotulo: 'Admins', url: /\/admin\/admins$/ },
];

async function entrar(page: Page) {
  await page.goto('/admin/entrar');
  await page.getByLabel('Usuário').fill(E2E.usuario);
  await page.getByLabel('Senha').fill(E2E.senha);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test('admin no PC: menu lateral com as 7 seções, marca a atual e nada rola de lado', async ({ page }) => {
  await entrar(page);

  // Um menu só (as abas do celular somem), vertical, com as 7 seções e o "Sair" no pé.
  const menu = page.getByRole('navigation', { name: 'Admin' });
  await expect(menu).toHaveCount(1);
  await expect(menu.getByRole('link')).toHaveText(SECOES.map((s) => s.rotulo));
  const [primeiro, ultimo] = [await menu.getByRole('link').first().boundingBox(), await menu.getByRole('link').last().boundingBox()];
  expect(ultimo!.y).toBeGreaterThan(primeiro!.y);
  expect(ultimo!.x).toBe(primeiro!.x);
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();

  // No Painel, o bloco da lista mostra a conta "x/16".
  await expect(page.getByRole('link', { name: /Lista de quarta/ })).toContainText(/\d+\/16/);

  for (const { rotulo, url } of SECOES) {
    await menu.getByRole('link', { name: rotulo, exact: true }).click();
    await expect(page).toHaveURL(url);
    await expect(menu.getByRole('link', { name: rotulo, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }

  // O anotador (e a tela de partida que não existe, na mesma rota) continua sem menu, também no PC.
  await page.goto('/admin/partida/999999');
  await expect(page.getByRole('heading', { name: 'Partida não encontrada' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Admin' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sair' })).toHaveCount(0);
  // Sem o menu, a coluna volta a ficar centrada na tela (sem a calha vazia do menu).
  const coluna = await page.locator('main').boundingBox();
  expect(Math.abs(coluna!.x + coluna!.width / 2 - 720)).toBeLessThanOrEqual(1);
});

test('pelada no PC: a fila fica à direita da lista, com a busca no alto da coluna da direita', async ({ page }) => {
  await entrar(page);
  await page.goto('/admin/pelada');
  const lista = await page.getByRole('heading', { name: 'Lista', exact: true }).boundingBox();
  const fila = await page.getByRole('heading', { name: 'Fila', exact: true }).boundingBox();
  expect(fila!.x).toBeGreaterThan(lista!.x + lista!.width);
  // A fila começa na altura da lista (lado a lado, não embaixo).
  expect(fila!.y).toBeLessThan(lista!.y + 400);
  // Uma busca só na tela (a do celular fica escondida), na coluna da fila, acima dela.
  const busca = page.getByRole('textbox', { name: 'Pôr alguém na lista' });
  await expect(busca).toHaveCount(1);
  const caixa = await busca.boundingBox();
  expect(Math.abs(caixa!.x - fila!.x)).toBeLessThanOrEqual(1);
  expect(caixa!.y).toBeLessThan(fila!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('jogadores no PC: a nota muda pela própria linha e continua depois de recarregar', async ({ page }) => {
  const nome = E2E.novatos.lista;
  await entrar(page);
  await page.goto('/admin/jogadores');
  // O cabeçalho da tabela (Nome · Nota · PIN) só existe no PC.
  await expect(page.getByText('Nome', { exact: true }).first()).toBeVisible();

  // A linha tem a nota, o PIN e o nome que abre o editor; o seletor fica na linha, sem abrir nada.
  const linha = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: new RegExp(`^${nome}`) }) });
  const nota = linha.getByRole('group', { name: `Nota de ${nome}` });
  await expect(nota).toBeVisible();
  await expect(linha.getByText('PIN: Ainda é 1234', { exact: true })).toBeVisible();
  const antes = (await nota.locator('output').textContent())!;
  const valor = (t: string) => Number(t.replace(',', '.'));

  await nota.getByRole('button', { name: 'Aumentar nota em 0,5' }).click();
  const nova = (valor(antes) + 0.5).toFixed(1).replace('.', ',');
  await expect(nota.locator('output')).toHaveText(nova);
  // Salva sozinho 500 ms depois do último toque.
  await page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/admin/jogadores'));
  await page.reload();
  await expect(page.getByRole('group', { name: `Nota de ${nome}` }).locator('output')).toHaveText(nova);

  // Clicar no nome abre o editor logo abaixo da linha, sem o seletor repetido.
  await page.getByRole('button', { name: new RegExp(`^${nome}`) }).click();
  const nomeCampo = page.getByLabel('Nome', { exact: true });
  await expect(nomeCampo).toHaveValue(nome);
  await expect(page.getByRole('group', { name: `Nota de ${nome}` })).toHaveCount(1);
  const linhaBox = await page.getByRole('button', { name: new RegExp(`^${nome}`) }).boundingBox();
  expect((await nomeCampo.boundingBox())!.y).toBeGreaterThan(linhaBox!.y + linhaBox!.height - 1);

  // Volta a nota de antes.
  await page.getByRole('group', { name: `Nota de ${nome}` }).getByRole('button', { name: 'Diminuir nota em 0,5' }).click();
  await page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/admin/jogadores'));
  await page.reload();
  await expect(page.getByRole('group', { name: `Nota de ${nome}` }).locator('output')).toHaveText(antes);
});
