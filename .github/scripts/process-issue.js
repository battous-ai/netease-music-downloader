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
    const uploadPromises = files.map(async (filePath) => {
        const content = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        await octokit.repos.uploadReleaseAsset({
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

        return fileName;
    });

    const uploadedFiles = await Promise.all(uploadPromises);
    return { release, uploadedFiles };
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
                body: "无法解析请求内容，请使用正确的issue模板"
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

        // 查找下载的音乐文件
        const downloadedFiles = glob.sync('downloads/**/*.mp3');

        if (downloadedFiles.length === 0) {
            throw new Error('没有找到下载的文件');
        }

        // 创建 release tag (使用 issue 编号和时间戳确保唯一性)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const tag = `download-${issueNumber}-${timestamp}`;

        // 上传文件到 release
        const { release, uploadedFiles } = await createRelease(octokit, owner, repo, tag, downloadedFiles);

        // 在 issue 中添加下载链接
        const downloadLinks = uploadedFiles.map(fileName => {
            const assetUrl = release.assets.find(asset => asset.name === fileName).browser_download_url;
            return `- [${fileName}](${assetUrl})`;
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
