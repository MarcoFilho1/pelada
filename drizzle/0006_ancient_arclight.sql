CREATE TABLE "duplas_separadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"jogador_a_id" integer NOT NULL,
	"jogador_b_id" integer NOT NULL,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duplas_separadas" ADD CONSTRAINT "duplas_separadas_jogador_a_id_jogadores_id_fk" FOREIGN KEY ("jogador_a_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplas_separadas" ADD CONSTRAINT "duplas_separadas_jogador_b_id_jogadores_id_fk" FOREIGN KEY ("jogador_b_id") REFERENCES "public"."jogadores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duplas_separadas_par_uniq" ON "duplas_separadas" USING btree ("jogador_a_id","jogador_b_id");--> statement-breakpoint
-- A primeira dupla separada, pedida pelo usuário: Luiz e Jonas (só se os dois estiverem cadastrados).
INSERT INTO "duplas_separadas" ("jogador_a_id", "jogador_b_id")
SELECT LEAST(a."id", b."id"), GREATEST(a."id", b."id")
FROM "jogadores" a, "jogadores" b
WHERE lower(a."nome") = 'luiz' AND lower(b."nome") = 'jonas'
ON CONFLICT DO NOTHING;
