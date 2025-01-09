import { SingleBar, type Options } from 'cli-progress';
import axios from 'axios';
import * as fs from 'fs';
import NodeID3 from 'node-id3';
import { getSongInfo, checkSongAvailability } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';
import { createSingleBar } from '../utils/progress';

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer'
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('下载封面图片失败 Failed to download cover image:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function downloadSong(id: string, progressBar?: SingleBar): Promise<void> {
  try {
    const song = await getSongInfo(id);
    const songName = song.name;
    const artistName = song.artists?.[0]?.name || '未知歌手 Unknown Artist';

    console.log(`\n歌曲信息 Song info: ${artistName}-${songName}`);

    const availability = await checkSongAvailability(id);
    if (!availability.available || !availability.url) {
      console.log(`歌曲已下架或无版权，跳过下载\nSong is unavailable or no copyright, skipping download`);
      return;
    }

    const sanitizedSongName = sanitizeFileName(songName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const fileName = `${sanitizedArtistName}-${sanitizedSongName}.mp3`;
    const filePath = getDownloadPath('single', fileName);

    if (fs.existsSync(filePath)) {
      console.log(`文件已存在，跳过下载 File exists, skipping download: ${fileName}`);
      return;
    }

    console.log(`开始下载 Start downloading: ${artistName}-${songName}`);

    const response = await axios({
      method: 'get',
      url: availability.url,
      responseType: 'stream'
    });

    const totalLength = parseInt(response.headers['content-length'], 10);
    const bar = createSingleBar();
    bar.start(Math.round(totalLength/1024), 0);

    const writer = fs.createWriteStream(filePath);
    let downloadedBytes = 0;

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      bar.update(Math.round(downloadedBytes/1024));
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    bar.stop();
    console.log(`\n下载完成 Download completed: ${fileName}`);

    // 写入元数据
    console.log('正在写入音乐标签 Writing music tags...');
    const tags: NodeID3.Tags = {
      title: song.name,
      artist: song.artists?.map(a => a.name).join(', '),
      album: song.album?.name,
      year: song.publishTime ? new Date(song.publishTime).getFullYear().toString() : undefined,
      trackNumber: undefined,
      performerInfo: song.artists?.map(a => a.name).join(', '),
      length: song.duration?.toString(),
    };

    // 下载并添加封面
    if (song.album?.picUrl) {
      const imageBuffer = await downloadImage(song.album.picUrl);
      if (imageBuffer) {
        tags.image = {
          mime: 'image/jpeg',
          type: {
            id: 3,
            name: 'front cover'
          },
          description: 'Album cover',
          imageBuffer
        };
      }
    }

    NodeID3.write(tags, filePath);
    console.log('音乐标签写入完成 Music tags written successfully');

  } catch (error) {
    const err = error as Error;
    console.error(`下载失败 Download failed (ID: ${id}):`, err.message);
  }
}
