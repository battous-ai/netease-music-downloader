import { createMultiBar } from '../utils/progress';
import { getAlbumInfo, checkSongAvailability } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';
import axios from 'axios';
import * as fs from 'fs';

export async function downloadAlbum(albumId: string): Promise<void> {
  try {
    // 从URL中提取ID Extract ID from URL
    if (albumId.includes('music.163.com')) {
      const match = albumId.match(/id=(\d+)/);
      if (!match) {
        console.error('无效的专辑URL Invalid album URL');
        process.exit(1);
      }
      albumId = match[1];
    }

    const { songs, albumName, artistName } = await getAlbumInfo(albumId);

    console.log(`\n专辑信息 Album info: ${albumName} - ${artistName}`);
    console.log(`共 Total: ${songs.length} 首歌曲 songs\n`);

    const sanitizedAlbumName = sanitizeFileName(albumName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const albumDirName = `${sanitizedArtistName}-${sanitizedAlbumName}`;

    const multibar = createMultiBar();

    let i = 0;
    while (i < songs.length) {
      const song = songs[i];
      try {
        const songName = song.name;
        const artistName = song.artists?.[0]?.name || '未知歌手 Unknown Artist';
        const displayName = `${artistName}-${songName}`;

        const availability = await checkSongAvailability(song.id);
        if (!availability.available || !availability.url) {
          console.log(`\n[${i + 1}/${songs.length}] ${displayName} (歌曲已下架或无版权，跳过下载 Song is unavailable or no copyright, skipping download)`);
          i++;
          continue;
        }

        const sanitizedSongName = sanitizeFileName(songName);
        const sanitizedArtistName = sanitizeFileName(artistName);
        const fileName = `${String(i + 1).padStart(2, '0')}.${sanitizedArtistName}-${sanitizedSongName}.mp3`;
        const filePath = getDownloadPath('album', fileName, albumDirName);

        if (fs.existsSync(filePath)) {
          console.log(`\n[${i + 1}/${songs.length}] ${fileName} (文件已存在，跳过下载 File exists, skipping download)`);
          i++;
          continue;
        }

        console.log(`\n[${i + 1}/${songs.length}] 开始下载 Start downloading: ${displayName}`);

        const response = await axios({
          method: 'get',
          url: availability.url,
          responseType: 'stream'
        });

        const totalLength = parseInt(response.headers['content-length'], 10);
        const progressBar = multibar.create(Math.round(totalLength/1024), 0, {
          name: `[${i + 1}/${songs.length}] ${songName.slice(0, 30)}${songName.length > 30 ? '...' : ''}`
        });

        const writer = fs.createWriteStream(filePath);
        let downloadedBytes = 0;

        response.data.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          progressBar.update(Math.round(downloadedBytes/1024));
        });

        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        progressBar.update(Math.round(totalLength/1024));
        i++;
      } catch (error) {
        const err = error as Error;
        console.error(`\n[${i + 1}/${songs.length}] ${song.name} - 下载失败 Download failed: ${err.message}`);
        if (err.message.includes('socket') || err.message.includes('network')) {
          console.log('等待 3 秒后重试... Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        i++;
      }
    }

    multibar.stop();
    console.log('\n专辑下载完成！Album download completed!');
  } catch (error) {
    const err = error as Error;
    console.error('下载失败 Download failed:', err.message);
    process.exit(1);
  }
}
