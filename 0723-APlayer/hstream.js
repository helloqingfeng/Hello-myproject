/**
 * XPTV 扩展源 - HStream (hstream.moe)
 * 适配规范遵循 XPTV 播放源制作方法论（标准 6 函数实现）
 */

const SITE = 'https://hstream.moe';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const cheerio = createCheerio();

/**
 * ① 新版 XPTV 强制检查入口：必须返回 api 字段
 */
async function getLocalInfo() {
  return jsonify({ api: SITE });
}

/**
 * ② 配置：显示名称 + 分类 tabs
 */
function getConfig() {
  const appConfig = {
    author: 'Antigravity',
    title: 'HStream',
    tabs: [
      { title: '最新推荐', typeurl: '/' },
      { title: '全部浏览', typeurl: '/search' },
    ],
  };
  return jsonify(appConfig);
}

/**
 * 卡片通用解析工具函数
 */
function parseCardsFromHtml(html) {
  const $ = cheerio.load(html);
  const cards = [];
  const seen = new Set();

  $('a[href*="/hentai/"]').each((_, el) => {
    const link = $(el);
    const href = link.attr('href');
    if (!href || seen.has(href)) return;

    const container = link.closest('.episode-item, .group, div[wire\\:key], div.relative');
    const target = container.length ? container : link;

    let title = target.find('h3').first().text().trim() ||
                target.find('.title').first().text().trim() ||
                link.attr('title') ||
                target.find('img').first().attr('alt') || '';

    if (!title) {
      const text = link.text().trim();
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length > 0) {
        title = lines.find(l => !l.includes('fps') && !l.includes('4k') && !l.includes('FHD')) || lines[0];
      }
    }

    let pic = target.find('img').first().attr('src') ||
              target.find('img').first().attr('data-src') || '';

    if (pic && !pic.startsWith('http')) {
      pic = SITE + (pic.startsWith('/') ? '' : '/') + pic;
    }

    let fullHref = href;
    if (fullHref && !fullHref.startsWith('http')) {
      fullHref = SITE + (fullHref.startsWith('/') ? '' : '/') + fullHref;
    }

    const duration = target.find('.duration').first().text().trim();
    const views = target.find('i.fa-eye, i.fa-regular.fa-eye').parent().text().trim();
    const remarks = [duration, views].filter(Boolean).join(' | ');

    if (title && fullHref.includes('/hentai/')) {
      seen.add(href);
      cards.push({
        vod_id: fullHref,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remarks,
      });
    }
  });

  return cards;
}

/**
 * ③ 列表：从 ext 取分类参数与页码
 */
async function getCards(ext) {
  try {
    let { typeurl = '/' } = ext || {};
    const url = typeurl.startsWith('http') ? typeurl : `${SITE}${typeurl}`;

    const { data } = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    });

    const html = typeof data === 'string' ? data : JSON.stringify(data);
    const list = parseCardsFromHtml(html);

    return jsonify({ list });
  } catch (error) {
    return jsonify({ list: [] });
  }
}

/**
 * ④ 线路 / 选集：解析播放线路与流媒体地址
 */
async function getTracks(ext) {
  try {
    const targetUrl = ext.url || ext.vod_id || ext.id || '';
    if (!targetUrl) return jsonify([]);

    const res = await $fetch.get(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    });

    const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    const $ = cheerio.load(html);

    const eId = $('#e_id').val();
    const token = $('input[name="_token"]').val();

    // 提取 Cookies（用于后续 API 认证）
    let cookies = '';
    if (res.headers && res.headers['set-cookie']) {
      const sc = res.headers['set-cookie'];
      cookies = Array.isArray(sc) ? sc.join('; ') : String(sc);
    }

    if (eId && token) {
      try {
        const postHeaders = {
          'User-Agent': UA,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          'X-CSRF-TOKEN': token,
          'Referer': targetUrl,
        };
        if (cookies) {
          postHeaders['Cookie'] = cookies;
        }

        const apiRes = await $fetch.post(
          `${SITE}/player/api`,
          JSON.stringify({ episode_id: parseInt(eId) }),
          { headers: postHeaders }
        );

        let apiData = apiRes.data;
        if (typeof apiData === 'string') {
          try {
            apiData = JSON.parse(apiData);
          } catch (e) {}
        }

        if (apiData && apiData.stream_url && (apiData.stream_domains || apiData.asia_stream_domains)) {
          const { stream_domains = [], stream_url, asia_stream_domains = [] } = apiData;
          const domains = asia_stream_domains.length > 0
            ? asia_stream_domains.concat(stream_domains)
            : stream_domains;

          const uniqueDomains = Array.from(new Set(domains));
          const tracks = [];

          uniqueDomains.forEach((domain, idx) => {
            tracks.push({
              name: `线路 ${idx + 1} (720P MP4 直链)`,
              url: `${domain}/${stream_url}/x264.720p.mp4`,
            });
            tracks.push({
              name: `线路 ${idx + 1} (1080P MPD)`,
              url: `${domain}/${stream_url}/1080/manifest.mpd`,
            });
            tracks.push({
              name: `线路 ${idx + 1} (720P MPD)`,
              url: `${domain}/${stream_url}/720/manifest.mpd`,
            });
          });

          if (tracks.length > 0) {
            return jsonify(tracks);
          }
        }
      } catch (err) {}
    }

    // 回退：查找页面中的直接媒体流
    const mediaRegex = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd)[^\s"'<>]*/g;
    const mediaList = html.match(mediaRegex) || [];
    const uniqueMedia = Array.from(new Set(mediaList));
    const fallbackTracks = uniqueMedia.map((mUrl, idx) => ({
      name: `播放源 ${idx + 1}`,
      url: mUrl,
    }));

    return jsonify(fallbackTracks);
  } catch (error) {
    return jsonify([]);
  }
}

/**
 * ⑤ 播放：提取最终直链与请求头
 */
async function getPlayinfo(ext) {
  try {
    const { url } = ext || {};
    if (!url) return jsonify({ url: '' });

    return jsonify({
      url: url,
      header: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    });
  } catch (error) {
    return jsonify({ url: '' });
  }
}

/**
 * ⑥ 搜索：通过 Livewire 3 动态检索
 */
async function search(ext) {
  try {
    const keyword = ext.keyword || ext.wd || ext.text || ext.key || '';
    if (!keyword) return jsonify({ list: [] });

    const getRes = await $fetch.get(`${SITE}/search`, {
      headers: { 'User-Agent': UA, 'Referer': SITE },
    });

    const html = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data);
    const $ = cheerio.load(html);
    const token = $('input[name="_token"]').val() || $('script[data-csrf]').attr('data-csrf');

    let cookies = '';
    if (getRes.headers && getRes.headers['set-cookie']) {
      const sc = getRes.headers['set-cookie'];
      cookies = Array.isArray(sc) ? sc.join('; ') : String(sc);
    }

    let snapshotStr = '';
    $('[wire\\:snapshot]').each((_, el) => {
      const s = $(el).attr('wire:snapshot');
      if (s && s.includes('live-search')) {
        snapshotStr = s;
      }
    });

    if (token && snapshotStr) {
      const payload = {
        _token: token,
        components: [
          {
            snapshot: snapshotStr,
            updates: { search: keyword },
            calls: [],
          },
        ],
      };

      const postHeaders = {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        'Accept': 'text/html, application/xhtml+xml',
        'X-Livewire': 'true',
        'X-CSRF-TOKEN': token,
        'Referer': `${SITE}/search`,
      };
      if (cookies) postHeaders['Cookie'] = cookies;

      const updateRes = await $fetch.post(
        `${SITE}/livewire/update`,
        JSON.stringify(payload),
        { headers: postHeaders }
      );

      let resData = updateRes.data;
      if (typeof resData === 'string') {
        try {
          resData = JSON.parse(resData);
        } catch (e) {}
      }

      const resHtml = resData?.components?.[0]?.effects?.html || '';
      if (resHtml) {
        const list = parseCardsFromHtml(resHtml);
        return jsonify({ list });
      }
    }

    // 回退机制：从静态页面检索
    const allCards = parseCardsFromHtml(html);
    const filtered = allCards.filter(c => c.vod_name.toLowerCase().includes(keyword.toLowerCase()));
    return jsonify({ list: filtered });
  } catch (error) {
    return jsonify({ list: [] });
  }
}
