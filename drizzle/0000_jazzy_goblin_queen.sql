CREATE TYPE "public"."cor_time" AS ENUM('azul', 'laranja', 'verde', 'preto');--> statement-breakpoint
CREATE TYPE "public"."estado_manual" AS ENUM('aberta', 'fechada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."lado_partida" AS ENUM('A', 'B');--> statement-breakpoint
CREATE TYPE "public"."resultado_partida" AS ENUM('A', 'B', 'empate');--> statement-breakpoint
CREATE TYPE "public"."status_presenca" AS ENUM('pendente', 'confirmado', 'removido');--> statement-breakpoint
CREATE TYPE "public"."tipo_lance" AS ENUM('gol', 'assistencia');--> statement-breakpoint
CREATE TYPE "public"."tipo_presenca" AS ENUM('M', 'D');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"senha_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
CREATE TABLE "jogadores" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"nota" numeric(2, 1) DEFAULT '3.0' NOT NULL,
	"pin_hash" text,
	"pin_precisa_trocar" boolean DEFAULT true NOT NULL,
	"pin_erros" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lances" (
	"id" serial PRIMARY KEY NOT NULL,
	"partida_id" integer NOT NULL,
	"jogador_id" integer NOT NULL,
	"tipo" "tipo_lance" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensalistas_mes" (
	"mes" text NOT NULL,
	"jogador_id" integer NOT NULL,
	CONSTRAINT "mensalistas_mes_mes_jogador_id_pk" PRIMARY KEY("mes","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "partida_jogadores" (
	"partida_id" integer NOT NULL,
	"jogador_id" integer NOT NULL,
	"lado" "lado_partida" NOT NULL,
	CONSTRAINT "partida_jogadores_partida_id_jogador_id_pk" PRIMARY KEY("partida_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "partidas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pelada_id" integer NOT NULL,
	"time_a_id" integer NOT NULL,
	"time_b_id" integer NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone,
	"resultado" "resultado_partida"
);
--> statement-breakpoint
CREATE TABLE "peladas" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"estado_manual" "estado_manual",
	CONSTRAINT "peladas_data_unique" UNIQUE("data")
);
--> statement-breakpoint
CREATE TABLE "presencas" (
	"id" serial PRIMARY KEY NOT NULL,
	"pelada_id" integer NOT NULL,
	"jogador_id" integer NOT NULL,
	"tipo" "tipo_presenca" NOT NULL,
	"status" "status_presenca" NOT NULL,
	"entrou_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_jogadores" (
	"time_id" integer NOT NULL,
	"jogador_id" integer NOT NULL,
	CONSTRAINT "time_jogadores_time_id_jogador_id_pk" PRIMARY KEY("time_id","jogador_id")
);
--> statement-breakpoint
CREATE TABLE "times" (
	"id" serial PRIMARY KEY NOT NULL,
	"pelada_id" integer NOT NULL,
	"cor" "cor_time" NOT NULL,
	"ordem" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lances" ADD CONSTRAINT "lances_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lances" ADD CONSTRAINT "lances_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensalistas_mes" ADD CONSTRAINT "mensalistas_mes_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD CONSTRAINT "partida_jogadores_partida_id_partidas_id_fk" FOREIGN KEY ("partida_id") REFERENCES "public"."partidas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD CONSTRAINT "partida_jogadores_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_pelada_id_peladas_id_fk" FOREIGN KEY ("pelada_id") REFERENCES "public"."peladas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_time_a_id_times_id_fk" FOREIGN KEY ("time_a_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_time_b_id_times_id_fk" FOREIGN KEY ("time_b_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_pelada_id_peladas_id_fk" FOREIGN KEY ("pelada_id") REFERENCES "public"."peladas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presencas" ADD CONSTRAINT "presencas_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_jogadores" ADD CONSTRAINT "time_jogadores_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_jogadores" ADD CONSTRAINT "time_jogadores_jogador_id_jogadores_id_fk" FOREIGN KEY ("jogador_id") REFERENCES "public"."jogadores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "times" ADD CONSTRAINT "times_pelada_id_peladas_id_fk" FOREIGN KEY ("pelada_id") REFERENCES "public"."peladas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jogadores_nome_lower_uniq" ON "jogadores" USING btree (lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "presencas_pelada_jogador_uniq" ON "presencas" USING btree ("pelada_id","jogador_id");