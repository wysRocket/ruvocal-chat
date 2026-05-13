import { base } from "$app/paths";
import { error, redirect } from "@sveltejs/kit";
import superjson from "superjson";

export async function load({ parent, params, fetch }) {
	const data = await parent();

	const model = data.models.find((m: { id: string }) => m.id === params.model);

	if (!model || model.unlisted) {
		redirect(302, `${base}/settings`);
	}

	const modelPath = params.model
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");
	const response = await fetch(`${base}/api/v2/models/${modelPath}`);
	if (!response.ok) {
		error(response.status, "Model not found");
	}
	const detailedModel = superjson.parse(await response.text());

	return {
		model: detailedModel,
	};
}
