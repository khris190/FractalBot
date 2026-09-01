CREATE TABLE `conversationTurn` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`threadId` text NOT NULL,
	`messageId` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`createdAt` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversationTurn_messageId_unique` ON `conversationTurn` (`messageId`);