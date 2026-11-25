CREATE TABLE "robo_diario" (
	"id" serial PRIMARY KEY NOT NULL,
	"quando" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"dados" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "robo_recados" (
	"nome" text PRIMARY KEY NOT NULL,
	"dados" text NOT NULL,
	"quando" timestamp with time zone NOT NULL
);
