CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`seed` integer NOT NULL,
	`outcome` text NOT NULL,
	`duration_ms` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`started_at` text NOT NULL,
	`document` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`document` text NOT NULL
);
