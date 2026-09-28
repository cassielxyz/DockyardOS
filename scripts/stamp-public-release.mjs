import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(process.cwd(), "registry", "public-release.json");
const rawUrl = String(process.env.DOCKYARD_PUBLIC_CONTROL_URL ?? "").trim();
if (!rawUrl) throw new Error("DOCKYARD_PUBLIC_CONTROL_URL is required for an official public release.");

let control;
try { control = new URL(rawUrl); } catch { throw new Error("DOCKYARD_PUBLIC_CONTROL_URL must be a valid URL."); }
if (control.protocol !== "https:" || control.username || control.password || control.search || control.hash) {
  throw new Error("DOCKYARD_PUBLIC_CONTROL_URL must be a credential-free HTTPS origin without query/hash.");
}
if (control.pathname !== "/" && control.pathname !== "") {
  throw new Error("DOCKYARD_PUBLIC_CONTROL_URL must be an HTTPS origin, not a nested path.");
}

const existing = JSON.parse(await readFile(target, "utf8"));
if (existing.schemaVersion !== 1) throw new Error("Unsupported public release marker schema.");
const release = {
  schemaVersion: 1,
  edition: "official-public",
  adEnforcement: "required",
  controlPlaneUrl: control.origin,
  stampedAt: new Date().toISOString(),
};
await writeFile(target, `${JSON.stringify(release, null, 2)}\n`, { encoding: "utf8", mode: 0o644 });
console.log(`Stamped official DockyardOS public release policy for ${control.origin}`);
