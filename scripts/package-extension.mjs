import fs from "node:fs";
import { execFileSync } from "node:child_process";
fs.rmSync("extension-build", { recursive: true, force: true });
fs.mkdirSync("extension-build");
fs.cpSync("dist", "extension-build", { recursive: true });
fs.cpSync("extension", "extension-build", { recursive: true });
fs.rmSync("extension-build/drapeit-extension.zip", { force: true });
// Extension CSP permits only bundled scripts; Vite's module entry is external.
const html = fs.readFileSync("extension-build/index.html", "utf8");
if (/<script(?![^>]*src=)[^>]*>\s*\S/.test(html))
  throw new Error("Inline scripts are incompatible with extension CSP.");
execFileSync("python", [
  "-c",
  "import pathlib,zipfile; root=pathlib.Path('extension-build'); z=zipfile.ZipFile('dist/drapeit-extension.zip','w',zipfile.ZIP_DEFLATED); [z.write(p,p.relative_to(root)) for p in root.rglob('*') if p.is_file()]; z.close()",
]);
console.log("Packaged extension with local tracking models and WebAssembly.");
