from pathlib import Path
from PIL import Image, ImageOps

workspace = Path(__file__).resolve().parents[6]
source = workspace / '사진/1_스냅사진/최종 셀렉/00_전체 모음_85장/4B7A3179색.jpg'
output = Path(__file__).resolve().parents[1] / 'assets/photos'
with Image.open(source) as original:
    photo = ImageOps.exif_transpose(original).convert('RGB')
    for width in (640, 960, 1440):
        resized = photo.resize((width, round(photo.height * width / photo.width)), Image.Resampling.LANCZOS)
        resized.save(output / f'forest-{width}.webp', quality=84, method=6, exif=b'')
        print(f'forest-{width}.webp: {resized.size}')
