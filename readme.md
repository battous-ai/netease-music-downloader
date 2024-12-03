# 网易云音乐下载器

一个命令行工具，用于下载网易云音乐的单曲或专辑。

## 功能特点

- ✨ 支持单曲/多曲下载
- 📀 支持整张专辑下载
- 🚀 显示下载进度条
- 🎵 自动获取歌手和歌名
- 📂 自动创建专辑目录
- ⚡️ 自动跳过已下载的文件
- 🔍 自动检测下架或无版权歌曲

## 安装

```bash
# 克隆仓库
git clone https://github.com/your-username/netease-music-downloader.git

# 进入目录
cd netease-music-downloader

# 安装依赖
pnpm install
```

## 使用方法

### 1. 下载单曲

```bash
# 使用音乐ID下载单曲
pnpm start download 426832090

# 下载多首歌曲
pnpm start download 426832090 123456 789012
```

### 2. 下载专辑

```bash
# 使用专辑URL下载
pnpm start album https://music.163.com/#/album?id=34836039

# 或使用专辑ID下载
pnpm start album 34836039
```

### 3. 批量下载歌曲

创建一个文本文件（例如 `songs.txt`），每行一个音乐ID：
```
426832090
123456
789012
# 这是注释，会被忽略
```

然后使用 `-f` 参数指定文件：
```bash
pnpm start download -f songs.txt
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
├── 单曲下载/
│   └── 歌手名-歌曲名.mp3
└── 专辑下载/
    └── 歌手名-专辑名/
        ├── 01.歌手名-歌曲1.mp3
        ├── 02.歌手名-歌曲2.mp3
        └── ...
```

## 注意事项

- 需要稳定的网络连接
- 下架或无版权的歌曲会自动跳过
- 已下载的文件不会重复下载
- 文件名中的特殊字符会被自动移除
- 下载的音乐仅供个人使用
- 请遵守相关法律法规和网易云音乐的服务条款

## License

MIT
