# Jared Fritz — JF monogram

The canonical SVG path is preserved exactly. Each grid unit is 20×20 in the 100×100 mark; every bar is one unit thick. No tracing or generated imagery.

- jf-monogram-black.svg / white.svg: vector masters for branding and print; transparent, scalable. Pure RGB black/white, not a CMYK separation.
- jf-monogram-black.png / white.png: transparent 2048×2048 exports for social profiles and raster workflows.
- favicon.svg: preferred browser icon, white on solid #202020 with 6/112 (5.36%) inset.
- favicon.ico: independently rendered 16, 32, 48px frames; fallback browser icon.
- favicon-16x16.png / 32x32.png / 48x48.png: optional raster browser assets.
- apple-touch-icon.png: 180px iOS home screen icon.
- android-chrome-192x192.png / 512x512.png: Android icons.
- android-maskable-512x512.png: mark spans 56% of canvas; its entire square fits within the central 80%-diameter safe circle. android-maskable.svg is its vector source.
- site.webmanifest: Jared Fritz / JF, root-domain paths and explicit any/maskable purposes.
- contact-sheet.png: black/white comparison and native-size light/dark tab previews. Device preview is 180px.
- head-snippet.html: reusable installation snippet. Copy favicon/device files and manifest to domain root.

QA: exact 5×5 occupancy verified across all 10,000 pixels in a grid-aligned vector render. PNG sizes, pure master foreground colors, transparent master backgrounds, opaque charcoal icon backgrounds, ICO frame sizes, and maskable safe zone verified. The bounding box is geometrically centered; no optical shift or small-size geometry distortion is applied. Antialiasing at fractional pixel boundaries is expected at 16/32px.

Rendering: Inkscape SVG renderer; Pillow PNG handling and a standard ICO directory containing the exact PNG frames. Rebuild using tools/build-brand-assets.py (Inkscape and Pillow required).

Integration: root and /card/ HTML heads reference root-relative favicon SVG, ICO, Apple icon, manifest, and #202020 theme color. Logo masters live under assets/brand/. No body markup, CSS, content, or behavior changes.
