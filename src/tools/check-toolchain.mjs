// tools/toolchain.json's pins against their real owners: android/app/build.gradle.kts, windows/Rapier.vcxproj, .github/workflows/rapier.yml.
// Run by tools/build.mjs; alone: node tools/check-toolchain.mjs
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');

function matchOne(source, pattern, label, problems) {
	const matches = [...source.matchAll(pattern)];
	if (matches.length === 0) { problems.push(label + ' not found'); return null; }
	if (matches.length > 1 && new Set(matches.map(m => m[1])).size > 1) {
		problems.push(label + ' appears more than once with different values: ' + matches.map(m => m[1]).join(', '));
		return null;
	}
	return matches[0][1];
}

export function checkToolchain() {
	const problems = [];
	const toolchain = JSON.parse(read('tools/toolchain.json'));
	const rapierYml = read('.github/workflows/rapier.yml');
	const gradle = read('android/app/build.gradle.kts');
	const vcxproj = read('windows/Rapier.vcxproj');

	// Java: the workflow's setup-java step and build.gradle.kts's source/target/jvmTarget must all
	// name the one version tools/toolchain.json pins.
	const workflowJava = matchOne(rapierYml, /java-version:\s*"(\d+)"/g, 'rapier.yml setup-java java-version', problems);
	if (workflowJava && workflowJava !== String(toolchain.java.version)) {
		problems.push(`rapier.yml pins Java ${workflowJava}, tools/toolchain.json pins ${toolchain.java.version}`);
	}
	for (const [label, pattern] of [
		['sourceCompatibility', /sourceCompatibility = JavaVersion\.VERSION_(\d+)/],
		['targetCompatibility', /targetCompatibility = JavaVersion\.VERSION_(\d+)/],
		['jvmTarget', /JvmTarget\.JVM_(\d+)/],
	]) {
		const found = firstMatch(gradle, pattern);
		if (found && found !== String(toolchain.java.version)) {
			problems.push(`android/app/build.gradle.kts ${label}=${found}, tools/toolchain.json pins Java ${toolchain.java.version}`);
		}
	}

	// Gradle: only the workflow pins a version (the project ships no wrapper).
	const workflowGradle = matchOne(rapierYml, /gradle-version:\s*"([^"]+)"/g, 'rapier.yml setup-gradle gradle-version', problems);
	if (workflowGradle && workflowGradle !== toolchain.gradle.version) {
		problems.push(`rapier.yml pins Gradle ${workflowGradle}, tools/toolchain.json pins ${toolchain.gradle.version}`);
	}

	// Android SDK: the workflow's sdkmanager platform/build-tools strings, and the project's own
	// compileSdk/minSdk.
	const workflowPlatform = matchOne(rapierYml, /"platforms;(android-[\d.]+)"/g, 'rapier.yml sdkmanager platform', problems);
	if (workflowPlatform && workflowPlatform !== toolchain.android.platform) {
		problems.push(`rapier.yml installs platform ${workflowPlatform}, tools/toolchain.json pins ${toolchain.android.platform}`);
	}
	const workflowBuildTools = matchOne(rapierYml, /"build-tools;([\d.]+)"/g, 'rapier.yml sdkmanager build-tools', problems);
	if (workflowBuildTools && workflowBuildTools !== toolchain.android.buildTools) {
		problems.push(`rapier.yml installs build-tools ${workflowBuildTools}, tools/toolchain.json pins ${toolchain.android.buildTools}`);
	}
	const compileSdk = firstMatch(gradle, /compileSdk\s*=\s*(\d+)/);
	if (compileSdk && Number(compileSdk) !== toolchain.android.compileSdk) {
		problems.push(`android/app/build.gradle.kts compileSdk=${compileSdk}, tools/toolchain.json pins ${toolchain.android.compileSdk}`);
	}
	const minSdk = firstMatch(gradle, /minSdk\s*=\s*(\d+)/);
	if (minSdk && Number(minSdk) !== toolchain.android.minSdk) {
		problems.push(`android/app/build.gradle.kts minSdk=${minSdk}, tools/toolchain.json pins ${toolchain.android.minSdk}`);
	}

	// Windows: PlatformToolset, WindowsTargetPlatformVersion and the pinned WebView2 SDK all come
	// from the one project file the workflow itself reads (windows/Rapier.vcxproj) before
	// restoring the SDK.
	const platformToolset = firstMatch(vcxproj, /<PlatformToolset>([^<]+)<\/PlatformToolset>/);
	if (platformToolset && platformToolset !== toolchain.windows.platformToolset) {
		problems.push(`windows/Rapier.vcxproj PlatformToolset=${platformToolset}, tools/toolchain.json pins ${toolchain.windows.platformToolset}`);
	}
	const targetPlatform = firstMatch(vcxproj, /<WindowsTargetPlatformVersion>([^<]+)<\/WindowsTargetPlatformVersion>/);
	if (targetPlatform && targetPlatform !== toolchain.windows.windowsTargetPlatformVersion) {
		problems.push(`windows/Rapier.vcxproj WindowsTargetPlatformVersion=${targetPlatform}, tools/toolchain.json pins ${toolchain.windows.windowsTargetPlatformVersion}`);
	}
	const webview2 = firstMatch(vcxproj, /<WebView2PackageVersion>([^<]+)<\/WebView2PackageVersion>/);
	if (webview2 && webview2 !== toolchain.windows.webview2) {
		problems.push(`windows/Rapier.vcxproj WebView2PackageVersion=${webview2}, tools/toolchain.json pins ${toolchain.windows.webview2}`);
	}

	return {problems};
}

function firstMatch(source, pattern) {
	const match = pattern.exec(source);
	return match ? match[1] : null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const {problems} = checkToolchain();
	if (problems.length) {
		console.error('toolchain consistency: ' + problems.join('\n'));
		process.exit(1);
	}
	console.log('toolchain consistency: tools/toolchain.json matches rapier.yml, build.gradle.kts and Rapier.vcxproj');
}
