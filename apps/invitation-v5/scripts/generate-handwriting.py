"""Derive an inline vector ink reveal from the licensed, bundled Pinyon font.
Raster analysis is only used to trace glyph centerlines; the shipped letters are
original font outlines, never a bitmap or a generated replacement typeface.
Run with Python + fontTools + Pillow + NumPy + OpenCV when changing lettering.
"""
from pathlib import Path
from xml.sax.saxutils import escape
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

root=Path(__file__).resolve().parents[1]
font_path=root/'assets/fonts/PinyonScript-Regular.ttf'
font=TTFont(font_path); glyphs=font.getGlyphSet(); cmap=font.getBestCmap()
units=font['head'].unitsPerEm; pixels=320; ratio=pixels/units
raster_font=ImageFont.truetype(str(font_path),pixels)

def thin(image):
    a=np.pad(image.astype(np.uint8),1)
    while True:
        changed=False
        for step in range(2):
            p=a[1:-1,1:-1]
            n=[a[:-2,1:-1],a[:-2,2:],a[1:-1,2:],a[2:,2:],a[2:,1:-1],a[2:,:-2],a[1:-1,:-2],a[:-2,:-2]]
            count=sum(n); turns=sum((n[i]==0)&(n[(i+1)%8]==1) for i in range(8))
            c1=n[0]*n[2]*(n[4] if step==0 else n[6]); c2=(n[2] if step==0 else n[0])*n[4]*n[6]
            remove=(p==1)&(count>=2)&(count<=6)&(turns==1)&(c1==0)&(c2==0)
            if remove.any():p[remove]=0;changed=True
        if not changed:return a[1:-1,1:-1]

def trace(char):
    left,top,right,bottom=raster_font.getbbox(char,anchor='ls');pad=7
    ox,oy=pad-left,pad-top
    im=Image.new('L',(right-left+pad*2,bottom-top+pad*2));ImageDraw.Draw(im).text((ox,oy),char,font=raster_font,fill=255,anchor='ls')
    binary=np.array(im)>32
    points=set(map(tuple,np.argwhere(thin(binary))))
    segments=[]
    while points:
        start=min(points,key=lambda p:(p[1],p[0]));points.remove(start);stack=[start];walk=[start]
        while stack:
            y,x=stack[-1]
            near=[(y+dy,x+dx) for dy,dx in [(0,1),(1,1),(1,0),(-1,1),(-1,0),(1,-1),(0,-1),(-1,-1)] if (y+dy,x+dx) in points]
            if near:
                node=near[0];points.remove(node);stack.append(node);walk.append(node)
            else:
                stack.pop()
                if stack:walk.append(stack[-1])
        contour=np.array([(x,y) for y,x in walk],dtype=np.float32).reshape(-1,1,2)
        simplified=cv2.approxPolyDP(contour,.55,False).reshape(-1,2)
        segments.append('M'+'L'.join(f'{(x-ox)/ratio:.1f},{(y-oy)/ratio:.1f}' for x,y in simplified))
    radius=float(cv2.distanceTransform(binary.astype(np.uint8),cv2.DIST_L2,5).max())
    return ' '.join(segments),max(22,2*radius/ratio+14),(left/ratio-100,top/ratio-100,(right-left)/ratio+200,(bottom-top)/ratio+200)

def advance(text):return sum(font['hmtx'][cmap[ord(c)]][0] for c in text)
width=12000; defs=[]; letters=[];delay=40;index=0
for text,scale,baseline in [('We are',.86,1550),('getting married',1,3650)]:
    x=(width-advance(text)*scale)/2
    for char in text:
        aw=font['hmtx'][cmap[ord(char)]][0]
        if char==' ':x+=aw*scale;delay+=30;continue
        pen=SVGPathPen(glyphs);glyphs[cmap[ord(char)]].draw(TransformPen(pen,(1,0,0,-1,0,0)))
        path,stroke,bounds=trace(char);bx,by,bw,bh=bounds
        duration=190 if index==0 else round(70+min(50,aw/20));mid=f'v5-ink-letter-{index}'
        style=f'--ink-delay:{delay}ms;--ink-duration:{duration}ms;--ink-end:{delay+duration}ms'
        defs.append(f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}"><path class="ink-trace" pathLength="1" d="{path}" fill="none" stroke="white" stroke-width="{stroke:.1f}" stroke-linecap="round" stroke-linejoin="round" style="{style}"/><rect class="ink-seal" x="{bx:.1f}" y="{by:.1f}" width="{bw:.1f}" height="{bh:.1f}" fill="white" style="{style}"/></mask>')
        letters.append(f'<g transform="translate({x:.1f} {baseline}) scale({scale})"><path d="{pen.getCommands()}" fill="currentColor" mask="url(#{mid})"/></g>')
        x+=aw*scale;delay+=duration-8;index+=1
svg='<svg class="hero-handwriting" viewBox="0 0 12000 4550" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs>'+''.join(defs)+'</defs>'+''.join(letters)+'</svg>'
(root/'src/hero-handwriting.svg').write_text(svg,encoding='utf-8')
print(f'{index} vector letters; {len(svg):,} bytes; ink complete {delay/1000:.1f}s')
