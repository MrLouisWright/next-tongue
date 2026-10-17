# Early check: `cacheComponents` + `output: 'export'`

**Date:** 2026-10-17  
**Next.js:** 16.4.2  
**Issue:** [#15](https://github.com/MrLouisWright/next-tongue/issues/15)

## Result: incompatible

`next build` fails with:

```
Error: Invariant: PPR cannot be enabled in export mode
```

Also, with Cache Components enabled, `export const dynamicParams = false` is rejected (`Route segment config "dynamicParams" is not compatible with nextConfig.cacheComponents`).

## Decision

Keep `examples/static-export` on `output: 'export'` **without** `cacheComponents` (and `prefix: 'always'`).  
Keep `examples/cache-components` on `cacheComponents: true` **without** `output: 'export'`.

Do not claim Cache Components + static export in docs until Next supports it.
