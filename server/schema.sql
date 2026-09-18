CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`detail` text NOT NULL,
	`date` text NOT NULL
);

CREATE TABLE `invitations` (
	`email` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);

CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL
);

CREATE UNIQUE INDEX `member_email` ON `members` (`email`);
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`alias` text NOT NULL,
	`group_name` text NOT NULL,
	`email` text,
	`start` text NOT NULL,
	`created` text NOT NULL
);

CREATE UNIQUE INDEX `participant_code` ON `participants` (`code`);
CREATE UNIQUE INDEX `participant_email` ON `participants` (`email`);
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`semester` integer NOT NULL,
	`date` text NOT NULL,
	`cycle` text NOT NULL,
	`category` text NOT NULL,
	`activity` text NOT NULL,
	`points` integer NOT NULL,
	`max` integer NOT NULL,
	`updated` text NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `record_identity` ON `records` (`participant_id`,`date`,`category`,`activity`);
CREATE INDEX `record_period` ON `records` (`participant_id`,`semester`,`date`);
CREATE TABLE `redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`item` text NOT NULL,
	`points` integer NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`date` text NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE `semesters` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`number` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE UNIQUE INDEX `participant_semester` ON `semesters` (`participant_id`,`number`);