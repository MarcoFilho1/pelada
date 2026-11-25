import { describe, expect, it } from 'vitest';
import {
  ESPERA_AVISO_DONO_MS,
  casarDiarista,
  cobrancaAtiva,
  horaDeAvisarDono,
  novaCobranca,
  prazoDaCobranca,
  proximaManha,
  registrarPagamento,
  textoDoLembrete,
  textoParaODono,
} from '@/robo/cobranca';

const DIARISTAS = [
  { jogadorId: 1, nome: 'Caio' },
  { jogadorId: 2, nome: 'João Pedro' },
  { jogadorId: 3, nome: 'João Victor' },
  { jogadorId: 4, nome: 'Renan' },
];
const c0 = () => novaCobranca('2026-11-25', DIARISTAS);
const t = (iso: string) => new Date(iso);

describe('cobrança do Pix', () => {
  it('lembrete com nomes, valor e chave', () => {
    expect(textoDoLembrete(DIARISTAS.slice(0, 2), { valor: '15,00', chave: 'pix@exemplo.com' })).toBe(
      '💸 Diaristas de hoje: Caio e João Pedro\nPix de R$ 15,00 pra chave pix@exemplo.com\nDepois manda o comprovante aqui no grupo',
    );
    expect(textoDoLembrete(DIARISTAS.slice(0, 1), { valor: '15,00', chave: 'pix@exemplo.com' }, true)).toContain('Diaristas de ontem: ');
  });

  it('comprovante vale até as 23:00 do dia seguinte', () => {
    expect(prazoDaCobranca('2026-11-25').toISOString()).toBe('2026-11-27T02:00:00.000Z');
    expect(cobrancaAtiva(c0(), t('2026-11-26T22:59:00-03:00'))).toBe(true);
    expect(cobrancaAtiva(c0(), t('2026-11-26T23:00:00-03:00'))).toBe(false);
    expect(cobrancaAtiva(null, t('2026-11-26T12:00:00-03:00'))).toBe(false);
  });

  it('casa o diarista: nome inteiro no comprovante, ou primeiro nome único', () => {
    const c = c0();
    expect(casarDiarista(c, [null, 'JOAO PEDRO DA SILVA'])?.jogadorId).toBe(2);
    expect(casarDiarista(c, ['Caio Lima'])?.jogadorId).toBe(1);
    expect(casarDiarista(c, ['renan 🔥'])?.jogadorId).toBe(4);
    // "João" sozinho: dois diaristas, ninguém (melhor perguntar ao dono).
    expect(casarDiarista(c, ['João'])).toBeNull();
    // O primeiro candidato não casa; o segundo (pagador no comprovante) sim.
    expect(casarDiarista(c, ['Jão', 'João Victor Alves'])?.jogadorId).toBe(3);
    expect(casarDiarista(c, ['Fulano'])).toBeNull();
  });

  it('pagamentos agrupam o aviso ao dono: o primeiro espera os próximos', () => {
    const now = t('2026-11-25T22:50:00-03:00');
    let c = registrarPagamento(c0(), { jogadorId: 1, nome: 'Caio', quando: now.toISOString(), mensagemId: 'A' }, now);
    expect(c.avisarDonoEm).toBe(new Date(now.getTime() + ESPERA_AVISO_DONO_MS).toISOString());
    const depois = new Date(now.getTime() + 60_000);
    c = registrarPagamento(c, { jogadorId: 2, nome: 'João Pedro', quando: depois.toISOString(), mensagemId: 'B' }, depois);
    expect(c.avisarDonoEm).toBe(new Date(now.getTime() + ESPERA_AVISO_DONO_MS).toISOString());
    expect(horaDeAvisarDono(c, depois)).toBe(false);
    expect(horaDeAvisarDono(c, new Date(now.getTime() + ESPERA_AVISO_DONO_MS))).toBe(true);
    c = registrarPagamento(c, { jogadorId: null, nome: 'Zé do Zap', quando: depois.toISOString(), mensagemId: 'C', pagador: 'JOSE SANTOS' }, depois);
    expect(textoParaODono(c)).toBe(
      '💰 Pix da pelada de 25/11\n✅ Pagaram (2): Caio e João Pedro\n⏳ Faltam (2): João Victor e Renan\n❓ Comprovante que não sei de quem é: Zé do Zap (no comprovante: JOSE SANTOS)',
    );
  });

  it('todo mundo pagou', () => {
    let c = novaCobranca('2026-11-25', DIARISTAS.slice(0, 1));
    c = registrarPagamento(c, { jogadorId: 1, nome: 'Caio', quando: '', mensagemId: 'A' }, t('2026-11-25T23:00:00Z'));
    expect(textoParaODono(c)).toContain('⏳ Faltam (0): ninguém, todo mundo pagou');
  });

  it('de madrugada, o aviso fica para as 07:05', () => {
    expect(proximaManha(t('2026-11-25T22:50:00-03:00')).toISOString()).toBe('2026-11-26T10:05:00.000Z');
    expect(proximaManha(t('2026-11-26T03:00:00-03:00')).toISOString()).toBe('2026-11-26T10:05:00.000Z');
  });
});
