import { program } from 'commander';
import { downloadSong } from './commands/download';
import { downloadAlbum } from './commands/album';
import * as fs from 'fs';

program
  .name('netease-downloader')
  .description('网易云音乐下载工具')
  .version('1.0.0');

program
  .command('download')
  .description('下载单个或多个音乐')
  .argument('[ids...]', '音乐ID列表')
  .option('-f, --file <file>', '从文件读取ID列表')
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
        console.error('读取文件失败:', error);
        process.exit(1);
      }
    }

    musicIds = [...new Set(musicIds)];

    if (musicIds.length === 0) {
      console.error('请提供至少一个音乐ID');
      process.exit(1);
    }

    console.log(`准备下载 ${musicIds.length} 首歌曲`);

    for (const id of musicIds) {
      await downloadSong(id);
    }

    console.log('\n所有下载任务完成！');
  });

program
  .command('album')
  .description('下载整张专辑')
  .argument('<albumId>', '专辑ID或URL')
  .action(downloadAlbum);

program.parse();
