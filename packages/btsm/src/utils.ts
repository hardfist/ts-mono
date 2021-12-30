const { resolve } = require("path");
const { existsSync } = require("fs");
export function $defaults(format) {
  let { FORCE_COLOR, NO_COLOR, NODE_DISABLE_COLORS, TERM } = process.env;
  let argv = process.argv.slice(2);
  let flags = new Set(argv);
  let isQuiet = flags.has("-q") || flags.has("--quiet");
  let enabled = !NODE_DISABLE_COLORS && NO_COLOR == null && TERM !== "dumb" && (FORCE_COLOR != null && FORCE_COLOR !== "0" || process.stdout.isTTY);
  let idx = flags.has("--tsmconfig") ? argv.indexOf("--tsmconfig") : -1;
  let file = resolve(".", !!~idx && argv[++idx] || "tsm.js");
  return {
    file: existsSync(file) && file,
    isESM: format === "esm",
    options: {
      format,
      charset: "utf8",
      sourcemap: "inline",
      target: format === "esm" ? "node" + process.versions.node : "node12",
      logLevel: isQuiet ? "silent" : "warning",
      color: enabled
    }
  };
};
export function $finalize(env, custom) {
  let base = env.options;
  if (custom && custom.common) {
    Object.assign(base, custom.common);
    delete custom.common;
  }
  let config = {
    ".mts": { ...base, loader: "ts" },
    ".jsx": { ...base, loader: "jsx" },
    ".tsx": { ...base, loader: "tsx" },
    ".cts": { ...base, loader: "ts" },
    ".ts": { ...base, loader: "ts" }
  };
  if (env.isESM) {
    config[".json"] = { ...base, loader: "json" };
  } else {
    config[".mjs"] = { ...base, loader: "js" };
  }
  let extn;
  if (custom && custom.loaders) {
    for (extn in custom.loaders)
      config[extn] = {
        ...base,
        loader: custom.loaders[extn]
      };
  } else if (custom) {
    let conf = custom.config || custom;
    for (extn in conf)
      config[extn] = { ...base, ...conf[extn] };
  }
  return config;
};
