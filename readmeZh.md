# 网易云音乐下载器

**本仓库绝大部分代码是由AI编写开发。**

一个简单易用的网易云音乐下载工具，支持单曲和专辑下载。提供多种使用方式，满足不同场景的需求。

## 功能特点

- ✨ 支持单曲/多曲下载
- 📀 支持整张专辑下载
- 🚀 显示下载进度条
- 🎵 自动获取歌手和歌名
- 📂 自动创建专辑目录
- ⚡️ 自动跳过已下载的文件
- 🔍 自动检测下架或无版权歌曲
- 📝 自动下载歌词（如果有）

## 使用方法

### 1. 通过 GitHub Issue 下载（推荐）

最简单的使用方式，无需安装任何工具（由于github action服务器在海外，所以部分歌曲可能无法下载）：

1. 访问 [Issues 页面](https://github.com/Gaohaoyang/netease-music-downloader/issues)
2. 点击 "New Issue"
3. 选择 "下载音乐" 模板
4. 填写下载类型（单曲/专辑）和音乐ID
5. 提交 issue 后会自动开始下载
6. 下载完成后会在 issue 中提供下载链接

### 2. 通过 npx 使用

无需安装，直接运行：

```bash
# 下载单曲
npx netease-music-downloader download 426832090

# 下载专辑
npx netease-music-downloader album 34836039
```

### 3. 本地开发运行

如果需要进行本地开发：

```bash
# 克隆仓库
git clone https://github.com/Gaohaoyang/netease-music-downloader.git

# 进入目录
cd netease-music-downloader

# 安装依赖
pnpm install

# 运行命令
pnpm start download 426832090  # 下载单曲
pnpm start album 34836039     # 下载专辑
```

## 如何获取音乐ID？

1. 打开网易云音乐网页版或客户端
2. 找到想要下载的歌曲或专辑
3. 复制链接，从链接中获取ID：
   - 单曲链接：`https://music.163.com/#/song?id=426832090` 中的 `426832090`
   - 专辑链接：`https://music.163.com/#/album?id=34836039` 中的 `34836039`

## 下载目录结构

```
downloads/
├── 歌手名-歌曲名.mp3              # 单曲下载
├── 歌手名-歌曲名.lrc             # 歌词文件
└── 专辑名/                       # 专辑下载
    ├── 01.歌手名-歌曲1.mp3
    ├── 01.歌手名-歌曲1.lrc
    ├── 02.歌手名-歌曲2.mp3
    ├── 02.歌手名-歌曲2.lrc
    └── ...
```

## 注意事项

- 仅供个人学习使用
- 请遵守相关法律法规
- 部分音乐可能因版权限制无法下载
- 下载的音乐文件会在 3 小时后自动清理
- 需要稳定的网络连接
- 文件名中的特殊字符会被自动移除

## License

MIT

