import * as ts from 'typescript';
import { isMatch } from 'micromatch';
import FS from 'fs-extra';
import path from 'path';
import recursiveReaddirFiles from 'recursive-readdir-files';
import { transform } from '../babel';
import { BuildOptions } from '../build';
import { outputFiles, outputLog, copyFiles } from '../utils/output';

export interface CompileOptions extends BuildOptions {}
export async function compile(
  fileNames: string[],
  tsOptions: ts.CompilerOptions = {},
  options: CompileOptions,
): Promise<void> {
  let { entry, disableBabel, cjs = tsOptions.outDir || 'lib', esm = 'esm', ...other } = options || {};
  const outDir = path.resolve(process.cwd(), tsOptions.outDir || cjs);
  const entryDir = path.dirname(entry);
  cjs = path.relative(ts.sys.getCurrentDirectory(), cjs);
  return new Promise(async (resolve, reject) => {
    try {
      await FS.remove(outDir);
      const dirToFiles = await recursiveReaddirFiles(path.dirname(entry), {
        exclude: /(tsconfig.json|.(test|spec).(ts|tsx|js|jsx))$/,
      });
      await Promise.all(
        dirToFiles.map(async (item) => {
          if (disableBabel) {
            return;
          }
          if (cjs) {
            const cjsPath = item.path.replace(entryDir, cjs);
            if (isMatch(item.path, ['**/*.[jt]s?(x)']) && !isMatch(item.path, ['**/?(*.)+(spec|test).[jt]s?(x)', '**/*.d.ts'])) {
              transform(item.path, { entryDir, cjs, ...other });
            } else {
              await copyFiles(item.path, cjsPath);
            }
          }
          if (esm) {
            const esmPath = item.path.replace(entryDir, esm);
            if (isMatch(item.path, ['**/*.[jt]s?(x)']) && !isMatch(item.path, ['**/?(*.)+(spec|test).[jt]s?(x)', '**/*.d.ts'])) {
              transform(item.path, { entryDir, esm, ...other });
            } else {
              await copyFiles(item.path, esmPath);
            }
          }
        }),
      );

      // Create a Program with an in-memory emit
      const createdFiles: Record<string, string> = {};
      tsOptions = { ...tsOptions, outDir: cjs || esm, target: tsOptions.target || ts.ScriptTarget.ESNext };
      if (tsOptions.noEmit) {
        resolve();
        return;
      }

      const host = ts.createCompilerHost(tsOptions, true);
      // ts.getParsedCommandLineOfConfigFile('', tsOptions, host)
      const files: string[] = [];
      host.readFile = (file) => {
        const result = ts.sys.readFile(file);
        if (!/node_modules/.test(file)) {
          files.push(file);
        }
        return result;
      };
      host.writeFile = (fileName: string, contents: string) => {
        return (createdFiles[fileName] = contents);
      };

      const program = ts.createProgram(fileNames, tsOptions, host);

      // Prepare and emit the `d.ts` files
      program.emit();

      await Promise.all(
        Object.keys(createdFiles).map(async (filepath) => {
          try {
            if (disableBabel) {
              ts.sys.writeFile(filepath, createdFiles[filepath]);
              outputLog(filepath);
            }
            if (/\.d\.ts$/.test(filepath)) {
              if (new RegExp(`${esm}`).test(filepath)) {
                outputFiles(filepath, createdFiles[filepath]);
                if (cjs) {
                  const fileCjs = filepath.replace(esm, cjs);
                  outputFiles(fileCjs, createdFiles[filepath]);
                }
              }
              if (new RegExp(`${cjs}`).test(filepath)) {
                outputFiles(filepath, createdFiles[filepath]);
                if (esm) {
                  const fileEsm = filepath.replace(cjs, esm);
                  outputFiles(fileEsm, createdFiles[filepath]);
                }
              }
            }
          } catch (error) {
            reject(error);
          }
        }),
      );
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}
