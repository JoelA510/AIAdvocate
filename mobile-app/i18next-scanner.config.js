// mobile-app/i18next-scanner.config.js
module.exports = {
  input: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
  output: "./src/locales",
  options: {
    debug: false,
    sort: true,
    removeUnusedKeys: false,
    func: { list: ["t"], extensions: [".ts", ".tsx"] },
    lngs: ["en", "es"],
    ns: ["translation"],
    defaultValue: (lng, _ns, key) => (lng === "en" ? key : ""),
    resource: {
      loadPath: "src/locales/{{lng}}.json",
      savePath: "{{lng}}.json",
    },
  },
};
