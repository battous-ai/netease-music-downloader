import axios from 'axios';
import { setProxy } from './netease';
import { getSongInfo } from './netease';
import cheerio from 'cheerio';

interface Proxy {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  country: string;
  speed?: number;
  lastChecked?: Date;
}

class ProxyManager {
  private proxyList: Proxy[] = [];
  private lastUpdate: Date | null = null;
  private readonly UPDATE_INTERVAL = 10 * 60 * 1000; // 10 minutes
  private readonly TIMEOUT = 3000; // 3 seconds timeout
  private readonly MAX_PARALLEL_TESTS = 5; // test 5 proxies at once
  private readonly TEST_SONG_ID = '1956534932'; // 用于测试的歌曲ID（热门歌曲）
  private readonly PROXY_SOURCES = [
    {
      url: 'https://www.kuaidaili.com/free/inha/',
      type: 'kuaidaili'
    },
    {
      url: 'http://www.89ip.cn/index_1.html',
      type: '89ip'
    },
    {
      url: 'https://proxy.ip3366.net/free/',
      type: 'ip3366'
    },
    {
      url: 'https://proxylist.geonode.com/api/proxy-list?filterUpTime=90&country=CN&protocols=http%2Chttps&limit=100',
      type: 'geonode'
    },
    {
      url: 'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&country=CN&ssl=all&anonymity=all',
      type: 'proxyscrape'
    },
    {
      url: 'https://raw.githubusercontent.com/fate0/proxylist/master/proxy.list',
      type: 'fate0'
    },
    {
      url: 'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.json',
      type: 'sunny9577'
    }
  ];

  // 强制更新代理列表
  async forceUpdateProxyList(): Promise<void> {
    this.lastUpdate = null;
    await this.updateProxyList();
  }

  async getWorkingProxy(forceUpdate: boolean = false): Promise<Proxy | null> {
    if (forceUpdate || !this.lastUpdate || Date.now() - this.lastUpdate.getTime() > this.UPDATE_INTERVAL) {
      await this.updateProxyList();
    }

    const sortedProxies = [...this.proxyList].sort((a, b) => {
      if (a.lastChecked && b.lastChecked) {
        return b.lastChecked.getTime() - a.lastChecked.getTime();
      }
      if (a.lastChecked) return -1;
      if (b.lastChecked) return 1;

      if (!a.speed) return 1;
      if (!b.speed) return -1;
      return a.speed - b.speed;
    });

    const chunks: Proxy[][] = [];
    for (let i = 0; i < sortedProxies.length; i += this.MAX_PARALLEL_TESTS) {
      chunks.push(sortedProxies.slice(i, i + this.MAX_PARALLEL_TESTS));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `\n开始测试第 ${i + 1}/${chunks.length} 组代理 Testing group ${i + 1}/${chunks.length} (${
          chunk.length
        } proxies)...`,
      );
      const results = await Promise.all(chunk.map((proxy) => this.testProxy(proxy)));

      const workingIndex = results.findIndex((speed) => speed !== null);
      if (workingIndex !== -1) {
        const workingProxy = chunk[workingIndex];
        workingProxy.speed = results[workingIndex]!;
        workingProxy.lastChecked = new Date();
        const proxyUrl = `${workingProxy.protocol}://${workingProxy.host}:${workingProxy.port}`;
        console.log(`\n✨ 找到可用代理 Found working proxy: ${proxyUrl}`);
        return workingProxy;
      }
      console.log(`❌ 第 ${i + 1} 组代理全部测试失败 All proxies in group ${i + 1} failed`);
    }

    if (this.proxyList.length === 0) {
      console.log('\n💡 代理列表为空，尝试重新获取 Proxy list empty, trying to update...');
      await this.updateProxyList();
      return this.getWorkingProxy();
    }

    console.log('\n❌ 所有代理均不可用 All proxies failed');
    return null;
  }

  private async updateProxyList() {
    this.proxyList = [];
    console.log('\n🔄 正在从代理源获取代理列表 Fetching proxy list from sources...');

    const results = await Promise.all(
      this.PROXY_SOURCES.map(async (source) => {
        try {
          console.log(`- 正在获取 Fetching from: ${source.url}`);
          const response = await axios.get(source.url, { timeout: this.TIMEOUT });
          const proxies = this.parseProxyList(response.data, source.type);
          console.log(
            `✅ 成功获取 ${proxies.length} 个代理 Successfully got ${proxies.length} proxies from ${source.url}`,
          );
          return proxies;
        } catch (error) {
          console.log(
            `❌ 获取失败 Failed to fetch from ${source.url}:`,
            error instanceof Error ? error.message : 'Unknown error',
          );
          return [];
        }
      }),
    );

    this.proxyList = results.flat();
    this.lastUpdate = new Date();
    console.log(
      `\n📊 代理列表更新完成，共找到 ${this.proxyList.length} 个中国代理 Proxy list updated, found ${this.proxyList.length} Chinese proxies`,
    );
  }

  private parseProxyList(data: any, sourceType: string): Proxy[] {
    try {
      switch (sourceType) {
        case 'proxy-list.download':
          return data
            .split('\n')
            .filter(Boolean)
            .map((line: string) => {
              const [host, port] = line.split(':');
              return { host, port: parseInt(port), protocol: 'http', country: 'CN' };
            });

        case 'geonode':
          return data.data.map((item: any) => ({
            host: item.ip,
            port: parseInt(item.port),
            protocol: item.protocols[0],
            country: 'CN',
          }));

        case 'proxyscrape':
          return data
            .split('\n')
            .filter(Boolean)
            .map((line: string) => {
              const [host, port] = line.split(':');
              return { host, port: parseInt(port), protocol: 'http', country: 'CN' };
            });

        case 'openproxylist':
          return data
            .split('\n')
            .filter(Boolean)
            .map((line: string) => {
              const [host, port] = line.split(':');
              return { host, port: parseInt(port), protocol: 'http', country: 'CN' };
            });

        case 'fate0':
          return data
            .split('\n')
            .filter(Boolean)
            .map((line: string) => {
              try {
                const item = JSON.parse(line);
                if (item.country === 'CN') {
                  return {
                    host: item.host,
                    port: item.port,
                    protocol: item.type || 'http',
                    country: 'CN',
                  };
                }
              } catch (e) {}
              return null;
            })
            .filter((item: any) => item !== null);

        case 'sunny9577':
          return JSON.parse(data)
            .filter((item: any) => item.country === 'CN')
            .map((item: any) => ({
              host: item.ip,
              port: parseInt(item.port),
              protocol: 'http',
              country: 'CN',
            }));

        case 'kuaidaili':
          const $ = cheerio.load(data);
          return $('table tbody tr')
            .map((_, tr) => {
              const host = $(tr).find('td[data-title="IP"]').text().trim();
              const port = parseInt($(tr).find('td[data-title="PORT"]').text().trim());
              if (host && port) {
                return { host, port, protocol: 'http' as const, country: 'CN' };
              }
              return null;
            })
            .get()
            .filter(Boolean);

        case '89ip':
          const $89 = cheerio.load(data);
          return $89('table tbody tr')
            .map((_, tr) => {
              const host = $89(tr).find('td:nth-child(1)').text().trim();
              const port = parseInt($89(tr).find('td:nth-child(2)').text().trim());
              if (host && port) {
                return { host, port, protocol: 'http' as const, country: 'CN' };
              }
              return null;
            })
            .get()
            .filter(Boolean);

        case '7yip':
          const $7yip = cheerio.load(data);
          return $7yip('table tbody tr')
            .map((_, tr) => {
              const host = $7yip(tr).find('td:nth-child(1)').text().trim();
              const port = parseInt($7yip(tr).find('td:nth-child(2)').text().trim());
              if (host && port) {
                return { host, port, protocol: 'http' as const, country: 'CN' };
              }
              return null;
            })
            .get()
            .filter(Boolean);

        case 'ip3366':
          const $ip3366 = cheerio.load(data);
          return $ip3366('table tbody tr').map((_, tr) => {
            const host = $ip3366(tr).find('td:nth-child(1)').text().trim();
            const port = parseInt($ip3366(tr).find('td:nth-child(2)').text().trim());
            if (host && port) {
              return { host, port, protocol: 'http' as const, country: 'CN' };
            }
            return null;
          }).get().filter(Boolean);

        default:
          return [];
      }
    } catch (error) {
      console.log(
        `解析代理列表失败 Failed to parse proxy list from ${sourceType}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      return [];
    }
  }

  private async testProxy(proxy: Proxy): Promise<number | null> {
    const startTime = Date.now();
    const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
    console.log(`正在测试代理 Testing proxy: ${proxyUrl}`);

    try {
      // 第一步：测试基本连接
      await axios.get('https://music.163.com', {
        timeout: this.TIMEOUT,
        proxy: {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
        },
      });

      // 第二步：测试API连接
      await axios.get('https://music.163.com/api/v3/playlist/detail', {
        timeout: this.TIMEOUT,
        proxy: {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol,
        },
      });

      // 第三步：测试实际歌曲信息获取
      setProxy(proxyUrl); // 设置代理
      try {
        await getSongInfo(this.TEST_SONG_ID);
        const speed = Date.now() - startTime;
        console.log(
          `✅ 代理完全可用 Proxy fully working: ${proxyUrl}, 响应时间 Response time: ${speed}ms`,
        );
        return speed; // 如果测试成功，保持代理设置
      } catch (error) {
        console.log(
          `❌ 代理可连接但无法获取歌曲信息 Proxy connected but failed to get song info: ${proxyUrl}`,
        );
        setProxy(undefined); // 只在测试失败时清除代理
        return null;
      }
    } catch (error) {
      console.log(`❌ 代理连接失败 Proxy connection failed: ${proxyUrl}`);
      setProxy(undefined); // 只在测试失败时清除代理
      return null;
    }
  }
}

const proxyManager = new ProxyManager();

export async function getAutoProxy(forceUpdate: boolean = false): Promise<string | null> {
  try {
    const proxy = await proxyManager.getWorkingProxy(forceUpdate);
    if (proxy) {
      const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
      setProxy(proxyUrl);
      return proxyUrl;
    }
  } catch (error) {
    console.error('Failed to get auto proxy:', error instanceof Error ? error.message : 'Unknown error');
  }
  return null;
}
