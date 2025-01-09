#!/usr/bin/env node

import { program } from 'commander';
import { downloadSong } from './commands/download';
import { downloadAlbum } from './commands/album';
import { setProxy } from './services/netease';
import * as fs from 'fs';

program
  .name('netease-downloader')
  .description('网易云音乐下载工具 NetEase Cloud Music Downloader')
  .version('1.0.0')
  .option('-p, --proxy <url>', '设置代理服务器 Set proxy server (e.g. http://127.0.0.1:7890)')
  .hook('preAction', (thisCommand) => {
    const options = thisCommand.opts();
    if (options.proxy) {
      setProxy(options.proxy);
    }
  });

program
  .command('download')
  .description('下载单个或多个音乐 Download single or multiple songs')
  .argument('[ids...]', '音乐ID列表 List of music IDs')
  .option('-f, --file <file>', '从文件读取ID列表 Read ID list from file')
  .action(async (ids: string[], options: { file?: string }) => {
    let musicIds = ids || [];

    if (options.file) {
      try {
        const fileContent = fs.readFileSync(options.file, 'utf8');
        const fileIds = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        musicIds = [...musicIds, ...fileIds];
      } catch (error) {
        console.error('读取文件失败 Failed to read file:', error);
        process.exit(1);
      }
    }

    musicIds = [...new Set(musicIds)];

    if (musicIds.length === 0) {
      console.error('请提供至少一个音乐ID Please provide at least one music ID');
      process.exit(1);
    }

    console.log(`准备下载 Preparing to download ${musicIds.length} 首歌曲 songs`);

    for (const id of musicIds) {
      await downloadSong(id);
    }

    console.log('\n所有下载任务完成！All download tasks completed!');
  });

program
  .command('album')
  .description('下载整张专辑 Download full album')
  .argument('<albumId>', '专辑ID或URL Album ID or URL')
  .action(downloadAlbum);

program.parse();
