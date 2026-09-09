import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function runProcess(args, cwd, label) {
	const result = spawnSync(process.execPath, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		shell: false,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
		throw new Error(`${label} failed with exit code ${result.status}: ${output}`);
	}
	return result.stdout ?? "";
}

function runNpm(args, cwd) {
	const npmExecPath = process.env.npm_execpath;
	if (!npmExecPath) throw new Error("Package smoke must be run through npm");
	return runProcess([npmExecPath, ...args], cwd, `npm ${args.join(" ")}`);
}

function packageFiles(packResult) {
	return new Set((packResult.files ?? []).map((file) => file.path.replaceAll("\\", "/")));
}

function readPackageJson() {
	try {
		return JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
	} catch {
		throw new Error("Could not parse package.json for package smoke");
	}
}

function readTarballEntries(tarballPath) {
	let archive;
	try {
		archive = gunzipSync(readFileSync(tarballPath));
	} catch {
		throw new Error("Could not read npm pack tarball");
	}

	const entries = [];
	for (let offset = 0; offset + 512 <= archive.length; ) {
		const header = archive.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
		const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
		const size = Number.parseInt(header.subarray(124, 136).toString("utf8").trim() || "0", 8);
		if (!Number.isFinite(size) || size < 0) throw new Error("Invalid npm pack tarball entry");
		entries.push(prefix ? `${prefix}/${name}` : name);
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return entries;
}

const packageJson = readPackageJson();
let tempRoot;
try {
	tempRoot = mkdtempSync(join(tmpdir(), "pi-agent-pulse-package-smoke-"));
	const packDir = join(tempRoot, "pack");
	mkdirSync(packDir);

	const packOutput = runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", packDir], repoRoot);
	const packResult = JSON.parse(packOutput)[0];
	if (!packResult?.filename) throw new Error("npm pack did not return a tarball filename");

	const tarballPath = join(packDir, packResult.filename);
	if (!existsSync(tarballPath)) throw new Error(`Tarball was not created: ${packResult.filename}`);

	const files = packageFiles(packResult);
	for (const required of ["package.json", "README.md", "LICENSE", "dist/extension/pi.js"]) {
		if (!files.has(required)) throw new Error(`Tarball file list is missing ${required}`);
	}

	const tarballEntries = readTarballEntries(tarballPath);
	for (const required of [
		"package/package.json",
		"package/README.md",
		"package/LICENSE",
		"package/dist/extension/pi.js",
	]) {
		if (!tarballEntries.includes(required)) throw new Error(`Tarball contents are missing ${required}`);
	}

	const consumerDir = join(tempRoot, "consumer");
	mkdirSync(consumerDir);
	writeFileSync(
		join(consumerDir, "package.json"),
		JSON.stringify(
			{ name: "pi-agent-pulse-package-smoke", version: "1.0.0", private: true, type: "module" },
			null,
			2,
		),
	);
	runNpm(
		[
			"install",
			"--ignore-scripts",
			"--omit=dev",
			"--no-package-lock",
			"--no-save",
			tarballPath,
			`@earendil-works/pi-coding-agent@${packageJson.devDependencies["@earendil-works/pi-coding-agent"]}`,
		],
		consumerDir,
	);

	const installedExtension = join(consumerDir, "node_modules", packageJson.name, "dist", "extension", "pi.js");
	if (!existsSync(installedExtension)) throw new Error(`Installed extension is missing: ${installedExtension}`);
	const importScript = [
		`const extension = await import(${JSON.stringify(pathToFileURL(installedExtension).href)});`,
		'if (typeof extension.default !== "function" || typeof extension.createPiPulseExtension !== "function") {',
		'throw new Error("Pi Pulse extension exports are invalid");',
		"}",
	].join("\n");
	runProcess(["--input-type=module", "-e", importScript], consumerDir, "extension import");

	console.log(`Package smoke passed for ${packageJson.name}@${packageJson.version}: ${packResult.filename}`);
	console.log("Verified package.json, README.md, LICENSE, dist/extension/pi.js, install, and extension exports.");
} catch (error) {
	console.error(`Package smoke failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}
