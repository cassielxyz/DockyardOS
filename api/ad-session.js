import {
  apiError,
  createAdSession,
  incrementAdMetric,
  loadAdConfig,
  normalizeInstallId,
  publicHeaders,
} from "./_lib/ad-control.js";

export default async function handler(request, response) {
  publicHeaders(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const installId = normalizeInstallId(request.body?.installId);
    const config = await loadAdConfig();
    if (!config.enabled) throw Object.assign(new Error("The official public DockyardOS ad service is temporarily unavailable."), { statusCode: 503 });
    const session = createAdSession(config, installId);
    await incrementAdMetric("session", session.ad.id).catch(() => false);
    return response.status(200).json({ schemaVersion: 1, ...session });
  } catch (error) {
    return apiError(response, error);
  }
}
