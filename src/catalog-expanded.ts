import type { Candidate, ContextCost, HostId, PermissionId, RiskLevel, UpdateChannel } from "./types.js";

const ALL_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"];
const AGENT_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode"];

type SkillSeed = {
  id: string;
  name: string;
  category: string;
  caps: string[];
  source: string;
  tags?: string[];
  stacks?: string[];
  permissions?: PermissionId[];
  risk?: RiskLevel;
  cost?: ContextCost;
  maturity?: number;
  maintenance?: number;
  channel?: UpdateChannel;
  license?: string;
  trust?: Candidate["trust"];
  sourceType?: Candidate["source"]["type"];
  hosts?: HostId[];
};

function skill(seed: SkillSeed): Candidate {
  return {
    id: seed.id,
    displayName: seed.name,
    category: seed.category,
    kind: "skill",
    trust: seed.trust ?? "official",
    capabilities: seed.caps,
    tags: seed.tags ?? [],
    stacks: seed.stacks ?? [],
    hosts: seed.hosts ?? ALL_HOSTS,
    permissions: seed.permissions ?? [],
    risk: seed.risk ?? "low",
    contextCost: seed.cost ?? "small",
    maturity: seed.maturity ?? 88,
    maintenance: seed.maintenance ?? 92,
    defaultChannel: seed.channel ?? "recommended",
    source: {
      type: seed.sourceType ?? "github",
      locator: seed.source,
      revisionStrategy: seed.sourceType === "website" || seed.sourceType === "official-registry" ? "live-metadata-only" : "pin-on-install",
      ...(seed.license ? { license: seed.license } : {}),
    },
  };
}

function mcp(seed: Omit<SkillSeed, "cost"> & { permissions?: PermissionId[] }): Candidate {
  return {
    ...skill({ ...seed, cost: "tiny" }),
    kind: "mcp",
    contextCost: "tiny",
    permissions: seed.permissions ?? ["network"],
  };
}

function dockAgent(id: string, name: string, category: string, caps: string[], tags: string[] = [], cost: ContextCost = "small"): Candidate {
  return {
    id,
    displayName: name,
    category,
    kind: "agent",
    trust: "dockyard",
    capabilities: caps,
    tags,
    stacks: [],
    hosts: AGENT_HOSTS,
    permissions: [],
    risk: "low",
    contextCost: cost,
    maturity: 86,
    maintenance: 100,
    defaultChannel: "recommended",
    source: { type: "dockyard", locator: `agents/${id}`, revisionStrategy: "bundled" },
  };
}

export const expandedCatalog: Candidate[] = [
  // Anthropic reference skills. Keep these explicit and pin-on-install; they are not auto-trusted for execution.
  skill({ id: "anthropic-pdf", name: "Anthropic PDF Skill", category: "documents", caps: ["pdf", "pdf-editing", "pdf-generation", "forms", "ocr"], source: "anthropics/skills", tags: ["documents", "artifact"], license: "Apache-2.0", maturity: 95, maintenance: 95 }),
  skill({ id: "anthropic-document-workflows", name: "Anthropic Document Workflows", category: "documents", caps: ["documents", "office-documents", "artifact-generation", "editing"], source: "anthropics/skills", tags: ["documents", "enterprise"], license: "Apache-2.0" }),
  skill({ id: "anthropic-spreadsheet-workflows", name: "Anthropic Spreadsheet Workflows", category: "spreadsheets", caps: ["spreadsheets", "data-analysis", "formulas", "charts"], source: "anthropics/skills", tags: ["xlsx", "analysis"], license: "Apache-2.0" }),
  skill({ id: "anthropic-presentation-workflows", name: "Anthropic Presentation Workflows", category: "presentations", caps: ["presentations", "slides", "visual-storytelling"], source: "anthropics/skills", tags: ["slides", "artifact"], license: "Apache-2.0" }),
  skill({ id: "anthropic-webapp-testing", name: "Anthropic Web App Testing", category: "testing", caps: ["web-testing", "browser-test", "qa"], source: "anthropics/skills", tags: ["browser", "verification"], permissions: ["browser"], risk: "medium", license: "Apache-2.0" }),
  skill({ id: "anthropic-mcp-builder", name: "Anthropic MCP Builder", category: "mcp-development", caps: ["mcp-server", "tool-design", "resource-design", "protocol"], source: "anthropics/skills", tags: ["mcp", "agents"], license: "Apache-2.0", cost: "medium" }),
  skill({ id: "anthropic-skill-authoring", name: "Anthropic Skill Authoring", category: "skill-development", caps: ["skill-authoring", "progressive-disclosure", "skill-evaluation"], source: "anthropics/skills", tags: ["agent-skills", "authoring"], license: "Apache-2.0" }),

  // Microsoft skills: treat the official repository as a large family catalogue and route into stack-specific leaves.
  skill({ id: "microsoft-skill-catalog", name: "Microsoft Agent Skills Catalog", category: "skill-discovery", caps: ["azure", "microsoft-foundry", "sdk-guidance", "mcp", "agent-development"], source: "microsoft/skills", tags: ["azure", "microsoft", "catalog"], cost: "tiny", maintenance: 98 }),
  skill({ id: "microsoft-mcp-builder", name: "Microsoft MCP Builder", category: "mcp-development", caps: ["mcp-server", "mcp-tools", "mcp-resources", "agent-integration"], source: "microsoft/skills", tags: ["mcp", "sdk"], maintenance: 98 }),
  skill({ id: "microsoft-skill-creator", name: "Microsoft Skill Creator", category: "skill-development", caps: ["skill-authoring", "skill-packaging", "agent-context"], source: "microsoft/skills", tags: ["skills", "authoring"], maintenance: 98 }),
  skill({ id: "microsoft-copilot-sdk", name: "Microsoft Copilot SDK", category: "agent-development", caps: ["copilot-sdk", "agents", "tool-use", "mcp"], source: "microsoft/skills", tags: ["microsoft", "agents"], maintenance: 98 }),
  skill({ id: "microsoft-foundry-agents", name: "Microsoft Foundry Agents", category: "agent-platform", caps: ["azure-ai-foundry", "agents", "models", "evaluations", "observability"], source: "microsoft/skills", tags: ["azure", "foundry", "ai"], permissions: ["network"], risk: "medium", cost: "medium", maintenance: 98 }),
  skill({ id: "microsoft-azure-openai", name: "Azure OpenAI Development", category: "ai-platform", caps: ["azure-openai", "models", "embeddings", "content-safety", "deployment"], source: "microsoft/skills", tags: ["azure", "openai"], permissions: ["network"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-azure-ai-ml", name: "Azure AI/ML SDK", category: "machine-learning", caps: ["azure-ml", "training", "endpoints", "pipelines", "model-registry"], source: "microsoft/skills", tags: ["azure", "ml", "python"], stacks: ["python"], permissions: ["network"], risk: "medium", cost: "medium", maintenance: 98 }),
  skill({ id: "microsoft-cosmos-db", name: "Azure Cosmos DB Skills", category: "database", caps: ["cosmos-db", "nosql", "partitioning", "queries", "sdk"], source: "microsoft/skills", tags: ["azure", "database"], permissions: ["network", "database-read"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-key-vault", name: "Azure Key Vault Skills", category: "secrets", caps: ["key-vault", "secrets", "keys", "certificates", "identity"], source: "microsoft/skills", tags: ["azure", "security"], permissions: ["network", "secrets"], risk: "high", maintenance: 98 }),
  skill({ id: "microsoft-container-apps", name: "Azure Container Apps Skills", category: "containers", caps: ["container-apps", "deployment", "scaling", "revisions", "observability"], source: "microsoft/skills", tags: ["azure", "containers"], permissions: ["network", "deployment"], risk: "high", maintenance: 98 }),
  skill({ id: "microsoft-aks", name: "Azure Kubernetes Service Skills", category: "kubernetes", caps: ["aks", "kubernetes", "deployment", "cluster-operations"], source: "microsoft/skills", tags: ["azure", "kubernetes"], permissions: ["network", "deployment"], risk: "high", cost: "medium", maintenance: 98 }),
  skill({ id: "microsoft-azure-functions", name: "Azure Functions Skills", category: "serverless", caps: ["azure-functions", "serverless", "triggers", "deployment"], source: "microsoft/skills", tags: ["azure", "functions"], permissions: ["network", "deployment"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-azure-storage", name: "Azure Storage Skills", category: "storage", caps: ["blob-storage", "queues", "files", "data-lake"], source: "microsoft/skills", tags: ["azure", "storage"], permissions: ["network"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-service-bus", name: "Azure Service Bus Skills", category: "messaging", caps: ["service-bus", "queues", "topics", "messaging"], source: "microsoft/skills", tags: ["azure", "messaging"], permissions: ["network"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-event-hubs", name: "Azure Event Hubs Skills", category: "streaming", caps: ["event-hubs", "streaming", "event-ingestion", "sdk"], source: "microsoft/skills", tags: ["azure", "streaming"], permissions: ["network"], risk: "medium", maintenance: 98 }),
  skill({ id: "microsoft-azure-monitor", name: "Azure Monitor Skills", category: "observability", caps: ["azure-monitor", "logs", "metrics", "tracing", "alerts"], source: "microsoft/skills", tags: ["azure", "observability"], permissions: ["network"], risk: "medium", maintenance: 98 }),

  // MongoDB official skill family and Atlas MCP.
  skill({ id: "mongodb-agent-skills", name: "MongoDB Agent Skills", category: "database", caps: ["mongodb", "schema-design", "queries", "query-optimization", "atlas-search", "vector-search"], source: "mongodb/agent-skills", tags: ["mongodb", "atlas", "database"], license: "Apache-2.0", maintenance: 98, cost: "medium" }),
  skill({ id: "mongodb-schema-design", name: "MongoDB Schema Design", category: "database-design", caps: ["mongodb", "schema-design", "data-modeling"], source: "mongodb/agent-skills", tags: ["mongodb", "schema"], license: "Apache-2.0", maintenance: 98 }),
  skill({ id: "mongodb-query-optimization", name: "MongoDB Query Optimization", category: "database-performance", caps: ["mongodb", "queries", "indexes", "query-performance"], source: "mongodb/agent-skills", tags: ["mongodb", "performance"], license: "Apache-2.0", maintenance: 98 }),
  skill({ id: "mongodb-atlas-search", name: "MongoDB Atlas Search", category: "search", caps: ["atlas-search", "full-text-search", "indexes"], source: "mongodb/agent-skills", tags: ["mongodb", "search"], license: "Apache-2.0", maintenance: 98 }),
  skill({ id: "mongodb-vector-search", name: "MongoDB Atlas Vector Search", category: "vector-database", caps: ["vector-search", "rag", "embeddings", "mongodb"], source: "mongodb/agent-skills", tags: ["mongodb", "rag", "vector"], license: "Apache-2.0", maintenance: 98 }),
  mcp({ id: "mongodb-atlas-mcp", name: "MongoDB Atlas MCP", category: "database-mcp", caps: ["mongodb", "atlas", "database-tools", "schema", "queries"], source: "mongodb/agent-skills", tags: ["mongodb", "mcp"], license: "Apache-2.0", permissions: ["network", "database-read"], risk: "medium", maintenance: 98 }),

  // Expo official skills (framework leaves and EAS service leaves stay individually routable).
  skill({ id: "expo-overview", name: "Expo Overview", category: "mobile", caps: ["expo", "routing", "mobile-architecture", "skill-routing"], source: "expo/skills", tags: ["expo", "react-native"], stacks: ["expo", "react-native"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-project-structure", name: "Expo Project Structure", category: "mobile-architecture", caps: ["expo", "project-structure", "mobile-architecture"], source: "expo/skills", tags: ["expo", "architecture"], stacks: ["expo"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-router", name: "Expo Router", category: "mobile-navigation", caps: ["expo-router", "navigation", "native-tabs", "modals", "routing"], source: "expo/skills", tags: ["expo", "navigation"], stacks: ["expo", "react-native"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-animation", name: "Expo Animation", category: "mobile-animation", caps: ["reanimated", "gestures", "mobile-animation", "haptics"], source: "expo/skills", tags: ["expo", "animation"], stacks: ["expo", "react-native"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-native-ui", name: "Expo Native UI", category: "mobile-ui", caps: ["native-ui", "mobile-design", "semantic-colors", "native-controls"], source: "expo/skills", tags: ["expo", "ui"], stacks: ["expo", "react-native"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-upgrade", name: "Expo SDK Upgrade", category: "mobile-upgrade", caps: ["expo-upgrade", "dependency-migration", "react-native-upgrade"], source: "expo/skills", tags: ["expo", "upgrade"], stacks: ["expo"], license: "MIT", maintenance: 99 }),
  skill({ id: "expo-app-clip", name: "Expo App Clip", category: "mobile-platform", caps: ["ios-app-clip", "associated-domains", "ios"], source: "expo/skills", tags: ["expo", "ios"], stacks: ["expo", "ios"], license: "MIT", maintenance: 99 }),
  skill({ id: "eas-app-stores", name: "EAS App Stores", category: "mobile-release", caps: ["app-store", "play-store", "testflight", "mobile-release"], source: "expo/skills", tags: ["expo", "eas", "release"], stacks: ["expo", "react-native"], permissions: ["network", "deployment"], risk: "high", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-hosting", name: "EAS Hosting", category: "deployment", caps: ["eas-hosting", "web-hosting", "api-routes", "domains"], source: "expo/skills", tags: ["expo", "hosting"], stacks: ["expo", "web"], permissions: ["network", "deployment"], risk: "medium", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-workflows", name: "EAS Workflows", category: "ci-cd", caps: ["eas-workflows", "mobile-ci", "build-automation"], source: "expo/skills", tags: ["expo", "ci"], stacks: ["expo", "react-native"], permissions: ["network", "deployment"], risk: "medium", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-update", name: "EAS Update", category: "mobile-release", caps: ["ota-updates", "rollout", "runtime-compatibility", "mobile-release"], source: "expo/skills", tags: ["expo", "ota"], stacks: ["expo"], permissions: ["network", "deployment"], risk: "high", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-update-insights", name: "EAS Update Insights", category: "mobile-observability", caps: ["update-health", "crash-rate", "rollout-gates", "mobile-metrics"], source: "expo/skills", tags: ["expo", "observability"], stacks: ["expo"], permissions: ["network"], risk: "medium", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-observe", name: "EAS Observe", category: "mobile-observability", caps: ["mobile-observability", "launch-metrics", "events", "versions"], source: "expo/skills", tags: ["expo", "observe"], stacks: ["expo"], permissions: ["network"], risk: "medium", license: "MIT", maintenance: 99 }),
  skill({ id: "eas-simulator", name: "EAS Simulator", category: "device-testing", caps: ["remote-simulator", "android-emulator", "ios-simulator", "mobile-qa"], source: "expo/skills", tags: ["expo", "device", "qa"], stacks: ["expo", "react-native"], permissions: ["network", "browser"], risk: "medium", license: "MIT", maintenance: 99 }),

  // Hugging Face official skills.
  skill({ id: "hf-cli", name: "Hugging Face CLI", category: "ml-platform", caps: ["huggingface-hub", "models", "datasets", "spaces", "jobs", "repos"], source: "huggingface/skills", tags: ["huggingface", "ml"], permissions: ["network", "shell"], risk: "medium", maintenance: 99 }),
  skill({ id: "huggingface-datasets", name: "Hugging Face Datasets", category: "datasets", caps: ["datasets", "dataset-viewer", "parquet", "filtering", "agent-traces"], source: "huggingface/skills", tags: ["huggingface", "data"], permissions: ["network"], risk: "medium", maintenance: 99 }),
  skill({ id: "huggingface-llm-trainer", name: "Hugging Face LLM Trainer", category: "ml-training", caps: ["llm-training", "sft", "dpo", "grpo", "reward-modeling", "gguf"], source: "huggingface/skills", tags: ["huggingface", "training"], permissions: ["network", "shell"], risk: "medium", cost: "large", maintenance: 99 }),
  skill({ id: "huggingface-vision-trainer", name: "Hugging Face Vision Trainer", category: "vision", caps: ["vision-training", "object-detection", "image-classification", "segmentation"], source: "huggingface/skills", tags: ["huggingface", "vision"], permissions: ["network", "shell"], risk: "medium", cost: "large", maintenance: 99 }),
  skill({ id: "huggingface-community-evals", name: "Hugging Face Community Evals", category: "ai-evals", caps: ["model-evaluation", "benchmarks", "lighteval", "inspect-ai"], source: "huggingface/skills", tags: ["huggingface", "evals"], permissions: ["network", "shell"], risk: "medium", maintenance: 99 }),
  skill({ id: "huggingface-trackio", name: "Hugging Face Trackio", category: "ml-observability", caps: ["experiment-tracking", "training-metrics", "ml-observability"], source: "huggingface/skills", tags: ["huggingface", "tracking"], permissions: ["network"], risk: "medium", maintenance: 99 }),
  skill({ id: "huggingface-gradio", name: "Hugging Face Gradio", category: "ml-ui", caps: ["gradio", "ml-demo", "web-ui"], source: "huggingface/skills", tags: ["huggingface", "gradio"], stacks: ["python"], maintenance: 99 }),
  skill({ id: "huggingface-transformers-js", name: "Transformers.js", category: "browser-ml", caps: ["transformers-js", "webgpu", "wasm", "browser-ml"], source: "huggingface/skills", tags: ["huggingface", "javascript", "ml"], stacks: ["javascript", "typescript", "web"], maintenance: 99 }),
  skill({ id: "huggingface-sentence-transformers", name: "Sentence Transformers Training", category: "embeddings", caps: ["embeddings", "reranking", "retrieval", "sentence-transformers"], source: "huggingface/skills", tags: ["huggingface", "embeddings"], permissions: ["network", "shell"], risk: "medium", cost: "medium", maintenance: 99 }),
  skill({ id: "huggingface-trl-training", name: "TRL Training", category: "ml-training", caps: ["trl", "llm-finetuning", "preference-optimization", "rlhf"], source: "huggingface/skills", tags: ["huggingface", "trl"], permissions: ["network", "shell"], risk: "medium", cost: "large", maintenance: 99 }),
  skill({ id: "huggingface-tool-builder", name: "Hugging Face Tool Builder", category: "tool-development", caps: ["hf-api", "tool-building", "automation"], source: "huggingface/skills", tags: ["huggingface", "tools"], permissions: ["network", "filesystem-write"], risk: "medium", maintenance: 99 }),
  skill({ id: "huggingface-model-selection", name: "Hugging Face Model Selection", category: "model-selection", caps: ["model-selection", "benchmarks", "model-comparison"], source: "huggingface/skills", tags: ["huggingface", "models"], permissions: ["network"], risk: "medium", maintenance: 99 }),
  mcp({ id: "huggingface-mcp", name: "Hugging Face MCP", category: "ml-mcp", caps: ["huggingface-hub", "model-discovery", "datasets", "spaces", "mcp"], source: "huggingface/skills", tags: ["huggingface", "mcp"], permissions: ["network"], risk: "medium", maintenance: 99 }),

  // Neon official skill family.
  skill({ id: "neon-agent-skills", name: "Neon Agent Skills", category: "database", caps: ["neon", "postgres", "branching", "autoscaling", "restore", "replicas", "search"], source: "neondatabase/agent-skills", tags: ["neon", "postgres"], license: "Apache-2.0", maintenance: 98, cost: "medium" }),
  skill({ id: "neon-postgres-skill", name: "Neon Postgres", category: "database", caps: ["postgres", "neon", "branching", "migrations", "restore", "replication"], source: "neondatabase/agent-skills", tags: ["neon", "postgres"], license: "Apache-2.0", permissions: ["network", "database-read"], risk: "medium", maintenance: 98 }),
  skill({ id: "neon-functions-skill", name: "Neon Functions", category: "serverless", caps: ["neon-functions", "http-handlers", "websockets", "sse", "webhooks", "cron"], source: "neondatabase/agent-skills", tags: ["neon", "functions"], stacks: ["javascript", "typescript"], license: "Apache-2.0", permissions: ["network", "deployment"], risk: "high", maintenance: 98 }),
  skill({ id: "neon-auth-skill", name: "Neon Auth", category: "auth", caps: ["auth", "better-auth", "oauth", "mfa", "passkeys", "organizations"], source: "neondatabase/agent-skills", tags: ["neon", "auth"], license: "Apache-2.0", permissions: ["network"], risk: "medium", maintenance: 98 }),
  mcp({ id: "neon-mcp", name: "Neon MCP", category: "database-mcp", caps: ["neon", "postgres", "database-tools", "branching"], source: "neondatabase/agent-skills", tags: ["neon", "mcp"], license: "Apache-2.0", permissions: ["network", "database-read"], risk: "medium", maintenance: 98 }),

  // Callstack React Native production skills.
  skill({ id: "callstack-react-native-best-practices", name: "Callstack React Native Best Practices", category: "mobile-performance", caps: ["react-native", "performance", "fps", "startup", "memory", "bundle-size"], source: "callstackincubator/agent-skills", tags: ["react-native", "performance"], stacks: ["react-native"], license: "MIT", maintenance: 96, cost: "medium" }),
  skill({ id: "callstack-react-navigation", name: "Callstack React Navigation", category: "mobile-navigation", caps: ["react-navigation", "stacks", "tabs", "drawers", "sheets"], source: "callstackincubator/agent-skills", tags: ["react-native", "navigation"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-rn-tv", name: "Callstack React Native TV", category: "tv-apps", caps: ["react-native-tv", "focus", "remote-input", "playback", "tv-accessibility"], source: "callstackincubator/agent-skills", tags: ["react-native", "tv"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-rn-library", name: "Callstack React Native Library", category: "mobile-library", caps: ["react-native-library", "native-modules", "native-views", "package-authoring"], source: "callstackincubator/agent-skills", tags: ["react-native", "library"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-rn-upgrade", name: "Callstack React Native Upgrade", category: "mobile-upgrade", caps: ["react-native-upgrade", "dependency-migration", "native-project-upgrade"], source: "callstackincubator/agent-skills", tags: ["react-native", "upgrade"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-rn-testing", name: "Callstack React Native Testing", category: "mobile-testing", caps: ["react-native-testing", "rtl", "unit-test", "integration-test"], source: "callstackincubator/agent-skills", tags: ["react-native", "testing"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-agent-device", name: "Callstack Agent Device", category: "device-testing", caps: ["device-automation", "screenshots", "logs", "mobile-qa", "performance"], source: "callstackincubator/agent-skills", tags: ["react-native", "device", "qa"], stacks: ["react-native"], permissions: ["shell"], risk: "medium", license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-dogfood", name: "Callstack Dogfood QA", category: "mobile-qa", caps: ["exploratory-qa", "smoke-test", "bug-hunt", "walkthrough"], source: "callstackincubator/agent-skills", tags: ["react-native", "qa"], stacks: ["react-native"], license: "MIT", maintenance: 96 }),
  skill({ id: "callstack-rn-migration-assessment", name: "Callstack React Native Migration Assessment", category: "mobile-migration", caps: ["migration-assessment", "react-native", "brownfield-plan"], source: "callstackincubator/agent-skills", tags: ["react-native", "migration"], license: "MIT", maintenance: 96, cost: "medium" }),
  skill({ id: "callstack-rn-brownfield", name: "Callstack React Native Brownfield Migration", category: "mobile-migration", caps: ["brownfield-migration", "react-native", "native-integration"], source: "callstackincubator/agent-skills", tags: ["react-native", "brownfield"], stacks: ["react-native", "android", "ios"], license: "MIT", maintenance: 96, cost: "medium" }),

  // Sentry engineering skills and production troubleshooting source.
  skill({ id: "sentry-code-review", name: "Sentry Code Review", category: "code-review", caps: ["code-review", "maintainability", "engineering-practices"], source: "getsentry/skills", tags: ["sentry", "review"], trust: "maintainer", maintenance: 95 }),
  skill({ id: "sentry-code-simplifier", name: "Sentry Code Simplifier", category: "refactor", caps: ["simplification", "refactor", "behavior-preservation"], source: "getsentry/skills", tags: ["sentry", "refactor"], trust: "maintainer", maintenance: 95 }),
  skill({ id: "sentry-django-access-review", name: "Sentry Django Access Review", category: "security-review", caps: ["django", "access-control", "idor", "security-review"], source: "getsentry/skills", tags: ["sentry", "django", "security"], stacks: ["django", "python"], trust: "maintainer", maintenance: 95 }),
  skill({ id: "sentry-django-performance-review", name: "Sentry Django Performance Review", category: "performance", caps: ["django", "performance", "query-review"], source: "getsentry/skills", tags: ["sentry", "django", "performance"], stacks: ["django", "python"], trust: "maintainer", maintenance: 95 }),
  skill({ id: "sentry-agent-settings-audit", name: "Sentry Agent Settings Audit", category: "agent-security", caps: ["agent-permissions", "settings-audit", "least-privilege"], source: "getsentry/skills", tags: ["sentry", "agents", "security"], trust: "maintainer", maintenance: 95 }),
  skill({ id: "sentry-production-ai", name: "Sentry for AI Production Debugging", category: "observability", caps: ["sentry", "production-debugging", "errors", "traces", "performance"], source: "getsentry/sentry-for-ai", tags: ["sentry", "production"], trust: "official", permissions: ["network"], risk: "medium", maintenance: 98 }),
  mcp({ id: "sentry-mcp", name: "Sentry MCP", category: "observability-mcp", caps: ["sentry", "errors", "issues", "traces", "production-debugging"], source: "getsentry/sentry-for-ai", tags: ["sentry", "mcp"], trust: "official", permissions: ["network"], risk: "medium", maintenance: 98 }),

  // Large metadata/discovery feeds. These are intentionally not executable package trust grants.
  skill({ id: "skills-sh-directory", name: "skills.sh Directory", category: "skill-discovery", caps: ["skill-discovery", "agent-skills", "community-catalog"], source: "https://skills.sh", sourceType: "website", tags: ["skills", "directory"], trust: "community", channel: "edge", cost: "tiny", maturity: 90, maintenance: 98 }),
  skill({ id: "voltagent-awesome-agent-skills", name: "Awesome Agent Skills", category: "skill-discovery", caps: ["skill-discovery", "official-sources", "community-sources"], source: "VoltAgent/awesome-agent-skills", tags: ["skills", "curated"], trust: "community", channel: "edge", cost: "tiny", maturity: 85, maintenance: 95 }),
  mcp({ id: "mcp-official-registry-feed", name: "Official MCP Registry Feed", category: "mcp-discovery", caps: ["mcp-discovery", "server-metadata", "connector-discovery"], source: "registry.modelcontextprotocol.io", sourceType: "official-registry", tags: ["mcp", "registry"], trust: "official", permissions: ["network"], maintenance: 99 }),

  // DockyardOS specialist role expansion. These are bounded role definitions, not extra models loaded all at once.
  dockAgent("product-manager-agent", "Product Manager", "product", ["requirements", "prioritization", "acceptance-criteria", "scope-control"], ["product", "planning"]),
  dockAgent("domain-analyst-agent", "Domain Analyst", "research", ["domain-analysis", "constraints", "terminology", "requirements"], ["research", "domain"]),
  dockAgent("solution-architect-agent", "Solution Architect", "architecture", ["architecture", "tradeoffs", "integration-design", "nonfunctional-requirements"], ["architecture"]),
  dockAgent("cloud-architect-agent", "Cloud Architect", "cloud", ["cloud-architecture", "provider-selection", "resilience", "cost"], ["cloud", "architecture"]),
  dockAgent("data-architect-agent", "Data Architect", "data", ["data-modeling", "schema", "data-flows", "retention"], ["data", "architecture"]),
  dockAgent("ai-architect-agent", "AI Architect", "ai", ["ai-architecture", "model-routing", "rag", "evals", "guardrails"], ["ai", "architecture"], "medium"),
  dockAgent("mcp-architect-agent", "MCP Architect", "mcp-development", ["mcp-server", "tool-design", "resource-design", "permission-boundaries"], ["mcp", "architecture"]),
  dockAgent("mcp-reviewer-agent", "MCP Reviewer", "mcp-review", ["mcp-review", "tool-contracts", "security-review", "context-efficiency"], ["mcp", "review"]),
  dockAgent("sdk-agent", "SDK Engineer", "sdk", ["sdk-design", "client-libraries", "versioning", "examples"], ["sdk", "api"]),
  dockAgent("cli-agent", "CLI Engineer", "cli", ["cli", "command-design", "automation", "cross-platform"], ["cli"]),
  dockAgent("payments-agent", "Payments Engineer", "payments", ["payments", "checkout", "webhooks", "idempotency"], ["payments", "backend"]),
  dockAgent("auth-agent", "Identity & Auth Engineer", "auth", ["authentication", "authorization", "oauth", "session-security", "mfa"], ["auth", "security"]),
  dockAgent("privacy-agent", "Privacy Engineer", "privacy", ["privacy", "data-minimization", "retention", "consent"], ["privacy", "security"]),
  dockAgent("supply-chain-security-agent", "Supply-chain Security Reviewer", "supply-chain-security", ["dependencies", "provenance", "sbom", "signing", "ci-security"], ["security", "supply-chain"]),
  dockAgent("threat-model-agent", "Threat Modeler", "security-architecture", ["threat-model", "attack-surface", "trust-boundaries", "abuse-cases"], ["security", "threat-model"]),
  dockAgent("secrets-reviewer-agent", "Secrets Reviewer", "secrets", ["secret-scan", "credential-boundaries", "rotation-plan"], ["security", "secrets"]),
  dockAgent("dependency-security-agent", "Dependency Security Reviewer", "dependencies", ["dependency-scan", "advisories", "upgrade-plan", "sbom"], ["security", "dependencies"]),
  dockAgent("frontend-reviewer-agent", "Frontend Reviewer", "frontend-review", ["frontend-review", "ui-correctness", "performance", "accessibility"], ["frontend", "review"]),
  dockAgent("backend-reviewer-agent", "Backend Reviewer", "backend-review", ["backend-review", "api", "concurrency", "data-integrity"], ["backend", "review"]),
  dockAgent("database-rls-reviewer-agent", "Database & RLS Reviewer", "database-review", ["database-review", "rls", "migrations", "query-performance"], ["database", "security"]),
  dockAgent("api-contract-agent", "API Contract Reviewer", "api-review", ["openapi", "api-contract", "backward-compatibility", "error-model"], ["api", "review"]),
  dockAgent("data-engineer-agent", "Data Engineer", "data-engineering", ["etl", "elt", "pipelines", "data-quality", "warehousing"], ["data", "pipelines"]),
  dockAgent("ml-engineer-agent", "ML Engineer", "machine-learning", ["training", "inference", "datasets", "model-packaging"], ["ml"]),
  dockAgent("evals-agent", "AI Evals Engineer", "ai-evals", ["evals", "benchmarks", "regression", "quality-gates"], ["ai", "evals"]),
  dockAgent("rag-agent", "RAG Engineer", "rag", ["rag", "retrieval", "chunking", "embeddings", "reranking"], ["ai", "rag"]),
  dockAgent("prompt-safety-agent", "Prompt Safety Reviewer", "ai-security", ["prompt-injection", "tool-safety", "data-exfiltration", "guardrails"], ["ai", "security"]),
  dockAgent("red-team-agent", "Application Red Team Reviewer", "security-testing", ["abuse-testing", "adversarial-review", "exploit-validation"], ["security", "red-team"]),
  dockAgent("infra-agent", "Infrastructure Engineer", "infrastructure", ["infrastructure", "iac", "networking", "deployment"], ["infra", "devops"]),
  dockAgent("kubernetes-agent", "Kubernetes Engineer", "kubernetes", ["kubernetes", "helm", "deployment", "cluster-operations"], ["kubernetes", "devops"]),
  dockAgent("terraform-agent", "Terraform Engineer", "iac", ["terraform", "iac", "plan-review", "state-safety"], ["terraform", "devops"]),
  dockAgent("cloudflare-agent", "Cloudflare Engineer", "edge", ["workers", "dns", "waf", "r2", "d1"], ["cloudflare", "edge"]),
  dockAgent("aws-agent", "AWS Engineer", "cloud", ["aws", "iam", "serverless", "containers", "observability"], ["aws", "cloud"]),
  dockAgent("azure-agent", "Azure Engineer", "cloud", ["azure", "identity", "containers", "serverless", "observability"], ["azure", "cloud"]),
  dockAgent("gcp-agent", "Google Cloud Engineer", "cloud", ["gcp", "cloud-run", "iam", "storage", "observability"], ["gcp", "cloud"]),
  dockAgent("incident-agent", "Incident Investigator", "incident-response", ["incident-response", "triage", "timeline", "root-cause", "mitigation"], ["sre", "incident"]),
  dockAgent("sre-agent", "Site Reliability Engineer", "sre", ["slo", "reliability", "capacity", "runbooks", "incident-readiness"], ["sre", "reliability"]),
  dockAgent("cost-agent", "Cloud Cost Reviewer", "finops", ["cost", "resource-efficiency", "free-tier", "capacity"], ["finops", "cloud"]),
  dockAgent("release-manager-agent", "Release Manager", "release", ["release-plan", "changelog", "rollback", "coordination"], ["release"]),
  dockAgent("migration-planner-agent", "Migration Planner", "migration", ["migration-plan", "compatibility", "cutover", "rollback"], ["migration"]),
  dockAgent("migration-verifier-agent", "Migration Verifier", "migration-review", ["migration-verification", "data-integrity", "rollback-verification"], ["migration", "review"]),
  dockAgent("i18n-agent", "Internationalization Reviewer", "i18n", ["i18n", "localization", "rtl", "locale-routing"], ["i18n"]),
  dockAgent("seo-agent", "SEO & Metadata Reviewer", "seo", ["seo", "metadata", "structured-data", "crawlability"], ["seo", "web"]),
  dockAgent("docs-agent", "Documentation Engineer", "documentation", ["documentation", "api-docs", "tutorials", "reference"], ["docs"]),
  dockAgent("technical-writer-agent", "Technical Writer", "documentation", ["technical-writing", "guides", "release-notes", "clarity"], ["docs", "writing"]),
  dockAgent("dx-agent", "Developer Experience Reviewer", "developer-experience", ["dx", "onboarding", "errors", "tooling", "examples"], ["dx", "developer-tools"]),
  dockAgent("desktop-agent", "Desktop App Engineer", "desktop", ["desktop-app", "electron", "tauri", "native-integration"], ["desktop"]),
  dockAgent("extension-agent", "IDE Extension Engineer", "extensions", ["vscode-extension", "ide-extension", "commands", "webviews"], ["extensions", "vscode"]),
  dockAgent("browser-extension-agent", "Browser Extension Engineer", "browser-extension", ["browser-extension", "manifest-v3", "content-scripts", "permissions"], ["browser", "extension"]),
  dockAgent("game-agent", "Game Systems Engineer", "game-development", ["gameplay", "state", "multiplayer", "performance"], ["game"]),
  dockAgent("three-d-agent", "3D/WebGL Engineer", "3d", ["threejs", "webgl", "r3f", "3d-performance"], ["3d", "webgl"]),
  dockAgent("accessibility-reviewer-agent", "Accessibility Reviewer", "accessibility", ["wcag", "a11y", "keyboard", "screen-reader", "contrast"], ["accessibility", "review"]),
  dockAgent("performance-reviewer-agent", "Performance Reviewer", "performance", ["profiling", "latency", "memory", "bundle", "regression"], ["performance", "review"]),
  dockAgent("mobile-qa-agent", "Mobile QA Reviewer", "mobile-qa", ["mobile-qa", "device-matrix", "smoke-test", "regression"], ["mobile", "qa"]),
  dockAgent("device-automation-agent", "Device Automation Engineer", "device-testing", ["device-automation", "emulator", "simulator", "screenshots", "logs"], ["mobile", "automation"]),
  dockAgent("compliance-agent", "Compliance Evidence Reviewer", "compliance", ["controls", "evidence", "auditability", "policy-mapping"], ["compliance", "security"]),
  dockAgent("data-privacy-agent", "Data Privacy Reviewer", "privacy", ["pii", "data-minimization", "retention", "data-flow-review"], ["privacy", "data"]),
  dockAgent("monorepo-agent", "Monorepo Engineer", "monorepo", ["monorepo", "workspace", "build-graph", "dependency-boundaries"], ["monorepo", "build"]),
  dockAgent("dependency-upgrade-agent", "Dependency Upgrade Engineer", "dependencies", ["dependency-upgrade", "compatibility", "codemod", "regression"], ["dependencies", "upgrade"]),
  dockAgent("websocket-agent", "Realtime/WebSocket Engineer", "realtime", ["websocket", "realtime", "presence", "reconnect", "backpressure"], ["realtime", "backend"]),
  dockAgent("search-agent", "Search Engineer", "search", ["full-text-search", "ranking", "indexing", "search-quality"], ["search"]),
  dockAgent("vector-search-agent", "Vector Search Engineer", "vector-database", ["vector-search", "embeddings", "indexing", "retrieval"], ["vector", "ai"]),
  dockAgent("data-quality-agent", "Data Quality Reviewer", "data-quality", ["data-quality", "validation", "lineage", "anomaly-detection"], ["data", "quality"]),
];
