CREATE TABLE "clinic_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"clinic_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"alias" text PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kinds" "medical_kind"[] NOT NULL,
	"interval_days" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "medical_records" ADD COLUMN "clinic_id" uuid;--> statement-breakpoint
ALTER TABLE "clinic_aliases" ADD CONSTRAINT "clinic_aliases_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clinics_name_idx" ON "clinics" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_idx" ON "products" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_clinic_id_clinics_id_fk" FOREIGN KEY ("clinic_id") REFERENCES "public"."clinics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "medical_product_idx" ON "medical_records" USING btree ("product_id");