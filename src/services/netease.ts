import axios from 'axios';
import * as cheerio from 'cheerio';
import { Song, AlbumInfo } from '../types';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://music.163.com/',
  'Cookie': 'NMTID=00OJ_vv9oqXwqq8TQFLFUbVeZz059kAAAGMqWD4yw'
};

export async function getSongInfo(id: string): Promise<Song> {
  const songUrl = `https://music.163.com/api/song/detail/?id=${id}&ids=[${id}]`;
  try {
    const response = await axios.get(songUrl, { headers });
    const song = response.data?.songs?.[0];
    if (!song) throw new Error('获取歌曲信息失败');
    return song;
  } catch (error) {
    return { id, name: id };
  }
}

export async function getAlbumInfo(albumId: string): Promise<AlbumInfo> {
  const response = await axios.get(`https://music.163.com/album?id=${albumId}`, { headers });
  const $ = cheerio.load(response.data);

  const songs: Song[] = [];
  $('#song-list-pre-cache .f-hide a').each((i, el) => {
    const $el = $(el);
    const id = $el.attr('href')?.match(/\?id=(\d+)/)?.[1] || '';
    const name = $el.text();
    songs.push({ id, name });
  });

  const albumName = $('.tit h2').text().trim();
  const artistName = $('.intr a').first().text().trim();

  const songDetails = await Promise.all(
    songs.map(song => getSongInfo(song.id))
  );

  return {
    songs: songDetails,
    albumName,
    artistName
  };
}

export async function checkSongAvailability(id: string): Promise<{
  available: boolean;
  contentLength?: number;
  url?: string;
}> {
  const url = `https://music.163.com/song/media/outer/url?id=${id}.mp3`;
  try {
    const response = await axios.head(url, {
      maxRedirects: 5,
      validateStatus: status => status >= 200 && status < 400,
      headers
    });

    const contentLength = parseInt(response.headers['content-length'], 10);
    const finalUrl = response.request.res.responseUrl || url;

    return {
      available: !finalUrl.includes('music.163.com/404') && contentLength > 500 * 1024,
      contentLength,
      url: finalUrl
    };
  } catch (error) {
    return { available: false };
  }
}
