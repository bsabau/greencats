CREATE TYPE "public"."adoption_stage" AS ENUM('paperwork', 'to_verify', 'external', 'done');--> statement-breakpoint
CREATE TYPE "public"."animal_status" AS ENUM('casuta', 'ana_adi', 'clinic', 'foster', 'foster_adoption', 'adoption_incomplete', 'adopted', 'deceased', 'external', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('medical', 'foster_logistics', 'adoption', 'shift', 'other');--> statement-breakpoint
CREATE TYPE "public"."foster_rating" AS ENUM('ok', 'conditional', 'not_ok', 'unrated');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('ro', 'en');--> statement-breakpoint
CREATE TYPE "public"."medical_kind" AS ENUM('vaccine_polyvalent', 'vaccine_rabies', 'deworm_external', 'deworm_internal', 'test_fiv_felv', 'test_corona', 'test_giardia', 'test_mange', 'sterilization', 'treatment', 'visit', 'weight', 'note');--> statement-breakpoint
CREATE TYPE "public"."placement_kind" AS ENUM('foster', 'foster_adoption', 'adoption_incomplete', 'adoption');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('day', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'coordinator', 'volunteer');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('f', 'm', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."species" AS ENUM('cat', 'dog');--> statement-breakpoint
CREATE TYPE "public"."sterilized" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."test_result" AS ENUM('positive', 'negative');--> statement-breakpoint
CREATE TABLE "adoption_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid,
	"animal_name" text NOT NULL,
	"person_id" uuid,
	"adopter_name" text,
	"stage" "adoption_stage" DEFAULT 'paperwork' NOT NULL,
	"health_book" text,
	"contract_no" text,
	"vaccine" text,
	"microchip" text,
	"passport" text,
	"notes" text,
	"status_note" text,
	"next_step_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "animals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"species" "species" DEFAULT 'cat' NOT NULL,
	"status" "animal_status" DEFAULT 'unknown' NOT NULL,
	"sex" "sex" DEFAULT 'unknown' NOT NULL,
	"color" text,
	"birth_date" date,
	"birth_precision" date_precision,
	"birth_text" text,
	"intake_date" date,
	"intake_precision" date_precision,
	"intake_text" text,
	"death_date" date,
	"death_note" text,
	"sterilized" "sterilized" DEFAULT 'unknown' NOT NULL,
	"sterilized_text" text,
	"contract_text" text,
	"health_book_no" text,
	"microchip" text,
	"passport" text,
	"current_treatment" text,
	"intake_history" text,
	"medical_summary" text,
	"other_info" text,
	"refill_notes" text,
	"location_note" text,
	"profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "event_type" DEFAULT 'other' NOT NULL,
	"title" text NOT NULL,
	"start_on" date NOT NULL,
	"end_on" date,
	"start_time" text,
	"end_time" text,
	"notes" text,
	"capacity" integer,
	"animal_id" uuid,
	"person_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet" text NOT NULL,
	"row" integer,
	"field" text,
	"raw_value" text,
	"message" text NOT NULL,
	"animal_id" uuid,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"kind" "medical_kind" NOT NULL,
	"date" date,
	"precision" date_precision,
	"description" text,
	"result" "test_result",
	"next_due_on" date,
	"raw_text" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phones" text[] DEFAULT '{}'::text[] NOT NULL,
	"email" text,
	"address" text,
	"notes" text,
	"foster_rating" "foster_rating" DEFAULT 'unrated' NOT NULL,
	"external_case" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"import_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"animal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "placement_kind" NOT NULL,
	"start_date" date,
	"start_text" text,
	"end_date" date,
	"notes" text,
	"open" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_signups" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_signups_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" DEFAULT 'volunteer' NOT NULL,
	"owns_adoptions" boolean DEFAULT false NOT NULL,
	"owns_visibility" boolean DEFAULT false NOT NULL,
	"locale" "locale" DEFAULT 'ro' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "visibility_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_name" text,
	"animal_name" text NOT NULL,
	"photos_ref" text,
	"contract_received" text,
	"ready_for_site" text,
	"on_site" text,
	"interested_person" text,
	"details" text,
	"info_sheet" text,
	"description" text,
	"extra" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adoption_cases" ADD CONSTRAINT "adoption_cases_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adoption_cases" ADD CONSTRAINT "adoption_cases_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_signups" ADD CONSTRAINT "shift_signups_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_status_idx" ON "animals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "animals_name_idx" ON "animals" USING btree ("name");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "calendar_events" USING btree ("start_on");--> statement-breakpoint
CREATE INDEX "medical_animal_kind_idx" ON "medical_records" USING btree ("animal_id","kind");--> statement-breakpoint
CREATE INDEX "medical_due_idx" ON "medical_records" USING btree ("next_due_on");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");--> statement-breakpoint
CREATE INDEX "placements_animal_idx" ON "placements" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "placements_person_idx" ON "placements" USING btree ("person_id");