ALTER TABLE "partidas" ADD COLUMN "origem" text;--> statement-breakpoint
ALTER TABLE "partidas" ADD CONSTRAINT "partidas_origem_unique" UNIQUE("origem");