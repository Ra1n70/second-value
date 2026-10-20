import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

// The JSON includes private engine state and hashed seat credentials. It never
// crosses the HTTP boundary; only the room engine's per-player projection does.
export const auctionRooms = sqliteTable("auction_rooms", {
  code: text("code").primaryKey(),
  storageVersion: integer("storage_version").notNull(),
  lastUsed: integer("last_used").notNull(),
  recordJson: text("record_json").notNull(),
}, table => [index("auction_rooms_last_used_idx").on(table.lastUsed)]);

export const auctionRateLimits = sqliteTable("auction_rate_limits", {
  bucketKey: text("bucket_key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
}, table => [index("auction_rate_limits_window_start_idx").on(table.windowStart)]);
