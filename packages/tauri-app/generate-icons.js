const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const iconSizes = [
  { size: 32, name: '32x32.png' },
  { size: 128, name: '128x128.png' },
  { size: 256, name: '128x128@2x.png' },
  { size: 512, name: 'icon.png' },
  { size: 1024, name: 'icon.icns' }, // 用于macOS
];

const androidSizes = [
  { size: 48, dir: 'mipmap-mdpi', name: 'ic_launcher.png' },
  { size: 72, dir: 'mipmap-hdpi', name: 'ic_launcher.png' },
  { size: 96, dir: 'mipmap-xhdpi', name: 'ic_launcher.png' },
  { size: 144, dir: 'mipmap-xxhdpi', name: 'ic_launcher.png' },
  { size: 192, dir: 'mipmap-xxxhdpi', name: 'ic_launcher.png' },
];

const inputSvg = path.join(__dirname, 'src-tauri/icons/icon.svg');
const outputDir = path.join(__dirname, 'src-tauri/icons');
const androidResDir = path.join(__dirname, 'src-tauri/gen/android/app/src/main/res');

async function generateIcons() {
  console.log('🎨 开始生成应用图标...\n');

  // 生成通用图标
  for (const { size, name } of iconSizes) {
    const outputPath = path.join(outputDir, name);
    await sharp(inputSvg).resize(size, size).png().toFile(outputPath);
    console.log(`✅ 生成: ${name} (${size}x${size})`);
  }

  // 检查Android资源目录是否存在
  if (fs.existsSync(androidResDir)) {
    console.log('\n📱 生成Android图标...\n');

    // 生成Android图标
    for (const { size, dir, name } of androidSizes) {
      const dirPath = path.join(androidResDir, dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      const outputPath = path.join(dirPath, name);
      await sharp(inputSvg).resize(size, size).png().toFile(outputPath);
      console.log(`✅ 生成: ${dir}/${name} (${size}x${size})`);
    }
  } else {
    console.log('\n⚠️  Android资源目录不存在，跳过Android图标生成');
  }

  console.log('\n✨ 图标生成完成！');
}

generateIcons().catch((err) => {
  console.error('❌ 生成图标时出错:', err);
  process.exit(1);
});
