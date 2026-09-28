import { apiError, normalizeInstallId, publicHeaders, verifyAdLease } from "./_lib/ad-control.js";

export default async function handler(request, response) {
  publicHeaders(response);
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "method_not_allowed" });
  }
  try {
    const installId = normalizeInstallId(request.body?.installId);
    const leaseToken = String(request.body?.leaseToken ?? "");
    const lease = verifyAdLease(leaseToken, installId);
    return response.status(200).json({
      schemaVersion: 1,
      valid: true,
      campaignId: lease.campaignId,
      expiresAt: lease.expiresAt,
    });
  } catch (error) {
    return apiError(response, error);
  }
}
