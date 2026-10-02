import type { ProviderDefinition } from "./types.js";

export const expandedProviders: ProviderDefinition[] = [
  // General cloud and application platforms.
  { id: "aws", displayName: "Amazon Web Services", capabilities: ["containers", "services", "serverless", "functions", "object-storage", "cdn", "dns", "waf", "ddos", "postgres", "database", "queues", "secrets", "observability", "ai-models"], connectionKinds: ["api", "cli", "sdk", "mcp"], tags: ["aws", "cloud", "enterprise"], requiresLiveAvailabilityCheck: true },
  { id: "azure", displayName: "Microsoft Azure", capabilities: ["containers", "services", "serverless", "functions", "object-storage", "cdn", "dns", "waf", "postgres", "database", "queues", "secrets", "observability", "ai-models"], connectionKinds: ["api", "cli", "sdk", "mcp"], tags: ["azure", "microsoft", "cloud", "enterprise"], requiresLiveAvailabilityCheck: true },
  { id: "gcp", displayName: "Google Cloud", capabilities: ["containers", "services", "serverless", "functions", "object-storage", "cdn", "dns", "waf", "postgres", "database", "queues", "secrets", "observability", "ai-models"], connectionKinds: ["api", "cli", "sdk"], tags: ["google", "gcp", "cloud", "enterprise"], requiresLiveAvailabilityCheck: true },
  { id: "digitalocean", displayName: "DigitalOcean", capabilities: ["web-hosting", "services", "containers", "object-storage", "postgres", "database", "cdn", "dns"], connectionKinds: ["api", "cli", "sdk"], tags: ["hosting", "cloud", "backend"], requiresLiveAvailabilityCheck: true },
  { id: "netlify", displayName: "Netlify", capabilities: ["web-hosting", "static-hosting", "preview-deployments", "serverless", "functions", "domains"], connectionKinds: ["api", "cli", "sdk"], tags: ["web", "hosting", "jamstack"], requiresLiveAvailabilityCheck: true },
  { id: "koyeb", displayName: "Koyeb", capabilities: ["web-hosting", "services", "containers", "serverless", "postgres"], connectionKinds: ["api", "cli"], tags: ["hosting", "backend", "containers"], requiresLiveAvailabilityCheck: true },

  // Managed databases, caches, search and vector stores.
  { id: "mongodb-atlas", displayName: "MongoDB Atlas", capabilities: ["document-database", "database", "full-text-search", "vector-database", "database-branching"], connectionKinds: ["mcp", "api", "cli", "sdk"], tags: ["mongodb", "database", "search", "vector"], requiresLiveAvailabilityCheck: true },
  { id: "planetscale", displayName: "PlanetScale", capabilities: ["mysql", "database", "database-branching"], connectionKinds: ["api", "cli", "sdk"], tags: ["mysql", "database", "serverless"], requiresLiveAvailabilityCheck: true },
  { id: "cockroachdb", displayName: "CockroachDB Cloud", capabilities: ["postgres-compatible", "database", "distributed-sql"], connectionKinds: ["api", "cli", "sdk"], tags: ["database", "sql", "distributed"], requiresLiveAvailabilityCheck: true },
  { id: "upstash", displayName: "Upstash", capabilities: ["redis", "cache", "queues", "rate-limiting", "vector-database"], connectionKinds: ["api", "cli", "sdk"], tags: ["redis", "serverless", "cache"], requiresLiveAvailabilityCheck: true },
  { id: "redis-cloud", displayName: "Redis Cloud", capabilities: ["redis", "cache", "vector-database", "realtime"], connectionKinds: ["api", "cli", "sdk"], tags: ["redis", "cache", "database"], requiresLiveAvailabilityCheck: true },
  { id: "pinecone", displayName: "Pinecone", capabilities: ["vector-database", "semantic-search", "rag"], connectionKinds: ["api", "sdk"], tags: ["vector", "rag", "ai"], requiresLiveAvailabilityCheck: true },
  { id: "qdrant-cloud", displayName: "Qdrant Cloud", capabilities: ["vector-database", "semantic-search", "rag"], connectionKinds: ["api", "cli", "sdk"], tags: ["vector", "rag", "database"], requiresLiveAvailabilityCheck: true },
  { id: "weaviate-cloud", displayName: "Weaviate Cloud", capabilities: ["vector-database", "semantic-search", "rag", "hybrid-search"], connectionKinds: ["api", "sdk"], tags: ["vector", "rag", "database"], requiresLiveAvailabilityCheck: true },

  // Auth and identity fallbacks.
  { id: "clerk", displayName: "Clerk", capabilities: ["auth", "identity", "organizations", "user-management", "mfa"], connectionKinds: ["api", "sdk"], tags: ["auth", "identity", "web"], requiresLiveAvailabilityCheck: true },
  { id: "auth0", displayName: "Auth0", capabilities: ["auth", "identity", "organizations", "user-management", "mfa"], connectionKinds: ["api", "cli", "sdk"], tags: ["auth", "identity", "enterprise"], requiresLiveAvailabilityCheck: true },
  { id: "workos", displayName: "WorkOS", capabilities: ["auth", "identity", "sso", "directory-sync", "organizations"], connectionKinds: ["api", "sdk"], tags: ["auth", "enterprise", "sso"], requiresLiveAvailabilityCheck: true },
  { id: "keycloak", displayName: "Keycloak", capabilities: ["auth", "identity", "sso", "mfa", "self-hosted-auth"], connectionKinds: ["api", "cli"], tags: ["auth", "self-hostable", "enterprise"], requiresLiveAvailabilityCheck: true },

  // Object storage and media.
  { id: "backblaze-b2", displayName: "Backblaze B2", capabilities: ["object-storage", "s3-compatible-storage", "backup"], connectionKinds: ["api", "cli", "sdk"], tags: ["storage", "s3", "backup"], requiresLiveAvailabilityCheck: true },
  { id: "minio", displayName: "MinIO", capabilities: ["object-storage", "s3-compatible-storage", "self-hosted-storage"], connectionKinds: ["api", "cli", "sdk"], tags: ["storage", "s3", "self-hostable"], requiresLiveAvailabilityCheck: true },
  { id: "cloudinary", displayName: "Cloudinary", capabilities: ["media-storage", "image-processing", "video-processing", "cdn"], connectionKinds: ["api", "cli", "sdk"], tags: ["media", "images", "cdn"], requiresLiveAvailabilityCheck: true },

  // Observability, product analytics and incident response.
  { id: "grafana-cloud", displayName: "Grafana Cloud", capabilities: ["metrics", "logs", "tracing", "dashboards", "alerts", "observability"], connectionKinds: ["api", "cli", "sdk"], tags: ["observability", "grafana", "otel"], requiresLiveAvailabilityCheck: true },
  { id: "datadog", displayName: "Datadog", capabilities: ["metrics", "logs", "tracing", "errors", "alerts", "observability"], connectionKinds: ["api", "cli", "sdk"], tags: ["observability", "apm", "enterprise"], requiresLiveAvailabilityCheck: true },
  { id: "new-relic", displayName: "New Relic", capabilities: ["metrics", "logs", "tracing", "errors", "alerts", "observability"], connectionKinds: ["api", "cli", "sdk"], tags: ["observability", "apm"], requiresLiveAvailabilityCheck: true },
  { id: "better-stack", displayName: "Better Stack", capabilities: ["logs", "uptime", "incident-management", "alerts", "observability"], connectionKinds: ["api", "sdk"], tags: ["observability", "uptime", "incident"], requiresLiveAvailabilityCheck: true },
  { id: "pagerduty", displayName: "PagerDuty", capabilities: ["incident-management", "on-call", "alerts", "operations"], connectionKinds: ["api", "sdk"], tags: ["incident", "operations", "sre"], requiresLiveAvailabilityCheck: true },
  { id: "posthog", displayName: "PostHog", capabilities: ["product-analytics", "feature-flags", "session-replay", "experiments"], connectionKinds: ["api", "sdk"], tags: ["analytics", "product", "feature-flags"], requiresLiveAvailabilityCheck: true },

  // Background jobs, events and messaging.
  { id: "inngest", displayName: "Inngest", capabilities: ["background-jobs", "workflows", "events", "queues", "scheduling"], connectionKinds: ["api", "cli", "sdk"], tags: ["jobs", "events", "serverless"], requiresLiveAvailabilityCheck: true },
  { id: "trigger-dev", displayName: "Trigger.dev", capabilities: ["background-jobs", "workflows", "scheduling", "long-running-tasks"], connectionKinds: ["api", "cli", "sdk"], tags: ["jobs", "workflows", "typescript"], requiresLiveAvailabilityCheck: true },
  { id: "confluent-cloud", displayName: "Confluent Cloud", capabilities: ["streaming", "kafka", "events", "schema-registry"], connectionKinds: ["api", "cli", "sdk"], tags: ["kafka", "streaming", "events"], requiresLiveAvailabilityCheck: true },

  // Email, messaging and communication APIs.
  { id: "resend", displayName: "Resend", capabilities: ["email", "transactional-email", "email-delivery"], connectionKinds: ["api", "sdk"], tags: ["email", "developer-tools"], requiresLiveAvailabilityCheck: true },
  { id: "postmark", displayName: "Postmark", capabilities: ["email", "transactional-email", "email-delivery"], connectionKinds: ["api", "sdk"], tags: ["email", "transactional"], requiresLiveAvailabilityCheck: true },
  { id: "sendgrid", displayName: "Twilio SendGrid", capabilities: ["email", "transactional-email", "marketing-email"], connectionKinds: ["api", "sdk"], tags: ["email", "twilio"], requiresLiveAvailabilityCheck: true },
  { id: "twilio", displayName: "Twilio", capabilities: ["sms", "voice", "whatsapp", "communications"], connectionKinds: ["api", "cli", "sdk"], tags: ["communications", "sms", "voice"], requiresLiveAvailabilityCheck: true },

  // Payments and commerce.
  { id: "stripe", displayName: "Stripe", capabilities: ["payments", "subscriptions", "billing", "checkout", "webhooks"], connectionKinds: ["api", "cli", "sdk"], tags: ["payments", "commerce", "billing"], requiresLiveAvailabilityCheck: true },
  { id: "lemonsqueezy", displayName: "Lemon Squeezy", capabilities: ["payments", "subscriptions", "billing", "digital-products"], connectionKinds: ["api", "sdk"], tags: ["payments", "commerce", "billing"], requiresLiveAvailabilityCheck: true },

  // AI/model providers. These are alternatives, not implicit defaults.
  { id: "openai", displayName: "OpenAI", capabilities: ["ai-models", "embeddings", "realtime-ai", "vision", "speech"], connectionKinds: ["api", "sdk"], tags: ["ai", "models", "embeddings"], requiresLiveAvailabilityCheck: true },
  { id: "anthropic", displayName: "Anthropic", capabilities: ["ai-models", "vision", "tool-use", "agents"], connectionKinds: ["api", "sdk"], tags: ["ai", "models", "agents"], requiresLiveAvailabilityCheck: true },
  { id: "google-ai", displayName: "Google AI / Gemini API", capabilities: ["ai-models", "embeddings", "vision", "multimodal", "agents", "image-generation", "video-generation", "veo"], connectionKinds: ["api", "sdk"], tags: ["ai", "google", "gemini", "veo", "media-generation"], requiresLiveAvailabilityCheck: true },
  { id: "huggingface", displayName: "Hugging Face", capabilities: ["ai-models", "model-hosting", "datasets", "inference", "embeddings"], connectionKinds: ["api", "cli", "sdk"], tags: ["ai", "models", "open-source"], requiresLiveAvailabilityCheck: true },
  { id: "groq", displayName: "GroqCloud", capabilities: ["ai-models", "inference"], connectionKinds: ["api", "sdk"], tags: ["ai", "inference"], requiresLiveAvailabilityCheck: true },
];
