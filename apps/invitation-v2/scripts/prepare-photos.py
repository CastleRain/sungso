"""Create web-sized copies of the five user-selected photographs; no retouching."""
from pathlib import Path
from PIL import Image, ImageOps
import json
import argparse

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=root.parent.parent / '사진' / '1_스냅사진' / '최종 셀렉' / '00_전체 모음_85장')
source = parser.parse_args().source
output = root / 'assets' / 'photos'
output.mkdir(parents=True, exist_ok=True)
selected = {
    'sea': '4B7A3899색.jpg',
    'bouquet': '4B7A3198색.jpg',
    'promise': '4B7A4247색.jpg',
    'date': '4B7A3370색.jpg',
    'walk': '4B7A4052색.jpg',
}
manifest = []
for name, filename in selected.items():
    with Image.open(source / filename) as raw:
        image = ImageOps.exif_transpose(raw).convert('RGB')
        for width in ([640, 960, 1440] if name in ('sea', 'walk') else [640, 1440]):
            size = (width, round(image.height * width / image.width))
            web = image.resize(size, Image.Resampling.LANCZOS)
            path = output / f'{name}-{width}.webp'
            quality = 83 if width > 640 else 78
            web.save(path, 'WEBP', quality=quality, method=6)
            while path.stat().st_size > 500_000 and quality > 70:
                quality -= 4
                web.save(path, 'WEBP', quality=quality, method=6)
            manifest.append({'file': path.name, 'width': web.width, 'height': web.height, 'bytes': path.stat().st_size})
        if name == 'sea':
            card = ImageOps.fit(image, (1200, 630), Image.Resampling.LANCZOS, centering=(.5, .72))
            card.save(output / 'share.jpg', quality=87, optimize=True)
records = root.parent.parent / 'docs' / 'invitation-v2-review'
records.mkdir(parents=True, exist_ok=True)
(records / 'web-photo-assets.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(selected)} photos; {len(manifest)} WebP assets; {sum(item["bytes"] for item in manifest):,} bytes')
