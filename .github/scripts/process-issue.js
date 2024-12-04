const { Octokit } = require("@octokit/rest");
const { execSync } = require("child_process");
const path = require('path');
const fs = require('fs');
const glob = require('glob');
const archiver = require('archiver');

async function createZipFile(files, zipName, type, musicId) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipName);
        const archive = archiver('zip', {
            zlib: { level: 9 } // 最高压缩级别
        });

        output.on('close', () => {
            console.log(`ZIP created: ${archive.pointer()} bytes`);
            resolve(zipName);
        });

        archive.on('error', (err) => {
            reject(err);
        });

        archive.pipe(output);

        // 添加文件到 zip
        if (type === 'album') {
            // 获取专辑目录名（假设是downloads目录下的第一个目录）
            const albumDirs = glob.sync('downloads/*/', { directories: true });
            if (albumDirs.length > 0) {
                const albumDir = path.basename(albumDirs[0]);
                console.log(`Found album directory: ${albumDir}`);

                // 将文件添加到对应的专辑目录中
                files.forEach(file => {
                    const relativePath = path.relative('downloads', file);
                    archive.file(file, { name: relativePath });
                });
            } else {
                console.log('No album directory found, using default structure');
                const defaultAlbumDir = `album-${musicId}`;
                files.forEach(file => {
                    archive.file(file, {
                        name: path.join(defaultAlbumDir, path.basename(file))
                    });
                });
            }
        } else {
            // 单曲直接添加到根目录
            files.forEach(file => {
                archive.file(file, { name: path.basename(file) });
            });
        }

        archive.finalize();
    });
}

async function createRelease(octokit, owner, repo, tag, files, type, musicId) {
    console.log(`Creating release with tag: ${tag}`);
    console.log(`Files to compress: ${files}`);

    // 创建 zip 文件
    const zipName = `music-${tag}.zip`;
    await createZipFile(files, zipName, type, musicId);

    // 创建一个新的 release
    const { data: release } = await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        name: `Music Download ${tag}`,
        body: 'Automated music download via GitHub Actions',
        draft: false
    });

    // 上传 zip 文件到 release
    const content = fs.readFileSync(zipName);
    const { data: asset } = await octokit.repos.uploadReleaseAsset({
        owner,
        repo,
        release_id: release.id,
        name: zipName,
        data: content,
        headers: {
            'content-type': 'application/zip',
            'content-length': content.length
        }
    });

    // 清理临时文件
    fs.unlinkSync(zipName);

    return {
        release,
        assets: [{
            name: zipName,
            browser_download_url: asset.browser_download_url
        }]
    };
}

async function main() {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const event = require(eventPath);
    const issueNumber = event.issue.number;

    try {
        // 解析 issue body
        const body = event.issue.body;

        // 从 body 中提取表单数据
        const typeMatch = body.match(/### 下载类型\s*\n\n(.+?)(?=\n|$)/);
        const idMatch = body.match(/### 音乐ID\s*\n\n(.+?)(?=\n|$)/);

        if (!typeMatch || !idMatch) {
            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: issueNumber,
                body: "无法解析请求内容请使用正确的issue模板"
            });
            return;
        }

        const type = typeMatch[1].trim() === '单曲' ? 'song' : 'album';
        const musicId = idMatch[1].trim();

        if (!musicId || !/^\d+$/.test(musicId)) {
            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: issueNumber,
                body: "无效的音乐ID，请提供正确的数字ID"
            });
            return;
        }

        // 确保下载目录存在
        if (!fs.existsSync('downloads')) {
            fs.mkdirSync('downloads', { recursive: true });
        }

        // 先构建项目
        console.log('Building project...');
        execSync('npm run build', { stdio: 'inherit' });

        // 执行下载命令
        if (type === 'song') {
            console.log(`Downloading song ${musicId}...`);
            try {
                // 执行下载并捕获输出
                const output = execSync(`node dist/index.js download ${musicId}`, {
                    stdio: 'pipe',
                    encoding: 'utf8'
                });
                console.log('Download output:', output);

                // 从输出中获取歌曲信息
                const songNameMatch = output.match(/歌曲信息:\s*(.+?)(?:\n|$)/);
                if (!songNameMatch) {
                    console.warn('无法从输出中解析歌曲信息');
                }

                const songName = songNameMatch ?
                    songNameMatch[1].trim().replace(/[<>:"/\\|?*]/g, '-') :
                    `song-${musicId}-${Date.now()}`;

                // 检查下载文件
                const downloadedFiles = glob.sync('downloads/**/*.mp3');
                console.log('Found downloaded files:', downloadedFiles);

                if (downloadedFiles.length === 0) {
                    throw new Error('下载失败：未找到下载的文件');
                }

                // 重命名文件
                const downloadedFile = downloadedFiles[0];
                const newPath = path.join(path.dirname(downloadedFile), `${songName}.mp3`);
                fs.renameSync(downloadedFile, newPath);
                console.log(`File renamed to: ${newPath}`);

            } catch (error) {
                console.error('Download command failed:', error);
                throw error;
            }
        } else {
            console.log(`Downloading album ${musicId}...`);
            execSync(`node dist/index.js album ${musicId}`, {
                stdio: 'inherit'
            });
        }

        // 查找下载的文件
        const downloadedFiles = glob.sync('downloads/**/*.mp3');
        console.log('Final check - found files:', downloadedFiles);

        if (downloadedFiles.length === 0) {
            throw new Error('没有找到下载的文件');
        }

        // 创建 release tag
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `download-${issueNumber}-${timestamp}`;

        // 使用下载的文件路径，传入类型和音乐ID
        const { release, assets } = await createRelease(
            octokit,
            owner,
            repo,
            tag,
            downloadedFiles,
            type,
            musicId
        );

        // 在 issue 中添加下载链接
        const downloadLinks = assets.map(asset => {
            return `- [${asset.name}](${asset.browser_download_url})`;
        }).join('\n');

        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `下载完成！您可以从以下链接下载音乐文件：\n\n${downloadLinks}\n\n或访问 [Release 页面](${release.html_url})`
        });

        // 清理下载的文件
        execSync('rm -rf downloads/*');

    } catch (error) {
        console.error('Error details:', error);
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `下载失败：${error.message}\n\n详细错误：\n\`\`\`\n${error.stack}\n\`\`\``
        });
        process.exit(1);
    } finally {
        await octokit.issues.update({
            owner,
            repo,
            issue_number: issueNumber,
            state: 'closed'
        });
    }
}

main().catch(console.error);
