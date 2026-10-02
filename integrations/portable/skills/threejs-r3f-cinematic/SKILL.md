---
name: threejs-r3f-cinematic
description: Build performant cinematic 3D web experiences with Three.js, React Three Fiber and Drei while preserving semantic HTML, accessibility and mobile fallbacks.
---

# Three.js / R3F Cinematic Web

Use this skill only when the selected Dockyard recipe needs real interactive 3D.

## Architecture

- Prefer one shared WebGL canvas per experience. Do not mount a renderer for every page section.
- Keep navigation, headings, copy, controls, pricing/specs and CTAs in semantic DOM.
- Synchronize scene/camera state with section state or scroll instead of placing the entire application inside WebGL.
- Prefer React Three Fiber + Drei in React projects when it reduces lifecycle complexity.
- Use raw Three.js when project architecture or rendering requirements justify it.

## Scene quality

Plan geometry, materials, texture sizes, lighting, camera choreography, postprocessing and loading states before implementation. For a product such as a motorcycle, keep proportions/identity stable and use camera motion, environment, lighting and effects to create drama rather than continuously redesigning the product.

## Performance

- Budget texture memory, draw calls, triangles, DPR, shadows and postprocessing.
- Pause/reduce rendering when the experience is offscreen.
- Provide lower-cost mobile effects and a static/poster fallback.
- Dispose resources on teardown.
- Verify with Playwright plus performance checks.
