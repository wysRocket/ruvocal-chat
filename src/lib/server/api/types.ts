export type ModelSummary = {
	id: string;
	name: string;
	displayName: string;
	description?: string;
	logoUrl?: string;
	preprompt?: string;
	multimodal: boolean;
	multimodalAcceptedMimetypes?: string[];
	supportsTools?: boolean;
	unlisted: boolean;
	hasInferenceAPI: boolean;
	isRouter: boolean;
};

export type GETModelsResponse = ModelSummary[];

export type GETOldModelsResponse = Array<{
	id: string;
	name: string;
	displayName: string;
	transferTo?: string;
}>;

export interface FeatureFlags {
	enableAssistants: boolean;
	loginEnabled: boolean;
	isAdmin: boolean;
	transcriptionEnabled: boolean;
}
