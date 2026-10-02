---
name: frame-sequence-2-5d
description: Turn inspected video or rendered motion into optimized scroll-scrubbed frame sequences for 2.5D web sections.
---

# 2.5D Frame Sequence Web

Use this route when cinematic camera motion matters more than free user-controlled 3D.

## Pipeline

1. Define a storyboard and the exact start/end frame of each website section.
2. Generate or render a short source clip for that section.
3. Inspect the source clip before extraction.
4. Extract frames deterministically with FFmpeg.
5. Reduce frame density where motion allows it.
6. Encode web-friendly variants and create a poster/fallback.
7. Bind the sequence to only that section's scroll progress.
8. Preload a bounded frame window around the current frame.
9. Use responsive resolution/frame density and reduced-motion fallbacks.

Do not ship every source frame blindly. Do not use one enormous sequence for the entire website. Text/content/CTA remain semantic DOM sections even when a canvas sequence sits behind them.
