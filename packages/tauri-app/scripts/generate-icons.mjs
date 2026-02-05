#!/usr/bin/env node
/**
 * Generate Tauri app icons from logo.svg
 */
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const srcTauriDir = join(rootDir, 'src-tauri');
const iconsDir = join(srcTauriDir, 'icons');
const logoPath = join(rootDir, '../../docs/public/logo.svg');

const sizes = [
  { name: '32x32.png', size: 32 },
  { name: '128x128.png', size: 128 },
  { name: '128x128@2x.png', size: 256 },
];

async function generateIcons() {
  await mkdir(iconsDir, { recursive: true });
  const svgBuffer = await readFile(logoPath);

  // Generate PNG icons
  for (const { name, size } of sizes) {
    await sharp(svgBuffer, { density: Math.ceil((size * 72) / 32) })
      .resize(size, size)
      .png()
      .toFile(join(iconsDir, name));
    console.log(`Generated ${name}`);
  }

  // Generate icon.ico (Windows) - multi-size ICO
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(svgBuffer, { density: Math.ceil((size * 72) / 32) })
        .resize(size, size)
        .png()
        .toBuffer(),
    ),
  );

  // Simple ICO generation (using the largest PNG as fallback)
  // For proper multi-size ICO, we use sharp's native output
  await sharp(svgBuffer, { density: 300 })
    .resize(256, 256)
    .png()
    .toFile(join(iconsDir, 'icon.png'));

  // Generate ICO file manually (ICO format)
  const icoBuffer = await createIco(icoBuffers, icoSizes);
  await writeFile(join(iconsDir, 'icon.ico'), icoBuffer);
  console.log('Generated icon.ico');

  // For macOS icns - use 1024x1024 PNG (icns generation requires native tools)
  // Create a placeholder PNG that can be converted later
  await sharp(svgBuffer, { density: 300 })
    .resize(1024, 1024)
    .png()
    .toFile(join(iconsDir, 'icon.icns.png'));
  console.log('Generated icon.icns.png (convert to .icns manually on macOS)');

  // Also copy as icon.icns placeholder (Tauri will handle this)
  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(iconsDir, 'icon.icns'));
  console.log('Generated icon.icns (PNG placeholder)');

  console.log('\nAll icons generated in:', iconsDir);
}

/**
 * Create ICO file buffer from PNG buffers
 * ICO format: https://en.wikipedia.org/wiki/ICO_(file_format)
 */
async function createIco(pngBuffers, sizes) {
  const images = [];

  for (let i = 0; i < pngBuffers.length; i++) {
    const metadata = await sharp(pngBuffers[i]).metadata();
    images.push({
      buffer: pngBuffers[i],
      width: sizes[i],
      height: sizes[i],
      size: pngBuffers[i].length,
    });
  }

  // ICO Header (6 bytes)
  const headerSize = 6;
  const dirEntrySize = 16;
  const numImages = images.length;
  const headerBuffer = Buffer.alloc(headerSize);
  headerBuffer.writeUInt16LE(0, 0); // Reserved
  headerBuffer.writeUInt16LE(1, 2); // Type: 1 = ICO
  headerBuffer.writeUInt16LE(numImages, 4); // Number of images

  // Directory entries
  let offset = headerSize + numImages * dirEntrySize;
  const dirEntries = [];

  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0); // Width
    entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1); // Height
    entry.writeUInt8(0, 2); // Color palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(img.size, 8); // Size of image data
    entry.writeUInt32LE(offset, 12); // Offset to image data
    dirEntries.push(entry);
    offset += img.size;
  }

  return Buffer.concat([headerBuffer, ...dirEntries, ...images.map((img) => img.buffer)]);
}

generateIcons().catch(console.error);
