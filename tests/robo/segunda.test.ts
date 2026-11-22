import { afterEach, describe, expect, it } from 'vitest';
import { decidir } from '@/robo/agenda';
import { dentroDaJanela } from '@/robo/janela';
import { configurarSegunda, horaDaLista, horaDeMandarBomDia, horaDoBomDia, inicioDaSemana, lerFaixa, textoDoBomDia } from '@/robo/segunda';

const QUARTA = '2026-11-25';
const t = (iso: string) => new Date(iso);
const foto = { dataQuarta: QUARTA, estadoManual: null, jogadores: {} };
const vazio = { ultimo: null, aberturaEnviada: null, grupoId: 'g' };

afterEach(() => configurarSegunda({}));

describe('segunda do robô', () => {
  it('lê a faixa "HH:MM-HH:MM"', () => {
    expect(lerFaixa('11:00-12:00')).toEqual([660, 720]);
    expect(lerFaixa(' 9:00 - 10:00 ')).toEqual([540, 600]);
    expect(lerFaixa('12:00-11:00')).toBeNull();
    expect(lerFaixa('')).toBeNull();
    expect(lerFaixa(undefined)).toBeNull();
  });

  it('sem configuração: lista segunda 14:00, sem bom dia (como sempre)', () => {
    expect(horaDaLista(QUARTA).toISOString()).toBe('2026-11-23T17:00:00.000Z');
    expect(horaDoBomDia(QUARTA)).toBeNull();
    expect(decidir(t('2026-11-23T13:59:00-03:00'), foto, vazio)).toBeNull();
    expect(decidir(t('2026-11-23T14:00:00-03:00'), foto, vazio)).toBe('abertura');
  });

  it('configurado: bom dia entre 9 e 10, lista entre 11 e 12, sempre o mesmo minuto na mesma semana', () => {
    configurarSegunda({ ROBO_LISTA_HORARIO: '11:00-12:00', ROBO_BOM_DIA_HORARIO: '09:00-10:00' });
    const lista = horaDaLista(QUARTA);
    const bomDia = horaDoBomDia(QUARTA)!;
    expect(lista >= t('2026-11-23T11:00:00-03:00') && lista <= t('2026-11-23T12:00:00-03:00')).toBe(true);
    expect(bomDia >= t('2026-11-23T09:00:00-03:00') && bomDia <= t('2026-11-23T10:00:00-03:00')).toBe(true);
    expect(horaDaLista(QUARTA).getTime()).toBe(lista.getTime());
    expect(inicioDaSemana(QUARTA).getTime()).toBe(bomDia.getTime());
    // A janela do robô abre no bom dia; a lista sai na hora dela.
    expect(dentroDaJanela(new Date(bomDia.getTime() - 60_000))).toBe(false);
    expect(dentroDaJanela(bomDia)).toBe(true);
    expect(decidir(new Date(lista.getTime() - 60_000), foto, vazio)).toBeNull();
    expect(decidir(lista, foto, vazio)).toBe('abertura');
  });

  it('bom dia: uma vez por semana, antes da lista', () => {
    configurarSegunda({ ROBO_LISTA_HORARIO: '11:00-12:00', ROBO_BOM_DIA_HORARIO: '09:00-10:00' });
    const bomDia = horaDoBomDia(QUARTA)!;
    expect(horaDeMandarBomDia(new Date(bomDia.getTime() - 1000), QUARTA, null)).toBe(false);
    expect(horaDeMandarBomDia(bomDia, QUARTA, null)).toBe(true);
    expect(horaDeMandarBomDia(bomDia, QUARTA, QUARTA)).toBe(false);
    expect(horaDeMandarBomDia(horaDaLista(QUARTA), QUARTA, null)).toBe(false);
  });

  it('texto do bom dia: mensagens curtas, avisa da lista, sem ponto final', () => {
    const txt = textoDoBomDia(QUARTA);
    const partes = txt.split('\n\n');
    expect(partes.length).toBe(3);
    expect(txt.toLowerCase()).toContain('lista');
    expect(partes.every((p) => !p.endsWith('.'))).toBe(true);
  });
});
