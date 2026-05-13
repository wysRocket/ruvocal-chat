import { afterEach, describe, expect, it, vi } from "vitest";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongoServer: MongoMemoryServer | null = null;

afterEach(async () => {
	delete process.env.MONGODB_URL;
	vi.resetModules();

	if (mongoServer) {
		await mongoServer.stop();
		mongoServer = null;
	}
});

describe("database transport selection", () => {
	it("uses MongoDB client when MONGODB_URL is configured", async () => {
		mongoServer = await MongoMemoryServer.create();
		process.env.MONGODB_URL = mongoServer.getUri("ruvocal-test");

		const { Database, ready } = await import("./database");

		await ready;

		const db = await Database.getInstance();
		const client = db.getClient();

		expect(client).toBeInstanceOf(MongoClient);

		if ("close" in client && typeof client.close === "function") {
			await client.close();
		}
	});
});
