import { describe, expect, it } from 'vitest';
import { adaptarEnvDoRobo, adaptarToml } from '../../scripts/android/pacote.mjs';

const TOML = `data_dir = "/Users/alguem/zapgate/dados"
keep_awake = true

[[sessions]]
id = "pelada"
expected_number = "5581900000000"    # só este número pode conectar
device = "chrome-macos"

[sessions.gate]
per_hour = 30
allow_initiate = ["120363000000000001@g.us"]

[sessions.webhook]
url = "http://127.0.0.1:8788/"
secret = "segredo-antigo-que-nao-pode-ir-junto"

[api]
listen = "127.0.0.1:8787"

[[api.keys]]
name = "admin-local"
key = "chave-admin-antiga-que-nao-pode-ir"
scopes = ["read", "admin"]

[[api.keys]]                         # o robô
name = "robo-pelada"
key = "chave-robo-antiga-que-nao-pode-ir"
scopes = ["read", "send"]
sessions = ["pelada"]
`;

describe('adaptarToml', () => {
  it('troca caminhos e chaves, mantém a conta e as regras', () => {
    const r = adaptarToml(TOML);
    expect(r.sessao).toBe('pelada');
    expect(r.toml).toContain('data_dir = "dados"');
    expect(r.toml).toContain('env_file = ".env"');
    expect(r.toml).toContain('secret_env = "PELADA_WEBHOOK_SECRET"');
    expect(r.toml).toMatch(/name = "admin-local"\nkey_env = "ZAPGATE_ADMIN_KEY"/);
    expect(r.toml).toMatch(/name = "robo-pelada"\nkey_env = "PELADA_ROBO_KEY"/);
    // Nenhum segredo antigo vai no arquivo; o que é do macOS sai.
    expect(r.toml).not.toMatch(/antig[ao]/);
    expect(r.toml).not.toContain('keep_awake');
    expect(r.toml).not.toContain('/Users/');
    // A conta e as regras ficam como estavam.
    for (const igual of ['expected_number = "5581900000000"    # só este número pode conectar', 'device = "chrome-macos"', 'per_hour = 30', 'allow_initiate = ["120363000000000001@g.us"]', 'url = "http://127.0.0.1:8788/"', 'sessions = ["pelada"]']) {
      expect(r.toml).toContain(igual);
    }
  });

  it('sem data_dir no arquivo, acrescenta', () => {
    const r = adaptarToml(TOML.replace(/^data_dir.*\n/, ''));
    expect(r.toml.startsWith('data_dir = "dados"\nenv_file = ".env"\n')).toBe(true);
  });

  it('recusa arquivo sem conta, sem chave de admin, sem chave do robô ou com chave sobrando', () => {
    expect(() => adaptarToml('[api]\nlisten = "x"\n')).toThrow(/nenhuma conta/);
    expect(() => adaptarToml(TOML.replace('scopes = ["read", "admin"]', 'scopes = ["read"]'))).toThrow(/admin/);
    expect(() => adaptarToml(TOML.replace('scopes = ["read", "send"]', 'scopes = ["read", "admin"]'))).toThrow(/chave do robô/);
    expect(() => adaptarToml(`${TOML}\n[[api.keys]]\nname = "agente"\nkey = "x"\nscopes = ["read"]\n`)).toThrow(/chaves a mais \(agente\)/);
  });
});

describe('adaptarEnvDoRobo', () => {
  it('troca só a ligação com o ZapGate e mantém o resto', () => {
    const env = '# banco\nDATABASE_URL=postgres://x\nROBO_ADMINS=5581987650001\nZAPGATE_KEY=antiga\nZAPGATE_WEBHOOK_SECRET=antigo\nZAPGATE_URL=http://outro:1\n';
    const novo = adaptarEnvDoRobo(env, { chaveDoRobo: 'nova-chave', segredoDoWebhook: 'novo-segredo', sessao: 'pelada' });
    expect(novo).toBe(
      '# banco\nDATABASE_URL=postgres://x\nROBO_ADMINS=5581987650001\nZAPGATE_KEY=nova-chave\nZAPGATE_WEBHOOK_SECRET=novo-segredo\nZAPGATE_URL=http://127.0.0.1:8787\nROBO_MOTOR=zapgate\nZAPGATE_SESSAO=pelada\n',
    );
  });
});
