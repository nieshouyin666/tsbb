import fs from 'fs-extra';
import path from 'path';
import { getExt } from './';

/**
 * IFileDirStat
 * @param {string} name E.g: `sum.ts`;
 * @param {string} path E.g: `/basic/src/utils/sum.ts`
 * @param {string} outputPath E.g: `/basic/src/utils/sum.js`
 */
export interface IFileDirStat {
  name: string;
  path: string;
  outputPath?: string;
  ext?: string;
  size?: number;
  isDirectory?: boolean;
  isFile?: boolean;
}


export async function getFileStat(root: string, outpuPath: string, filePath: string): Promise<IFileDirStat> {
  const stat = await fs.stat(filePath);
  return {
    name: filePath,
    path: filePath,
    outputPath: filePath.replace(root, outpuPath).replace(/.ts$/, '.js'),
    ext: getExt(filePath),
    size: stat.size,
    isFile: true,
  };
}

async function getFiles(rootPath: string, outpuPath: string, files: IFileDirStat[], root: string) {
  const filesData = await fs.readdir(rootPath);
  const fileDir: IFileDirStat[] = filesData.map(file => ({
    name: file,
    path: path.join(rootPath, file),
  }));
  await Promise.all(fileDir.map(async (item: IFileDirStat) => {
    const stat = await fs.stat(item.path);
    item.size = stat.size;
    item.ext = '';
    if (stat.isDirectory()) {
      // item.ext = 'dir';
      // item.isDirectory = true;
      files = files.concat(await getFiles(item.path, outpuPath, [], root));
    } else if (stat.isFile()) {
      item.ext = getExt(item.path);
      item.isFile = true;
      item.outputPath = item.path.replace(root, outpuPath);
      files.push(item);
      if (/ts$/.test(item.ext)) {
        item.outputPath = item.outputPath.replace(new RegExp(`.${item.ext}$`), '.js');
      }
    }
    return item;
  }));
  return files;
}

export default async (rootPath: string, outpuPath?: string) => {
  return await getFiles(rootPath, outpuPath, [], rootPath);
}