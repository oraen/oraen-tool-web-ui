const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
for (const folder of ["cmaps", "standard_fonts"]) {
  fs.cpSync(
    path.join(root, "node_modules/pdfjs-dist", folder),
    path.join(root, "public/pdfjs", folder),
    { recursive: true },
  );
}
