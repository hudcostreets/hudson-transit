# Default `og:image`: bubble-chart screenshot for the bare homepage

## Problem

Since the dynamic OGIs work (`9a66e85`, `/og/{index,nyc}.png`), the Worker's `HTMLRewriter` rewrites `og:image` on **every** page, including bare `https://hbt.hccs.dev/` (no view params). That bare URL is the one people share most (e.g. hccs.dev's link-tree, social posts), and it now unfurls as the Satori stacked-bar card (`/og/index.png?v=…`).

The static `public/og.png` (1200×630 bubble chart from `scrns -i og`, with mode icons and operator logos) is a much stronger hero image, but it's only reachable now as the `index.html` fallback and on `/files*`. [hccs.dev] already uses `/og.png` for its hbt card for this reason.

The `workers-assets-r2-files.md` spec originally said "`/` with no view params keeps today's tags exactly", which matches what we want. §4 (dynamic OGIs) changed that.

## Change

In `www/worker/index.ts` `resolveOgMeta`, when the request is the **index page with no view-affecting params** (`d`, `t`, `g` all absent / default), return:

- `image: ${url.origin}/og.png`
- `imageAlt: STATIC_IMAGE_ALT`

Title and description are unchanged: they already use `SITE_TITLE` and the plain description for the default view.

Keep the dynamic Satori cards for:
- any non-default index view (`?d=nynj`, `?t=3h`, `?g=m`, …), since they describe *that* view
- `/nyc` (all views; there's no static `/nyc` hero)

Condition it on the **resolved view equalling the default** (`dir === 'entering' && time === 'peak_1hr' && gran === 'crossing'`), not on `url.search === ''`. That way `/?t=1h` (explicit default) also gets the hero, and unrelated params don't affect it.

## Cache-busting

`/og.png` is a static asset with no `v=` param. When `og.png` is regenerated, crawlers may keep the old one. Optional: append `?v=<version>` to the static URL too (asset serving ignores the query), matching the dynamic cards.

## Also

- Check `public/og.png` is current: latest data year and current mode icons/logos. Regenerate with `scrns -h 3847 -o public -i og` (see `scrns.config.ts`) if it's stale.
- `og:image:alt` for the static image should describe the bubble chart ("NJ→NY passengers by mode/crossing, 8-9am, Fall business day, 2014-2024"). That's the existing `STATIC_IMAGE_ALT` / `index.html` value.

## Verify

- `curl -s https://hbt.hccs.dev/ | grep og:image` → `https://hbt.hccs.dev/og.png`
- `curl -s 'https://hbt.hccs.dev/?d=nynj' | grep og:image` → `/og/index.png?d=nynj&v=…` (dynamic, unchanged)
- `curl -s https://hbt.hccs.dev/nyc | grep og:image` → `/og/nyc.png?v=…` (unchanged)
- If a test for `resolveOgMeta` exists or gets added, assert the exact `OgMeta` for those three URLs.

[hccs.dev]: https://hccs.dev

## Done

- `resolveOgMeta` (`www/worker/index.ts`): the index view that resolves to the default (`entering` / `peak_1hr` / `crossing`) returns `/og.png?v=<version>` + `STATIC_IMAGE_ALT`, so `/`, `/?t=1h` and unrelated params all get the hero. `/files*` uses the same versioned static URL. Other index views and all `/nyc` views keep their Satori cards.
- `public/og.png` checked: current (data through '24), not regenerated.
- No worker test harness exists; verified with `curl` against prod (see commit).
