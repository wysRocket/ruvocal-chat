import type { ModelSummary } from "$lib/server/api/types";

export const findCurrentModel = (
	models: ModelSummary[],
	_oldModels: { id: string; transferTo?: string }[] = [],
	id?: string
): ModelSummary => {
	if (id) {
		const direct = models.find((m) => m.id === id);
		if (direct) return direct;
	}

	return models[0];
};
