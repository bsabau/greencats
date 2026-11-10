CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "locations_name_idx" ON "locations" USING btree (lower("name"));--> statement-breakpoint
-- The two places that used to be statuses. Same names as SEED_LOCATIONS in src/lib/catalog-seed.ts.
INSERT INTO "locations" ("name") VALUES ('Căsuță'), ('Ana & Adi');--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "location_id" uuid;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" SET DEFAULT 'unknown'::text;--> statement-breakpoint
-- While the column is text: cats at the casuta or with Ana & Adi become "in_shelter" at that location.
UPDATE "animals" SET "status" = 'in_shelter', "location_id" = (SELECT "id" FROM "locations" WHERE "name" = 'Căsuță') WHERE "status" = 'casuta';--> statement-breakpoint
UPDATE "animals" SET "status" = 'in_shelter', "location_id" = (SELECT "id" FROM "locations" WHERE "name" = 'Ana & Adi') WHERE "status" = 'ana_adi';--> statement-breakpoint
-- Recreated rather than altered: a value added with ALTER TYPE ... ADD VALUE can't be used in the same
-- transaction, and the migrator applies all pending migrations in one. This also drops the two old values.
DROP TYPE "public"."animal_status";--> statement-breakpoint
CREATE TYPE "public"."animal_status" AS ENUM('in_shelter', 'clinic', 'foster', 'foster_adoption', 'adoption_incomplete', 'adopted', 'deceased', 'external', 'unknown');--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" SET DEFAULT 'unknown'::"public"."animal_status";--> statement-breakpoint
ALTER TABLE "animals" ALTER COLUMN "status" SET DATA TYPE "public"."animal_status" USING "status"::"public"."animal_status";--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_location_idx" ON "animals" USING btree ("location_id");--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_location_in_shelter" CHECK ("animals"."location_id" is null or "animals"."status" = 'in_shelter');
