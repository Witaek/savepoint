CREATE TABLE `achievement_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'game' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `achievement_groups_game_idx` ON `achievement_groups` (`game_id`);--> statement-breakpoint
CREATE TABLE `split_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`type` text NOT NULL,
	`value` text DEFAULT '' NOT NULL,
	`range_from` integer,
	`range_to` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `achievement_groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `split_rules_game_idx` ON `split_rules` (`game_id`);--> statement-breakpoint
ALTER TABLE `achievements` ADD `group_id` integer REFERENCES achievement_groups(id);--> statement-breakpoint
ALTER TABLE `achievements` ADD `group_manual` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `achievements_group_idx` ON `achievements` (`group_id`);