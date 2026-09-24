"""Build compact images for the home page without changing source photographs."""

from pathlib import Path
import re

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "home"
PAGE = ROOT / "index.html"
HOME_IMAGE = re.compile(r'<img[^>]+src="assets/home/([^"]+)\.webp"')


def main() -> None:
    OUTPUT.mkdir(exist_ok=True)
    names = {match.group(1) for match in HOME_IMAGE.finditer(PAGE.read_text(encoding="utf-8"))}
    sources = {"assets/brand/malina-logo-ai.png"}
    for name in names - {"malina-logo-ai"}:
        matches = [
            * (ROOT / "assets" / "services").glob(f"{name}.*"),
            * (ROOT / "assets" / "portfolio").glob(f"{name}.*"),
        ]
        if len(matches) != 1:
            raise RuntimeError(f"Expected one source image for {name}, found {len(matches)}")
        sources.add(str(matches[0].relative_to(ROOT)).replace("\\", "/"))

    for relative in sorted(sources):
        source = ROOT / relative
        if not source.exists():
            raise FileNotFoundError(source)
        target = OUTPUT / f"{source.stem}.webp"
        if source.name == "malina-logo-ai.png":
            maximum = (480, 180)
            settings = {"lossless": True, "method": 6}
        elif source.name == "hero-studio.webp":
            maximum = (1120, 840)
            settings = {"quality": 78, "method": 6}
        elif source.parent.name == "services":
            maximum = (700, 700)
            settings = {"quality": 76, "method": 6}
        else:
            maximum = (850, 1100)
            settings = {"quality": 76, "method": 6}

        with Image.open(source) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail(maximum, Image.Resampling.LANCZOS)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGB")
            image.save(target, "WEBP", **settings)
            print(f"{relative} -> {target.relative_to(ROOT)} {image.width}x{image.height}")


if __name__ == "__main__":
    main()
