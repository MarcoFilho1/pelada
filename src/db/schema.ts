import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const estadoManualEnum = pgEnum('estado_manual', ['aberta', 'fechada', 'cancelada']);
export const tipoPresencaEnum = pgEnum('tipo_presenca', ['M', 'D']);
export const statusPresencaEnum = pgEnum('status_presenca', ['pendente', 'confirmado', 'removido']);
export const corTimeEnum = pgEnum('cor_time', ['azul', 'laranja', 'verde', 'preto']);
export const resultadoEnum = pgEnum('resultado_partida', ['A', 'B', 'empate']);
export const ladoEnum = pgEnum('lado_partida', ['A', 'B']);
export const tipoLanceEnum = pgEnum('tipo_lance', ['gol', 'assistencia']);

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const jogadores = pgTable(
  'jogadores',
  {
    id: serial('id').primaryKey(),
    nome: text('nome').notNull(),
    nota: numeric('nota', { precision: 2, scale: 1 }).notNull().default('3.0'),
    pinHash: text('pin_hash'),
    pinPrecisaTrocar: boolean('pin_precisa_trocar').notNull().default(true),
    pinErros: integer('pin_erros').notNull().default(0),
    bloqueadoAte: timestamptz('bloqueado_ate'),
    ativo: boolean('ativo').notNull().default(true),
    // Sobe para derrubar todas as sessões do jogador (zerar PIN, desativar).
    sessaoVersao: integer('sessao_versao').notNull().default(0),
    criadoEm: timestamptz('criado_em').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('jogadores_nome_lower_uniq').on(sql`lower(${t.nome})`)],
);

export const admins = pgTable('admins', {
  id: serial('id').primaryKey(),
  usuario: text('usuario').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  criadoEm: timestamptz('criado_em').notNull().defaultNow(),
});

export const mensalistasMes = pgTable(
  'mensalistas_mes',
  {
    mes: text('mes').notNull(), // 'YYYY-MM'
    jogadorId: integer('jogador_id')
      .notNull()
      .references(() => jogadores.id),
  },
  (t) => [primaryKey({ columns: [t.mes, t.jogadorId] })],
);

export const peladas = pgTable('peladas', {
  id: serial('id').primaryKey(),
  data: date('data', { mode: 'string' }).notNull().unique(), // a quarta
  estadoManual: estadoManualEnum('estado_manual'),
});

export const presencas = pgTable(
  'presencas',
  {
    id: serial('id').primaryKey(),
    peladaId: integer('pelada_id')
      .notNull()
      .references(() => peladas.id),
    jogadorId: integer('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    tipo: tipoPresencaEnum('tipo').notNull(),
    status: statusPresencaEnum('status').notNull(),
    entrouEm: timestamptz('entrou_em').notNull().defaultNow(),
    atualizadoEm: timestamptz('atualizado_em').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('presencas_pelada_jogador_uniq').on(t.peladaId, t.jogadorId)],
);

export const times = pgTable('times', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .notNull()
    .references(() => peladas.id),
  cor: corTimeEnum('cor').notNull(),
  ordem: integer('ordem').notNull(),
});

export const timeJogadores = pgTable(
  'time_jogadores',
  {
    timeId: integer('time_id')
      .notNull()
      .references(() => times.id),
    jogadorId: integer('jogador_id')
      .notNull()
      .references(() => jogadores.id),
  },
  (t) => [primaryKey({ columns: [t.timeId, t.jogadorId] })],
);

export const partidas = pgTable('partidas', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .notNull()
    .references(() => peladas.id),
  timeAId: integer('time_a_id')
    .notNull()
    .references(() => times.id),
  timeBId: integer('time_b_id')
    .notNull()
    .references(() => times.id),
  iniciadaEm: timestamptz('iniciada_em').notNull().defaultNow(),
  encerradaEm: timestamptz('encerrada_em'),
  resultado: resultadoEnum('resultado'),
});

export const partidaJogadores = pgTable(
  'partida_jogadores',
  {
    partidaId: integer('partida_id')
      .notNull()
      .references(() => partidas.id),
    jogadorId: integer('jogador_id')
      .notNull()
      .references(() => jogadores.id),
    lado: ladoEnum('lado').notNull(),
  },
  (t) => [primaryKey({ columns: [t.partidaId, t.jogadorId] })],
);

export const lances = pgTable('lances', {
  id: serial('id').primaryKey(),
  partidaId: integer('partida_id')
    .notNull()
    .references(() => partidas.id),
  jogadorId: integer('jogador_id')
    .notNull()
    .references(() => jogadores.id),
  tipo: tipoLanceEnum('tipo').notNull(),
  criadoEm: timestamptz('criado_em').notNull().defaultNow(),
});
