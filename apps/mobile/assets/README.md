# Brand assets

Everything here is generated from four numbers by [`make-icons.py`](make-icons.py).
No file in this directory is hand-edited — change the geometry or the palette
in that script and re-run it, or the set drifts apart.

```sh
python apps/mobile/assets/make-icons.py    # from the repo root
```

Requires Pillow. Nothing else, and nothing at build time — these are committed
artefacts, not a build step.

## The mark

Three stumps and a bail. Chosen over three other concepts (a seam-stitched
ball, a scorebook cell, an `OI` monogram) for one reason: it is the only one
that survives 16px without losing a stroke. A circle reads as a baseball at
small sizes; a 2×2 ruled cell reads as a dashboard icon; a two-letter monogram
means nothing for a brand nobody has seen yet.

[`wicket.svg`](wicket.svg) is the master and carries the geometry in full.
The 1:2.7 stroke-to-gap ratio is load-bearing — thicker and the three rods
merge into a slab, thinner and the outer stumps vanish below 24px.

## Palette

From the Industry system in `tailwind.config.js`. Two colours only:

| Role | Token | Hex |
| --- | --- | --- |
| Ground | `scoreboard.DEFAULT` | `#1d2d3d` |
| Mark | `background` | `#f2f2f3` |

The ground is the same deep steel as the score plate — the one reversed field
the design system permits. A dark icon is also the rarer thing in a Play Store
grid, where most tiles are white.

> The previous `adaptiveIcon.backgroundColor` was `#0F2A20`, pitch green from
> the retired Pavilion palette. It was the only place that colour still
> survived.

## Files

| File | Size | Used by |
| --- | --- | --- |
| `icon.png` | 1024² | `app.json` → `expo.icon`. Full bleed, mark at ~61%. |
| `adaptive-icon.png` | 1024² | `app.json` → `android.adaptiveIcon.foregroundImage`. Transparent; every corner sits inside the 66% safe circle (max corner radius 326 of 341) so a circular mask cannot clip it. |
| `splash-icon.png` | 1024² | `app.json` → `expo-splash-screen`. Transparent, rendered at 180pt on the steel ground. |
| `favicon.png` | 48² | `app.json` → `web.favicon`. Rendered at a heavier scale so the strokes hold. |
| `play-icon-512.png` | 512² | Play Console listing icon. |
| `play-feature-graphic.png` | 1024×500 | Play Console feature graphic. Type is measured and shrunk to fit, not sized by eye. |
| `wicket.svg` | — | Master. Inherits `currentColor`, so it drops into a component. |

The web app's favicon and apple-touch icon are the same mark, written to
`apps/web/app/icon.png` and `apps/web/app/apple-icon.png`, where the Next.js
App Router picks them up by filename convention with no metadata wiring.

## Still needed for the Play listing

Not generated here, because they need the real app on a real device:

- 2–8 phone screenshots (Devpost wants 1179×2556, no device frame)
- Optional 7-inch and 10-inch tablet screenshots
