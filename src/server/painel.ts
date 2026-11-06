import { desc, lte } from 'drizzle-orm';
import type { DB } from '@/db/client';
import { peladas } from '@/db/schema';
import { calcularLista } from '@/domain/lista';
import { aberturaLista, dataDe, MAX_MENSALISTAS, mesDaQuarta, proximaQuarta } from '@/domain/tempo';
import { listarJogadores } from './jogadores';
import { previaMensalistasDoMes } from './mensalistas';
import { partidaEmAndamento } from './partidas';
import { peladaExistenteDaSemana } from './pelada';
import { estadoDaPelada } from './presencas';
import { partidasJogadas, timesDaPelada } from './times';

export type EstadoDaLista = 'antes' | 'aberta' | 'fechada' | 'cancelada';

export type ResumoPainel = {
  lista: { data: string; abertura: string; estado: EstadoDaLista; confirmados: number; vagas: number; naFila: number };
  /** `null` = ainda não teve pelada nenhuma até hoje. `cancelada` vale também para as partidas (é a mesma pelada). */
  sorteio: { data: string; hoje: boolean; definidos: boolean; cancelada: boolean } | null;
  /** `null` = ainda não teve pelada nenhuma até hoje. */
  partidas: { jogadas: number; emAndamentoId: number | null } | null;
  jogadores: { ativos: number; pinPadrao: number };
  mensalistas: { mes: string; marcados: number; vagas: number };
};

/**
 * O resumo da semana para o painel do admin. Só lê: não cria a pelada da semana nem copia os
 * mensalistas do mês anterior (o painel abre a toda hora; criar antes de segunda 00:00 congelaria
 * os mensalistas). Sem a pelada criada, mostra o que as outras telas mostrariam ao criá-la:
 * lista vazia (os mensalistas entram pendentes, nenhum confirmado) e, na quarta, sorteio e
 * partidas do dia ainda sem nada.
 */
export async function resumoDoPainel(db: DB, now: Date): Promise<ResumoPainel> {
  const data = proximaQuarta(now);
  const mes = mesDaQuarta(data);
  const hoje = dataDe(now);

  const [daSemana, [ultima], ativos, previa] = await Promise.all([
    peladaExistenteDaSemana(db, now),
    db.select({ id: peladas.id, data: peladas.data, estadoManual: peladas.estadoManual }).from(peladas).where(lte(peladas.data, hoje)).orderBy(desc(peladas.data)).limit(1),
    listarJogadores(db, { incluirInativos: false }),
    previaMensalistasDoMes(db, mes),
  ]);

  const lista = daSemana
    ? await estadoDaPelada(db, daSemana.id, now)
    : calcularLista({ presencas: [], dataQuarta: data, estadoManual: null, now });
  const estadoManual = daSemana?.estadoManual ?? null;
  const estado: EstadoDaLista = lista.cancelada
    ? 'cancelada'
    : lista.aberta
      ? 'aberta'
      : estadoManual === null && now < aberturaLista(data)
        ? 'antes'
        : 'fechada';

  // A pelada da noite, como em `peladaDoDia`, mas sem criar: na quarta, sem a de hoje no banco,
  // vale a de hoje vazia (é o que o sorteio e as partidas vão mostrar ao abrir).
  const doDia = ultima?.data !== hoje && data === hoje ? { id: null, data: hoje, estadoManual: null } : (ultima ?? null);
  const [times, jogadas, emAndamentoId] =
    doDia?.id != null
      ? await Promise.all([timesDaPelada(db, doDia.id), partidasJogadas(db, doDia.id), partidaEmAndamento(db, doDia.id)])
      : [[], { jogadas: 0 }, null];

  return {
    lista: {
      data,
      abertura: dataDe(aberturaLista(data)),
      estado,
      confirmados: lista.principal.filter((i) => i.confirmado).length,
      vagas: lista.vagas,
      naFila: lista.fila.length,
    },
    sorteio: doDia && {
      data: doDia.data,
      hoje: doDia.data === hoje,
      definidos: times.length > 0,
      cancelada: doDia.estadoManual === 'cancelada',
    },
    partidas: doDia && { jogadas: jogadas.jogadas, emAndamentoId },
    jogadores: { ativos: ativos.length, pinPadrao: ativos.filter((j) => j.pinPadrao).length },
    mensalistas: { mes, marcados: previa.ids.length, vagas: MAX_MENSALISTAS },
  };
}
