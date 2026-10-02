const GUIDANCE: Record<string, string[]> = {
  "threejs-r3f-cinematic": [
    "Use a single shared WebGL canvas where possible; do not mount one renderer per section.",
    "Keep semantic HTML sections outside the canvas and synchronize camera/scene state to scroll rather than turning the whole product page into inaccessible WebGL.",
    "Use R3F/Drei for React projects when it reduces lifecycle complexity; use raw Three.js only when the project architecture clearly benefits.",
    "Budget geometry, texture memory, DPR, post-processing, shadows, and mobile fallbacks before adding effects.",
  ],
  "gsap-scroll-storytelling": [
    "Build one narrative timeline per meaningful section, not one unmaintainable page-long animation.",
    "Use ScrollTrigger for deterministic scrub/pin transitions and clean up triggers on route/component teardown.",
    "Respect prefers-reduced-motion and keep content usable without animation.",
  ],
  "frame-sequence-2-5d": [
    "Treat a frame sequence as a section-owned asset with an explicit start/end scroll range, poster fallback, and bounded preload window.",
    "Do not ship every source-video frame blindly. Choose frame density from motion speed and target device budget, then encode web-friendly frames.",
    "Use canvas/image rendering for scrubbed sequences and preserve separate semantic DOM sections above/below the cinematic layer.",
  ],
  "cinematic-asset-pipeline": [
    "Storyboard first: map each section to the exact shot, transition, duration, first/last visual state, and interaction before generating media.",
    "Prefer reusable product/reference assets and deterministic section boundaries. Generated video is an asset source, not the website itself.",
    "After video generation, inspect the result before frame extraction; optimize, fingerprint and lazy-load assets instead of committing huge raw outputs blindly.",
  ],
  "video-model-selection": [
    "Select a video model from required capabilities rather than brand preference. Credentials remain with the provider/host and must never enter Dockyard checkpoints.",
    "For Google Veo, prefer the richer Veo 3.1 model when reference images, extension, interpolation or 4K capability is required; use Fast for speed-oriented generation and Lite only when its smaller feature set is sufficient.",
  ],
};

export function bundledCapabilityIds(candidateIds: string[]): string[] {
  return [...new Set(candidateIds)].filter((id) => Boolean(GUIDANCE[id]));
}

export function bundledCapabilityAgentText(candidateIds: string[]): string[] {
  const lines: string[] = [];
  for (const id of bundledCapabilityIds(candidateIds)) {
    const guidance = GUIDANCE[id];
    if (!guidance) continue;
    lines.push(`DOCKYARD BUNDLED SKILL — ${id}`);
    lines.push(...guidance.map((item) => `- ${item}`));
  }
  return lines;
}
