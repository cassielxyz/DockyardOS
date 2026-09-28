import {
  acknowledgeAdSession,
  apiError,
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
    const sessionToken = String(request.body?.sessionToken ?? "");
    const config = await loadAdConfig();
    const lease = acknowledgeAdSession(config, sessionToken, installId);
    await incrementAdMetric("impression", lease.campaignId).catch(() => false);
    await incrementAdMetric("lease", lease.campaignId).catch(() => false);
    return response.status(200).json({ schemaVersion: 1, ...lease });
  } catch (error) {
    return apiError(response, error);
  }
}
