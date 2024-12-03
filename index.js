#!/usr/bin/env node

const { program } = require('commander');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

program
  .argument('<id>', 'NetEase music ID')
  .action(async (id) => {
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

        console.log('歌曲信息:', {
          name: songName,
          artist: artistName
        });
      } catch (error) {
        console.error('获取歌曲信息失败:', error.message);
        songName = id;
        artistName = '未知歌手';
      }

      // 处理文件名，移除非法字符
      const sanitizedSongName = songName.replace(/[<>:"/\\|?*]/g, '').trim();
      const sanitizedArtistName = artistName.replace(/[<>:"/\\|?*]/g, '').trim();
      const fileName = `${sanitizedArtistName}-${sanitizedSongName}.mp3`;

      // 在下载前先打印一下信息
      console.log(`正在下载: ${sanitizedArtistName} - ${sanitizedSongName}`);

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

      // 创建下载目录
      const downloadDir = path.join(process.cwd(), 'downloads');
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir);
      }

      // 保存文件
      const filePath = path.join(downloadDir, fileName);
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
      console.error('下载失败:', error.message);
      process.exit(1);
    }
  });

program.parse();
