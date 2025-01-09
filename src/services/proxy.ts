import axios from 'axios';
import { setProxy } from './netease';

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
  private readonly TIMEOUT = 3000; // 减少到3秒
  private readonly MAX_PARALLEL_TESTS = 5; // 最多同时测试5个代理
  private readonly PROXY_SOURCES = [
    'https://www.proxy-list.download/api/v1/get?type=http&country=CN',
    'https://proxylist.geonode.com/api/proxy-list?filterUpTime=90&country=CN&protocols=http%2Chttps&limit=100',
  ];

  async getWorkingProxy(): Promise<Proxy | null> {
    // Update proxy list if it's too old
    if (!this.lastUpdate || Date.now() - this.lastUpdate.getTime() > this.UPDATE_INTERVAL) {
      await this.updateProxyList();
    }

    // Sort by speed (if available) and last checked time
    const sortedProxies = [...this.proxyList].sort((a, b) => {
      // 优先使用最近测试成功的代理
      if (a.lastChecked && b.lastChecked) {
        return b.lastChecked.getTime() - a.lastChecked.getTime();
      }
      if (a.lastChecked) return -1;
      if (b.lastChecked) return 1;

      // 其次按速度排序
      if (!a.speed) return 1;
      if (!b.speed) return -1;
      return a.speed - b.speed;
    });

    // 并行测试代理
    const chunks: Proxy[][] = [];
    for (let i = 0; i < sortedProxies.length; i += this.MAX_PARALLEL_TESTS) {
      chunks.push(sortedProxies.slice(i, i + this.MAX_PARALLEL_TESTS));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`\n开始测试第 ${i + 1}/${chunks.length} 组代理 Testing group ${i + 1}/${chunks.length} (${chunk.length} proxies)...`);
      const results = await Promise.all(
        chunk.map(proxy => this.testProxy(proxy))
      );

      // 找到第一个可用的代理
      const workingIndex = results.findIndex(speed => speed !== null);
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

    // If no working proxy found, try to update the list once more
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
          console.log(`- 正在获取 Fetching from: ${source}`);
          const response = await axios.get(source, { timeout: this.TIMEOUT });
          const proxies = this.parseProxyList(response.data, source);
          console.log(`✅ 成功获取 ${proxies.length} 个代理 Successfully got ${proxies.length} proxies from ${source}`);
          return proxies;
        } catch (error) {
          console.log(`❌ 获取失败 Failed to fetch from ${source}:`, error instanceof Error ? error.message : 'Unknown error');
          return [];
        }
      })
    );

    this.proxyList = results.flat();
    this.lastUpdate = new Date();
    console.log(`\n📊 代理列表更新完成，共找到 ${this.proxyList.length} 个中国代理 Proxy list updated, found ${this.proxyList.length} Chinese proxies`);
  }

  private parseProxyList(data: any, source: string): Proxy[] {
    if (source.includes('proxy-list.download')) {
      // Format: IP:PORT per line
      return data.split('\n')
        .filter(Boolean)
        .map((line: string) => {
          const [host, port] = line.split(':');
          return {
            host,
            port: parseInt(port),
            protocol: 'http',
            country: 'CN'
          };
        });
    } else if (source.includes('geonode.com')) {
      // GeoNode API format
      return data.data.map((item: any) => ({
        host: item.ip,
        port: parseInt(item.port),
        protocol: item.protocols[0],
        country: 'CN'
      }));
    }
    return [];
  }

  private async testProxy(proxy: Proxy): Promise<number | null> {
    const startTime = Date.now();
    const proxyUrl = `${proxy.protocol}://${proxy.host}:${proxy.port}`;
    console.log(`正在测试代理 Testing proxy: ${proxyUrl}`);

    try {
      // Test the proxy with NetEase Music API
      await axios.get('https://music.163.com/api/v3/playlist/detail', {
        timeout: this.TIMEOUT,
        proxy: {
          host: proxy.host,
          port: proxy.port,
          protocol: proxy.protocol
        }
      });

      const speed = Date.now() - startTime;
      console.log(`✅ 代理可用 Proxy working: ${proxyUrl}, 响应时间 Response time: ${speed}ms`);
      return speed;
    } catch (error) {
      console.log(`❌ 代理不可用 Proxy failed: ${proxyUrl}`);
      return null;
    }
  }
}

const proxyManager = new ProxyManager();

export async function getAutoProxy(): Promise<string | null> {
  try {
    const proxy = await proxyManager.getWorkingProxy();
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
