CREATE TABLE "time_completes" (
	"id" serial PRIMARY KEY NOT NULL,
	"time_id" integer NOT NULL,
	"nota" numeric(2, 1) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "times" ADD COLUMN "arquivado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "time_completes" ADD CONSTRAINT "time_completes_time_id_times_id_fk" FOREIGN KEY ("time_id") REFERENCES "public"."times"("id") ON DELETE no action ON UPDATE no action;