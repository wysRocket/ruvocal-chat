/**
 * RuVocal Database — self-contained RVF document store.
 *
 * Zero external dependencies. All data persisted to a single
 * RVF JSON file on disk. MongoDB Collection interface preserved
 * so all 56 importing files work unchanged.
 */

import type { Conversation } from "$lib/types/Conversation";
import type { SharedConversation } from "$lib/types/SharedConversation";
import type { AbortedGeneration } from "$lib/types/AbortedGeneration";
import type { Settings } from "$lib/types/Settings";
import type { User } from "$lib/types/User";
import type { MessageEvent } from "$lib/types/MessageEvent";
import type { Session } from "$lib/types/Session";
import type { Assistant } from "$lib/types/Assistant";
import type { Report } from "$lib/types/Report";
import type { ConversationStats } from "$lib/types/ConversationStats";
import type { MigrationResult } from "$lib/types/MigrationResult";
import type { Semaphore } from "$lib/types/Semaphore";
import type { AssistantStats } from "$lib/types/AssistantStats";
import type { TokenCache } from "$lib/types/TokenCache";
import type { ConfigKey } from "$lib/types/ConfigKey";

import { building } from "$app/environment";
import { GridFSBucket, MongoClient, type Db } from "mongodb";
import { onExit } from "./exitHandler";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";

import { RvfCollection, RvfGridFSBucket, initRvfStore, flushToDisk } from "./database/rvf";

export const CONVERSATION_STATS_COLLECTION = "conversations.stats";

export class Database {
	private static instance: Database;
	private initialized = false;
	private client: MongoClient | null = null;
	private db: Db | null = null;

	private async init() {
		const mongoUrl = process.env.MONGODB_URL?.trim();

		if (mongoUrl) {
			this.client = new MongoClient(mongoUrl);
			await this.client.connect();
			this.db = process.env.MONGODB_DB_NAME?.trim()
				? this.client.db(process.env.MONGODB_DB_NAME.trim())
				: this.client.db();
			this.initialized = true;

			console.log(`[RuVocal] Database: MongoDB (${this.db.databaseName})`);

			onExit(async () => {
				console.log("[RuVocal] Closing MongoDB client");
				await this.client?.close();
			});

			return;
		}

		const dbFolder =
			process.env.RVF_DB_PATH || join(dirname(fileURLToPath(import.meta.url)), "../../../db");

		if (!existsSync(dbFolder)) {
			mkdirSync(dbFolder, { recursive: true });
		}

		const dbPath = join(dbFolder, "ruvocal.rvf.json");

		console.log(`[RuVocal] Database: ${dbPath}`);
		initRvfStore(dbPath);
		this.initialized = true;

		// Flush to disk on exit
		onExit(async () => {
			console.log("[RuVocal] Flushing database to disk");
			flushToDisk();
		});
	}

	public static async getInstance(): Promise<Database> {
		if (!Database.instance) {
			Database.instance = new Database();
			await Database.instance.init();
		}
		return Database.instance;
	}

	public getClient() {
		if (!this.initialized) {
			throw new Error("Database not initialized");
		}
		return this.client ?? {}; // RVF mode has no external client
	}

	public getCollections() {
		if (!this.initialized) {
			throw new Error("Database not initialized");
		}

		if (this.db) {
			const db = this.db;

			return {
				conversations: db.collection<Conversation>("conversations"),
				conversationStats: db.collection<ConversationStats>(CONVERSATION_STATS_COLLECTION),
				assistants: db.collection<Assistant>("assistants"),
				assistantStats: db.collection<AssistantStats>("assistants.stats"),
				reports: db.collection<Report>("reports"),
				sharedConversations: db.collection<SharedConversation>("sharedConversations"),
				abortedGenerations: db.collection<AbortedGeneration>("abortedGenerations"),
				settings: db.collection<Settings>("settings"),
				users: db.collection<User>("users"),
				sessions: db.collection<Session>("sessions"),
				messageEvents: db.collection<MessageEvent>("messageEvents"),
				bucket: new GridFSBucket(db),
				migrationResults: db.collection<MigrationResult>("migrationResults"),
				semaphores: db.collection<Semaphore>("semaphores"),
				tokenCaches: db.collection<TokenCache>("tokens"),
				tools: db.collection<Record<string, unknown>>("tools"),
				config: db.collection<ConfigKey>("config"),
			};
		}

		const conversations = new RvfCollection<Conversation>("conversations");
		const settings = new RvfCollection<Settings>("settings");
		const users = new RvfCollection<User>("users");
		const sessions = new RvfCollection<Session>("sessions");
		const messageEvents = new RvfCollection<MessageEvent>("messageEvents");
		const abortedGenerations = new RvfCollection<AbortedGeneration>("abortedGenerations");
		const semaphores = new RvfCollection<Semaphore>("semaphores");
		const tokenCaches = new RvfCollection<TokenCache>("tokens");
		const configCollection = new RvfCollection<ConfigKey>("config");
		const migrationResults = new RvfCollection<MigrationResult>("migrationResults");
		const sharedConversations = new RvfCollection<SharedConversation>("sharedConversations");
		const assistants = new RvfCollection<Assistant>("assistants");
		const assistantStats = new RvfCollection<AssistantStats>("assistants.stats");
		const conversationStats = new RvfCollection<ConversationStats>(CONVERSATION_STATS_COLLECTION);
		const reports = new RvfCollection<Report>("reports");
		const tools = new RvfCollection<Record<string, unknown>>("tools");
		const bucket = new RvfGridFSBucket();

		return {
			conversations,
			conversationStats,
			assistants,
			assistantStats,
			reports,
			sharedConversations,
			abortedGenerations,
			settings,
			users,
			sessions,
			messageEvents,
			bucket,
			migrationResults,
			semaphores,
			tokenCaches,
			tools,
			config: configCollection,
		};
	}
}

export let collections: ReturnType<typeof Database.prototype.getCollections>;

export const ready = (async () => {
	if (!building) {
		const db = await Database.getInstance();
		collections = db.getCollections();
	} else {
		collections = {} as unknown as ReturnType<typeof Database.prototype.getCollections>;
	}
})();

export async function getCollectionsEarly(): Promise<
	ReturnType<typeof Database.prototype.getCollections>
> {
	await ready;
	if (!collections) {
		throw new Error("Database not initialized");
	}
	return collections;
}
