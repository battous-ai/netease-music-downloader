const { Octokit } = require("@octokit/rest");
const { execSync } = require("child_process");
const path = require('path');
const fs = require('fs');
const glob = require('glob');

async function createRelease(octokit, owner, repo, tag, files) {
    console.log(`Creating release with tag: ${tag}`);
    console.log(`Files: ${files}`);

    // 创建一个新的 release
    const { data: release } = await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tag,
        name: `Music Download ${tag}`,
        body: 'Automated music download via GitHub Actions',
        draft: false
    });

    // 上传所有文件到 release
    const uploadedAssets = [];
    for (const filePath of files) {
        const content = fs.readFileSync(filePath);
        let fileName = path.basename(filePath);

        console.log(`Uploading asset: ${fileName}`);

        // 只处理异常文件名
        if (fileName === '-.mp3' || fileName === '.mp3') {
            fileName = `song-${Date.now()}.mp3`;
        }

        console.log(`Uploading asset: ${fileName}`);
        const { data: asset } = await octokit.repos.uploadReleaseAsset({
            owner,
            repo,
            release_id: release.id,
            name: fileName,
            data: content,
            headers: {
                'content-type': 'audio/mpeg',
                'content-length': content.length
            }
        });

        // 保存文件信息
        uploadedAssets.push({
            name: fileName,
            browser_download_url: asset.browser_download_url
        });
        console.log(JSON.stringify(uploadedAssets, null, 2));
    }

    return { release, assets: uploadedAssets };
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

        // 先构建项目
        execSync('npm run build', { stdio: 'inherit' });

        // 执行下载命令
        if (type === 'song') {
            // 执行下载并捕获输出
            const output = execSync(`node dist/index.js download ${musicId}`, {
                stdio: ['inherit', 'pipe', 'inherit'],
                encoding: 'utf8'
            });

            // 从输出中获取歌曲信息
            const songNameMatch = output.match(/歌曲信息: (.+)/);
            const songName = songNameMatch ? songNameMatch[1].trim() : `song-${musicId}`;

            // 重命名文件
            const downloadedFile = glob.sync('downloads/**/*.mp3')[0];
            if (downloadedFile && path.basename(downloadedFile) === '-.mp3') {
                const newPath = path.join(path.dirname(downloadedFile), `${songName}.mp3`);
                fs.renameSync(downloadedFile, newPath);
            }
        } else {
            execSync(`node dist/index.js album ${musicId}`, { stdio: 'inherit' });
        }

        // 查找下载的文件
        const downloadedFiles = glob.sync('downloads/**/*.mp3');

        if (downloadedFiles.length === 0) {
            throw new Error('没有找到下载的文件');
        }

        // 创建 release tag
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `download-${issueNumber}-${timestamp}`;

        // 使用下载的文件路径
        const { release, assets } = await createRelease(octokit, owner, repo, tag, downloadedFiles);

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
        console.error(error);
        await octokit.issues.createComment({
            owner,
            repo,
            issue_number: issueNumber,
            body: `下载失败：${error.message}`
        });
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
