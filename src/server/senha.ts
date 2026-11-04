import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const TAM_SALT = 16;
const TAM_HASH = 32;

function derivar(segredo: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(segredo, salt, TAM_HASH, (err, chave) => (err ? reject(err) : resolve(chave))),
  );
}

/** Hash de PIN ou senha: scrypt com salt aleatório, no formato `salt:hash` em hex. */
export async function hashSegredo(segredo: string): Promise<string> {
  const salt = randomBytes(TAM_SALT);
  const hash = await derivar(segredo, salt);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Confere o segredo contra um hash de `hashSegredo`. Hash malformado dá `false`. */
export async function conferirSegredo(segredo: string, hashGuardado: string): Promise<boolean> {
  const [saltHex, hashHex, ...resto] = hashGuardado.split(':');
  const hexValido = /^(?:[0-9a-f]{2})+$/;
  if (resto.length > 0 || !hexValido.test(saltHex ?? '') || !hexValido.test(hashHex ?? '')) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  if (esperado.length !== TAM_HASH) return false;
  const obtido = await derivar(segredo, Buffer.from(saltHex, 'hex'));
  return timingSafeEqual(obtido, esperado);
}
