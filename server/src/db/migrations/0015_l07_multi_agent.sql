ALTER TABLE "agent_runs" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "multi_agent_runs" ADD COLUMN "selected_runs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_group_id_multi_agent_runs_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."multi_agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_group_idx" ON "agent_runs" USING btree ("group_id");