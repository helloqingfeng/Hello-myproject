/**
 * XPTV 扩展源 - ZIP0 影视 (zip0.com)
 * 适配规范遵循 XPTV 播放源制作方法论（标准 6 函数实现）
 */

const SITE = 'https://zip0.com'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const cheerio = createCheerio()

/**
 * ① 新版 XPTV 强制检查入口：必须返回 api 字段
 */
async function getLocalInfo() {
  return jsonify({ api: SITE })
}

/**
 * ② 配置：显示名称 + 分类 tabs
 */
function getConfig() {
  const appConfig = {
    author: 'Antigravity',
    title: 'ZIP0 影视',
    tabs: [
      { title: '电影', typeurl: '/api/videos/search?query=电影' },
      { title: '电视剧', typeurl: '/api/videos/search?query=电视剧' },
      { title: '动漫', typeurl: '/api/videos/search?query=动漫' },
      { title: '综艺', typeurl: '/api/videos/search?query=综艺' },
      { title: '国产剧', typeurl: '/api/videos/search?query=国产剧' },
      { title: '美剧', typeurl: '/api/videos/search?query=美剧' },
      { title: '日韩剧', typeurl: '/api/videos/search?query=韩剧' },
      { title: '短剧', typeurl: '/api/videos/search?query=短剧' },
      { title: '动作片', typeurl: '/api/videos/search?query=动作' },
      { title: '科幻片', typeurl: '/api/videos/search?query=科幻' },
    ],
  }
  return jsonify(appConfig)
}

/**
 * ③ 列表：从 ext 取分类参数与页码
 */
async function getCards(ext) {
  try {
    let { page = 1, typeurl = '/api/videos/search?query=电影' } = ext || {}
    let url = ''
    if (typeurl.includes('?')) {
      url = `${SITE}${typeurl}&page=${page}&limit=20`
    } else {
      url = `${SITE}${typeurl}?page=${page}&limit=20`
    }

    const { data } = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
        'Accept': 'application/json',
      },
    })

    const json = typeof data === 'string' ? JSON.parse(data) : data
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
        })
      }
    }

    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}

/**
 * ④ 线路 / 选集：解析详情页与播放列表
 */
async function getTracks(ext) {
  try {
    const targetUrl = ext.url || ext.vod_id || ext.id || ''
    if (!targetUrl) return jsonify([])

    const { data } = await $fetch.get(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    })

    const html = typeof data === 'string' ? data : JSON.stringify(data)
    const tracks = []

    // 优先从 SSR 序列化数据提取具体集数和链接
    const epRegex = /\{name:"([^"]+)",url:"([^"]+)"\}/g
    let match
    while ((match = epRegex.exec(html)) !== null) {
      tracks.push({
        name: match[1],
        url: match[2],
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
          url: mediaUrl,
        })
      })
    }

    // 再次回退：若仍无直链，直接返回详情页作为单线路
    if (tracks.length === 0) {
      tracks.push({
        name: '默认线路',
        url: targetUrl,
      })
    }

    return jsonify(tracks)
  } catch (error) {
    return jsonify([])
  }
}

/**
 * ⑤ 播放：提取最终直链
 */
async function getPlayinfo(ext) {
  try {
    const { url } = ext || {}
    if (!url) return jsonify({ url: '' })

    // 如果已经是 m3u8 / mp4 直链，直接返回
    if (url.includes('.m3u8') || url.includes('.mp4')) {
      return jsonify({
        url: url,
        header: {
          'User-Agent': UA,
          'Referer': SITE,
        },
      })
    }

    // 若传入的是播放页地址，二次抓取
    const { data } = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
      },
    })

    const html = typeof data === 'string' ? data : JSON.stringify(data)
    const reg = /https?:\/\/[^\s'"<>]+?\.(?:m3u8|mp4)[^\s'"<>]*/g
    const match = html.match(reg)

    if (match && match.length > 0) {
      return jsonify({
        url: match[0],
        header: {
          'User-Agent': UA,
          'Referer': url,
        },
      })
    }

    return jsonify({ url: url })
  } catch (error) {
    return jsonify({ url: '' })
  }
}

/**
 * ⑥ 搜索：按关键词搜索视频
 */
async function search(ext) {
  try {
    const { wd, text, key, page = 1 } = ext || {}
    const keyword = text || wd || key || ext.keyword || ''
    if (!keyword) return jsonify({ list: [] })

    const searchUrl = `${SITE}/api/videos/search?query=${encodeURIComponent(keyword)}&page=${page}&limit=20`
    const { data } = await $fetch.get(searchUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE,
        'Accept': 'application/json',
      },
    })

    const json = typeof data === 'string' ? JSON.parse(data) : data
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
        })
      }
    }

    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}
