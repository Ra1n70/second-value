CREATE TABLE `auction_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auction_rate_limits_window_start_idx` ON `auction_rate_limits` (`window_start`);--> statement-breakpoint
CREATE TABLE `auction_rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`storage_version` integer NOT NULL,
	`last_used` integer NOT NULL,
	`record_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auction_rooms_last_used_idx` ON `auction_rooms` (`last_used`);