// hstream.moe XPTV 播放源扩展
// 站点使用 Livewire (Laravel) 框架，首页服务端渲染包含视频卡片
// 播放地址通过 /player/api 获取流媒体域名和 stream_url

const SITE = 'https://hstream.moe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 站点支持的标签分类（从首页标签区域提取）
const TAGS = [
  'uncensored', 'milf', 'maid', 'school-girl', 'succubus',
  'tentacle', 'big-boobs', 'bdsm', 'elf', '4k-48fps',
  'anal', 'cum', 'asian', 'teen'
];

async function getLocalInfo() {
  return jsonify({ api: SITE });
}

async function getConfig() {
  return jsonify({
    title: 'HStream',
    tabs: [
      { name: '首页', ext: { url: SITE + '/' } },
      { name: 'Uncensored', ext: { tag: 'uncensored' } },
      { name: 'Milf', ext: { tag: 'milf' } },
      { name: 'Maid', ext: { tag: 'maid' } },
      { name: 'School Girl', ext: { tag: 'school-girl' } },
      { name: 'Succubus', ext: { tag: 'succubus' } },
      { name: 'Tentacle', ext: { tag: 'tentacle' } },
      { name: 'Big Boobs', ext: { tag: 'big-boobs' } },
      { name: 'BDSM', ext: { tag: 'bdsm' } },
      { name: 'Elf', ext: { tag: 'elf' } },
      { name: '4K 48FPS', ext: { tag: '4k-48fps' } },
      { name: 'Anal', ext: { tag: 'anal' } },
      { name: 'Asian', ext: { tag: 'asian' } },
      { name: 'Teen', ext: { tag: 'teen' } },
    ]
  });
}

async function getCards(ext) {
  const cheerio = createCheerio();
  let url;

  if (ext.url) {
    url = ext.url;
  } else if (ext.tag) {
    // 标签筛选需要通过 Livewire AJAX，这里尝试 URL 参数
    url = SITE + '/?tags%5B0%5D%5B%5D=' + encodeURIComponent(ext.tag);
  } else {
    url = SITE + '/';
  }

  const data = await $fetch.get(url, {
    headers: { 'User-Agent': UA }
  });

  const $ = cheerio.load(data);
  const cards = [];

  $('div.episode-item').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').first();
    const href = link.attr('href');
    const title = link.find('h3').text().trim();
    const pic = link.find('img').attr('src');
    const duration = $el.find('.duration').text().trim();

    if (href && title) {
      const remarks = [];
      if (duration) remarks.push(duration);
      const viewsEl = $el.find('i.fa-regular.fa-eye').parent();
      if (viewsEl.length) {
        const viewsText = viewsEl.text().trim();
        if (viewsText) remarks.push(viewsText);
      }

      cards.push({
        vod_id: href,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remarks.join(' | ')
      });
    }
  });

  return jsonify({ list: cards });
}

async function getTracks(ext) {
  const cheerio = createCheerio();
  const url = ext.url;

  if (!url) {
    return jsonify({ list: [] });
  }

  const data = await $fetch.get(url, {
    headers: { 'User-Agent': UA }
  });

  const $ = cheerio.load(data);
  const eId = $('#e_id').val();
  const authCheck = $('#auth_check').val();

  if (!eId) {
    return jsonify({ list: [] });
  }

  // 提取页面中的 CSRF token
  const token = $('input[name="_token"]').val();

  // 调用 player API 获取流媒体数据
  // 注意：XPTV 运行时环境会自动管理 Cookie 和 CSRF
  let apiData;
  try {
    apiData = await $fetch.post(SITE + '/player/api',
      { episode_id: parseInt(eId) },
      {
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': url
        }
      }
    );
  } catch (e) {
    // 如果 player API 调用失败，尝试从页面中提取流信息
    // 检查是否有嵌入式数据
    const streamData = $('script').filter((_, s) => {
      const text = $(s).text();
      return text.includes('stream_url') || text.includes('stream_domains');
    });

    if (streamData.length) {
      const text = streamData.text();
      const urlMatch = text.match(/stream_url["':\s]+["']([^"']+)["']/);
      const domainMatch = text.match(/stream_domains["':\s]+\[([^\]]+)\]/);

      if (urlMatch) {
        return jsonify({
          list: [{
            track_name: 'Stream',
            ext: { url: urlMatch[1], type: 'mpd' }
          }]
        });
      }
    }

    return jsonify({ list: [] });
  }

  if (!apiData || apiData.status !== 200 || !apiData.data) {
    return jsonify({ list: [] });
  }

  const { stream_domains, stream_url, asia_stream_domains } = apiData.data;
  const domains = asia_stream_domains && asia_stream_domains.length
    ? asia_stream_domains
    : stream_domains;

  if (!domains || !stream_url) {
    return jsonify({ list: [] });
  }

  const tracks = [];
  domains.forEach((domain, i) => {
    const mpdUrl = domain + '/' + stream_url + '/720/manifest.mpd';
    const mp4Url = domain + '/' + stream_url + '/x264.720p.mp4';

    tracks.push({
      track_name: `Server #${i + 1}`,
      ext: {
        url: mpdUrl,
        mp4_url: mp4Url,
        type: 'mpd'
      }
    });
  });

  return jsonify({ list: tracks });
}

async function getPlayinfo(ext) {
  const url = ext.url;
  if (!url) {
    return jsonify({ urls: [] });
  }
  return jsonify({ urls: [url] });
}

async function search(ext) {
  const cheerio = createCheerio();
  const keyword = ext.keyword;

  if (!keyword) {
    return jsonify({ list: [] });
  }

  // Livewire 搜索需要通过 AJAX，这里尝试 URL 参数
  const url = SITE + '/search?keyword=' + encodeURIComponent(keyword);

  const data = await $fetch.get(url, {
    headers: { 'User-Agent': UA }
  });

  const $ = cheerio.load(data);
  const cards = [];

  $('div.episode-item').each((_, el) => {
    const $el = $(el);
    const link = $el.find('a').first();
    const href = link.attr('href');
    const title = link.find('h3').text().trim();
    const pic = link.find('img').attr('src');

    if (href && title) {
      // 检查标题是否包含搜索关键词
      if (title.toLowerCase().includes(keyword.toLowerCase())) {
        cards.push({
          vod_id: href,
          vod_name: title,
          vod_pic: pic
        });
      }
    }
  });

  return jsonify({ list: cards });
}
