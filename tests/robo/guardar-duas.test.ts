import { describe, expect, it } from 'vitest';
import { oQueApagar, semSufixo } from '../../scripts/android/guardar-duas.mjs';

const arq = (pathname: string, quando: string) => ({ pathname, url: `https://loja/${pathname}`, uploadedAt: quando });

describe('o que sai do armazenamento depois de publicar', () => {
  const app10 = arq('app/pelada-0.10.1-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA.apk', '2026-11-25T13:00:00Z');
  const app11 = arq('app/pelada-0.11.1-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.apk', '2026-11-25T15:00:00Z');
  const app12 = arq('app/pelada-0.12.0-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC.apk', '2026-11-25T16:00:00Z');
  const roboVelho = arq('robo/robo-2026.11.25-2acd268-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD.mjs', '2026-11-25T12:00:00Z');
  const roboAnterior = arq('robo/robo-2026.11.25-2acd268-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEE.mjs', '2026-11-25T12:30:00Z');
  const roboRepetido = arq('robo/robo-2026.11.25-d1dfe0e-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFF.mjs', '2026-11-25T15:00:00Z');
  const roboNoAr = arq('robo/robo-2026.11.25-d1dfe0e-GGGGGGGGGGGGGGGGGGGGGGGGGGGGGG.mjs', '2026-11-25T16:00:00Z');
  const tudo = [app10, app11, app12, roboVelho, roboAnterior, roboRepetido, roboNoAr];

  it('tira o sufixo sorteado do nome', () => {
    expect(semSufixo(app12.pathname)).toBe('app/pelada-0.12.0.apk');
    expect(semSufixo(roboNoAr.pathname)).toBe('robo/robo-2026.11.25-d1dfe0e.mjs');
  });

  it('fica a versão no ar e a anterior; o resto sai', () => {
    const apagar = oQueApagar(tudo, [app12.url, roboNoAr.url]);
    expect(apagar).toEqual([app10, roboVelho, roboRepetido]);
  });

  it('a reserva é a versão anterior, não outro envio da mesma versão', () => {
    const apagar = oQueApagar(tudo, [app12.url, roboNoAr.url]);
    expect(apagar).not.toContain(roboAnterior);
    expect(apagar).toContain(roboRepetido);
  });

  it('pasta sem nada no ar fica como está', () => {
    expect(oQueApagar(tudo, [roboNoAr.url])).toEqual([roboVelho, roboRepetido]);
    expect(oQueApagar(tudo, [])).toEqual([]);
  });

  it('não mexe em arquivo de outra pasta', () => {
    const outro = arq('fotos/a.png', '2026-11-01T00:00:00Z');
    expect(oQueApagar([...tudo, outro], [app12.url, roboNoAr.url])).not.toContain(outro);
  });
});
