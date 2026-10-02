import type { Candidate, HostId } from "./types.js";

const ALL_HOSTS: HostId[] = ["antigravity", "gemini-cli", "codex", "claude-code", "cursor", "opencode", "universal"];

function bundledSkill(
  id: string,
  displayName: string,
  capabilities: string[],
  tags: string[],
  contextCost: Candidate["contextCost"] = "small",
): Candidate {
  return {
    id,
    displayName,
    category: "cinematic-web",
    kind: "skill",
    trust: "dockyard",
    capabilities,
    tags,
    stacks: ["web", "react", "nextjs", "threejs", "r3f"],
    hosts: ALL_HOSTS,
    permissions: [],
    risk: "low",
    contextCost,
    maturity: 94,
    maintenance: 100,
    defaultChannel: "recommended",
    source: {
      type: "dockyard",
      locator: `skills/${id}`,
      revisionStrategy: "bundled",
      license: "MIT",
    },
  };
}

export const cinematicCatalog: Candidate[] = [
  bundledSkill(
    "threejs-r3f-cinematic",
    "Three.js / R3F Cinematic Web",
    ["3d-web", "threejs", "r3f", "drei", "webgl", "scene-architecture", "camera", "lighting", "materials", "postprocessing", "asset-loading", "responsive-3d"],
    ["3d", "threejs", "react-three-fiber", "drei", "webgl", "product-experience"],
    "medium",
  ),
  bundledSkill(
    "gsap-scroll-storytelling",
    "GSAP Scroll Storytelling",
    ["animation", "gsap", "scrolltrigger", "scroll-storytelling", "timeline", "section-transitions", "motion-design", "scroll-scrubbing"],
    ["gsap", "scrolltrigger", "motion", "cinematic", "scroll"],
  ),
  bundledSkill(
    "frame-sequence-2-5d",
    "2.5D Frame Sequence Web",
    ["2.5d", "video-to-frames", "frame-sequence", "image-sequence", "scroll-scrubbing", "canvas-sequence", "preload-strategy", "responsive-sequence", "reduced-motion"],
    ["2.5d", "frames", "scroll", "canvas", "cinematic"],
    "medium",
  ),
  bundledSkill(
    "cinematic-asset-pipeline",
    "Cinematic Asset Pipeline",
    ["asset-planning", "storyboard", "image-to-video", "video-generation", "frame-extraction", "compression", "web-asset-budget", "progressive-loading"],
    ["assets", "video", "frames", "optimization", "web-performance"],
  ),
  bundledSkill(
    "video-model-selection",
    "Video Generation Model Selection",
    ["video-generation", "model-selection", "google-veo", "image-to-video", "reference-images", "frame-interpolation", "video-extension"],
    ["video-generation", "google-ai", "veo", "model-routing"],
  ),
  {
    id: "ffmpeg",
    displayName: "FFmpeg",
    category: "media-tooling",
    kind: "tool",
    trust: "maintainer",
    capabilities: ["video-processing", "frame-extraction", "video-to-frames", "transcoding", "compression"],
    tags: ["video", "frames", "media", "cli"],
    stacks: [],
    hosts: ALL_HOSTS,
    permissions: ["filesystem-read", "filesystem-write", "shell"],
    risk: "medium",
    contextCost: "tiny",
    maturity: 99,
    maintenance: 98,
    defaultChannel: "recommended",
    source: {
      type: "github",
      locator: "FFmpeg/FFmpeg",
      revisionStrategy: "pin-on-install",
      license: "LGPL-2.1-or-later",
    },
  },
];
