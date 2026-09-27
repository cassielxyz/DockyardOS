import type { SecurityControl, SecurityProfile, SecurityProfileId } from "./security-types.js";

function controls(source: string, entries: Array<[string, string]>): SecurityControl[] {
  return entries.map(([id, title]) => ({ id, title, source, required: true }));
}

const webControls = controls("OWASP Top 10:2025", [
  ["A01:2025", "Broken Access Control"],
  ["A02:2025", "Security Misconfiguration"],
  ["A03:2025", "Software Supply Chain Failures"],
  ["A04:2025", "Cryptographic Failures"],
  ["A05:2025", "Injection"],
  ["A06:2025", "Insecure Design"],
  ["A07:2025", "Authentication Failures"],
  ["A08:2025", "Software or Data Integrity Failures"],
  ["A09:2025", "Security Logging and Alerting Failures"],
  ["A10:2025", "Mishandling of Exceptional Conditions"],
]);

const apiControls = controls("OWASP API Security Top 10:2023", [
  ["API1:2023", "Broken Object Level Authorization"],
  ["API2:2023", "Broken Authentication"],
  ["API3:2023", "Broken Object Property Level Authorization"],
  ["API4:2023", "Unrestricted Resource Consumption"],
  ["API5:2023", "Broken Function Level Authorization"],
  ["API6:2023", "Unrestricted Access to Sensitive Business Flows"],
  ["API7:2023", "Server Side Request Forgery"],
  ["API8:2023", "Security Misconfiguration"],
  ["API9:2023", "Improper Inventory Management"],
  ["API10:2023", "Unsafe Consumption of APIs"],
]);

const mobileControls = controls("OWASP Mobile Top 10:2024", [
  ["M1:2024", "Improper Credential Usage"],
  ["M2:2024", "Inadequate Supply Chain Security"],
  ["M3:2024", "Insecure Authentication/Authorization"],
  ["M4:2024", "Insufficient Input/Output Validation"],
  ["M5:2024", "Insecure Communication"],
  ["M6:2024", "Inadequate Privacy Controls"],
  ["M7:2024", "Insufficient Binary Protections"],
  ["M8:2024", "Security Misconfiguration"],
  ["M9:2024", "Insecure Data Storage"],
  ["M10:2024", "Insufficient Cryptography"],
]);

const llmControls = controls("OWASP GenAI LLM Top 10:2026", [
  ["LLM01:2026", "Prompt Injection"],
  ["LLM02:2026", "Sensitive Information Disclosure"],
  ["LLM03:2026", "Excessive Agency"],
  ["LLM04:2026", "Supply Chain"],
  ["LLM05:2026", "Data and Model Poisoning"],
  ["LLM06:2026", "Unbounded Consumption"],
  ["LLM07:2026", "Misinformation"],
  ["LLM08:2026", "Hidden Context Exposure"],
  ["LLM09:2026", "Vector and Embedding Weaknesses"],
  ["LLM10:2026", "Improper Output Handling"],
]);

export const securityProfiles: SecurityProfile[] = [
  {
    id: "general",
    displayName: "General Secure Development",
    frameworkVersion: "Dockyard baseline + OWASP Top 10:2025",
    controls: webControls,
    scanners: ["gitleaks", "osv-scanner", "semgrep"],
    notes: ["Use a more specific profile when the project exposes a web UI, API, mobile client, or LLM/agent surface."],
  },
  {
    id: "web",
    displayName: "Web Application Security",
    frameworkVersion: "OWASP Top 10:2025",
    controls: webControls,
    scanners: ["gitleaks", "osv-scanner", "semgrep", "strix"],
    notes: ["Strix is most valuable against authorized staging plus source when dynamic behavior must be verified."],
  },
  {
    id: "api",
    displayName: "API Security",
    frameworkVersion: "OWASP API Security Top 10:2023",
    controls: apiControls,
    scanners: ["gitleaks", "osv-scanner", "semgrep", "strix"],
    notes: ["Authorization testing must include object-level, property-level, and function-level checks."],
  },
  {
    id: "mobile",
    displayName: "Mobile Application Security",
    frameworkVersion: "OWASP Mobile Top 10:2024",
    controls: mobileControls,
    scanners: ["gitleaks", "osv-scanner", "semgrep", "strix"],
    notes: ["Source scanning is only part of mobile assurance; binary/runtime testing should be added when platform artifacts are available."],
  },
  {
    id: "llm",
    displayName: "LLM / Agentic Application Security",
    frameworkVersion: "OWASP GenAI LLM Top 10:2026",
    controls: llmControls,
    scanners: ["gitleaks", "osv-scanner", "semgrep", "strix"],
    notes: ["Pay special attention to excessive agency, tool permissions, hidden context exposure, prompt injection, output handling, and resource limits."],
  },
];

export function securityProfile(id: SecurityProfileId): SecurityProfile {
  const profile = securityProfiles.find((item) => item.id === id);
  if (!profile) throw new Error(`Unknown DockyardOS security profile: ${id}`);
  return profile;
}
