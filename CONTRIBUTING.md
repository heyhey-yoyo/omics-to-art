# Contributing

1. Create a focused branch and keep data processing separate from artistic rendering.
2. Add a fixture and a test for every parser or compatibility rule.
3. Every template must implement deterministic output, a simple legend, a technical legend, Canvas rendering and SVG rendering.
4. Do not add server-side expression-matrix parsing, persistent user-data storage, clinical claims, or automatic statistical significance calculations.
5. Run `npm run check` before opening a pull request.

New templates should follow `docs/template-development.md` and must not call `Math.random()` in layout code.
