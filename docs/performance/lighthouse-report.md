# Lighthouse Performance Report

Status: Implemented

Back to the [architecture index](../architecture/README.md).

## Measurement Conditions

- Date: 2026-07-27
- URL measured: `http://localhost:4185/`
- Server mode: `npm start` with `PORT=4185`
- Page state: initial public UI idle state, no audit request running
- Tool: Lighthouse `13.4.1`
- Browser: Chrome `150.0.7871.182`
- Profile: mobile navigation, default Lighthouse mobile throttling
- Storage: fresh temporary Chrome profile per run
- Runtime assets: local Express static files only
- Network: local loopback; no live public audit target was fetched
- Report policy: median of three valid runs is the primary result

These are local Lighthouse lab results. They are not field data, do not represent production hosting, and should be repeated after deployment.

## Results

| Run | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT | FCP | Speed Index |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 71 | 100 | 96 | 100 | 1.198 s | 0 | 3190 ms | 1.123 s | 1.123 s |
| 2 | 100 | 100 | 96 | 100 | 1.101 s | 0 | 0 ms | 1.101 s | 1.101 s |
| 3 | 100 | 100 | 96 | 100 | 1.160 s | 0 | 1 ms | 1.160 s | 1.160 s |
| Median | 100 | 100 | 96 | 100 | 1.160 s | 0 | 1 ms | 1.123 s | 1.123 s |

## Target Review

| Target | Result | Status |
| --- | ---: | --- |
| LCP below 2.5 s | 1.160 s median | Pass |
| CLS at or below 0.1 | 0 median | Pass |
| Performance at least 90 | 100 median | Pass |
| Accessibility at least 95 | 100 median | Pass |
| Best Practices at least 95 | 96 median | Pass |

SEO is secondary for this functional developer tool, but the measured SEO score was 100.

## LCP Element

Lighthouse did not expose a node snippet for the largest contentful paint element in the generated JSON. FCP and LCP occurred together on all runs, and the initial viewport is text-first with no hero image or remote font. The practical LCP candidate is the initial heading block rendered from [public/index.html](../../public/index.html).

The main heading and audit form remain in initial HTML. The UI does not hide initial content while JavaScript loads.

## Bottlenecks And Changes

No LCP or CLS bottleneck required code-level performance remediation. Run 1 recorded a local TBT and main-thread outlier while LCP and CLS stayed within target; runs 2 and 3 returned near-zero TBT, and the median result still passed the target budgets.

Small Phase 10B polish changes:

- Added token-based text selection styling.
- Added browser autofill styling for the URL input.
- Captured README screenshots using deterministic local data.
- Documented measured Lighthouse results and the local-lab limitation.

## Limitations

- Local Lighthouse lab results are not production field metrics.
- Results do not include hosting latency, CDN behaviour, TLS negotiation, or real-user device variation.
- The PagePulse backend audit engine still does not measure audited websites with Lighthouse, browser rendering, Core Web Vitals, or field data.
- Post-deployment verification should rerun Lighthouse against the deployed public URL under documented conditions.
