// Copies the version in package.json into the Xcode project, which cannot read package.json at build time.
// Runs automatically from `npm version` (the "version" script in package.json); Android reads package.json directly
// in native/android/app/build.gradle. scripts/check-ios-project.py fails when the two get out of sync.
//
// MARKETING_VERSION (CFBundleShortVersionString) gets the version without a pre-release suffix, because iOS only
// accepts numbers there. CURRENT_PROJECT_VERSION (CFBundleVersion) gets major * 1000000 + minor * 1000 + patch,
// the same number Android uses as versionCode.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectPath = resolve(root, 'native/ios/App/App.xcodeproj/project.pbxproj');

const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const marketingVersion = version.split('-')[0];
const [major, minor, patch] = marketingVersion.split('.').map(Number);
if ([major, minor, patch].some((part) => !Number.isInteger(part)) || minor > 999 || patch > 999) {
  throw new Error(`unsupported version in package.json: ${version}`);
}

const buildNumber = major * 1000000 + minor * 1000 + patch;

const project = readFileSync(projectPath, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${marketingVersion};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${buildNumber};`);
writeFileSync(projectPath, project);

console.log(`iOS version ${marketingVersion} (${buildNumber})`);
