// XPTV Extension - KBJFree (Korean BJ Free Video Portal)
// Compliant with XPTV JavaScript VM 6-function architecture

const SITE_URL = 'https://kbjfree.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function argsify(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args);
    } catch (e) {
      return {};
    }
  }
  return args || {};
}

async function getConfig() {
  return jsonify({
    title: 'KBJFree 韩国主播',
    site: SITE_URL,
    tabs: [
      { name: '最新收录', ext: { path: '/', page: 1 } },
      { name: 'AfreecaTV', ext: { path: '/category/afreecatv', page: 1 } },
      { name: 'PandaTV', ext: { path: '/category/pandatv', page: 1 } },
      { name: 'PopkonTV', ext: { path: '/category/popkontv', page: 1 } },
      { name: 'WinkTV', ext: { path: '/category/winktv', page: 1 } },
      { name: 'FlexTV', ext: { path: '/category/flextv', page: 1 } },
      { name: 'MIB 精选', ext: { path: '/category/mib', page: 1 } },
      { name: '18+ 专区', ext: { path: '/category/18', page: 1 } },
      { name: 'VIP 典藏', ext: { path: '/category/vip', page: 1 } }
    ]
  });
}

async function getCards(ext) {
  ext = argsify(ext);
  const path = ext.path || '/';
  const page = ext.page || 1;
  let targetUrl = SITE_URL + path;
  if (page > 1) {
    targetUrl += (path.includes('?') ? '&' : '?') + 'page=' + page;
  }

  const res = await $fetch.get(targetUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': SITE_URL + '/'
    }
  });

  const html = res.text();
  const $ = cheerio.load(html);
  const cards = [];
  const seenIds = new Set();

  $('a[href*="/watch/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const match = href.match(/\/watch\/([a-zA-Z0-9_\-]+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const img = $(el).find('img');
    let title = img.attr('alt') || $(el).attr('title') || $(el).text().trim();
    let cover = img.attr('src') || img.attr('data-src') || '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    title = title.replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2) title = 'KBJ ' + id.slice(0, 8);

    cards.push({
      vod_id: id,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: '超清MP4',
      ext: {
        url: href.startsWith('http') ? href : SITE_URL + href,
        id: id,
        title: title,
        cover: cover
      }
    });
  });

  return jsonify({
    list: cards
  });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const detailUrl = ext.url || (SITE_URL + '/watch/' + ext.id);

  const res = await $fetch.get(detailUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': SITE_URL + '/'
    }
  });

  const html = res.text();
  const $ = cheerio.load(html);
  let streamUrl = '';

  // 1. Check schema.org JSON-LD scripts
  $('script[type="application/ld+json"]').each((i, el) => {
    try {
      const json = JSON.parse($(el).html());
      if (json['@type'] === 'VideoObject') {
        if (json.contentUrl) streamUrl = json.contentUrl;
      }
    } catch (e) {}
  });

  // 2. Regex fallback on HTML
  if (!streamUrl) {
    const match = html.match(/"contentUrl"\s*:\s*"([^"]+)"/) || html.match(/(https?:\/\/[^\s"'<>]+\.marshlecdn\.com\/[^\s"'<>]+\.mp4[^"'\s<>]*)/i);
    if (match) {
      streamUrl = match[1].replace(/\\"/g, '').replace(/&amp;/g, '&');
    }
  }

  const tracks = [];
  if (streamUrl) {
    tracks.push({
      name: 'MP4 官方原画直链',
      pan: '',
      ext: {
        url: streamUrl
      }
    });
  }

  return jsonify({
    list: [
      {
        title: '播放线路 (极速直链)',
        tracks: tracks.length > 0 ? tracks : [{ name: '播放直链', pan: '', ext: { url: streamUrl } }]
      }
    ]
  });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  const url = ext.url;
  return jsonify({
    urls: [url],
    headers: [
      {
        'User-Agent': USER_AGENT,
        'Referer': SITE_URL + '/'
      }
    ]
  });
}

async function search(ext) {
  ext = argsify(ext);
  const keyword = ext.text || ext.wd || ext.keyword || '';
  const page = ext.page || 1;
  let targetUrl = SITE_URL + '/search?q=' + encodeURIComponent(keyword);
  if (page > 1) {
    targetUrl += '&page=' + page;
  }

  const res = await $fetch.get(targetUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': SITE_URL + '/'
    }
  });

  const html = res.text();
  const $ = cheerio.load(html);
  const cards = [];
  const seenIds = new Set();

  $('a[href*="/watch/"]').each((i, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const match = href.match(/\/watch\/([a-zA-Z0-9_\-]+)/);
    if (!match) return;
    const id = match[1];
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const img = $(el).find('img');
    let title = img.attr('alt') || $(el).attr('title') || $(el).text().trim();
    let cover = img.attr('src') || img.attr('data-src') || '';
    if (cover.startsWith('//')) cover = 'https:' + cover;

    title = title.replace(/\s+/g, ' ').trim();
    if (!title || title.length < 2) title = 'KBJ ' + id.slice(0, 8);

    cards.push({
      vod_id: id,
      vod_name: title,
      vod_pic: cover,
      vod_remarks: '超清MP4',
      ext: {
        url: href.startsWith('http') ? href : SITE_URL + href,
        id: id,
        title: title,
        cover: cover
      }
    });
  });

  return jsonify({
    list: cards
  });
}
