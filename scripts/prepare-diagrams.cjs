const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const packageDir = path.join(root, "node_modules/@plantuml/core");
const { version } = require(path.join(packageDir, "package.json"));
const output = path.join(root, "public/plantuml", version);
fs.mkdirSync(output, { recursive: true });
for (const file of [
  "plantuml.js",
  "viz-global.js",
  "themes.js",
  "emoji.js",
  "openiconic.js",
  "LICENSE",
]) {
  fs.copyFileSync(path.join(packageDir, file), path.join(output, file));
}
for (const file of ["frame.html", "frame.js"]) {
  fs.copyFileSync(
    path.join(
      root,
      "src/pages/professionalUtil/markdownUtil/diagrams/plantuml",
      file,
    ),
    path.join(output, file),
  );
}
