import { createMultiBar } from '../utils/progress';
import { getAlbumInfo, checkSongAvailability, getLyrics, proxyConfig } from '../services/netease';
import { sanitizeFileName, getDownloadPath } from '../utils/file';
import axios from 'axios';
import * as fs from 'fs';
import { Octokit } from '@octokit/rest';
import NodeID3 from 'node-id3';

async function downloadImage(url: string): Promise<Buffer | null> {
  try {
    const response = await axios({
      method: 'get',
      url,
      responseType: 'arraybuffer',
      ...proxyConfig
    });
    return Buffer.from(response.data);
  } catch (error) {
    console.error('下载封面图片失败 Failed to download cover image:', error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

export async function downloadAlbum(albumId: string, issueNumber?: number): Promise<void> {
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

    let albumInfo;
    try {
      albumInfo = await getAlbumInfo(albumId);
    } catch (error) {
      console.error('\n获取专辑信息失败，可能是网络问题或代理服务器无响应\nFailed to get album info, might be network issue or proxy server not responding');
      if (error instanceof Error) {
        console.error('详细错误 Detailed error:', error.message);
      }
      process.exit(1);
    }

    const { songs, albumName, artistName } = albumInfo;

    console.log(`\n专辑信息 Album info: ${albumName} - ${artistName}`);
    console.log(`共 Total: ${songs.length} 首歌曲 songs\n`);

    const sanitizedAlbumName = sanitizeFileName(albumName);
    const sanitizedArtistName = sanitizeFileName(artistName);
    const albumDirName = `${sanitizedArtistName}-${sanitizedAlbumName}`;

    const multibar = createMultiBar();

    const downloadResults = {
      success: [] as string[],
      failed: [] as string[],
      skipped: [] as string[],
    };

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
          downloadResults.skipped.push(`${displayName} (无版权或已下架)`);
          i++;
          continue;
        }

        const sanitizedSongName = sanitizeFileName(songName);
        const sanitizedArtistName = sanitizeFileName(artistName);
        const fileName = `${String(i + 1).padStart(2, '0')}.${sanitizedArtistName}-${sanitizedSongName}.mp3`;
        const filePath = getDownloadPath('album', fileName, albumDirName);
        const lrcPath = getDownloadPath('album', `${String(i + 1).padStart(2, '0')}.${sanitizedArtistName}-${sanitizedSongName}.lrc`, albumDirName);

        // 下载歌词
        const lyrics = await getLyrics(song.id);
        if (lyrics) {
          fs.writeFileSync(lrcPath, lyrics, 'utf8');
          console.log(`[${i + 1}/${songs.length}] 歌词下载完成 Lyrics downloaded`);
        }

        if (fs.existsSync(filePath)) {
          console.log(`\n[${i + 1}/${songs.length}] ${fileName} (文件已存在，跳过下载 File exists, skipping download)`);
          i++;
          continue;
        }

        console.log(`\n[${i + 1}/${songs.length}] 开始下载 Start downloading: ${displayName}`);

        const response = await axios({
          method: 'get',
          url: availability.url,
          responseType: 'stream',
          ...proxyConfig
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

        // 写入元数据
        console.log(`[${i + 1}/${songs.length}] 正在写入音乐标签 Writing music tags...`);
        const tags: NodeID3.Tags = {
          title: song.name,
          artist: song.artists?.map(a => a.name).join(', '),
          album: albumName,
          year: song.publishTime ? new Date(song.publishTime).getFullYear().toString() : undefined,
          trackNumber: `${i + 1}/${songs.length}`,
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
        console.log(`[${i + 1}/${songs.length}] 音乐标签写入完成 Music tags written successfully`);

        downloadResults.success.push(displayName);
        i++;
      } catch (error) {
        const err = error as Error;
        console.error(`\n[${i + 1}/${songs.length}] ${song.name} - 下载失败 Download failed: ${err.message}`);
        if (err.message.includes('socket') || err.message.includes('network')) {
          console.log('等待 3 秒后重试... Retrying in 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
          continue;
        }
        downloadResults.failed.push(`${song.name} (${err.message})`);
        i++;
      }
    }

    multibar.stop();
    console.log('\n专辑下载完成！Album download completed!');

    // 如果是通过 GitHub Issue 触发的下载，发送下载报告
    if (issueNumber && !isNaN(Number(issueNumber))) {
      const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
      });

      // 如果没有成功下载任何歌曲
      if (downloadResults.success.length === 0) {
        const errorMessage = `❌ 专辑《${albumName}》下载失败\n\n` +
          `可能原因：所有歌曲都没有版权或已下架\n\n` +
          `总计歌曲数：${songs.length}\n` +
          `⚠️ 无版权或已下架：${downloadResults.skipped.length} 首\n\n` +
          (downloadResults.skipped.length > 0 ? `### 无版权或已下架的歌曲：\n${downloadResults.skipped.map(s => `- ${s}`).join('\n')}` : '');

        try {
          await octokit.issues.createComment({
            owner: 'Gaohaoyang',
            repo: 'netease-music-downloader',
            issue_number: Number(issueNumber),
            body: errorMessage
          });

          // 关闭 issue
          await octokit.issues.update({
            owner: 'Gaohaoyang',
            repo: 'netease-music-downloader',
            issue_number: Number(issueNumber),
            state: 'closed'
          });
          return;  // 直接返回，不进行打包上传
        } catch (apiError) {
          console.error('GitHub API 调用失败:', apiError);
          return;
        }
      }

      const summaryMessage = `## 专辑《${albumName}》下载报告\n\n` +
        `总计歌曲数：${songs.length}\n\n` +
        `✅ 下载成功：${downloadResults.success.length} 首\n` +
        `❌ 下载失败：${downloadResults.failed.length} 首\n` +
        `⚠️ 无版权跳过：${downloadResults.skipped.length} 首\n\n` +
        (downloadResults.success.length > 0 ? `### 下载成功的歌曲：\n${downloadResults.success.map(s => `- ${s}`).join('\n')}\n\n` : '') +
        (downloadResults.failed.length > 0 ? `### 下载失败的歌曲：\n${downloadResults.failed.map(s => `- ${s}`).join('\n')}\n\n` : '') +
        (downloadResults.skipped.length > 0 ? `### 无版权或已下架的歌曲：\n${downloadResults.skipped.map(s => `- ${s}`).join('\n')}` : '');

      try {
        // 发送下载报告
        await octokit.issues.createComment({
          owner: 'Gaohaoyang',
          repo: 'netease-music-downloader',
          issue_number: Number(issueNumber),
          body: summaryMessage
        });

        // 关闭 issue
        await octokit.issues.update({
          owner: 'Gaohaoyang',
          repo: 'netease-music-downloader',
          issue_number: Number(issueNumber),
          state: 'closed'
        });
      } catch (apiError) {
        console.error('GitHub API 调用失败:', apiError);
      }
    }

  } catch (error) {
    if (issueNumber && !isNaN(Number(issueNumber))) {
      try {
        const octokit = new Octokit({
          auth: process.env.GITHUB_TOKEN,
        });

        // 只发送简单的错误消息
        await octokit.issues.createComment({
          owner: 'Gaohaoyang',
          repo: 'netease-music-downloader',
          issue_number: Number(issueNumber),
          body: '❌ 专辑下载失败，可能是因为版权限制或资源不可用。'
        });

        // 关闭 issue
        await octokit.issues.update({
          owner: 'Gaohaoyang',
          repo: 'netease-music-downloader',
          issue_number: Number(issueNumber),
          state: 'closed'
        });
      } catch (apiError) {
        // 只在控制台记录 API 错误，不要让它显示在 issue 中
        console.error('GitHub API 调用失败:', apiError);
      }
    }

    // 在控制台显示详细错误，但不要让它显示在 issue 中
    console.error('专辑下载失败，可能是因为版权限制或资源不可用。');
    if (error instanceof Error) {
      console.error('详细错误:', error.message);
    }

    process.exit(1);
  }
}
