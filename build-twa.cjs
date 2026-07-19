const { Config, TwaManifest, TwaGenerator, AndroidSdkTools, JdkHelper, KeyTool } = require('@bubblewrap/core');
const path = require('path');
const fs = require('fs');

const JAVA_HOME = 'C:\\Users\\shrin\\.antigravity\\extensions\\redhat.java-1.54.0-win32-x64\\jre\\21.0.10-win32-x86_64';
const ANDROID_HOME = 'C:\\Users\\shrin\\AppData\\Local\\Android\\Sdk';
const PROJECT_DIR = path.join(__dirname, 'android-twa');

async function main() {
  fs.mkdirSync(PROJECT_DIR, { recursive: true });

  const config = new Config({ jdkPath: JAVA_HOME, androidSdkPath: ANDROID_HOME });
  const jdkHelper = new JdkHelper(config);
  const keyTool = new KeyTool(jdkHelper);

  const twaManifest = new TwaManifest({
    packageId: 'tanglish.caption.studio',
    host: 'tanglish-caption-studio.pages.dev',
    name: 'Tanglish Caption Studio',
    shortName: 'CaptionStudio',
    startUrl: '/',
    themeColor: '#9333ea',
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'public', 'icons', 'icon-512.png'),
    signing: {
      path: path.join(PROJECT_DIR, 'keystore.jks'),
      password: 'caption2026',
      alias: 'caption',
      aliasPassword: 'caption2026',
    },
    appVersionCode: 1,
    appVersionName: '1.0.0',
    useFallback: true,
  });

  console.log('TwaManifest created. Generating TWA project...');

  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(PROJECT_DIR, twaManifest, config, keyTool);

  console.log('TWA project created at:', PROJECT_DIR);
  console.log('Building APK...');

  const sdkTools = new AndroidSdkTools(config, jdkHelper);
  await sdkTools.runGradle(PROJECT_DIR, ['assembleRelease']);

  console.log('Done! APK at:', path.join(PROJECT_DIR, 'app', 'build', 'outputs', 'apk', 'release'));
}

main().catch(console.error);
