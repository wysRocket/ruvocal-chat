/**
 * HITL resume endpoint.
 *
 * GET  /api/hitl?conversationId=xxx
 *   Returns pending tool calls for a paused conversation.
 *
 * POST /api/hitl
 *   body: { conversationId, callId, decision: object }
 *   Resumes the agent loop with the human's decision.
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { OpenRouter } from "@openrouter/agent";
import { env } from "$env/dynamic/private";

// Re-use the same in-memory store — in production, swap for MongoDB
// This import shares the store from the agent route via module singleton
// (works because both routes run in the same Node.js process)
const stateStore = (globalThis as Record<string, unknown>)["__hitl_state__"] as Map<
	string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	any
> ?? (() => {
	const m = new Map();
	(globalThis as Record<string, unknown>)["__hitl_state__"] = m;
	return m;
})();

export const GET: RequestHandler = async ({ url }) => {
	const conversationId = url.searchParams.get("conversationId");
	if (!conversationId) {
		return json({ error: "conversationId required" }, { status: 400 });
	}

	const state = stateStore.get(conversationId);
	if (!state || state.status !== "awaiting_hitl") {
		return json({ status: "not_paused", pendingCalls: [] });
	}

	return json({
		status: "awaiting_hitl",
		conversationId,
		pendingCalls: state.pendingCalls ?? [],
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const { conversationId, callId, decision } = await request.json();

	if (!conversationId || !callId || decision === undefined) {
		return json({ error: "conversationId, callId, and decision are required" }, { status: 400 });
	}

	const apiKey = env.OPENROUTER_API_KEY ?? env.OPENAI_API_KEY;
	if (!apiKey) {
		return json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
	}

	const savedState = stateStore.get(conversationId);
	if (!savedState) {
		return json({ error: "Conversation not found or already completed" }, { status: 404 });
	}

	const openrouter = new OpenRouter({ apiKey });

	// Resume the agent loop by supplying the human's decision as a function_call_output
	const state = {
		load: async () => savedState,
		save: async (s: unknown) => { stateStore.set(conversationId, s); },
	};

	try {
		const result = await openrouter.callModel({
			model: "qwen/qwen3.6-max-preview",
			input: [{ type: "function_call_output", callId, output: JSON.stringify(decision) }],
			// @ts-expect-error tools type threading — state carries tool definitions
			state,
		});

		const stateSnapshot = await result.getState();

		if (stateSnapshot.status === "awaiting_hitl") {
			const pendingCalls = await result.getPendingToolCalls();
			return json({
				status: "awaiting_hitl",
				conversationId,
				pendingCalls: pendingCalls.map((c) => ({
					id: c.id,
					name: c.name,
					arguments: c.arguments,
				})),
			});
		}

		return json({
			status: "complete",
			conversationId,
			response: stateSnapshot.messages?.at(-1)?.content ?? "",
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 500 });
	}
};
