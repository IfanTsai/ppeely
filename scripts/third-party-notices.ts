// Generates the third-party license list third-party-notices.txt at build time; it ships with the web assets in both platform packages and is read by the "Open source licenses" page in settings.
//
// npm packages bundled into the JS bundle are collected from this build's module graph, so only packages actually used are included; components outside the module graph
// (model files, libraries compiled into WASM, native dependencies) are registered in EXTRA_COMPONENTS, with license texts in the licenses/ directory.
// When native dependencies change (upgrading Capacitor or plugins), check EXTRA_COMPONENTS against `./gradlew :app:dependencies --configuration releaseRuntimeClasspath`
// and each plugin's Package.swift.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { NOTICE_LABEL, NOTICE_RULE, NOTICE_THIN_RULE } from '../src/lib/notices';

interface Component {
  name: string;
  version?: string;
  license: string;
  url?: string;
  text: string;
  notice?: string;
}

interface ExtraComponent {
  name: string;
  license: string;
  url: string;
  // File name under the licenses/ directory.
  text: string;
  notice?: string;
}

interface PackageJson {
  name: string;
  version: string;
  license?: string | { type: string };
  homepage?: string;
  repository?: string | { url: string };
}

const NOTICES_FILE = 'third-party-notices.txt';

const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt))?$/i;
const NOTICE_FILE = /^notice(\.(md|txt))?$/i;

// License text used when an npm package ships no license file: taken from the license at the root of the package's source repository, or chosen by the license declared in package.json.
const LICENSE_TEXT_FALLBACKS: Record<string, string> = {
  '@ionic/vue': 'ionic-framework.txt',
  '@ionic/vue-router': 'ionic-framework.txt',
  '@mediapipe/tasks-vision': 'apache-2.0.txt',
};

// npm packages that are not imported but still ship with the app: Capacitor's native runtime.
const EXTRA_PACKAGES = ['@capacitor/android', '@capacitor/ios'];

const EXTRA_COMPONENTS: ExtraComponent[] = [
  {
    name: 'DeepLab v3 segmentation model (TensorFlow Lite, MediaPipe model zoo)',
    license: 'Apache-2.0',
    url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite',
    text: 'apache-2.0.txt',
  },
  {
    name: 'libwebp (compiled into wasm-webp)',
    license: 'BSD-3-Clause',
    url: 'https://chromium.googlesource.com/webm/libwebp',
    text: 'libwebp.txt',
  },
  {
    name: 'Apache Cordova Android (Android only)',
    license: 'Apache-2.0',
    url: 'https://github.com/apache/cordova-android',
    text: 'apache-2.0.txt',
    notice: 'apache-cordova-NOTICE.txt',
  },
  { name: 'AndroidX libraries (Android only)', license: 'Apache-2.0', url: 'https://android.googlesource.com/platform/frameworks/support', text: 'apache-2.0.txt' },
  { name: 'Material Components for Android (Android only)', license: 'Apache-2.0', url: 'https://github.com/material-components/material-components-android', text: 'apache-2.0.txt' },
  { name: 'Kotlin standard library (Android only)', license: 'Apache-2.0', url: 'https://github.com/JetBrains/kotlin', text: 'apache-2.0.txt' },
  { name: 'kotlinx.coroutines (Android only)', license: 'Apache-2.0', url: 'https://github.com/Kotlin/kotlinx.coroutines', text: 'apache-2.0.txt' },
  { name: 'JetBrains Java Annotations (Android only)', license: 'Apache-2.0', url: 'https://github.com/JetBrains/java-annotations', text: 'apache-2.0.txt' },
  { name: 'Gson (Android only)', license: 'Apache-2.0', url: 'https://github.com/google/gson', text: 'apache-2.0.txt' },
  { name: 'Guava ListenableFuture (Android only)', license: 'Apache-2.0', url: 'https://github.com/google/guava', text: 'apache-2.0.txt' },
  { name: 'Error Prone annotations (Android only)', license: 'Apache-2.0', url: 'https://github.com/google/error-prone', text: 'apache-2.0.txt' },
  { name: 'AutoValue annotations (Android only)', license: 'Apache-2.0', url: 'https://github.com/google/auto', text: 'apache-2.0.txt' },
  { name: 'JSpecify (Android only)', license: 'Apache-2.0', url: 'https://github.com/jspecify/jspecify', text: 'apache-2.0.txt' },
  {
    name: 'libyuv (in androidx.camera:camera-core, Android only)',
    license: 'BSD-3-Clause',
    url: 'https://chromium.googlesource.com/libyuv/libyuv',
    text: 'libyuv.txt',
  },
  { name: 'ion-android-camera (Android only)', license: 'MIT', url: 'https://github.com/ionic-team/ion-android-camera', text: 'ion-android-camera.txt' },
  { name: 'ion-android-filesystem (Android only)', license: 'MIT', url: 'https://github.com/ionic-team/ion-android-filesystem', text: 'ion-android-filesystem.txt' },
  { name: 'ion-ios-camera (iOS only)', license: 'MIT', url: 'https://github.com/ionic-team/ion-ios-camera', text: 'ion-ios-camera.txt' },
  { name: 'ion-ios-filesystem (iOS only)', license: 'MIT', url: 'https://github.com/ionic-team/ion-ios-filesystem', text: 'ion-ios-filesystem.txt' },
];

export function thirdPartyNotices(root: string): Plugin {
  const licensesDir = join(root, 'licenses');
  const readLicenseText = (file: string): string => readFileSync(join(licensesDir, file), 'utf8');

  return {
    name: 'third-party-notices',
    apply: 'build',
    generateBundle() {
      const packageDirs = new Set<string>(EXTRA_PACKAGES.map((name) => join(root, 'node_modules', name)));
      for (const id of this.getModuleIds()) {
        const dir = packageDirectory(id);
        if (dir) {
          packageDirs.add(dir);
        }
      }

      const components = [
        ...[...packageDirs].map((dir) => readPackage(dir, readLicenseText)),
        ...EXTRA_COMPONENTS.map((extra) => ({
          ...extra,
          text: readLicenseText(extra.text),
          notice: extra.notice ? readLicenseText(extra.notice) : undefined,
        })),
      ];

      this.emitFile({ type: 'asset', fileName: NOTICES_FILE, source: render(components) });
    },
  };
}

// When a module ID is a file under node_modules, returns the directory of its npm package; uses the last node_modules segment so nested installs work.
function packageDirectory(id: string): string | null {
  if (id.startsWith('\0')) {
    return null;
  }

  const path = id.split('?')[0].replaceAll('\\', '/');
  const marker = '/node_modules/';
  const index = path.lastIndexOf(marker);
  if (index === -1) {
    return null;
  }

  const segments = path.slice(index + marker.length).split('/');
  const name = segments[0].startsWith('@') ? segments.slice(0, 2).join('/') : segments[0];

  return path.slice(0, index + marker.length) + name;
}

function readPackage(dir: string, readLicenseText: (file: string) => string): Component {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageJson;
  const files = readdirSync(dir);
  const licenseFile = files.find((file) => LICENSE_FILE.test(file));
  const noticeFile = files.find((file) => NOTICE_FILE.test(file));

  let text: string;
  if (licenseFile) {
    text = readFileSync(join(dir, licenseFile), 'utf8');
  } else if (LICENSE_TEXT_FALLBACKS[pkg.name]) {
    text = readLicenseText(LICENSE_TEXT_FALLBACKS[pkg.name]);
  } else {
    // Fail the build: a new dependency without license text must be filled in by hand, not silently skipped.
    throw new Error(`${pkg.name} has no license file; add its license text to LICENSE_TEXT_FALLBACKS in scripts/third-party-notices.ts`);
  }

  return {
    name: pkg.name,
    version: pkg.version,
    license: typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'UNKNOWN'),
    url: repositoryUrl(pkg),
    text,
    notice: noticeFile ? readFileSync(join(dir, noticeFile), 'utf8') : undefined,
  };
}

function repositoryUrl(pkg: PackageJson): string | undefined {
  const raw = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!raw) {
    return pkg.homepage;
  }

  return raw
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^ssh:\/\/git@/, 'https://')
    .replace(/^github:/, 'https://github.com/')
    .replace(/\.git$/, '');
}

// Components with identical license text are merged into one section that lists the text once. The format is defined in src/lib/notices.ts, which the in-app page uses to parse it.
function render(components: Component[]): string {
  const groups = new Map<string, Component[]>();
  for (const component of [...components].sort((a, b) => a.name.localeCompare(b.name))) {
    const key = `${component.text.trim()}\n\0${component.notice?.trim() ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), component]);
  }

  const sections = [...groups.values()].map((members) => {
    const header = members
      .map((member) => [
        `${member.name}${member.version ? ` ${member.version}` : ''}`,
        `  License: ${member.license}`,
        ...(member.url ? [`  Source: ${member.url}`] : []),
      ].join('\n'))
      .join('\n');
    const notice = members[0].notice ? `\n${NOTICE_THIN_RULE}\n${NOTICE_LABEL}\n\n${members[0].notice.trim()}\n` : '';

    return `${NOTICE_RULE}\n${header}\n${NOTICE_THIN_RULE}\n\n${members[0].text.trim()}\n${notice}`;
  });

  const intro = [
    'Third-party software notices',
    '',
    'This app includes the third-party software listed below. Components that share the same',
    'license text are grouped together, followed by that license text.',
  ].join('\n');

  return `${intro}\n\n${sections.join('\n')}`;
}
