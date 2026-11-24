// Transformações do pacote de configuração do app Android (sem tocar em disco: dá para testar).

/**
 * Adapta o zapgate.toml do Mac para o celular:
 *  - a pasta de dados e o arquivo de chaves passam a ser relativos (a pasta do app só é conhecida lá);
 *  - as chaves e o segredo do webhook saem do arquivo e vão para o `.env` (por nome).
 * Devolve o toml novo e os nomes das variáveis que o `.env` precisa ter.
 * A conta, as regras e os limites ficam exatamente como estão.
 */
export function adaptarToml(toml) {
  const linhas = toml.split('\n');
  const saida = [];
  let tabela = '';
  let bloco = null; // o [[api.keys]] atual: { inicio, nome, admin }
  const blocos = [];
  let temDados = false;
  let temEnv = false;
  let sessao = '';

  for (const linha of linhas) {
    const cabecalho = linha.match(/^\s*(\[\[?[^\]]+\]\]?)/);
    if (cabecalho) {
      tabela = cabecalho[1].replace(/\s/g, '');
      bloco = tabela === '[[api.keys]]' ? { linhaDaChave: -1, nome: '', admin: false } : null;
      if (bloco) blocos.push(bloco);
      saida.push(linha);
      continue;
    }
    const par = linha.match(/^(\s*)([A-Za-z_]+)\s*=\s*(.*)$/);
    if (!par) {
      saida.push(linha);
      continue;
    }
    const [, recuo, nome, resto] = par;
    if (tabela === '' && nome === 'data_dir') {
      temDados = true;
      saida.push(`${recuo}data_dir = "dados"`);
    } else if (tabela === '' && nome === 'env_file') {
      temEnv = true;
      saida.push(`${recuo}env_file = ".env"`);
    } else if (tabela === '' && (nome === 'keep_awake' || nome === 'wait_for_full_wake')) {
      // Só fazem sentido no macOS; no celular quem segura o aparelho acordado é o app.
    } else if (tabela === '[[sessions]]' && nome === 'id' && !sessao) {
      sessao = resto.match(/"([^"]+)"/)?.[1] ?? '';
      saida.push(linha);
    } else if (tabela === '[sessions.webhook]' && (nome === 'secret' || nome === 'secret_env')) {
      saida.push(`${recuo}secret_env = "PELADA_WEBHOOK_SECRET"`);
    } else if (bloco && (nome === 'key' || nome === 'key_env')) {
      bloco.linhaDaChave = saida.length;
      saida.push(linha); // trocada depois, quando se souber se é a chave de administrador
    } else {
      if (bloco && nome === 'name') bloco.nome = resto.match(/"([^"]+)"/)?.[1] ?? '';
      if (bloco && nome === 'scopes') bloco.admin = /"admin"/.test(resto);
      saida.push(linha);
    }
  }

  const admin = blocos.find((b) => b.admin && b.linhaDaChave >= 0);
  const robo = blocos.find((b) => !b.admin && b.linhaDaChave >= 0);
  if (!sessao) throw new Error('O zapgate.toml não tem nenhuma conta ([[sessions]] com id).');
  if (!admin) throw new Error('O zapgate.toml não tem uma chave com permissão "admin": o app precisa dela para ver o estado e parear.');
  if (!robo) throw new Error('O zapgate.toml não tem a chave do robô (uma [[api.keys]] sem "admin").');
  const outras = blocos.filter((b) => b !== admin && b !== robo && b.linhaDaChave >= 0);
  if (outras.length) throw new Error(`O zapgate.toml tem chaves a mais (${outras.map((b) => b.nome).join(', ')}): tire as que o celular não vai usar.`);
  saida[admin.linhaDaChave] = 'key_env = "ZAPGATE_ADMIN_KEY"';
  saida[robo.linhaDaChave] = 'key_env = "PELADA_ROBO_KEY"';

  const cabeca = [];
  if (!temDados) cabeca.push('data_dir = "dados"');
  if (!temEnv) cabeca.push('env_file = ".env"');
  return { toml: [...cabeca, ...saida].join('\n'), sessao, envs: ['ZAPGATE_ADMIN_KEY', 'PELADA_ROBO_KEY', 'PELADA_WEBHOOK_SECRET'] };
}

/**
 * Adapta o `.env` do robô: mantém tudo (banco, IA, organizadores, Pix, horários) e troca só o que
 * liga o robô ao ZapGate, que no celular tem chaves novas.
 */
export function adaptarEnvDoRobo(env, { chaveDoRobo, segredoDoWebhook, sessao }) {
  const trocar = {
    ROBO_MOTOR: 'zapgate',
    ZAPGATE_URL: 'http://127.0.0.1:8787',
    ZAPGATE_KEY: chaveDoRobo,
    ZAPGATE_WEBHOOK_SECRET: segredoDoWebhook,
    ZAPGATE_SESSAO: sessao,
  };
  const vistos = new Set();
  const linhas = env.replace(/\n+$/, '').split('\n').map((linha) => {
    const nome = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (nome && nome in trocar) {
      vistos.add(nome);
      return `${nome}=${trocar[nome]}`;
    }
    return linha;
  });
  for (const [nome, valor] of Object.entries(trocar)) if (!vistos.has(nome)) linhas.push(`${nome}=${valor}`);
  return linhas.join('\n').replace(/\n*$/, '\n');
}
