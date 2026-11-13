CREATE TABLE `feeds` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`encrypted_url` text NOT NULL,
	`events_json` text DEFAULT '[]' NOT NULL,
	`last_synced` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "feeds_source_allowed" CHECK("feeds"."source" IN ('tumonline','moodle')),
	CONSTRAINT "feeds_events_valid_json" CHECK(json_valid("feeds"."events_json"))
);
--> statement-breakpoint
CREATE TABLE `rate_buckets` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "rate_buckets_hash_length" CHECK(length("rate_buckets"."key_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `rate_buckets_expiry_idx` ON `rate_buckets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`csrf_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "sessions_hash_lengths" CHECK(length("sessions"."token_hash") = 64 AND length("sessions"."csrf_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expiry_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "users_username_length" CHECK(length("users"."username") BETWEEN 3 AND 32),
	CONSTRAINT "users_username_normalized" CHECK("users"."username" = lower("users"."username") AND "users"."username" NOT GLOB '*[^a-z0-9._-]*' AND substr("users"."username",1,1) GLOB '[a-z0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);