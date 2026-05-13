/**
 * Agent API route — runs the OpenRouter callModel loop with HITL tools.
 *
 * POST /api/agent
 *   body: { message: string, conversationId?: string }
 *   Returns: { status, conversationId, response?, pendingCalls? }
 *
 * The HITL tools defined here map to real actions in the SaaS pipeline:
 *   - create_github_issue  → auto if severity=low, pause if high/critical
 *   - approve_deploy       → always pause for human approval
 */

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { OpenRouter, tool } from "@openrouter/agent";
import type { ConversationState, StateAccessor } from "@openrouter/agent";
import { z } from "zod";
import { env } from "$env/dynamic/private";

// ── In-memory state store (swap for MongoDB in production) ────────────────────
// Key: conversationId, Value: serialized ConversationState
const stateStore = new Map<string, ConversationState<readonly [typeof createGithubIssue, typeof approveDeploy]>>();

// ── HITL Tool 1: Create GitHub Issue ─────────────────────────────────────────
const issueInputSchema = z.object({
	title: z.string(),
	body: z.string(),
	severity: z.enum(["low", "medium", "high", "critical"]),
	repo: z.string().optional().default("SaaS-Pretty-Projects/teachenza"),
});

const issueOutputSchema = z.object({
	created: z.boolean(),
	issueNumber: z.number().optional(),
	reason: z.string().optional(),
});

const createGithubIssue = tool({
	name: "create_github_issue",
	description:
		"Creates a GitHub issue in the specified repository. Low severity issues are auto-created; high/critical severity issues require human approval first.",
	inputSchema: issueInputSchema,
	outputSchema: issueOutputSchema,
	onToolCalled: async (input) => {
		// Auto-resolve low-severity issues without human review
		if (input.severity === "low") {
			return { created: true, reason: "Auto-approved: low severity" };
		}
		// Pause for human review on high/critical
		return null;
	},
	onResponseReceived: async (raw) => {
		const decision = issueOutputSchema.parse(raw);
		return { ...decision, reason: decision.reason ?? "Human reviewed" };
	},
});

// ── HITL Tool 2: Approve Deploy ───────────────────────────────────────────────
const deployInputSchema = z.object({
	target: z.string().describe("Deployment target, e.g. 'netlify:ruflo-chat' or 'firebase:teachenza'"),
	branch: z.string().default("main"),
	description: z.string().describe("What is being deployed"),
});

const deployOutputSchema = z.object({
	approved: z.boolean(),
	approvedBy: z.string().optional(),
	notes: z.string().optional(),
});

const approveDeploy = tool({
	name: "approve_deploy",
	description: "Request human approval before deploying to production. Always pauses for review.",
	inputSchema: deployInputSchema,
	outputSchema: deployOutputSchema,
	onToolCalled: async (_input) => {
		// Always pause — deployments always need a human
		return null;
	},
	onResponseReceived: async (raw) => {
		return deployOutputSchema.parse(raw);
	},
});

// ── Handler ───────────────────────────────────────────────────────────────────
export const POST: RequestHandler = async ({ request }) => {
	const { message, conversationId = crypto.randomUUID() } = await request.json();

	const apiKey = env.OPENROUTER_API_KEY ?? env.OPENAI_API_KEY;
	if (!apiKey) {
		return json({ error: "OPENROUTER_API_KEY not configured" }, { status: 500 });
	}

	const openrouter = new OpenRouter({ apiKey });
	const tools = [createGithubIssue, approveDeploy] as const;

	const state: StateAccessor<typeof tools> = {
		load: async () => stateStore.get(conversationId) ?? null,
		save: async (s) => { stateStore.set(conversationId, s); },
	};

	try {
		const result = await openrouter.callModel({
			model: "qwen/qwen3.6-max-preview",
			input: message,
			tools,
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
