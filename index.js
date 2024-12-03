#!/usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

// 下载单个音乐的函数
async function downloadMusic(id) {
  try {
    // 构建播放器URL
    const playerUrl = `https://music.163.com/outchain/player?type=2&id=${id}&auto=1&height=66`;

    // 获取播放器页面
    const response = await axios.get(playerUrl);
    const $ = cheerio.load(response.data);

    // 获取歌曲信息
    const songUrl = `https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`;
    let songName, artistName;

    try {
      const songResponse = await axios.get(songUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Referer': 'https://music.163.com/',
          'Cookie': 'NMTID=00OJ_vv9oqXwqq8TQFLFUbVeZz059kAAAGMqWD4yw'
        }
      });

      // 从API响应中获取标题和作者
      songName = songResponse.data?.songs?.[0]?.name || id;
      artistName = songResponse.data?.songs?.[0]?.artists?.[0]?.name || '未知歌手';

      console.log(`\n歌曲信息: ${artistName} - ${songName}`);
    } catch (error) {
      console.error('获取歌曲信息失败:', error.message);
      songName = id;
      artistName = '未知歌手';
    }

    // 处理文件名，移除非法字符
    const sanitizedSongName = songName.replace(/[<>:"/\\|?*]/g, '').trim();
    const sanitizedArtistName = artistName.replace(/[<>:"/\\|?*]/g, '').trim();
    const fileName = `${sanitizedArtistName}-${sanitizedSongName}.mp3`;

    // 创建下载目录
    const downloadDir = path.join(process.cwd(), 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir);
    }

    // 构建文件路径
    const filePath = path.join(downloadDir, fileName);

    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      console.log(`文件已存在，跳过下载: ${fileName}`);
      return;
    }

    // 在下载前先打印一下信息
    console.log(`开始下载: ${fileName}`);

    // 构建实际的音乐文件URL
    const musicUrl = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;

    // 下载音乐文件
    const musicResponse = await axios({
      method: 'get',
      url: musicUrl,
      responseType: 'stream'
    });

    // 获取文件大小
    const totalLength = parseInt(musicResponse.headers['content-length'], 10);

    // 创建进度条
    const progressBar = new cliProgress.SingleBar({
      format: '下载进度 |{bar}| {percentage}% || {value}/{total} KB',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });

    // 初始化进度条
    progressBar.start(Math.round(totalLength/1024), 0);

    // 保存文件
    const writer = fs.createWriteStream(filePath);

    // 跟踪已下载的字节数
    let downloadedBytes = 0;

    musicResponse.data.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      progressBar.update(Math.round(downloadedBytes/1024));
    });

    musicResponse.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        progressBar.stop();
        console.log(`\n下载完成: ${filePath}`);
        resolve();
      });
      writer.on('error', (err) => {
        progressBar.stop();
        reject(err);
      });
    });
  } catch (error) {
    console.error(`下载失败 (ID: ${id}):`, error.message);
  }
}

program
  .name('netease-downloader')
  .description('网易云音乐下载工具')
  .version('1.0.0');

program
  .command('download')
  .description('下载单个或多个音乐')
  .argument('[ids...]', '音乐ID列表')
  .option('-f, --file <file>', '从文件读取ID列表')
  .action(async (ids, options) => {
    let musicIds = ids || [];

    // 如果提供了文件，从文件读取ID
    if (options.file) {
      try {
        const fileContent = fs.readFileSync(options.file, 'utf8');
        const fileIds = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')); // 忽略空行和注释
        musicIds = [...musicIds, ...fileIds];
      } catch (error) {
        console.error('读取文件失败:', error.message);
        process.exit(1);
      }
    }

    // 去重
    musicIds = [...new Set(musicIds)];

    if (musicIds.length === 0) {
      console.error('请提供至少一个音乐ID');
      process.exit(1);
    }

    console.log(`准备下载 ${musicIds.length} 首歌曲`);

    // 串行下载所有歌曲
    for (const id of musicIds) {
      await downloadMusic(id);
    }

    console.log('\n所有下载任务完成！');
  });

program.parse();
