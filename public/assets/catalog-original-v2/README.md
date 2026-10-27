# Original catalog artwork cleanup

The first 18 catalog identities now use individual square images. The built-in imagegen tool cleaned each object's edge and framing from the original catalog sheet, preserving its shape, colors, motifs and condition, with a consistent dark forest-green background and warm antique lighting.

The game loads `{catalogId}.webp` files in this directory. They are lossless delivery copies with identical decoded pixels. The 1254×1254 PNG masters are retained locally in `outputs/art-polish/masters/`, separate from the web build. This avoids shipping two copies of every large image.

Full editing prompts and reference roles are retained here:

- `clock-cups-prompts.md`
- `badges-cameras-prompts.md`
- `radios-maps-prompts.md`

The first edit target was `assets/catalog-lots-v1.png`; the second image was a background, lighting and material reference from the newer art. The old sheet remains available as a source reference. Unknown cards still show only the existing generic outline image.
