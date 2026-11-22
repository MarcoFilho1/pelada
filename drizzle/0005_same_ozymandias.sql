CREATE TABLE "links_anotador" (
	"id" serial PRIMARY KEY NOT NULL,
	"pelada_id" integer NOT NULL,
	"chave_hash" text NOT NULL,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"revogado_em" timestamp with time zone,
	CONSTRAINT "links_anotador_chave_hash_unique" UNIQUE("chave_hash")
);
--> statement-breakpoint
ALTER TABLE "links_anotador" ADD CONSTRAINT "links_anotador_pelada_id_peladas_id_fk" FOREIGN KEY ("pelada_id") REFERENCES "public"."peladas"("id") ON DELETE cascade ON UPDATE no action;