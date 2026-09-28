import { adminHeaders, apiError, readAdMetrics, requireAdmin } from "../_lib/ad-control.js";

export default async function handler(request, response) {
  adminHeaders(response);
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  try {
    requireAdmin(request);
    const result = await readAdMetrics();
    return response.status(200).json({ schemaVersion: 1, ...result });
  } catch (error) {
    return apiError(response, error);
  }
}
