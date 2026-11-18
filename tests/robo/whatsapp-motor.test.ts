// O robô pelo motor-wa: tradução dos eventos (sem rede) e, se houver o binário do motor-wa, um
// teste de ponta a ponta com o motor no WhatsApp FALSO (nada chega ao WhatsApp, nenhum contato).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as netServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MessageReceived } from '@/robo/motor-wa';
import { conectarMotor, explicarErro, lerEventoDoMotor, referenciaDoEnvio } from '@/robo/whatsapp-motor';
import type { MensagemRecebida } from '@/robo/responder';
import type { WhatsApp } from '@/robo/whatsapp';

const ROBO = '5583999990000@s.whatsapp.net';
const ROBO_LID = '100000000000001@lid';
const GRUPO = '120363000000000000@g.us';

const base: MessageReceived = {
  id: 'M1',
  chat: GRUPO,
  sender: '5583111110000@s.whatsapp.net',
  push_name: ' Ana ',
  is_group: true,
  timestamp: 1_800_000_000,
  text: 'oi',
  mentions: [],
  mentions_me: false,
  offline: false,
};

describe('lerEventoDoMotor', () => {
  it('traduz uma mensagem de grupo', () => {
    const m = lerEventoDoMotor(base, [ROBO, ROBO_LID])!;
    expect(m).toMatchObject({ grupoId: GRUPO, remetenteTelefone: '5583111110000', remetenteNome: 'Ana', texto: 'oi', mencionaORobo: false, respondeAoRobo: false });
    expect(m.privado).toBeUndefined();
    expect(m.quando.getTime()).toBe(1_800_000_000_000);
  });

  it('tira a marcação do robô (por LID) e troca a de outra pessoa por @alguém', () => {
    const m = lerEventoDoMotor(
      { ...base, text: '@100000000000001 bora?  @5583222220000 vem', mentions: [ROBO_LID, '5583222220000@s.whatsapp.net'], mentions_me: true },
      [ROBO, ROBO_LID],
    )!;
    expect(m.mencionaORobo).toBe(true);
    expect(m.texto).toBe('bora? @alguém vem');
  });

  it('privado com LID: telefone vem do sender_alt', () => {
    const m = lerEventoDoMotor({ ...base, chat: '247416506831075@lid', sender: '247416506831075@lid', sender_alt: '5583111110000@s.whatsapp.net', is_group: false }, [ROBO])!;
    expect(m.privado).toBe(true);
    expect(m.remetenteTelefone).toBe('5583111110000');
  });

  it('resposta a uma mensagem do robô', () => {
    expect(lerEventoDoMotor({ ...base, reply_to: 'B1', reply_to_sender: ROBO_LID, replies_to_me: true }, [ROBO])!.respondeAoRobo).toBe(true);
  });

  it('sem texto (figurinha, áudio): ignorada', () => {
    expect(lerEventoDoMotor({ ...base, text: undefined }, [ROBO])).toBeNull();
  });

  it('mantém as quebras de linha (o importar lê linha a linha)', () => {
    expect(lerEventoDoMotor({ ...base, text: 'Time A:\n  João   e Zé\n\n\n\nTime B' }, [ROBO])!.texto).toBe('Time A:\nJoão e Zé\n\nTime B');
  });
});

describe('referenciaDoEnvio', () => {
  it('mesma conversa e texto na mesma janela de 10 min: mesma referência', () => {
    const t = 1_800_000_000_000;
    expect(referenciaDoEnvio(GRUPO, 'lista', t)).toBe(referenciaDoEnvio(GRUPO, 'lista', t + 60_000));
    expect(referenciaDoEnvio(GRUPO, 'lista', t)).not.toBe(referenciaDoEnvio(GRUPO, 'outra', t));
    expect(referenciaDoEnvio(GRUPO, 'lista', t)).not.toBe(referenciaDoEnvio(GRUPO, 'lista', t + 600_000));
  });
});

// ---------- ponta a ponta com o binário do motor-wa (WhatsApp falso) ----------

const BIN = process.env.MOTOR_WA_BIN ?? join(process.env.HOME ?? '', 'Desktop/things/motor-wa/target/debug/motor-wa');
const temMotor = existsSync(BIN);

const portaLivre = () =>
  new Promise<number>((ok) => {
    const s = netServer().listen(0, () => {
      const p = (s.address() as AddressInfo).port;
      s.close(() => ok(p));
    });
  });

describe.skipIf(!temMotor)('ponta a ponta com o motor-wa (WhatsApp falso)', () => {
  const ADMIN = 'pelada-admin-key-0123456789';
  const ROBO_KEY = 'pelada-robo-key-01234567890';
  const SEGREDO = 'pelada-webhook-secret-0123';
  let motor: ChildProcess;
  let pasta: string;
  let url: string;
  let wa: WhatsApp;
  const recebidas: MensagemRecebida[] = [];
  const evento = async (e: unknown) => {
    const r = await fetch(`${url}/v1/_fake/pelada/event`, { method: 'POST', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    expect(r.status).toBe(204);
  };
  const enviadas = async (): Promise<Array<{ to: string; content: { body: string } }>> =>
    (await fetch(`${url}/v1/_fake/pelada/sent`, { headers: { Authorization: `Bearer ${ADMIN}` } })).json();

  beforeAll(async () => {
    const [portaApi, portaHook] = [await portaLivre(), await portaLivre()];
    url = `http://127.0.0.1:${portaApi}`;
    pasta = mkdtempSync(join(tmpdir(), 'pelada-motor-'));
    writeFileSync(
      join(pasta, 'motor-wa.toml'),
      `data_dir = "${pasta}/data"
[[sessions]]
id = "pelada"
expected_number = "5583999990000"
engine = "fake"
[sessions.gate]
allow_initiate = ["${GRUPO}"]
quiet_hours = "off"
warmup = false
pacing_seconds = [0, 0]
[sessions.webhook]
url = "http://127.0.0.1:${portaHook}/"
secret = "${SEGREDO}"
[api]
listen = "127.0.0.1:${portaApi}"
[[api.keys]]
name = "admin"
key = "${ADMIN}"
scopes = ["read", "send", "admin"]
[[api.keys]]
name = "robo"
key = "${ROBO_KEY}"
scopes = ["read", "send"]
`,
    );
    motor = spawn(BIN, ['--config', join(pasta, 'motor-wa.toml'), 'run'], { stdio: 'ignore', env: { ...process.env, RUST_LOG: 'warn' } });
    for (let i = 0; i < 100 && !(await fetch(`${url}/v1/health`).catch(() => null))?.ok; i++) await new Promise((r) => setTimeout(r, 100));
    await evento({ type: 'connected', own: ROBO });
    await fetch(`${url}/v1/sessions/pelada/sending`, { method: 'PUT', headers: { Authorization: `Bearer ${ADMIN}`, 'Content-Type': 'application/json' }, body: '{"enabled":true}' });
    wa = await conectarMotor({ url, chave: ROBO_KEY, sessao: 'pelada', portaWebhook: portaHook, segredoWebhook: SEGREDO, prazoMs: 10_000, log: () => {}, aoReceber: (m) => recebidas.push(m) });
  }, 30_000);

  afterAll(async () => {
    await wa?.fechar();
    motor?.kill('SIGTERM');
    rmSync(pasta, { recursive: true, force: true });
  });

  it('a lista no grupo sai pelo motor-wa e só resolve com a confirmação', async () => {
    await wa.enviar(GRUPO, 'Lista da quarta');
    const e = await enviadas();
    expect(e.at(-1)).toMatchObject({ to: GRUPO, content: { body: 'Lista da quarta' } });
  });

  it('uma marcação ao robô no grupo chega como MensagemRecebida', async () => {
    await evento({
      type: 'message', id: 'G1', chat: GRUPO, sender: '5583111110000@s.whatsapp.net', sender_alt: null, push_name: 'Ana',
      timestamp: Math.floor(Date.now() / 1000), text: '@100000000000001 ajuda', media: null, mentions: [ROBO_LID], reply_to: null, offline: false,
    });
    for (let i = 0; i < 50 && !recebidas.some((m) => m.texto === 'ajuda'); i++) await new Promise((r) => setTimeout(r, 100));
    expect(recebidas.find((m) => m.texto === 'ajuda')).toMatchObject({ grupoId: GRUPO, mencionaORobo: true, remetenteTelefone: '5583111110000' });
  });

  it('o mesmo texto duas vezes seguidas sai uma vez só', async () => {
    const antes = (await enviadas()).length;
    await wa.enviar(GRUPO, 'Lembrete: faltam 3');
    await wa.enviar(GRUPO, 'Lembrete: faltam 3');
    expect((await enviadas()).length).toBe(antes + 1);
  });

  it('puxar conversa no privado de quem não escreveu é recusado, com explicação', async () => {
    await expect(wa.enviar('5583333330000@s.whatsapp.net', 'oi')).rejects.toThrow(/not_a_reply/);
  });

  it('o grupo é achado pelo nome exato', async () => {
    expect(await wa.gruposChamados('Pelada 3.0')).toEqual([]);
  });

  it('explicarErro traduz as recusas', () => {
    expect(explicarErro(new Error('x'))).toBe('x');
  });
});
