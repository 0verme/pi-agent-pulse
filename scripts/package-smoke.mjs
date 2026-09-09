import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const tarCommand = process.platform === "win32" ? "tar.exe" : "tar";

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		shell: process.platform === "win32" && command === npmCommand,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
		throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}: ${output}`);
	}
	return result.stdout ?? "";
}

function packageFiles(packResult) {
	return new Set((packResult.files ?? []).map((file) => file.path.replaceAll("\\", "/")));
}

let tempRoot;
try {
	tempRoot = mkdtempSync(join(tmpdir(), "pi-agent-pulse-package-smoke-"));
	const packDir = join(tempRoot, "pack");
	mkdirSync(packDir);

	const packOutput = run(npmCommand, ["pack", "--ignore-scripts", "--json", "--pack-destination", packDir], repoRoot);
	const packResult = JSON.parse(packOutput)[0];
	if (!packResult?.filename) throw new Error("npm pack did not return a tarball filename");

	const tarballPath = join(packDir, packResult.filename);
	if (!existsSync(tarballPath)) throw new Error(`Tarball was not created: ${packResult.filename}`);

	const files = packageFiles(packResult);
	for (const required of ["package.json", "README.md", "LICENSE", "dist/extension/pi.js"]) {
		if (!files.has(required)) throw new Error(`Tarball file list is missing ${required}`);
	}

	const tarballEntries = run(tarCommand, ["-tzf", tarballPath], packDir)
		.split(/\r?\n/)
		.map((entry) => entry.trim())
		.filter(Boolean);
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
	run(
		npmCommand,
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
	run(process.execPath, ["--input-type=module", "-e", importScript], consumerDir);

	console.log(`Package smoke passed for ${packageJson.name}@${packageJson.version}: ${packResult.filename}`);
	console.log("Verified package.json, README.md, LICENSE, dist/extension/pi.js, install, and extension exports.");
} catch (error) {
	console.error(`Package smoke failed: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
} finally {
	if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
}
