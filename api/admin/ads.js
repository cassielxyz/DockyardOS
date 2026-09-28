import {
  adminHeaders,
  apiError,
  loadAdConfig,
  requireAdmin,
  saveAdConfig,
} from "../_lib/ad-control.js";

export default async function handler(request, response) {
  adminHeaders(response);
  if (!["GET", "PUT"].includes(request.method)) {
    response.setHeader("Allow", "GET, PUT");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  try {
    requireAdmin(request);
    if (request.method === "GET") {
      const config = await loadAdConfig();
      return response.status(200).json({ schemaVersion: 1, config });
    }
    const config = await saveAdConfig(request.body?.config ?? request.body);
    return response.status(200).json({ schemaVersion: 1, saved: true, config });
  } catch (error) {
    return apiError(response, error);
  }
}
