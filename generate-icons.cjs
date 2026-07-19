const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, 'public', 'icons', 'logo.svg'));

async function generate() {
  // PWA icons
  await sharp(svg).resize(192, 192).png().toFile(path.join(__dirname, 'public', 'icons', 'icon-192.png'));
  await sharp(svg).resize(512, 512).png().toFile(path.join(__dirname, 'public', 'icons', 'icon-512.png'));

  // Android mipmap icons
  const mipmapDir = path.join(__dirname, 'android-app', 'app', 'src', 'main', 'res');
  const sizes = { 'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96, 'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192 };

  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(mipmapDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    await sharp(svg).resize(size, size).png().toFile(path.join(dir, 'ic_launcher.png'));
    console.log(`${folder}: ${size}x${size}`);
  }

  console.log('All icons generated!');
}

generate().catch(console.error);
