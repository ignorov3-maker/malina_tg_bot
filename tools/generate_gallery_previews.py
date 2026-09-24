"""Create lightweight gallery previews and reserve their layout space in HTML.

The full-size images stay untouched for the lightbox and direct image links.
Run with the bundled Python environment (Pillow required).
"""

from pathlib import Path
import re

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "assets" / "references"
PREVIEWS = SOURCES / "previews"
PAGE = ROOT / "references.html"
CARD = re.compile(
    r'(<a class="reference-card" href="assets/references/(reference-\d{3}\.jpg)"[^>]*><img )'
    r'src="[^"]+"(?: width="\d+" height="\d+")?'
)


def main() -> None:
    PREVIEWS.mkdir(exist_ok=True)
    dimensions = {}
    for source in sorted(SOURCES.glob("reference-*.jpg")):
        destination = PREVIEWS / source.name
        with Image.open(source) as original:
            preview = ImageOps.exif_transpose(original)
            preview.thumbnail((480, 720), Image.Resampling.LANCZOS)
            if preview.mode != "RGB":
                preview = preview.convert("RGB")
            dimensions[source.name] = preview.size
            preview.save(destination, "JPEG", quality=72, optimize=True, progressive=True)

    html = PAGE.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        prefix, name = match.groups()
        width, height = dimensions[name]
        return (
            f'{prefix}src="assets/references/previews/{name}" '
            f'width="{width}" height="{height}"'
        )

    html, count = CARD.subn(replace, html)
    if count != len(dimensions):
        raise RuntimeError(f"Updated {count} cards for {len(dimensions)} images")
    PAGE.write_text(html, encoding="utf-8")
    print(f"Generated {count} previews in {PREVIEWS}")


if __name__ == "__main__":
    main()
