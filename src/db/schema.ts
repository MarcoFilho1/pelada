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
    // Costuma agarrar: aparece primeiro na escolha de goleiro da partida.
    agarra: boolean('agarra').notNull().default(false),
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
  // Mesma regra do PIN do jogador: 5 erros seguidos bloqueiam por 15 min.
  erros: integer('erros').notNull().default(0),
  bloqueadoAte: timestamptz('bloqueado_ate'),
  // Sobe para derrubar as sessões do admin (troca de senha).
  sessaoVersao: integer('sessao_versao').notNull().default(0),
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
  // Preenchido quando um sorteio novo substitui o time depois de haver partidas (o time antigo fica para o histórico).
  arquivadoEm: timestamptz('arquivado_em'),
});

export const timeCompletes = pgTable('time_completes', {
  id: serial('id').primaryKey(),
  timeId: integer('time_id')
    .notNull()
    .references(() => times.id),
  nota: numeric('nota', { precision: 2, scale: 1 }).notNull(),
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

export const partidas = pgTable(
  'partidas',
  {
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
    // Pausa do cronômetro: o tempo parado já somado e, se está pausada agora, desde quando.
    pausadoMs: integer('pausado_ms').notNull().default(0),
    pausadaEm: timestamptz('pausada_em'),
    // Empate: o lado que ganhou na moeda e volta primeiro para a fila (null: moeda ainda não jogada).
    desempate: ladoEnum('desempate'),
  },
  // Uma partida aberta por pelada, garantido pelo banco (o código também confere, travando a pelada).
  (t) => [uniqueIndex('partidas_uma_aberta_por_pelada').on(t.peladaId).where(sql`${t.encerradaEm} is null`)],
);

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
    // Task 18: jogador que entrou para completar o time de outro lado nesta partida.
    completando: boolean('completando').notNull().default(false),
    // Goleiro do lado nesta partida: alguém de fora dos dois times. Conta gols e assistências, não conta jogo.
    goleiro: boolean('goleiro').notNull().default(false),
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
  // Tempo de jogo (sem as pausas) na hora do lance. Null: lance de antes da pausa existir ou posto em Corrigir.
  tempoMs: integer('tempo_ms'),
});

// Link temporário de anotar (o robô gera): abre só as telas de partida da pelada, sem login de admin.
// Guarda só o hash da chave; um link novo da mesma pelada revoga os anteriores.
export const linksAnotador = pgTable('links_anotador', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .notNull()
    .references(() => peladas.id, { onDelete: 'cascade' }),
  chaveHash: text('chave_hash').notNull().unique(),
  criadoPor: text('criado_por').notNull(),
  criadoEm: timestamptz('criado_em').notNull().defaultNow(),
  expiraEm: timestamptz('expira_em').notNull(),
  revogadoEm: timestamptz('revogado_em'),
});

// Duplas que o sorteio nunca põe no mesmo time (ex.: Luiz e Jonas). Só os organizadores veem e mexem.
// A dupla é guardada com o menor id em `jogador_a_id`, então "A e B" e "B e A" são a mesma linha.
export const duplasSeparadas = pgTable(
  'duplas_separadas',
  {
    id: serial('id').primaryKey(),
    jogadorAId: integer('jogador_a_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    jogadorBId: integer('jogador_b_id')
      .notNull()
      .references(() => jogadores.id, { onDelete: 'cascade' }),
    criadaEm: timestamptz('criada_em').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('duplas_separadas_par_uniq').on(t.jogadorAId, t.jogadorBId)],
);

// Sinal de vida do robô que roda num celular (docs/android.md): o app manda de minuto em minuto
// como ele está. Uma linha por aparelho; cada sinal novo substitui o anterior.
export const roboSinais = pgTable('robo_sinais', {
  aparelho: text('aparelho').primaryKey(),
  vistoEm: timestamptz('visto_em').notNull(),
  /** O que o app contou (JSON já conferido e limitado por `limparSinal`). */
  dados: text('dados').notNull(),
});

// O manifesto das atualizações do robô do celular (docs/android.md): o arquivo pequeno que o app
// consulta para saber se há versão nova. Uma linha só ("atual"); publicar substitui.
export const roboManifesto = pgTable('robo_manifesto', {
  id: text('id').primaryKey(),
  conteudo: text('conteudo').notNull(),
  atualizadoEm: timestamptz('atualizado_em').notNull(),
});
