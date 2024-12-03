const { Octokit } = require("@octokit/rest");
const { execSync } = require("child_process");
const path = require('path');
const fs = require('fs');
const glob = require('glob');

async function createRelease(octokit, owner, repo, tag, files) {
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
        if (fileName === '-.mp3' || fileName === '.mp3') {
            fileName = `music-${Date.now()}.mp3`;
        }

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

        uploadedAssets.push(asset);
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
            execSync(`node dist/index.js download ${musicId}`, { stdio: 'inherit' });
        } else {
            execSync(`node dist/index.js album ${musicId}`, { stdio: 'inherit' });
        }

        // 查找并重命名下载的文件
        const downloadedFiles = glob.sync('downloads/**/*.mp3');

        if (downloadedFiles.length === 0) {
            throw new Error('没有找到下载的文件');
        }

        // 重命名文件，只处理异常的文件名
        const renamedFiles = downloadedFiles.map(filePath => {
            const originalName = path.basename(filePath);
            // 只有当文件名异常时才重命名
            if (originalName === '-.mp3' || originalName === '.mp3') {
                // 如果无法获取歌曲信息，使用默认名称
                const newName = `song-${musicId}-${Date.now()}.mp3`;
                const newPath = path.join(path.dirname(filePath), newName);
                fs.renameSync(filePath, newPath);
                return newPath;
            }
            // 保持原有的歌手-歌曲名格式
            return filePath;
        });

        // 创建 release tag
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `download-${issueNumber}-${timestamp}`;

        // 使用重命名后的文件路径
        const { release, assets } = await createRelease(octokit, owner, repo, tag, renamedFiles);

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
