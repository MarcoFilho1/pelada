ALTER TABLE "jogadores" ADD COLUMN "agarra" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lances" ADD COLUMN "tempo_ms" integer;--> statement-breakpoint
ALTER TABLE "partida_jogadores" ADD COLUMN "goleiro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "pausado_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "pausada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "partidas" ADD COLUMN "desempate" "lado_partida";--> statement-breakpoint
-- Quem costuma agarrar, pedido pelo usuário (só marca quem já estiver cadastrado com esse nome).
UPDATE "jogadores" SET "agarra" = true WHERE lower("nome") IN ('marquinho', 'rayanderson', 'manoel', 'israel', 'pepe', 'silvio');
