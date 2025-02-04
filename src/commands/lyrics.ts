import { getSongInfo, getAlbumInfo, getLyrics } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';
import * as fs from 'fs';

/**
 * Download lyrics for a single song
 */
export async function downloadSongLyrics(id: string): Promise<void> {
  try {
    // Extract ID from URL if needed
    if (id.includes('music.163.com')) {
      const match = id.match(/id=(\d+)/);
      if (!match) {
        console.error('无效的歌曲URL Invalid song URL');
        process.exit(1);
      }
      id = match[1];
    }

    // Get song info
    const song = await getSongInfo(id);
    const songName = song.name;
    const artistName = song.artists?.[0]?.name || '未知歌手 Unknown Artist';

    console.log(`\n歌曲信息 Song info: ${artistName}-${songName}`);

    // Download lyrics
    const lyrics = await getLyrics(id);
    if (!lyrics) {
      console.log('该歌曲无歌词 No lyrics available for this song');
      return;
    }

    // Save lyrics
    const sanitizedSongName = sanitizeFileName(songName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const fileName = `${sanitizedArtistName}-${sanitizedSongName}.lrc`;
    const lrcPath = getDownloadPath('single', fileName);

    fs.writeFileSync(lrcPath, lyrics, 'utf8');
    console.log('歌词下载完成 Lyrics downloaded');
    console.log('保存路径 Save path:', lrcPath);
    console.log('网页链接 Web URL:', `https://music.163.com/#/song?id=${id}`);

  } catch (error) {
    console.error('下载歌词失败 Failed to download lyrics:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Download lyrics for all songs in an album
 */
export async function downloadAlbumLyrics(albumId: string): Promise<void> {
  try {
    // Extract ID from URL if needed
    if (albumId.includes('music.163.com')) {
      const match = albumId.match(/id=(\d+)/);
      if (!match) {
        console.error('无效的专辑URL Invalid album URL');
        process.exit(1);
      }
      albumId = match[1];
    }

    // Get album info
    const albumInfo = await getAlbumInfo(albumId);
    const { songs, albumName, artistName } = albumInfo;

    console.log(`\n专辑信息 Album info: ${albumName} - ${artistName}`);
    console.log(`共 Total: ${songs.length} 首歌曲 songs\n`);

    const sanitizedAlbumName = sanitizeFileName(albumName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const albumDirName = `${sanitizedArtistName}-${sanitizedAlbumName}`;

    // Download lyrics for each song
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i];
      const songName = song.name;
      const songArtistName = song.artists?.[0]?.name || '未知歌手 Unknown Artist';
      const displayName = `${songArtistName}-${songName}`;

      console.log(`\n[${i + 1}/${songs.length}] 正在获取歌词 Getting lyrics: ${displayName}`);

      const lyrics = await getLyrics(song.id);
      if (!lyrics) {
        console.log(`[${i + 1}/${songs.length}] 该歌曲无歌词 No lyrics available for this song`);
        continue;
      }

      const sanitizedSongName = sanitizeFileName(songName);
      const sanitizedSongArtistName = sanitizeFileName(songArtistName);
      const fileName = `${String(i + 1).padStart(2, '0')}.${sanitizedSongArtistName}-${sanitizedSongName}.lrc`;
      const lrcPath = getDownloadPath('album', fileName, albumDirName);

      fs.writeFileSync(lrcPath, lyrics, 'utf8');
      console.log(`[${i + 1}/${songs.length}] 歌词下载完成 Lyrics downloaded`);
      console.log(`[${i + 1}/${songs.length}] 网页链接 Web URL: https://music.163.com/#/song?id=${song.id}`);
    }

    console.log('\n专辑歌词下载完成！Album lyrics download completed!');

  } catch (error) {
    console.error('下载专辑歌词失败 Failed to download album lyrics:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
