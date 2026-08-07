CREATE TABLE `families` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`shift_id` integer NOT NULL,
	`family_number` integer NOT NULL,
	`operation_id` text NOT NULL,
	`adults` integer NOT NULL,
	`children` integer NOT NULL,
	`visual` text DEFAULT '' NOT NULL,
	`age_status` text DEFAULT 'unchecked' NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`queued_at` text,
	`entered_at` text,
	`due_at` text,
	`departed_at` text,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "families_adults_check" CHECK("families"."adults" >= 1),
	CONSTRAINT "families_children_check" CHECK("families"."children" >= 1),
	CONSTRAINT "families_age_status_check" CHECK("families"."age_status" IN ('unchecked', 'under4', '4plus')),
	CONSTRAINT "families_status_check" CHECK("families"."status" IN ('waiting', 'inside', 'completed', 'left_queue'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_families_shift_number` ON `families` (`shift_id`,`family_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_families_operation_id` ON `families` (`operation_id`);--> statement-breakpoint
CREATE INDEX `idx_families_shift_status_entered` ON `families` (`shift_id`,`status`,`entered_at`);--> statement-breakpoint
CREATE INDEX `idx_families_shift_status_queued` ON `families` (`shift_id`,`status`,`queued_at`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`mode` text DEFAULT 'quiet' NOT NULL,
	CONSTRAINT "shifts_mode_check" CHECK("shifts"."mode" IN ('quiet', 'busy'))
);
--> statement-breakpoint
CREATE INDEX `idx_shifts_active` ON `shifts` (`ended_at`);