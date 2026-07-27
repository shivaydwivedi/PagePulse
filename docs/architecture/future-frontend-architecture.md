# Frontend Architecture

Status: Implemented

Phase 10 implements the public demo UI with plain HTML, CSS, and browser JavaScript. No frontend framework, bundler, web-font package, chart library, or external runtime dependency is used. Lighthouse measurement is still pending.

Back to the [architecture index](README.md).

## Implemented Design

- `GET /` serves [public/index.html](../../public/index.html).
- Static assets are served from [public](../../public) by the existing Express app.
- The UI calls `POST /api/v1/audits` through a same-origin relative URL.
- Browser state is explicit: idle, loading, success, and error.
- Light, dark, and system themes use CSS custom properties.
- Explicit theme choice is stored as `pagepulse.theme`; the last submitted URL is stored as `pagepulse.lastUrl`.
- Result rendering uses safe DOM methods rather than HTML string interpolation.
- Checks are displayed in the API scoring order.
- Errors show safe public messages, request IDs where available, and retry guidance.
- Rate-limit errors show a whole-second retry countdown capped at one hour.
- The footer visibly includes `Built for Digital Heroes Training Task`.

## Performance Targets

The UI is LCP-conscious by construction: main heading and form are in initial HTML, JavaScript is loaded as a module, no remote fonts or external scripts are used, and no large raster assets are added. LCP below 2.5 seconds remains a target for a later measured Lighthouse phase and has not been measured yet.

## Accessibility Approach

The page includes semantic landmarks, a skip link, visible labels, keyboard-accessible controls, focus states, `aria-live` status areas, `aria-busy` loading state, reduced-motion CSS, and text labels alongside status colours.

## Known Limitations

- No deployed frontend exists yet.
- No screenshots are committed.
- Lighthouse, accessibility tooling, and mobile performance measurement are pending.
- The UI intentionally does not render target pages or measure Core Web Vitals.

## UI Flow

```mermaid
flowchart TD
  User[User] --> Form[URL input form]
  Form --> API[PagePulse audit API]
  API --> Loading[Progress state]
  API --> Result[Score checks and issues]
  API --> Error[Accessible error feedback]
```
