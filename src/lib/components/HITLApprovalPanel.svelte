<script lang="ts">
	/**
	 * HITLApprovalPanel — shown when the agent pauses for human approval.
	 *
	 * Usage:
	 *   <HITLApprovalPanel {conversationId} on:resolved={handleResolved} />
	 */
	import { createEventDispatcher, onMount, onDestroy } from "svelte";

	export let conversationId: string;

	type PendingCall = {
		id: string;
		name: string;
		arguments: Record<string, unknown>;
	};

	const dispatch = createEventDispatcher<{ resolved: { response: string } }>();

	let pendingCalls: PendingCall[] = [];
	let loading = false;
	let error = "";
	let pollInterval: ReturnType<typeof setInterval> | null = null;

	const TOOL_LABELS: Record<string, { label: string; icon: string; riskColor: string }> = {
		create_github_issue: {
			label: "Create GitHub Issue",
			icon: "🐛",
			riskColor: "orange",
		},
		approve_deploy: {
			label: "Deploy to Production",
			icon: "🚀",
			riskColor: "red",
		},
	};

	async function fetchPending() {
		try {
			const res = await fetch(`/api/hitl?conversationId=${encodeURIComponent(conversationId)}`);
			const data = await res.json();
			if (data.status === "awaiting_hitl") {
				pendingCalls = data.pendingCalls ?? [];
			} else {
				pendingCalls = [];
			}
		} catch {
			// silently retry
		}
	}

	async function submitDecision(call: PendingCall, approved: boolean) {
		loading = true;
		error = "";
		try {
			const decision =
				call.name === "create_github_issue"
					? { created: approved, reason: approved ? "Human approved" : "Human rejected" }
					: { approved, approvedBy: "human", notes: "" };

			const res = await fetch("/api/hitl", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ conversationId, callId: call.id, decision }),
			});
			const data = await res.json();

			if (data.status === "complete") {
				pendingCalls = [];
				dispatch("resolved", { response: data.response ?? "" });
			} else if (data.status === "awaiting_hitl") {
				pendingCalls = data.pendingCalls ?? [];
			} else if (data.error) {
				error = data.error;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Unknown error";
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		fetchPending();
		pollInterval = setInterval(fetchPending, 3000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

{#if pendingCalls.length > 0}
	<div class="hitl-panel">
		<div class="hitl-header">
			<span class="hitl-icon">⏸️</span>
			<strong>Agent paused — human approval required</strong>
		</div>

		{#each pendingCalls as call (call.id)}
			{@const meta = TOOL_LABELS[call.name] ?? { label: call.name, icon: "🔧", riskColor: "gray" }}
			<div class="hitl-card" style="border-left-color: {meta.riskColor}">
				<div class="hitl-card-header">
					<span>{meta.icon}</span>
					<strong>{meta.label}</strong>
				</div>

				<pre class="hitl-args">{JSON.stringify(call.arguments, null, 2)}</pre>

				<div class="hitl-actions">
					<button
						class="btn-approve"
						disabled={loading}
						on:click={() => submitDecision(call, true)}
					>
						✅ Approve
					</button>
					<button
						class="btn-reject"
						disabled={loading}
						on:click={() => submitDecision(call, false)}
					>
						❌ Reject
					</button>
				</div>
			</div>
		{/each}

		{#if error}
			<p class="hitl-error">{error}</p>
		{/if}
	</div>
{/if}

<style>
	.hitl-panel {
		margin: 1rem 0;
		padding: 1rem;
		border-radius: 0.75rem;
		background: #1e1e2e;
		border: 1px solid #45475a;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.hitl-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #cdd6f4;
		font-size: 0.9rem;
	}

	.hitl-card {
		background: #181825;
		border-radius: 0.5rem;
		border-left: 3px solid orange;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.hitl-card-header {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: #cdd6f4;
		font-size: 0.85rem;
	}

	.hitl-args {
		background: #11111b;
		color: #a6e3a1;
		font-size: 0.75rem;
		padding: 0.5rem;
		border-radius: 0.4rem;
		overflow-x: auto;
		white-space: pre-wrap;
		margin: 0;
	}

	.hitl-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-approve,
	.btn-reject {
		padding: 0.35rem 0.9rem;
		border-radius: 0.4rem;
		border: none;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		transition: opacity 0.15s;
	}

	.btn-approve:disabled,
	.btn-reject:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-approve {
		background: #a6e3a1;
		color: #1e1e2e;
	}

	.btn-reject {
		background: #f38ba8;
		color: #1e1e2e;
	}

	.hitl-error {
		color: #f38ba8;
		font-size: 0.8rem;
		margin: 0;
	}
</style>
