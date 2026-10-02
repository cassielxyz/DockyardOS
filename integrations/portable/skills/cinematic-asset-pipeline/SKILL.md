---
name: cinematic-asset-pipeline
description: Plan, generate, inspect, extract and optimize cinematic web assets without turning generated media into an unbounded website payload.
---

# Cinematic Asset Pipeline

Storyboard before generation. For every section record purpose, subject, camera motion, duration, first visual state, final visual state and transition.

Prefer real project/product/reference assets first. When generation is useful, create short section-specific media rather than one long video.

After generation:
- visually inspect continuity and product identity;
- reject bad generations before frame extraction;
- keep raw source media outside the shipped web bundle when practical;
- generate optimized derivatives reproducibly;
- fingerprint/lazy-load assets;
- set explicit total and per-section asset budgets.

Generated media is a source asset. It must not replace page structure, accessibility, navigation or readable content.
