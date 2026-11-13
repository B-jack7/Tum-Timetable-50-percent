import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex,primaryKey,check} from 'drizzle-orm/sqlite-core';

export const users=sqliteTable('users',{
  id:text('id').primaryKey(),
  username:text('username').notNull(),
  passwordHash:text('password_hash').notNull(),
  createdAt:integer('created_at').notNull(),
},table=>[
  uniqueIndex('users_username_unique').on(table.username),
  check('users_username_length',sql`length(${table.username}) BETWEEN 3 AND 32`),
  check('users_username_normalized',sql`${table.username} = lower(${table.username}) AND ${table.username} NOT GLOB '*[^a-z0-9._-]*' AND substr(${table.username},1,1) GLOB '[a-z0-9]'`),
]);
export const sessions=sqliteTable('sessions',{
  tokenHash:text('token_hash').primaryKey(),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  csrfHash:text('csrf_hash').notNull(),
  createdAt:integer('created_at').notNull(),
  expiresAt:integer('expires_at').notNull(),
},table=>[
  index('sessions_user_idx').on(table.userId),
  index('sessions_expiry_idx').on(table.expiresAt),
  check('sessions_hash_lengths',sql`length(${table.tokenHash}) = 64 AND length(${table.csrfHash}) = 64`),
]);
export const feeds=sqliteTable('feeds',{
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  source:text('source',{enum:['tumonline','moodle']}).notNull(),
  encryptedUrl:text('encrypted_url').notNull(),
  eventsJson:text('events_json').notNull().default('[]'),
  lastSynced:integer('last_synced'),
  lastError:text('last_error'),
  createdAt:integer('created_at').notNull(),
  updatedAt:integer('updated_at').notNull(),
},table=>[
  primaryKey({columns:[table.userId,table.source]}),
  check('feeds_source_allowed',sql`${table.source} IN ('tumonline','moodle')`),
  check('feeds_events_valid_json',sql`json_valid(${table.eventsJson})`),
]);
export const rateBuckets=sqliteTable('rate_buckets',{
  keyHash:text('key_hash').primaryKey(),
  windowStart:integer('window_start').notNull(),
  count:integer('count').notNull(),
  expiresAt:integer('expires_at').notNull(),
},table=>[
  index('rate_buckets_expiry_idx').on(table.expiresAt),
  check('rate_buckets_hash_length',sql`length(${table.keyHash}) = 64`),
]);
