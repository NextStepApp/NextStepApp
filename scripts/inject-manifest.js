// scripts/inject-manifest.js
const fs = require("fs");
const path = require("path");

const DIST = path.join(__dirname, "..", "dist");
const INDEX = path.join(DIST, "index.html");

if (!fs.existsSync(INDEX)) {
  console.error("dist/index.html not found. Run the export first.");
  process.exit(1);
}

let html = fs.readFileSync(INDEX, "utf8");

// Inject manifest link + theme-color in <head>
if (!/rel=['"]manifest['"]/.test(html)) {
  html = html.replace(
    /<head>/i,
    `<head>
  <link rel="manifest" href="/NextStepApp/manifest.webmanifest">
  <meta name="theme-color" content="#0a84ff">`
  );
}

// Inject a SW registration snippet before </body> (idempotent)
if (!/navigator\.serviceWorker\.register\(/.test(html)) {
  html = html.replace(
    /<\/body>/i,
    `<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/NextStepApp/sw.js').catch(()=>{});
  }
</script>
</body>`
  );
}

fs.writeFileSync(INDEX, html, "utf8");
console.log("Injected manifest link + SW registration into dist/index.html");
