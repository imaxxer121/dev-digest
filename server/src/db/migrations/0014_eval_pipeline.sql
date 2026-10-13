CREATE TABLE "eval_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"snapshot" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "source_finding_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "input_digest" text;--> statement-breakpoint
ALTER TABLE "eval_batches" ADD CONSTRAINT "eval_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_batch_running_uq" ON "eval_batches" USING btree ("workspace_id","agent_id") WHERE "eval_batches"."status" = 'running';--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_batch_id_eval_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."eval_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_case_source_uq" ON "eval_cases" USING btree ("workspace_id","owner_kind","owner_id","source_finding_id") WHERE "eval_cases"."source_finding_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "eval_run_batch_case_uq" ON "eval_runs" USING btree ("batch_id","case_id") WHERE "eval_runs"."batch_id" IS NOT NULL;