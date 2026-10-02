---
name: video-model-selection
description: Select a compatible video-generation model from required capabilities without treating provider metadata as authentication.
---

# Video Model Selection

Choose a model only after identifying required inputs and outputs: text/image input, product/reference consistency, first/last-frame interpolation, extension, aspect ratio, resolution and iteration priority.

Dockyard's current verified Google route uses the Veo 3.1 model family. Use the richer model when reference images, extension or 4K capability is required; prefer Fast for iteration speed when the richer feature set is still needed; use Lite only when its reduced feature set is sufficient.

Model selection does not mean the provider is authenticated and does not authorize spend. Provider credentials/tokens stay in provider-owned tooling or the user's environment and must never be copied into Dockyard checkpoints, logs or generated source files.
