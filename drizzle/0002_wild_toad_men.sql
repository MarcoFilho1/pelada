ALTER TABLE "admins" ADD COLUMN "erros" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "bloqueado_ate" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admins" ADD COLUMN "sessao_versao" integer DEFAULT 0 NOT NULL;