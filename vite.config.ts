import { defineConfig, PluginOption, UserConfig } from "vite";
// import { babel } from "@rollup/plugin-babel";
import eslint from "vite-plugin-eslint";
// import dts from "vite-plugin-dts";
import { dependencies } from "./package.json";
import { builtinModules } from "module";

//将dependencies依赖转换成外部化处理的映射表
const getExternalDependencies = (
  exclude: Array<string> = [],
  include: Array<string> = [],
) => {
  const external = [...Object.keys(dependencies), ...include].filter(
    (value) => !exclude.includes(value),
  );
  const globals = {};
  for (let name of external) {
    globals[name] = name;
  }
  return { external, globals };
};

//生成node模块数组
const generateNodeModules = () => {
  const nodeModuleNames = [...builtinModules];

  const appendList: Array<string> = [];

  for (let name of nodeModuleNames) {
    appendList.push(`node:${name}`);
  }

  return [...nodeModuleNames, ...appendList];
};

export default defineConfig(({ mode }): UserConfig => {
  const { external, globals } = getExternalDependencies(
    [],
    [...generateNodeModules()],
  );
  const getOutDir = () => {
    let dir = "";

    switch (mode) {
      case "development":
        dir = "dist-dev";
        break;
      case "production":
        dir = "dist-prod";
        break;
      default:
        dir = "dist-prod";
        break;
    }

    return dir;
  };

  const plugins: PluginOption[] = [
    //babel配置
    // babel({
    //   babelHelpers: "runtime",
    //   extensions: [".js", ".jsx", ".ts", ".tsx", ".cjs", ".mjs"],
    //   exclude: ["**/node_modules/**"],
    //   presets: [
    //     [
    //       "@babel/preset-env",
    //       {
    //         corejs: 3,
    //         useBuiltIns: "usage",
    //       },
    //     ],
    //   ],
    //   plugins: [["@babel/plugin-transform-runtime", {}]],
    // }) as PluginOption,
  ];

  if (mode !== "development") {
    //输出文件types
    // plugins.push(dts());
  }

  if (mode === "development") {
    plugins.push(
      eslint({
        fix: false,
        lintOnStart: true,
        include: ["./src"],
      }),
    );
  }

  return {
    build: {
      target: "esnext",
      outDir: getOutDir(),
      sourcemap: false,
      emptyOutDir: false,
      minify: mode !== "development",
      lib: {
        entry: "./src/index.ts",
        name: "index",
        fileName: (format, entryName) =>
          format === "es" ? `index.js` : `index.${format}.js`,
        formats: ["umd", "es"],
      },
      rollupOptions: {
        // 确保外部化处理那些你不想打包进库的依赖
        external: [...external],
        output: {
          // 在 UMD 构建模式下为这些外部化的依赖提供一个全局变量
          globals: {
            ...globals,
          },
        },
      },
    },
    esbuild: {
      legalComments: "none",
      keepNames: false,
      drop: [],
    },
    plugins: [...plugins],
  };
});
