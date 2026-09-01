ALTER TABLE `conversationTurn` ADD `upvotes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversationTurn` ADD `downvotes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversationTurn` ADD `promoted` integer DEFAULT 0 NOT NULL;