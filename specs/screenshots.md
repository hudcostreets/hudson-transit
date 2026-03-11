# Screenshots: tracked images, CI verification, README GIFs

## Goal

Git-track canonical screenshots of all 6 bubble-chart views (2 directions × 3 time periods), generate GIFs grouping them, embed in README, and verify no regressions in CI.

## `runsascoded/scrns@v1` GHA

There's a reusable action that handles scrns invocation + diff checking:

```yaml
- uses: runsascoded/scrns@v1
  with:
    host: localhost:3847
    output: public/screenshots
    upload-artifact: true    # upload actual screenshots on failure
```

It auto-detects the project's `scrns` dep (via `pnpm exec`), installs PW Chromium (`npx playwright install --with-deps chromium`), runs scrns, and diffs the output dir. `on-diff: fail` (default) fails the step if screenshots changed.

Key inputs: `host`, `output`, `config`, `engine`, `selector`, `load-timeout`, `include`, `on-diff` (`fail`|`commit`|`none`), `upload-artifact`.

Key outputs: `changed`, `changed-files`, `committed`.

## Cross-platform r13y

The action uses native PW on GHA Ubuntu (not Docker). Font rendering differs between macOS and Linux, so screenshots generated locally on Mac won't be byte-identical to CI.

**Approach**: Always regenerate screenshots via Docker locally (matching GHA's Ubuntu env), or accept that the "source of truth" is CI and regenerate via a `workflow_dispatch` run when needed.

For this project, the simplest path:
1. Generate initial screenshots in CI (push code, let action run, download artifact)
2. Commit those as the baseline
3. Future changes: if CI fails, regenerate locally via Docker wrapper script (for when you need to update them intentionally)

### Docker wrapper for local generation

`www/scripts/docker-screenshots.sh` — for when you need to regenerate locally to match CI:

```bash
#!/usr/bin/env bash
# Generate screenshots matching GHA Ubuntu environment.
set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="linux/amd64"
IMAGE="hbt-screenshots"
CONTAINER="hbt-screenshots-run"

docker build --platform "$PLATFORM" -f Dockerfile.screenshots -t "$IMAGE" .
docker rm "$CONTAINER" 2>/dev/null || true
docker run --platform "$PLATFORM" --name "$CONTAINER" "$IMAGE"
docker cp "$CONTAINER:/app/public/screenshots/." public/screenshots/
docker rm "$CONTAINER"
```

`www/Dockerfile.screenshots`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.57.0-noble
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install
COPY . .
RUN pnpm build
EXPOSE 3847
CMD ["sh", "-c", "pnpm exec serve dist -l 3847 -s & sleep 2 && pnpm exec scrns -h localhost:3847 -o public/screenshots -E playwright -l 30000"]
```

## Screenshot set

Dark theme only for tracked images.

### Tracked screenshots (6 bubble views + og-image = 7)

| Name | Direction | Time | Params |
|------|-----------|------|--------|
| `bubble-nj-ny-1h` | NJ→NY | Peak 1hr | (default) |
| `bubble-nj-ny-3h` | NJ→NY | Peak period | `t=3h` |
| `bubble-nj-ny-1d` | NJ→NY | 24hr | `t=1d` |
| `bubble-ny-nj-1h` | NY→NJ | Peak 1hr | `d=nynj` |
| `bubble-ny-nj-3h` | NY→NJ | Peak period | `d=nynj&t=3h` |
| `bubble-ny-nj-1d` | NY→NJ | 24hr | `d=nynj&t=1d` |
| `og-image` | NJ→NY | Peak 1hr | (default, 1200×850) |

Output dir: `www/public/screenshots/`

### GIFs (2, one per direction)

| Name | Frames | Description |
|------|--------|-------------|
| `nj-ny.gif` | `bubble-nj-ny-{1h,3h,1d}` | NJ→NY across time periods |
| `ny-nj.gif` | `bubble-ny-nj-{1h,3h,1d}` | NY→NJ across time periods |

Post-hoc assembly from the 6 PNGs.

## Implementation

### 1. Simplify `scrns.config.ts`

Track only the 7 dark-theme screenshots:

```ts
import type { ScreenshotsMap, ScreenshotConfig } from 'scrns'

const W = 1200, H = 800

function shot(params: string, h = H): ScreenshotConfig {
  return {
    query: params ? `?${params}` : '',
    width: W, height: h,
    selector: '.js-plotly-plot',
    preScreenshotSleep: 1500,
  }
}

const dirs = [
  { key: 'nj-ny', params: '' },
  { key: 'ny-nj', params: 'd=nynj' },
] as const

const times = [
  { key: '1h', params: '' },
  { key: '3h', params: 't=3h' },
  { key: '1d', params: 't=1d' },
] as const

function join(...p: string[]) { return p.filter(Boolean).join('&') }

const screenshots: ScreenshotsMap = {}
for (const dir of dirs) {
  for (const time of times) {
    screenshots[`bubble-${dir.key}-${time.key}`] = shot(join(dir.params, time.params))
  }
}
screenshots['og-image'] = shot('', 850)

export default screenshots
```

### 2. CI workflow

Update `deploy.yml` to add screenshot verification using the reusable action:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          cache-dependency-path: www/pnpm-lock.yaml
      - run: pnpm install --frozen-lockfile
        working-directory: www
      - run: pnpm build
        working-directory: www
      - name: Serve built site
        working-directory: www
        run: npx serve dist -l 3847 -s &
      - uses: runsascoded/scrns@v1
        with:
          host: localhost:3847
          output: www/public/screenshots
          upload-artifact: true
        working-directory: www
      - uses: actions/upload-pages-artifact@v3
        with:
          path: www/dist

  deploy:
    needs: build
    # ...existing deploy job...
```

The `serve` step runs in background, then the scrns action generates screenshots and diffs against the committed versions. If changed, the step fails and uploads the actual screenshots as an artifact.

### 3. GIF assembly

`www/scripts/make-gifs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
DIR="${1:-public/screenshots}"

for dir_key in nj-ny ny-nj; do
  magick -delay 150 -loop 0 \
    "$DIR/bubble-${dir_key}-1h.png" \
    "$DIR/bubble-${dir_key}-3h.png" \
    "$DIR/bubble-${dir_key}-1d.png" \
    "$DIR/${dir_key}.gif"
  echo "  wrote $DIR/${dir_key}.gif"
done
```

GIFs are assembled locally (ImageMagick `magick`), committed alongside the PNGs. CI verifies them too.

### 4. package.json scripts

```json
{
  "scrns": "scrns -h localhost:3847 -o public/screenshots -E playwright",
  "scrns:docker": "./scripts/docker-screenshots.sh",
  "scrns:gifs": "./scripts/make-gifs.sh"
}
```

### 5. README table

Near the top of README, after the intro:

```markdown
## Charts

| NJ→NY (entering) | NY→NJ (leaving) |
|:-:|:-:|
| [![NJ→NY][nj-ny-gif]][nj-ny-live] | [![NY→NJ][ny-nj-gif]][ny-nj-live] |

Each GIF cycles through peak 1hr, peak period (3hr), and 24hr views. Click to open the interactive chart.

| | NJ→NY | NY→NJ |
|---|:-:|:-:|
| Peak 1hr | [![][nj-ny-1h]][nj-ny-1h-live] | [![][ny-nj-1h]][ny-nj-1h-live] |
| Peak period | [![][nj-ny-3h]][nj-ny-3h-live] | [![][ny-nj-3h]][ny-nj-3h-live] |
| 24hr | [![][nj-ny-1d]][nj-ny-1d-live] | [![][ny-nj-1d]][ny-nj-1d-live] |

[nj-ny-gif]: www/public/screenshots/nj-ny.gif
[ny-nj-gif]: www/public/screenshots/ny-nj.gif
[nj-ny-live]: https://cbd.hudcostreets.org
[ny-nj-live]: https://cbd.hudcostreets.org?d=nynj
[nj-ny-1h]: www/public/screenshots/bubble-nj-ny-1h.png
[nj-ny-3h]: www/public/screenshots/bubble-nj-ny-3h.png
[nj-ny-1d]: www/public/screenshots/bubble-nj-ny-1d.png
[ny-nj-1h]: www/public/screenshots/bubble-ny-nj-1h.png
[ny-nj-3h]: www/public/screenshots/bubble-ny-nj-3h.png
[ny-nj-1d]: www/public/screenshots/bubble-ny-nj-1d.png
[nj-ny-1h-live]: https://cbd.hudcostreets.org
[nj-ny-3h-live]: https://cbd.hudcostreets.org?t=3h
[nj-ny-1d-live]: https://cbd.hudcostreets.org?t=1d
[ny-nj-1h-live]: https://cbd.hudcostreets.org?d=nynj
[ny-nj-3h-live]: https://cbd.hudcostreets.org?d=nynj&t=3h
[ny-nj-1d-live]: https://cbd.hudcostreets.org?d=nynj&t=1d
```

## Consolidation

- Move `public/og-image.png` → generated as `public/screenshots/og-image.png`
- Update `index.html` `<meta property="og:image">` to point at `/screenshots/og-image.png`
- Delete standalone `public/og-image.png`

## Open questions

1. **r13y strategy**: The scrns GHA uses native PW on Ubuntu (no Docker). For local regeneration that matches CI, we still need the Docker wrapper. Alternatively, could add a `docker` input to the action in the future. For now: generate initial baseline from CI artifact, use Docker locally when updating.
2. **GIF frame delay**: 1.5s (150cs) per frame for 3-frame GIFs. Adjust after seeing them.
3. **`working-directory`**: The scrns action may need to run from `www/` — verify that `host` and `output` paths resolve correctly relative to the action's working directory.
4. **`deploy` dependency**: Should `deploy` require screenshots to pass? Currently screenshots run as part of `build` job (before artifact upload), so a screenshot failure blocks deploy. This is the desired behavior.
