import { selectVideoGenerationModel, type VideoModelSelectionResult } from "./media-models.js";

export type CinematicWebRoute = "true-3d" | "frame-sequence-2.5d" | "hybrid";

export interface CinematicSectionPlan {
  id: string;
  purpose: string;
  rendering: "dom" | "webgl" | "frame-sequence" | "hybrid";
  notes: string[];
}

export interface CinematicWebPlan {
  schemaVersion: 1;
  route: CinematicWebRoute;
  reason: string[];
  stack: string[];
  sections: CinematicSectionPlan[];
  video?: VideoModelSelectionResult;
  qualityGates: string[];
  assetRules: string[];
}

function includesAny(text: string, expressions: RegExp[]): boolean {
  return expressions.some((expression) => expression.test(text));
}

export function chooseCinematicWebRoute(task: string): { route: CinematicWebRoute; reason: string[] } {
  const prompt = task.toLowerCase();
  const interactive3d = includesAny(prompt, [
    /rotate|orbit|inspect|customi[sz]e|configurator|interactive 3d|product viewer|hotspot|drag/,
    /three\.?js|react[- ]three[- ]fiber|\br3f\b|\bwebgl\b/,
  ]);
  const cinematicFrames = includesAny(prompt, [
    /2\.5d|frame[- ]sequence|video[- ]to[- ]frames|image[- ]sequence/,
    /cinematic|camera (?:move|motion|transition)|scroll[- ](?:driven|scrubbed)|video generation|\bveo\b/,
  ]);

  if (interactive3d && cinematicFrames) {
    return {
      route: "hybrid",
      reason: [
        "The requirement needs both interactive 3D behavior and deterministic cinematic/scroll-controlled shots.",
        "Use WebGL only where interaction benefits from real geometry; use section-owned frame sequences for generated/cinematic transitions.",
      ],
    };
  }
  if (cinematicFrames && !interactive3d) {
    return {
      route: "frame-sequence-2.5d",
      reason: [
        "The request emphasizes deterministic cinematic motion rather than free 3D interaction.",
        "A generated/video-derived frame sequence reduces runtime scene complexity while preserving scroll-scrubbed depth and motion.",
      ],
    };
  }
  return {
    route: "true-3d",
    reason: [
      "The request primarily benefits from interactive 3D geometry/camera control.",
      "Use Three.js/R3F for the interactive scene and keep content/navigation as semantic DOM sections.",
    ],
  };
}

export function planCinematicWebExperience(task: string): CinematicWebPlan {
  const chosen = chooseCinematicWebRoute(task);
  const wantsVideo = chosen.route !== "true-3d" || /video generation|\bveo\b|generate (?:a )?video/i.test(task);
  const wantsProductConsistency = /product|bike|motorcycle|car|r15|vehicle|reference image/i.test(task);
  const wantsInterpolation = /first.*last|start.*end|interpolat|transition between/i.test(task);
  const video = wantsVideo
    ? selectVideoGenerationModel({
        priority: wantsProductConsistency ? "quality" : "speed",
        requiresReferenceImages: wantsProductConsistency,
        requiresFirstLastFrame: wantsInterpolation,
        resolution: "1080p",
      })
    : undefined;

  const sections: CinematicSectionPlan[] = [
    {
      id: "hero",
      purpose: "Establish the product/subject and visual direction without blocking navigation or basic content.",
      rendering: chosen.route === "true-3d" ? "webgl" : chosen.route === "hybrid" ? "hybrid" : "frame-sequence",
      notes: ["Keep headline/CTA in semantic DOM.", "Provide a poster/static fallback before heavy assets are ready."],
    },
    {
      id: "story",
      purpose: "Move through feature/story beats as separate scroll sections.",
      rendering: chosen.route === "frame-sequence-2.5d" ? "frame-sequence" : "hybrid",
      notes: ["Each scene owns its scroll range/timeline.", "Do not create one monolithic page-long animation timeline."],
    },
    {
      id: "details",
      purpose: "Show product details/specification/content with stable readable layout.",
      rendering: chosen.route === "true-3d" || chosen.route === "hybrid" ? "hybrid" : "dom",
      notes: ["Interactive hotspots are optional and must not replace accessible text.", "Pause expensive rendering when the section is offscreen."],
    },
    {
      id: "closing",
      purpose: "Resolve the visual story and provide final CTA/content.",
      rendering: "dom",
      notes: ["Do not require WebGL/video playback for the user to reach the CTA.", "Respect reduced-motion preferences."],
    },
  ];

  return {
    schemaVersion: 1,
    route: chosen.route,
    reason: chosen.reason,
    stack: ["web", "react", "threejs", "r3f", "gsap"],
    sections,
    ...(video ? { video } : {}),
    qualityGates: [
      "Playwright visual/interaction pass across desktop and mobile breakpoints.",
      "No console/runtime errors and no orphaned WebGL/ScrollTrigger resources after navigation.",
      "Lighthouse/performance review with explicit asset and GPU-memory budgets.",
      "Reduced-motion and static-content fallback remain usable.",
      "Independent QA verifies section boundaries, scroll synchronization, loading states and fallbacks.",
    ],
    assetRules: [
      "Storyboard sections before generating media.",
      "Generated video is a source asset, not a single full-page background that replaces structure.",
      "Inspect generated video before frame extraction.",
      "Frame extraction/compression must be deterministic and reproducible; keep original generation outside the shipped web bundle when possible.",
      "Preload only a bounded window around the current frame/section.",
      "Use responsive frame density/resolution and a poster fallback for constrained devices.",
    ],
  };
}
