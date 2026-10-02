# Autonomous Skills and Cinematic Web Workflow

DockyardOS keeps **skill availability** separate from **skill activation**.

## Auto Initialize skill bootstrap

Auto Initialize now runs:

```bash
dockyard skills bootstrap --json
```

The bootstrap enumerates every **installable skill manifest** in the effective Dockyard registry, downloads each exact upstream revision into Dockyard's user-owned quarantine/cache, scans it, and applies the existing package policy.

- automatic-safe package: pinned revision is activated;
- approval-required package: downloaded and assessed, but left inactive;
- quarantined package: downloaded and kept quarantined;
- already active package: reused;
- discovery-only catalogue item: remains metadata until Dockyard has a real install manifest.

The report is stored outside the project at:

```text
~/.dockyardos/skills/bootstrap.json
```

This is intentional. A catalogue entry is never called installed merely because Dockyard knows its name.

At request/team time Dockyard only loads the capabilities selected for the current phase. It does not dump the complete skill library into model context.

## Cinematic 3D / 2.5D routing

The `cinematic-3d-web` recipe handles requests such as:

```text
create a 3d website for r15
build a cinematic product website
make a 2.5d scroll frame-sequence site
build an interactive R3F product viewer
```

Dockyard chooses one of three routes:

### True 3D

Use when real interaction requires geometry, camera/orbit control, hotspots, configuration, or WebGL-specific behavior.

Typical stack:

```text
React / Next.js
React Three Fiber
Drei
Three.js
GSAP / ScrollTrigger where needed
```

### Frame-sequence 2.5D

Use when the experience is primarily a controlled cinematic camera movement.

Pipeline:

```text
requirements
  -> storyboard separate page sections
  -> choose/generate reference imagery
  -> generate a short section clip when generation is useful
  -> inspect the clip
  -> FFmpeg frame extraction
  -> responsive/compressed frame variants
  -> section-owned canvas scrub
  -> poster/reduced-motion fallback
  -> browser + performance verification
```

A frame sequence belongs to one section. Dockyard must not create one enormous page-long sequence.

### Hybrid

This is the default for a generic product-oriented “3D website” request. Use real 3D only where interaction earns its GPU/runtime cost, while deterministic frame-sequence shots handle major cinematic transitions.

Every route keeps headings, copy, controls, specs and CTAs as semantic DOM content.

## Video model selection

DockyardOS contains non-secret metadata for the currently verified Google Veo 3.1 Gemini API family:

- `veo-3.1-generate-preview`
- `veo-3.1-fast-generate-preview`
- `veo-3.1-lite-generate-preview`

The selector filters by required features and resolution, then applies quality/speed/lean preference.

The richer Veo 3.1 Standard/Fast routes support product/reference-image guidance and video extension; Lite has a smaller feature set. The current family outputs 24 fps and supports 4/6/8 second generation, subject to model/feature resolution constraints.

Source of truth: Google AI for Developers, Gemini API Veo documentation:
https://ai.google.dev/gemini-api/docs/veo

The model selector **does not** authenticate Google, spend credits, or submit media. Actual generation must use a verified provider credential/session. Dockyard never writes provider API keys into checkpoints, logs, generated source, or its skill bootstrap report.

## Cinematic skill set

Dockyard bundles:

- `threejs-r3f-cinematic`
- `gsap-scroll-storytelling`
- `frame-sequence-2-5d`
- `cinematic-asset-pipeline`
- `video-model-selection`

and can verify an external `ffmpeg` runtime when frame extraction is selected.

The active phase receives only the selected bundled guidance plus any integrity-verified installed community skills required by that phase.
