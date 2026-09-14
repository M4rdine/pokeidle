CREATE TABLE "hunt_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trainer_id" uuid NOT NULL,
	"hunt_id" text NOT NULL,
	"species_name" text NOT NULL,
	"level" integer NOT NULL,
	"xp_trainer" integer NOT NULL,
	"gold" integer NOT NULL,
	"drops" jsonb NOT NULL,
	"captured" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hunt_sessions" (
	"trainer_id" uuid PRIMARY KEY NOT NULL,
	"hunt_id" text NOT NULL,
	"session_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"seed" integer NOT NULL,
	"rng_state" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_simulated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"trainer_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_trainer_id_item_id_pk" PRIMARY KEY("trainer_id","item_id"),
	CONSTRAINT "inventory_quantity_check" CHECK ("inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pokedex_entries" (
	"trainer_id" uuid NOT NULL,
	"species_name" text NOT NULL,
	"seen_at" timestamp with time zone NOT NULL,
	"caught_at" timestamp with time zone,
	CONSTRAINT "pokedex_entries_trainer_id_species_name_pk" PRIMARY KEY("trainer_id","species_name")
);
--> statement-breakpoint
CREATE TABLE "pokemon" (
	"id" text PRIMARY KEY NOT NULL,
	"trainer_id" uuid NOT NULL,
	"species_name" text NOT NULL,
	"level" integer NOT NULL,
	"xp" integer NOT NULL,
	"hp" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"team_slot" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"gold" integer DEFAULT 0 NOT NULL,
	"return_hp_percent" integer DEFAULT 30 NOT NULL,
	"ball_tier" text DEFAULT 'best' NOT NULL,
	"max_wild_hp_percent" integer DEFAULT 30 NOT NULL,
	"allow_duplicates" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainers_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "trainers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "hunt_log" ADD CONSTRAINT "hunt_log_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_sessions" ADD CONSTRAINT "hunt_sessions_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokedex_entries" ADD CONSTRAINT "pokedex_entries_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokemon" ADD CONSTRAINT "pokemon_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hunt_log_trainer_created_idx" ON "hunt_log" USING btree ("trainer_id","created_at");--> statement-breakpoint
CREATE INDEX "pokemon_trainer_idx" ON "pokemon" USING btree ("trainer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pokemon_trainer_slot_idx" ON "pokemon" USING btree ("trainer_id","team_slot") WHERE "pokemon"."team_slot" is not null;--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");