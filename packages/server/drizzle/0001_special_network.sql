ALTER TABLE "trainers" ALTER COLUMN "return_hp_percent" SET DEFAULT 50;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "potion_hp_percent" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_gold_check" CHECK ("trainers"."gold" >= 0);