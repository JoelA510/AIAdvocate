const fs = require('fs');
const path = require('path');

// Simple recursive file search
function getFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getFiles(file));
        } else {
            results.push(file);
        }
    });
    return results;
}

const distDir = path.join(__dirname, '../dist');
const MAX_BUNDLE_SIZE_MB = 5;

console.log(`Checking bundle size in ${distDir}...`);

if (!fs.existsSync(distDir)) {
    console.log('No dist directory found. Run "npx expo export" first to generate bundles.');
    // Don't fail if dist doesn't exist, just warn. In CI, we should build first.
    process.exit(0);
}

const files = getFiles(distDir);
const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.hbc'));

let totalSize = 0;
jsFiles.forEach(f => {
    const stats = fs.statSync(f);
    totalSize += stats.size;
});

const totalSizeMB = totalSize / (1024 * 1024);
console.log(`Total JS bundle size: ${totalSizeMB.toFixed(2)} MB`);

if (totalSizeMB > MAX_BUNDLE_SIZE_MB) {
    console.error(`ERROR: Bundle size exceeds limit of ${MAX_BUNDLE_SIZE_MB} MB`);
    process.exit(1);
} else {
    console.log('SUCCESS: Bundle size is within limit.');
}
