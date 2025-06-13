CREATE TABLE `guildData` (
	`id` text PRIMARY KEY NOT NULL,
	`lastWishTimeStamp` integer,
	`updatedAt` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL
);
