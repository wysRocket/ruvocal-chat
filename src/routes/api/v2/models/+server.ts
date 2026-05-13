import type { RequestHandler } from "@sveltejs/kit";
import { superjsonResponse } from "$lib/server/api/utils/superjsonResponse";
import type { GETModelsResponse, ModelSummary } from "$lib/server/api/types";

const MODEL_SUMMARY_DESCRIPTION_LIMIT = 160;

function summarizeDescription(description?: string | null) {
	if (!description) {
		return undefined;
	}

	const normalized = description.replace(/\s+/g, " ").trim();
	if (normalized.length <= MODEL_SUMMARY_DESCRIPTION_LIMIT) {
		return normalized;
	}

	return `${normalized.slice(0, MODEL_SUMMARY_DESCRIPTION_LIMIT - 1).trimEnd()}…`;
}

function toModelSummary(model: {
	id: string;
	name: string;
	displayName: string;
	description?: string | null;
	logoUrl?: string | null;
	preprompt?: string | null;
	multimodal?: boolean;
	multimodalAcceptedMimetypes?: string[];
	unlisted?: boolean;
	hasInferenceAPI?: boolean;
	isRouter?: boolean;
	supportsTools?: boolean;
}): ModelSummary {
	return {
		id: model.id,
		name: model.name,
		displayName: model.displayName,
		...(summarizeDescription(model.description) && {
			description: summarizeDescription(model.description),
		}),
		...(model.logoUrl && { logoUrl: model.logoUrl }),
		...(model.preprompt && { preprompt: model.preprompt }),
		multimodal: model.multimodal ?? false,
		...(model.multimodalAcceptedMimetypes?.length && {
			multimodalAcceptedMimetypes: model.multimodalAcceptedMimetypes,
		}),
		supportsTools: model.supportsTools ?? false,
		unlisted: model.unlisted ?? false,
		hasInferenceAPI: model.hasInferenceAPI ?? false,
		isRouter: model.isRouter ?? false,
	};
}

export const GET: RequestHandler = async () => {
	try {
		const { models } = await import("$lib/server/models");
		return superjsonResponse(
			models
				.filter((m) => m.unlisted == false)
				.map((model) =>
					toModelSummary({
						id: model.id,
						name: model.name,
						displayName: model.displayName,
						description: model.description,
						logoUrl: model.logoUrl,
						preprompt: model.preprompt,
						multimodal: model.multimodal,
						multimodalAcceptedMimetypes: model.multimodalAcceptedMimetypes,
						supportsTools: (model as unknown as { supportsTools?: boolean }).supportsTools,
						unlisted: model.unlisted,
						hasInferenceAPI: model.hasInferenceAPI,
						isRouter: model.isRouter,
					})
				) satisfies GETModelsResponse
		);
	} catch {
		return superjsonResponse([] as GETModelsResponse);
	}
};
