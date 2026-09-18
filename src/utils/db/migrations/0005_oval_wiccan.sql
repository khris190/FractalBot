CREATE TABLE `movies` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`watched` integer,
	`updatedAt` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `movies_title_unique` ON `movies` (`title`);