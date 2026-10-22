CREATE TABLE `achievements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`key` text NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`icon_locked` text,
	`hidden` integer DEFAULT false NOT NULL,
	`global_percent` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievements_game_key_idx` ON `achievements` (`game_id`,`key`);--> statement-breakpoint
CREATE TABLE `api_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_cache_expires_idx` ON `api_cache` (`expires_at`);--> statement-breakpoint
CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`steam_app_id` integer,
	`igdb_id` integer,
	`name` text NOT NULL,
	`cover` text,
	`hero` text,
	`summary` text,
	`release_date` text,
	`developers` text DEFAULT '[]' NOT NULL,
	`genres` text DEFAULT '[]' NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`schema_updated_at` integer,
	`details_updated_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_steam_idx` ON `games` (`steam_app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_igdb_idx` ON `games` (`igdb_id`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`started_at` integer NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_idx` ON `job_runs` (`job`,`started_at`);--> statement-breakpoint
CREATE TABLE `library_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`game_id` integer NOT NULL,
	`status` text NOT NULL,
	`platform` text,
	`steam_owned` integer DEFAULT false NOT NULL,
	`playtime_minutes` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`synced_playtime` integer,
	`achievements_synced_at` integer,
	`rating` integer,
	`notes` text,
	`perfected_at` integer,
	`added_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `library_user_game_idx` ON `library_entries` (`user_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `library_user_status_idx` ON `library_entries` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `notification_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_error` text,
	`last_sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_targets_user_idx` ON `notification_targets` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`user_id` integer NOT NULL,
	`achievement_id` integer NOT NULL,
	`unlocked_at` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`user_id`, `achievement_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievements`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_achievements_time_idx` ON `user_achievements` (`user_id`,`unlocked_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`prefs` text DEFAULT '{}' NOT NULL,
	`steam_id` text,
	`steam_name` text,
	`steam_avatar` text,
	`steam_synced_at` integer,
	`steam_sync` text DEFAULT '{"status":"idle"}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);