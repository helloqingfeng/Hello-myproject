/**
 * XPTV 扩展源 - ZIP0 影视 (zip0.com)
 * 适配规范遵循 XPTV 播放源制作方法论（标准 6 函数实现）
 */

const SITE = 'https://zip0.com'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const cheerio = createCheerio()

function argsify(args) {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args)
    } catch (e) {
      return {}
    }
  }
  return args || {}
}

async function getLocalInfo() {
  return jsonify({ api: SITE })
}

function getConfig() {
  const appConfig = {
    ver: 20261022,
    title: 'ZIP0 影视',
    site: SITE,
    tabs: [
      { name: '电影', ext: { query: '电影' }, ui: 1 },
      { name: '电视剧', ext: { query: '电视剧' }, ui: 1 },
      { name: '动漫', ext: { query: '动漫' }, ui: 1 },
      { name: '综艺', ext: { query: '综艺' }, ui: 1 },
      { name: '国产剧', ext: { query: '国产剧' }, ui: 1 },
      { name: '美剧', ext: { query: '美剧' }, ui: 1 },
      { name: '日韩剧', ext: { query: '韩剧' }, ui: 1 },
      { name: '短剧', ext: { query: '短剧' }, ui: 1 },
      { name: '动作片', ext: { query: '动作' }, ui: 1 },
      { name: '科幻片', ext: { query: '科幻' }, ui: 1 },
    ],
  }
  return jsonify(appConfig)
}

async function getCards(ext) {
  try {
    ext = argsify(ext)
    let { page = 1, query = '电影' } = ext
    let url = `${SITE}/api/videos/search?query=${encodeURIComponent(query)}&page=${page}&limit=20`

    const res = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
        'Accept': 'application/json',
      },
    })

    const raw = res.data !== undefined ? res.data : (typeof res.text === 'function' ? res.text() : res)
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = []

    if (json && Array.isArray(json.data)) {
      for (const item of json.data) {
        let playUrl = item.url || ''
        if (playUrl && !playUrl.startsWith('http')) {
          playUrl = SITE + playUrl
        }
        list.push({
          vod_id: playUrl,
          vod_name: item.title || '',
          vod_pic: item.image || item.poster || '',
          vod_remarks: item.remarks || `${item.year || ''} ${item.category || ''}`.trim() || '',
          ext: {
            url: playUrl,
            title: item.title,
            pic: item.image || item.poster
          }
        })
      }
    }

    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}

async function getTracks(ext) {
  try {
    ext = argsify(ext)
    const targetUrl = ext.url || ext.vod_id || ext.id || ''
    if (!targetUrl) return jsonify({ list: [] })

    const res = await $fetch.get(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    })

    const raw = res.data !== undefined ? res.data : (typeof res.text === 'function' ? res.text() : res)
    const html = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const tracks = []

    // 优先从 SSR 序列化数据提取具体集数和链接 (episodes:[{name:"...",url:"..."}])
    const epRegex = /\{name:"([^"]+)",url:"([^"]+)"\}/g
    let match
    while ((match = epRegex.exec(html)) !== null) {
      tracks.push({
        name: match[1],
        pan: '',
        ext: { url: match[2] }
      })
    }

    // 回退机制：若未匹配到，正则查找所有 m3u8/mp4
    if (tracks.length === 0) {
      const mediaRegex = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/g
      const mediaList = html.match(mediaRegex) || []
      const uniqueMedia = Array.from(new Set(mediaList))
      uniqueMedia.forEach((mediaUrl, idx) => {
        tracks.push({
          name: `播放源 ${idx + 1}`,
          pan: '',
          ext: { url: mediaUrl }
        })
      })
    }

    if (tracks.length === 0) {
      tracks.push({
        name: '默认线路',
        pan: '',
        ext: { url: targetUrl }
      })
    }

    return jsonify({
      list: [{
        title: 'ZIP0 极速播放',
        tracks: tracks
      }]
    })
  } catch (error) {
    return jsonify({ list: [] })
  }
}

async function getPlayinfo(ext) {
  try {
    ext = argsify(ext)
    const url = ext.url || ''
    if (!url) return jsonify({ urls: [] })

    // 如果已经是 m3u8 / mp4 直链，直接返回
    if (url.includes('.m3u8') || url.includes('.mp4')) {
      return jsonify({
        urls: [url],
        headers: [{
          'User-Agent': UA,
          'Referer': SITE,
        }],
      })
    }

    // 若传入的是播放页地址，二次抓取
    const res = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    })

    const raw = res.data !== undefined ? res.data : (typeof res.text === 'function' ? res.text() : res)
    const html = typeof raw === 'string' ? raw : JSON.stringify(raw)
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/)
    if (m3u8Match) {
      return jsonify({
        urls: [m3u8Match[0]],
        headers: [{
          'User-Agent': UA,
          'Referer': SITE,
        }],
      })
    }

    return jsonify({ urls: [url] })
  } catch (error) {
    return jsonify({ urls: [] })
  }
}

async function search(ext) {
  try {
    ext = argsify(ext)
    const keyword = ext.text || ext.keyword || ext.wd || ''
    if (!keyword) return jsonify({ list: [] })

    const url = `${SITE}/api/videos/search?query=${encodeURIComponent(keyword)}&page=1&limit=20`
    const res = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
        'Accept': 'application/json',
      },
    })

    const raw = res.data !== undefined ? res.data : (typeof res.text === 'function' ? res.text() : res)
    const json = typeof raw === 'string' ? JSON.parse(raw) : raw
    const list = []

    if (json && Array.isArray(json.data)) {
      for (const item of json.data) {
        let playUrl = item.url || ''
        if (playUrl && !playUrl.startsWith('http')) {
          playUrl = SITE + playUrl
        }
        list.push({
          vod_id: playUrl,
          vod_name: item.title || '',
          vod_pic: item.image || item.poster || '',
          vod_remarks: item.remarks || `${item.year || ''} ${item.category || ''}`.trim() || '',
          ext: {
            url: playUrl,
            title: item.title,
            pic: item.image || item.poster
          }
        })
      }
    }

    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}
