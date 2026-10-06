import json
import random
import zipfile
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent
ARCHIVE = ROOT / "ACRIMA-Dataset.zip"
FUNDUS_DIR = ROOT / "assets" / "fundus"
RESULTS_FILE = ROOT / "data" / "results.json"
SEED = 42
IMAGE_SIZE = (512, 512)


def main():
    if not ARCHIVE.is_file():
        raise FileNotFoundError(f"Dataset archive not found: {ARCHIVE}")

    with zipfile.ZipFile(ARCHIVE) as archive:
        images = [
            name
            for name in archive.namelist()
            if name.startswith("Database/Images/")
            and name.lower().endswith((".jpg", ".jpeg"))
        ]

        glaucoma = sorted(name for name in images if "_g_" in Path(name).name)
        normal = sorted(name for name in images if "_g_" not in Path(name).name)
        if len(glaucoma) < 15 or len(normal) < 15:
            raise ValueError(
                f"Expected at least 15 images per label; found "
                f"{len(glaucoma)} glaucoma and {len(normal)} normal images."
            )

        chooser = random.Random(SEED)
        selected = chooser.sample(glaucoma, 15) + chooser.sample(normal, 15)
        chooser.shuffle(selected)

        FUNDUS_DIR.mkdir(parents=True, exist_ok=True)
        RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
        for old_image in FUNDUS_DIR.glob("img[0-9][0-9].jpg"):
            old_image.unlink()

        results = []
        for index, source in enumerate(selected, start=1):
            image_id = f"img{index:02d}"
            filename = f"{image_id}.jpg"
            label = "glaucoma" if "_g_" in Path(source).name else "normal"
            risk_rng = random.Random(f"{SEED}:{image_id}:{label}")
            risk = risk_rng.randint(60, 95) if label == "glaucoma" else risk_rng.randint(5, 35)

            with archive.open(source) as source_file:
                with Image.open(source_file) as image:
                    image = ImageOps.exif_transpose(image).convert("RGB")
                    image = ImageOps.fit(
                        image,
                        IMAGE_SIZE,
                        method=Image.Resampling.LANCZOS,
                        centering=(0.5, 0.5),
                    )
                    image.save(FUNDUS_DIR / filename, format="JPEG", quality=90, optimize=True)

            results.append(
                {"id": image_id, "file": f"assets/fundus/{filename}", "label": label, "risk": risk}
            )

    RESULTS_FILE.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(results)} images: 15 glaucoma, 15 normal.")
    print(f"Images: {FUNDUS_DIR}")
    print(f"Results: {RESULTS_FILE}")


if __name__ == "__main__":
    main()
