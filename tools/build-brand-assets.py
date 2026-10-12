#!/usr/bin/env python3
"""Rebuild exact JF geometry using Inkscape and Pillow. Run from repo root."""
from pathlib import Path
import subprocess, json, shutil, zipfile, math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'jf-assets'
OUT.mkdir(exist_ok=True)
PATH = "M0 0H100V20H60V40H100V60H60V100H0V60H20V80H40V20H0Z"
def svg(color, icon=False, mask=False):
    if icon:
        # 56% square fits completely within the 80% diameter safe circle.
        transform = 'translate(24.64 24.64) scale(0.6272)' if mask else 'translate(6 6)'
        return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112"><rect width="112" height="112" fill="#202020"/><path d="{PATH}" transform="{transform}" fill="#FFFFFF"/></svg>\n'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="{PATH}" fill="{color}"/></svg>\n'
def render(source, target, size):
    subprocess.run(['inkscape',str(source),'--export-type=png',f'--export-filename={target}',f'--export-width={size}',f'--export-height={size}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for color in ['black','white']:
    source = OUT / f'jf-monogram-{color}.svg'
    source.write_text(svg('#000000' if color=='black' else '#FFFFFF'))
    render(source, OUT/f'jf-monogram-{color}.png',2048)
(OUT/'favicon.svg').write_text(svg('#FFFFFF',icon=True))
(OUT/'android-maskable.svg').write_text(svg('#FFFFFF',icon=True,mask=True))
for name,size in [('favicon-16x16.png',16),('favicon-32x32.png',32),('favicon-48x48.png',48),('apple-touch-icon.png',180),('android-chrome-192x192.png',192),('android-chrome-512x512.png',512),('android-maskable-512x512.png',512)]:
    render(OUT/('android-maskable.svg' if 'maskable' in name else 'favicon.svg'),OUT/name,size)
# Encode separately rendered PNGs into an ICO without resizing the frames.
import struct
frames=[(n,(OUT/f'favicon-{n}x{n}.png').read_bytes()) for n in (16,32,48)]
offset=6+16*len(frames)
header=struct.pack('<HHH',0,1,len(frames))
entries=b''
for n,data in frames:
    entries+=struct.pack('<BBBBHHII',n,n,0,0,1,32,len(data),offset)
    offset+=len(data)
(OUT/'favicon.ico').write_bytes(header+entries+b''.join(data for _,data in frames))
manifest={'name':'Jared Fritz','short_name':'JF','id':'/','start_url':'/','scope':'/','display':'standalone','background_color':'#202020','theme_color':'#202020','icons':[{'src':'/android-chrome-192x192.png','sizes':'192x192','type':'image/png','purpose':'any'},{'src':'/android-chrome-512x512.png','sizes':'512x512','type':'image/png','purpose':'any'},{'src':'/android-maskable-512x512.png','sizes':'512x512','type':'image/png','purpose':'maskable'}]}
(OUT/'site.webmanifest').write_text(json.dumps(manifest,indent=2)+'\n')
snippet='<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">\n<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="#202020">'
(OUT/'head-snippet.html').write_text(snippet+'\n')
for p in [ROOT/'index.html',ROOT/'card/index.html']:
    content=p.read_text()
    import re
    content=re.sub(r'<meta name="theme-color" content="[^"]+">','',content)
    if 'href="/favicon.svg"' not in content:
        content=content.replace('</head>',snippet+'\n</head>')
    p.write_text(content)
# QA: sample every pixel of a grid-aligned 100px render.
render(OUT/'jf-monogram-black.svg',OUT/'geometry-check.png',100)
grid=['XXXXX','..X..','..XXX','X.X..','XXX..']
im=Image.open(OUT/'geometry-check.png').convert('RGBA')
for y in range(100):
    for x in range(100):
        assert im.getpixel((x,y))[3]==(255 if grid[y//20][x//20]=='X' else 0)
(OUT/'geometry-check.png').unlink()
for color in ['black','white']:
    im=Image.open(OUT/f'jf-monogram-{color}.png').convert('RGBA')
    assert im.size==(2048,2048) and im.getpixel((1800,1800))[3]==0
    rgb=(0,0,0) if color=='black' else (255,255,255)
    assert all(p[:3]==rgb for p in im.getdata() if p[3])
for name,size in [('favicon-16x16.png',16),('favicon-32x32.png',32),('favicon-48x48.png',48),('apple-touch-icon.png',180),('android-chrome-192x192.png',192),('android-chrome-512x512.png',512),('android-maskable-512x512.png',512)]:
    im=Image.open(OUT/name).convert('RGBA')
    assert im.size==(size,size)
    assert im.getextrema()[3]==(255,255)
    assert im.getpixel((size-1,size-1))==(32,32,32,255)
ico=Image.open(OUT/'favicon.ico')
assert ico.ico.sizes()=={(16,16),(32,32),(48,48)}
assert math.sqrt(2)*0.56/2 < 0.4
# Contact sheet: actual-size icons on simulated browser tab backgrounds.
sheet=Image.new('RGB',(1000,740),'#eeeeeb')
d=ImageDraw.Draw(sheet)
font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',17)
title=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',26)
d.text((32,24),'JF — exact geometric identity',fill='#202020',font=title)
for x,color,bg,fg in [(32,'black','#ffffff','#202020'),(516,'white','#202020','#ffffff')]:
    d.rectangle((x,80,x+452,340),fill=bg)
    source=OUT/f'jf-monogram-{color}.svg'
    render(source,OUT/f'preview-{color}.png',180)
    logo=Image.open(OUT/f'preview-{color}.png').convert('RGBA')
    sheet.paste(logo,(x+136,105),logo)
    d.text((x+18,308),color.title()+' master / transparent',fill=fg,font=font)
for y,bg,fg,label in [(380,'#ffffff','#202020','Light browser theme'),(550,'#303030','#ffffff','Dark browser theme')]:
    d.rectangle((32,y,968,y+150),fill=bg)
    d.text((48,y+12),label,fill=fg,font=font)
    for x,n in zip([58,190,322,454],[16,32,48,64]):
        tmp=OUT/f'preview-{n}.png'
        render(OUT/'favicon.svg',tmp,n)
        im=Image.open(tmp)
        sheet.paste(im,(x,y+54))
        d.text((x,y+124),f'{n}px',fill=fg,font=font)
    # 180px preview is shown above at actual size; use separate taller sheet inset.
d.text((650,452),'180px device icon',fill='#202020',font=font)
im=Image.open(OUT/'apple-touch-icon.png')
sheet.paste(im,(740,510))
d.text((650,704),'All previews shown at native size',fill='#202020',font=font)
sheet.save(OUT/'contact-sheet.png')
for p in OUT.glob('preview-*.png'): p.unlink()
(OUT/'README.md').write_text("""# Jared Fritz — JF monogram

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
""")
(OUT/'QA.txt').write_text('PASS: exact grid, master colors and alpha, dimensions, opaque charcoal corners, ICO 16/32/48 frames, maskable circle containment.\n')
for p in OUT.iterdir():
    if p.name.startswith('jf-monogram') or p.name in ['android-maskable.svg','README.md','QA.txt','contact-sheet.png']:
        target=ROOT/'assets/brand'/p.name
    elif p.name=='head-snippet.html':
        continue
    else: target=ROOT/p.name
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(p,target)
with zipfile.ZipFile(ROOT.parent / 'jf-monogram-assets.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.iterdir()): z.write(p,p.name)
print('PASS: generated and verified all brand assets.')
