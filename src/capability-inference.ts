export interface InferredSelectionSignals {
  capabilities: string[];
  stacks: string[];
}

type SignalRule = {
  pattern: RegExp;
  capabilities?: string[];
  stacks?: string[];
};

const RULES: SignalRule[] = [
  // Documents and artifacts.
  { pattern: /\bpdfs?\b|portable document/i, capabilities: ["pdf", "pdf-generation", "document-analysis"] },
  { pattern: /\bdocx\b|\bword document\b|microsoft word/i, capabilities: ["document-generation", "document-editing"] },
  { pattern: /\bxlsx\b|\bexcel\b|spreadsheet/i, capabilities: ["spreadsheet", "xlsx"] },
  { pattern: /\bpptx\b|powerpoint|slide deck|presentation/i, capabilities: ["presentation", "slides"] },

  // UI, design and browser quality.
  { pattern: /\bfigma\b|figjam/i, capabilities: ["figma", "design-context", "design-tokens"], stacks: ["web"] },
  { pattern: /\bshadcn(?:\/ui)?\b/i, capabilities: ["shadcn", "ui-components"], stacks: ["web", "react"] },
  { pattern: /\bui\b|\bux\b|user interface|user experience|design system|design tokens/i, capabilities: ["ui-ux", "design-system"] },
  { pattern: /\binspo\b|inspiration|reference (?:site|sites|website|websites|design|designs)|design reference|visual reference/i, capabilities: ["design-inspiration", "visual-reference", "macrostructure"], stacks: ["web"] },
  { pattern: /anti[- ]?slop|ai[- ]generated look|ai[- ]looking|generic ai|not look ai|premium (?:ui|website|web|landing)|creative (?:ui|website|web|landing)|design taste|taste skill/i, capabilities: ["anti-slop", "visual-direction", "design-taste", "ui-design"], stacks: ["web"] },
  { pattern: /playwright|browser qa|browser test|e2e|end[- ]to[- ]end|screenshot test|visual regression/i, capabilities: ["browser-automation", "e2e", "screenshots"] },
  { pattern: /accessibilit|\ba11y\b|\bwcag\b/i, capabilities: ["accessibility", "wcag"] },
  { pattern: /lighthouse|core web vitals|web performance/i, capabilities: ["performance", "lighthouse", "core-web-vitals"] },
  { pattern: /3d (?:website|web|landing|experience)|three\.?js|react[- ]three[- ]fiber|\br3f\b|\bwebgl\b/i, capabilities: ["3d-web", "threejs", "r3f", "webgl", "responsive-3d"], stacks: ["web", "react", "threejs", "r3f"] },
  { pattern: /2\.5d|frame[- ]sequence|image[- ]sequence|scroll[- ](?:driven|scrubbed).*frames?|video[- ]to[- ]frames/i, capabilities: ["2.5d", "frame-sequence", "video-to-frames", "scroll-scrubbing"], stacks: ["web"] },
  { pattern: /cinematic (?:website|web|landing|experience)|scroll storytelling|scroll[- ]story/i, capabilities: ["cinematic-web", "motion-design", "scroll-storytelling", "visual-direction"], stacks: ["web"] },
  { pattern: /video generation|generate (?:a )?video|google veo|\bveo(?: 3\.1)?\b|image[- ]to[- ]video/i, capabilities: ["video-generation", "model-selection", "google-veo", "image-to-video"], stacks: ["google-ai"] },

  // Common web and mobile stacks.
  { pattern: /website|web app|webpage|landing page|marketing page|portfolio/i, stacks: ["web"] },
  { pattern: /next\.?js|\bnextjs\b/i, stacks: ["web", "react", "nextjs"] },
  { pattern: /\breact\b/i, stacks: ["web", "react"] },
  { pattern: /\bvue(?:\.js)?\b/i, stacks: ["web", "vue"] },
  { pattern: /\bsvelte(?:kit)?\b/i, stacks: ["web", "svelte"] },
  { pattern: /\bastro\b/i, stacks: ["web", "astro"] },
  { pattern: /react native/i, stacks: ["mobile", "react-native", "react"] },
  { pattern: /\bexpo\b|expo router/i, stacks: ["mobile", "react-native", "expo"] },
  { pattern: /\bflutter\b|\bdart\b/i, stacks: ["mobile", "flutter"] },
  { pattern: /android|kotlin|jetpack compose/i, stacks: ["mobile", "android", "kotlin"] },
  { pattern: /\bios\b|swiftui|\bswift\b/i, stacks: ["mobile", "ios", "swift"] },

  // Backend frameworks and languages.
  { pattern: /\bnode(?:\.js)?\b|\bnodejs\b/i, stacks: ["node", "javascript"] },
  { pattern: /typescript/i, stacks: ["typescript"] },
  { pattern: /python/i, stacks: ["python"] },
  { pattern: /fastapi/i, stacks: ["python", "fastapi", "api"] },
  { pattern: /django/i, stacks: ["python", "django", "web"] },
  { pattern: /laravel|\bphp\b/i, stacks: ["php", "laravel"] },
  { pattern: /spring boot|\bspring\b/i, stacks: ["java", "spring"] },
  { pattern: /\.net|asp\.net|\bc#\b/i, stacks: ["dotnet"] },
  { pattern: /\bgolang\b|\bgo backend\b|\bgo service\b/i, stacks: ["go"] },
  { pattern: /\brust\b/i, stacks: ["rust"] },

  // Data, authentication and storage.
  { pattern: /\bauth\b|authentication|login|sign[- ]?in|oauth|openid|\bsso\b|identity/i, capabilities: ["auth", "identity"] },
  { pattern: /file upload|object storage|blob storage|bucket|s3-compatible|\bs3\b/i, capabilities: ["object-storage"] },
  { pattern: /postgres(?:ql)?|\bpgsql\b/i, capabilities: ["postgres", "database"], stacks: ["postgres"] },
  { pattern: /\bsql\b|relational database|database schema|db schema/i, capabilities: ["database", "schema"] },
  { pattern: /database migration|schema migration|migrate the database/i, capabilities: ["database", "migrations", "schema"] },
  { pattern: /mongodb|document database/i, capabilities: ["document-database", "database"], stacks: ["mongodb"] },
  { pattern: /redis|\bcache\b|caching/i, capabilities: ["redis", "cache"] },
  { pattern: /vector database|vector store|semantic search|\brag\b|retrieval augmented/i, capabilities: ["vector-database", "semantic-search", "rag"] },
  { pattern: /embedding|embeddings/i, capabilities: ["embeddings", "vector-database"] },

  // Named backend/provider hints. These are selection hints only, never authorization.
  { pattern: /\bsupabase\b/i, capabilities: ["supabase", "postgres"], stacks: ["supabase", "postgres"] },
  { pattern: /\bneon\b/i, capabilities: ["neon", "postgres"], stacks: ["neon", "postgres"] },
  { pattern: /\bfirebase\b|firestore/i, capabilities: ["auth", "document-database", "database"], stacks: ["firebase"] },
  { pattern: /\bappwrite\b/i, capabilities: ["auth", "database", "object-storage"], stacks: ["appwrite"] },
  { pattern: /\bpocketbase\b/i, capabilities: ["auth", "database", "object-storage"], stacks: ["pocketbase"] },
  { pattern: /\bvercel\b/i, capabilities: ["vercel", "deployments", "web-hosting"], stacks: ["vercel", "web"] },
  { pattern: /\bcloudflare\b|cloudflare workers|cloudflare pages|\bwrangler\b/i, capabilities: ["cloudflare", "edge-functions", "web-hosting"], stacks: ["cloudflare", "web"] },
  { pattern: /github|pull request|\bpr\b|github actions/i, capabilities: ["repositories", "pull-requests", "ci"], stacks: ["github"] },

  // Collaboration and knowledge systems.
  { pattern: /\blinear\b/i, capabilities: ["linear", "issues", "projects"] },
  { pattern: /\bjira\b|\bconfluence\b|atlassian/i, capabilities: ["jira", "confluence", "issues", "knowledge"] },
  { pattern: /\bnotion\b/i, capabilities: ["notion", "workspace-search", "knowledge-base"] },

  // Commerce and communication.
  { pattern: /\bstripe\b|payment|checkout|subscription|billing/i, capabilities: ["payments", "checkout", "billing"] },
  { pattern: /transactional email|send email|email delivery|\bresend\b|sendgrid|postmark/i, capabilities: ["email", "transactional-email"] },
  { pattern: /\bsms\b|whatsapp|voice call|\btwilio\b/i, capabilities: ["communications", "sms"] },

  // Infrastructure, operations and asynchronous work.
  { pattern: /background job|job queue|worker queue|scheduled job|scheduler|cron job/i, capabilities: ["background-jobs", "queues", "scheduling"] },
  { pattern: /\bdocker\b|container(?:s|ized)?/i, capabilities: ["containers"], stacks: ["docker"] },
  { pattern: /kubernetes|\bk8s\b|\bkubectl\b|\bhelm\b/i, capabilities: ["kubernetes", "containers"], stacks: ["kubernetes"] },
  { pattern: /terraform|opentofu|infrastructure as code|\biac\b/i, capabilities: ["infrastructure", "terraform"] },
  { pattern: /observability|monitoring|metrics|distributed tracing|application logs/i, capabilities: ["observability", "logs", "tracing"] },
  { pattern: /load test|stress test|\bk6\b/i, capabilities: ["load-test", "performance-test"] },

  // AI/model workflows.
  { pattern: /ai model|language model|\bllm\b|generative ai/i, capabilities: ["ai-models"] },
  { pattern: /openai|gpt[- ]?\d|chatgpt/i, capabilities: ["ai-models"], stacks: ["openai"] },
  { pattern: /anthropic|claude/i, capabilities: ["ai-models"], stacks: ["anthropic"] },
  { pattern: /gemini|google ai/i, capabilities: ["ai-models"], stacks: ["google-ai"] },
  { pattern: /hugging face|huggingface/i, capabilities: ["ai-models", "model-hosting"], stacks: ["huggingface"] },

  // Security intent enriches the existing task-type/security recipes.
  { pattern: /owasp|appsec|application security|pentest|penetration test|threat model/i, capabilities: ["security", "appsec"] },
  { pattern: /secret scan|credential leak|gitleaks/i, capabilities: ["secret-scan"] },
  { pattern: /dependency vulnerab|supply chain|osv scanner|osv-scanner/i, capabilities: ["dependency-scan"] },
];

function appendUnique(target: string[], values: string[] | undefined): void {
  for (const value of values ?? []) if (!target.includes(value)) target.push(value);
}

export function inferSelectionSignals(text: string): InferredSelectionSignals {
  const prompt = text.trim();
  const capabilities: string[] = [];
  const stacks: string[] = [];
  if (!prompt) return { capabilities, stacks };

  for (const rule of RULES) {
    if (!rule.pattern.test(prompt)) continue;
    appendUnique(capabilities, rule.capabilities);
    appendUnique(stacks, rule.stacks);
  }
  return { capabilities, stacks };
}
