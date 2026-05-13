import { describe, expect, it } from "vitest";
import superjson from "superjson";
import { GET as modelsGET } from "../../../../routes/api/v2/models/+server";
import { GET as modelNamespaceGET } from "../../../../routes/api/v2/models/[namespace]/+server";
import { GET as modelDetailGET } from "../../../../routes/api/v2/models/[namespace]/[model]/+server";
import { models } from "$lib/server/models";
import type { GETModelsResponse } from "$lib/server/api/types";
import type { Model } from "$lib/types/Model";

async function parseResponse<T = unknown>(res: Response): Promise<T> {
	return superjson.parse(await res.text()) as T;
}

describe("GET /api/v2/models", () => {
	it("returns lightweight model summaries for app shell loads", async () => {
		const res = await modelsGET({} as Parameters<typeof modelsGET>[0]);
		const data = await parseResponse<GETModelsResponse>(res);

		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBeGreaterThan(0);

		const first = data[0] as Record<string, unknown>;
		expect(first).not.toHaveProperty("providers");
		expect(first).not.toHaveProperty("parameters");
		expect(first).not.toHaveProperty("promptExamples");
		expect(first).not.toHaveProperty("websiteUrl");
		expect(first).not.toHaveProperty("modelUrl");
		expect(first).not.toHaveProperty("datasetName");
		expect(first).not.toHaveProperty("datasetUrl");
	});
});

describe("GET /api/v2/models/[id]", () => {
	it("keeps full detail available from the per-model endpoint", async () => {
		const sample = models.find((model) => model.id.includes("/")) ?? models[0];
		const parts = sample.id.split("/");

		const res =
			parts.length === 2
				? await modelDetailGET({
						params: { namespace: parts[0], model: parts[1] },
					} as Parameters<typeof modelDetailGET>[0])
				: await modelNamespaceGET({
						params: { namespace: parts[0] },
					} as Parameters<typeof modelNamespaceGET>[0]);

		const data = await parseResponse<Model>(res);

		expect(data.id).toBe(sample.id);
		expect(data).toHaveProperty("description");
		expect(data).toHaveProperty("preprompt");
		expect(data).toHaveProperty("providers");
		expect(data).toHaveProperty("parameters");
	});
});
