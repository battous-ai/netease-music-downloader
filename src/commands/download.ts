import { SingleBar, type Options } from 'cli-progress';
import axios from 'axios';
import * as fs from 'fs';
import { getSongInfo, checkSongAvailability } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';

export async function downloadSong(id: string, progressBar?: SingleBar): Promise<void> {
  try {
    const song = await getSongInfo(id);
    const songName = song.name;
    const artistName = song.artists?.[0]?.name || '未知歌手';

    console.log(`\n歌曲信息: ${artistName}-${songName}`);

    const availability = await checkSongAvailability(id);
    if (!availability.available || !availability.url) {
      console.log(`歌曲已下架或无版权，跳过下载`);
      return;
    }

    const sanitizedSongName = sanitizeFileName(songName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const fileName = `${sanitizedArtistName}-${sanitizedSongName}.mp3`;
    const filePath = getDownloadPath('single', fileName);

    if (fs.existsSync(filePath)) {
      console.log(`文件已存在，跳过下载: ${fileName}`);
      return;
    }

    console.log(`开始下载: ${artistName}-${songName}`);

    const response = await axios({
      method: 'get',
      url: availability.url,
      responseType: 'stream'
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log(`下载完成: ${fileName}`);
  } catch (error) {
    const err = error as Error;
    console.error(`下载失败 (ID: ${id}):`, err.message);
  }
}
