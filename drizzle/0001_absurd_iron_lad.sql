ALTER TABLE "people" ADD COLUMN "consent_note" text;--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL;