---
name: gsap-scroll-storytelling
description: Create section-owned cinematic timelines and scroll-driven storytelling with GSAP and ScrollTrigger.
---

# GSAP Scroll Storytelling

Build separate narrative sections with explicit start/end states. Each section owns its timeline and cleanup.

- Use ScrollTrigger for scrub/pin behavior only where it improves the story.
- Never create one giant unstructured page timeline.
- Keep layout/content usable without animation.
- Respect prefers-reduced-motion.
- Kill ScrollTriggers/timelines on component or route teardown.
- Keep animation state deterministic so browser QA can reproduce it.
- Coordinate DOM, WebGL and frame-sequence layers through a shared section state rather than competing scroll listeners.
