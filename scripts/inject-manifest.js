// Inject <link rel="manifest"> into dist/index.html for GH Pages base path.
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");
const INDEX = path.join(DIST, "index.html");

if (!fs.existsSync(INDEX)) {
  console.error("dist/index.html not found. Run the export first.");
  process.exit(1);
}

let html = fs.readFileSync(INDEX, "utf8");

// Add manifest + theme-color if missing
if (!/rel=["']manifest["']/.test(html)) {
  html = html.replace(
    /<head>/i,
    `<head>
  <link rel="manifest" href="/NextStepApp/manifest.webmanifest">
  <meta name="theme-color" content="#0a84ff">`
  );
}

fs.writeFileSync(INDEX, html, "utf8");
console.log("Injected manifest link into dist/index.html");
