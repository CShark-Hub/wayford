CREATE TABLE `sweeps` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`profile_id` text NOT NULL,
	`axis` text NOT NULL,
	`started_at` text NOT NULL,
	`document` text NOT NULL
);
