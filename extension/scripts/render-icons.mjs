import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "public/icons/icon.svg"));
const outDir = join(root, "public/icons");

for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(outDir, `icon-${size}.png`));
  console.log(`icon-${size}.png`);
}
