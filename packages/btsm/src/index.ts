import { existsSync, promises as fs } from "fs";
import { build } from 'esbuild'
import { dirname } from 'path'
import { URL, pathToFileURL, fileURLToPath } from 'url'
import * as tsm from "./utils";
let config;
let esbuild;
let env = tsm.$defaults("esm");
let setup = env.file && import("file:///" + env.file);
async function toConfig() {
  let mod = await setup;
  mod = mod && mod.default || mod;
  return tsm.$finalize(env, mod);
}
const EXTN = /\.\w+(?=\?|$)/;
const isTS = /\.[mc]?tsx?(?=\?|$)/;
const isJS = /\.([mc])?js$/;
const extensionsRegex = /\.m?(tsx?|json)$/

async function esbuildResolve(id, dir) {
  let result

  await build({
    stdin: {
      contents: `import ${JSON.stringify(id)}`,
      resolveDir: dir,
    },
    write: false,
    bundle: true,
    treeShaking: false,
    ignoreAnnotations: true,
    mainFields: ['source', 'main', 'module'],
    platform: 'node',
    plugins: [{
      name: 'resolve',
      setup({ onLoad }) {
        onLoad({ filter: /.*/ }, (args) => {
          result = args.path
          return { contents: '' }
        })
      },
    }],
  })
  return result
}
async function toOptions(uri) {
  config = config || await toConfig();
  let [extn] = EXTN.exec(uri) || [];
  return config[extn];
}
function check(fileurl) {
  let tmp = fileURLToPath(fileurl);
  if (existsSync(tmp))
    return fileurl;
}
const root = new URL("file:///" + process.cwd() + "/");
function isValidURL(s) {
  try {
    return !!new URL(s)
  }
  catch (e) {
    if (e instanceof TypeError)
      return false

    throw e
  }
}
function getTsCompatSpecifier(parentURL, specifier) {
  let tsSpecifier
  let search

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    // Relative import
    const url = new URL(specifier, parentURL)
    tsSpecifier = fileURLToPath(url).replace(/\.tsx?$/, '')
    search = url.search
  }
  else {
    // Bare import
    tsSpecifier = specifier
    search = ''
  }

  return {
    tsSpecifier,
    search,
  }
}
export async function resolve(specifier, context, defaultResolve) {
  const {
    parentURL,
  } = context

  let url

  // According to Node's algorithm, we first check if it is a valid URL.
  // When the module is the entry point, node will provides a file URL to it.
  if (isValidURL(specifier)) {
    url = new URL(specifier)
  }
  else {
    // Try to resolve the module according to typescript's algorithm,
    // and construct a valid url.

    const parsed = getTsCompatSpecifier(parentURL, specifier)
    const path = await esbuildResolve(parsed.tsSpecifier, dirname(fileURLToPath(parentURL)))
    if (path) {
      url = pathToFileURL(path)
      url.search = parsed.search
    }
  }

  if (url) {
    // If the resolved file is typescript
    if (extensionsRegex.test(url.pathname)) {
      return {
        url: url.href,
        format: 'module',
      }
    }
    // Else, for other types, use default resolve with the valid path
    return defaultResolve(url.href, context, defaultResolve)
  }

  return defaultResolve(specifier, context, defaultResolve)
}
export const load = async function(uri, context, fallback) {
  let options = await toOptions(uri);
  if (options == null)
    return fallback(uri, context, fallback);
  let format = options.format === "cjs" ? "commonjs" : "module";
  let path = fileURLToPath(uri);
  let source = await fs.readFile(path);
  esbuild = esbuild || await import("esbuild");
  let result = await esbuild.transform(source.toString(), {
    ...options,
    sourcefile: path,
    format: format === "module" ? "esm" : "cjs"
  });
  return { format, source: result.code };
};
export const getFormat = async function(uri, context, fallback) {
  let options = await toOptions(uri);
  if (options == null)
    return fallback(uri, context, fallback);
  return { format: options.format === "cjs" ? "commonjs" : "module" };
};
export const transformSource = async function(source, context, xform) {
  let options = await toOptions(context.url);
  if (options == null)
    return xform(source, context, xform);
  esbuild = esbuild || await import("esbuild");
  let result = await esbuild.transform(source.toString(), {
    ...options,
    sourcefile: context.url,
    format: context.format === "module" ? "esm" : "cjs"
  });
  return { source: result.code };
};
