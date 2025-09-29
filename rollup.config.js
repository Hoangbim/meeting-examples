import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import babel from "@rollup/plugin-babel";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";
import replace from "@rollup/plugin-replace";
import copy from "rollup-plugin-copy";
import { readFileSync } from "fs";

// Read package.json for version and metadata
const pkg = JSON.parse(readFileSync("./package.json", "utf-8"));

// Environment variables
const isDev = process.env.NODE_ENV === "development";
const isProd = process.env.NODE_ENV === "production";

// Banner for built files
const banner = `/**
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * 
 * @author ${pkg.author.name} <${pkg.author.email}>
 * @license ${pkg.license}
 * @homepage ${pkg.homepage}
 */`;

// Base configuration
const baseConfig = {
  input: "src/index.js",
  external: [], // No external dependencies since we want a standalone bundle
  plugins: [
    // Copy static files in development
    ...(isDev
      ? [
          copy({
            targets: [
              { src: "demo/**/*", dest: "dist/demo" },
              { src: "README.md", dest: "dist/" },
              { src: "package.json", dest: "dist/" },
            ],
          }),
        ]
      : []),

    // Replace environment variables
    replace({
      preventAssignment: true,
      values: {
        __VERSION__: JSON.stringify(pkg.version),
        __DEV__: isDev,
        __PROD__: isProd,
        "process.env.NODE_ENV": JSON.stringify(
          process.env.NODE_ENV || "development"
        ),
      },
    }),

    // Resolve node modules
    resolve({
      browser: true,
      preferBuiltins: false,
      exportConditions: ["browser", "import", "module", "default"],
    }),

    // Handle CommonJS modules
    commonjs({
      include: /node_modules/,
    }),

    // Handle JSON imports
    json(),

    // Babel transpilation
    babel({
      babelHelpers: "bundled",
      exclude: /node_modules/,
      presets: [
        [
          "@babel/preset-env",
          {
            targets: {
              browsers: ["defaults", "not IE 11", "not op_mini all"],
            },
            modules: false,
            useBuiltIns: "usage",
            corejs: 3,
          },
        ],
      ],
    }),
  ],
};

// Development configuration
// const devConfig = {
//   ...baseConfig,
//   output: {
//     file: "dist/ermis-classroom.js",
//     format: "umd",
//     name: "ErmisClassroom",
//     banner,
//     sourcemap: true,
//     globals: {},
//   },
//   watch: {
//     include: "src/**",
//     exclude: "node_modules/**",
//   },
// };

// Production configurations
// const prodConfigs = [
//   // UMD build
//   {
//     ...baseConfig,
//     output: {
//       file: "dist/ermis-classroom.js",
//       format: "umd",
//       name: "ErmisClassroom",
//       banner,
//       sourcemap: true,
//       globals: {},
//     },
//     plugins: [...baseConfig.plugins],
//   },

//   // UMD minified build
//   {
//     ...baseConfig,
//     output: {
//       file: "dist/ermis-classroom.min.js",
//       format: "umd",
//       name: "ErmisClassroom",
//       banner,
//       sourcemap: true,
//       globals: {},
//     },
//     plugins: [
//       ...baseConfig.plugins,
//       terser({
//         format: {
//           comments: /^!/,
//           preamble: banner,
//         },
//         compress: {
//           drop_console: true,
//           drop_debugger: true,
//           pure_funcs: ["console.log", "console.info", "console.debug"],
//         },
//       }),
//     ],
//   },

//   // ES module build
//   {
//     ...baseConfig,
//     output: {
//       file: "dist/ermis-classroom.esm.js",
//       format: "es",
//       banner,
//       sourcemap: true,
//     },
//     plugins: [...baseConfig.plugins],
//   },

//   // CommonJS build
//   {
//     ...baseConfig,
//     output: {
//       file: "dist/ermis-classroom.cjs.js",
//       format: "cjs",
//       banner,
//       sourcemap: true,
//       exports: "default",
//     },
//     plugins: [...baseConfig.plugins],
//   },
// ];

// Export configuration based on environment
// let config;

// if (isDev) {
//   config = devConfig;
// } else if (isProd) {
//   config = prodConfigs;
// } else {
//   // Default to single UMD build
//   config = {
//     ...baseConfig,
//     output: {
//       file: "dist/ermis-classroom.js",
//       format: "umd",
//       name: "ErmisClassroom",
//       banner,
//       sourcemap: true,
//       globals: {},
//     },
//   };
// }

// ...existing code...

// export default config;

export default {
  ...baseConfig,
  output: {
    dir: "dist",
    format: "es", // hoặc "cjs"
    sourcemap: true,
    banner,
  },
  plugins: [...baseConfig.plugins],
};

// export default {
//   input: "src/index.js",
//   output: {
//     dir: "dist",
//     format: "es", // hoặc "cjs"
//     sourcemap: true,
//     banner,
//   },
//   plugins: [
//     // ...plugins như cũ
//   ],
// };
