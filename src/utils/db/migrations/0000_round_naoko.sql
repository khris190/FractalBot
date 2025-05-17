CREATE TABLE `imageChannel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channelId` text NOT NULL,
	`updatedAt` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imageChannelIdx` ON `imageChannel` (`channelId`);--> statement-breakpoint
CREATE TABLE `messageBlacklistChannel` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channelId` text NOT NULL,
	`updatedAt` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messageBlacklistChannelIdx` ON `messageBlacklistChannel` (`channelId`);