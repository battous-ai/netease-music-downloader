const { Octokit } = require("@octokit/rest");

async function cleanupReleases() {
    const octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN
    });

    const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

    try {
        // 获取所有 releases
        const { data: releases } = await octokit.repos.listReleases({
            owner,
            repo,
            per_page: 100
        });

        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);

        // 筛选出超过3小时的 releases
        const oldReleases = releases.filter(release => {
            const releaseDate = new Date(release.created_at);
            return releaseDate < threeHoursAgo;
        });

        console.log(`Found ${oldReleases.length} releases older than 3 hours`);

        // 删除旧的 releases
        for (const release of oldReleases) {
            console.log(`Deleting release: ${release.tag_name}`);
            await octokit.repos.deleteRelease({
                owner,
                repo,
                release_id: release.id
            });

            // 删除对应的 tag
            try {
                await octokit.git.deleteRef({
                    owner,
                    repo,
                    ref: `tags/${release.tag_name}`
                });
                console.log(`Deleted tag: ${release.tag_name}`);
            } catch (error) {
                console.warn(`Failed to delete tag ${release.tag_name}:`, error.message);
            }
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        process.exit(1);
    }
}

cleanupReleases().catch(console.error);
