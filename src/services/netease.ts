import axios from 'axios';
import * as cheerio from 'cheerio';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { Song, AlbumInfo } from '../types';

// 网易云音乐 API 加密参数
const presetKey = '0CoJUm6Qyw8W8jud';
const iv = '0102030405060708';
const eapiKey = 'e82ckenh8dichen8';
const base62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const headers = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CloudMusic/2.5.1',
  'Referer': 'https://music.163.com/',
  'Origin': 'https://music.163.com',
  'Cookie': 'NMTID=00OJ_vv9oqXwqq8TQFLFUbVeZz059kAAAGMqWD4yw; _ntes_nuid=' + randomBytes(16).toString('hex'),
};

// 音质等级，按优先级排序
const QUALITY_LEVELS = ['hires', 'lossless', 'exhigh', 'higher', 'standard'];
const QUALITY_BITRATES = {
  'standard': '128000',
  'higher': '192000',
  'exhigh': '320000',
  'lossless': '999000',
  'hires': '999000'
};

function getRandomString(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += base62[Math.floor(Math.random() * base62.length)];
  }
  return result;
}

function aesEncrypt(buffer: Buffer | string, mode: string, key: string, iv: string) {
  const keyBuffer = Buffer.from(key).slice(0, 16);
  const ivBuffer = Buffer.from(iv).slice(0, 16);
  const cipher = createCipheriv('aes-128-' + mode, keyBuffer, ivBuffer);
  cipher.setAutoPadding(true);
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

function eapi(url: string, obj: any) {
  const text = JSON.stringify(obj);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = createHash('md5').update(message).digest('hex');
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return {
    params: aesEncrypt(data, 'ecb', eapiKey, '').toString('hex').toUpperCase()
  };
}

export async function getSongInfo(id: string): Promise<Song> {
  try {
    const url = '/api/v3/song/detail';
    const data = {
      c: JSON.stringify([{ id }]),
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v3/song/detail',
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        }
      }
    );

    const song = response.data?.songs?.[0];
    if (!song) throw new Error('获取歌曲信息失败 Failed to get song info');

    const artists = song.ar?.map((artist: any) => ({
      name: artist.name || '未知歌手 Unknown Artist'
    })) || [{ name: '未知歌手 Unknown Artist' }];

    return {
      id: song.id.toString(),
      name: `${song.name}${song.alia?.length ? ` (${song.alia[0]})` : ''}`,
      artists,
      album: {
        name: song.al?.name || '',
        picUrl: song.al?.picUrl
      },
      duration: song.dt, // duration in milliseconds
      publishTime: song.publishTime
    };
  } catch (error) {
    console.error('获取歌曲信息失败 Failed to get song info:', error instanceof Error ? error.message : 'Unknown error');
    return {
      id,
      name: id,
      artists: [{ name: '未知歌手 Unknown Artist' }],
      album: { name: '' }
    };
  }
}

export async function getAlbumInfo(albumId: string): Promise<AlbumInfo> {
  try {
    const url = '/api/v1/album/' + albumId;
    const data = {
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/v1/album/' + albumId,
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        }
      }
    );

    if (response.data?.code !== 200) {
      throw new Error(`API 返回错误 API returned error: ${response.data?.message || 'Unknown error'}`);
    }

    const album = response.data?.album;
    if (!album) {
      throw new Error('获取专辑信息失败 Failed to get album info');
    }

    const songs = response.data?.songs || [];
    const songList = songs.map((song: any) => {
      const artists = song.ar?.map((artist: any) => ({
        name: artist.name || '未知歌手 Unknown Artist'
      })) || [{ name: '未知歌手 Unknown Artist' }];

      return {
        id: song.id.toString(),
        name: `${song.name}${song.alia?.length ? ` (${song.alia[0]})` : ''}`,
        artists,
        album: {
          name: album.name || '',
          picUrl: album.picUrl
        },
        duration: song.dt,
        publishTime: song.publishTime
      };
    });

    const albumArtists = album.artists?.map((artist: any) => artist.name).filter(Boolean) || ['未知歌手 Unknown Artist'];
    const albumArtistName = albumArtists.join(',');

    return {
      songs: songList,
      albumName: album.name || '',
      artistName: albumArtistName,
      picUrl: album.picUrl,
      publishTime: album.publishTime
    };
  } catch (error) {
    console.error('获取专辑信息失败 Failed to get album info:', error instanceof Error ? error.message : 'Unknown error');
    return {
      songs: [],
      albumName: '',
      artistName: '未知歌手 Unknown Artist'
    };
  }
}

async function getSongUrl(id: string, level: string): Promise<string | null> {
  try {
    const url = '/api/song/enhance/player/url/v1';
    const data = {
      ids: [id],
      level,
      encodeType: 'aac',
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/song/enhance/player/url/v1',
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        },
        timeout: 10000
      }
    );

    if (response.data?.code !== 200) {
      console.error(`API 返回错误 API returned error for ${level}:`, {
        code: response.data?.code,
        message: response.data?.message,
        data: response.data
      });
      return null;
    }

    const songData = response.data?.data?.[0];
    if (!songData?.url) {
      console.log(`未获到 ${level} 音质的 URL No URL found for ${level} quality`);
      return null;
    }

    console.log(`获取到音质 Quality: ${level}, 比特率 Bitrate: ${Math.floor(songData.br / 1000)}kbps, 格式 Format: ${songData.type}, URL: ${songData.url}`);
    return songData.url;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`尝试获取 ${level} 音质失败 Failed to get ${level} quality:`, {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
    } else {
      console.error(`尝试获取 ${level} 音质失败 Failed to get ${level} quality:`, error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }
}

export async function checkSongAvailability(id: string): Promise<{
  available: boolean;
  contentLength?: number;
  url?: string;
}> {
  // 尝试获取最高音质
  for (const level of QUALITY_LEVELS) {
    const url = await getSongUrl(id, level);
    if (url) {
      try {
        const response = await axios.head(url, {
          maxRedirects: 5,
          validateStatus: status => status >= 200 && status < 400,
          headers: {
            ...headers,
            'Referer': 'https://music.163.com/'
          },
          timeout: 10000
        });

        const contentLength = parseInt(response.headers['content-length'], 10);
        if (contentLength > 500 * 1024) { // 大于 500KB
          return {
            available: true,
            contentLength,
            url
          };
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error(`检查音乐可用性失败 Failed to check availability:`, {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
          });
        } else {
          console.error(`检查音乐可用性失败 Failed to check availability:`, error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  }

  return { available: false };
}

export async function getLyrics(id: string): Promise<string | null> {
  try {
    const url = '/api/song/lyric/v1';
    const data = {
      id,
      lv: 1,
      kv: 1,
      tv: -1,
      header: {
        os: 'iOS',
        appver: '2.5.1',
        deviceId: randomBytes(8).toString('hex').toUpperCase(),
      }
    };

    const { params } = eapi(url, data);
    const response = await axios.post(
      'https://interface3.music.163.com/eapi/song/lyric/v1',
      new URLSearchParams({
        params
      }).toString(),
      {
        headers: {
          ...headers,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NeteaseMusic/2.5.1 (iPhone; iOS 16.6; Scale/3.00)'
        }
      }
    );

    if (response.data?.code !== 200) {
      console.error('获取歌词失败 Failed to get lyrics:', response.data?.message || 'Unknown error');
      return null;
    }

    const lrc = response.data?.lrc?.lyric;
    if (!lrc) {
      console.log('该歌曲无歌词 No lyrics available for this song');
      return null;
    }

    return lrc;
  } catch (error) {
    console.error('获取歌词失败 Failed to get lyrics:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}
