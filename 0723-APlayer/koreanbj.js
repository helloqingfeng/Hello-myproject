/**
 * XPTV 扩展源 - Korean BJ Live (koreanbj.live)
 * 适配规范遵循 XPTV 播放源制作方法论（标准 6 函数实现）
 */

const SITE = 'https://koreanbj.live'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
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
    title: 'Korean BJ Live',
    tabs: [
      { title: '最新视频', typeurl: '/?filter=latest' },
      { title: '韩国主播', typeurl: '/category/korean-bj/' },
      { title: '最多观看', typeurl: '/?filter=most-viewed' },
      { title: '最长视频', typeurl: '/?filter=longest' },
      { title: 'Panda TV', typeurl: '/category/pandatv/' },
      { title: 'OnlyFans', typeurl: '/category/onlyfans/' },
      { title: 'Twitch', typeurl: '/category/twitch/' },
      { title: 'Fantrie', typeurl: '/category/fantrie/' },
      { title: 'StripChat', typeurl: '/category/stripchat/' },
    ],
  }
  return jsonify(appConfig)
}

/**
 * 卡片解析工具函数
 */
function parseCardsFromHtml(html) {
  const $ = cheerio.load(html)
  const cards = []
  const seen = new Set()

  $('article, .video-item, .item, .thumb-block').each((_, el) => {
    const link = $(el).find('a[href*="/video/"]').first()
    const href = link.attr('href') || $(el).find('a').attr('href')
    if (!href || !href.includes('/video/') || seen.has(href)) return

    let title = link.attr('title') || $(el).find('.title, h2, h3').text().trim() || link.text().trim()
    let pic = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || ''
    if (pic && !pic.startsWith('http')) {
      pic = SITE + (pic.startsWith('/') ? '' : '/') + pic
    }
    const duration = $(el).find('.duration, .time').text().trim()
    const views = $(el).find('.views, .view').text().trim()
    const remarks = [duration, views].filter(Boolean).join(' | ')

    if (href && title) {
      seen.add(href)
      const fullUrl = href.startsWith('http') ? href : SITE + (href.startsWith('/') ? '' : '/') + href
      cards.push({
        vod_id: fullUrl,
        vod_name: title,
        vod_pic: pic,
        vod_remarks: remarks,
      })
    }
  })

  return cards
}

/**
 * ③ 列表：从 ext 取分类参数与页码
 */
async function getCards(ext) {
  try {
    let { page = 1, typeurl = '/?filter=latest' } = ext || {}
    let url = ''

    if (typeurl.startsWith('http')) {
      url = typeurl
    } else {
      if (typeurl.includes('?')) {
        const [path, query] = typeurl.split('?')
        if (page > 1) {
          url = `${SITE}${path}page/${page}/?${query}`
        } else {
          url = `${SITE}${typeurl}`
        }
      } else {
        const cleanPath = typeurl.endsWith('/') ? typeurl : `${typeurl}/`
        if (page > 1) {
          url = `${SITE}${cleanPath}page/${page}/`
        } else {
          url = `${SITE}${cleanPath}`
        }
      }
    }

    const { data } = await $fetch.get(url, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE + '/',
      },
    })

    const list = parseCardsFromHtml(data)
    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}

/**
 * ④ 线路 / 选集：进入详情页与 iframe 提取 HLS 直链
 */
async function getTracks(ext) {
  try {
    const targetUrl = ext.url || ext.vod_id || ext.id || ''
    if (!targetUrl) return jsonify([])

    const { data: detailHtml } = await $fetch.get(targetUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE + '/',
      },
    })

    const $ = cheerio.load(detailHtml)
    let iframeSrc = $('iframe[src*="/embed/"]').first().attr('src') || $('iframe').first().attr('src') || ''
    
    if (iframeSrc) {
      if (!iframeSrc.startsWith('http')) {
        iframeSrc = SITE + (iframeSrc.startsWith('/') ? '' : '/') + iframeSrc
      }

      const { data: iframeHtml } = await $fetch.get(iframeSrc, {
        headers: {
          'User-Agent': UA,
          'Referer': targetUrl,
        },
      })

      const htmlStr = String(iframeHtml)
      const fileMatch = htmlStr.match(/file:\s*["']([^"']+)["']/)
      if (fileMatch) {
        let streamUrl = fileMatch[1].replace(/\\\//g, '/')
        return jsonify([
          {
            name: '高清 HLS 播放',
            url: streamUrl,
          },
        ])
      }

      // 回退：正则搜索任何 m3u8 / master.txt / mp4 链接
      const mediaMatch = htmlStr.match(/https?:\/\/[^\s"'<>]+\.(?:txt|m3u8|mp4)[^\s"'<>]*/g)
      if (mediaMatch && mediaMatch.length > 0) {
        const unique = Array.from(new Set(mediaMatch))
        return jsonify(
          unique.map((mUrl, i) => ({
            name: `播放线路 ${i + 1}`,
            url: mUrl.replace(/\\\//g, '/'),
          }))
        )
      }
    }

    // 再次回退：在详情页查找直接视频
    const directMatch = String(detailHtml).match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|webm)[^\s"'<>]*/g)
    if (directMatch && directMatch.length > 0) {
      return jsonify(
        directMatch.map((mUrl, i) => ({
          name: `直链 ${i + 1}`,
          url: mUrl,
        }))
      )
    }

    return jsonify([])
  } catch (error) {
    return jsonify([])
  }
}

/**
 * ⑤ 播放：提取最终直链与请求头
 */
async function getPlayinfo(ext) {
  try {
    const { url } = ext || {}
    if (!url) return jsonify({ url: '' })

    return jsonify({
      url: url,
      header: {
        'User-Agent': UA,
        'Referer': SITE + '/',
      },
    })
  } catch (error) {
    return jsonify({ url: '' })
  }
}

/**
 * ⑥ 搜索：按关键词检索视频
 */
async function search(ext) {
  try {
    const keyword = ext.keyword || ext.wd || ext.text || ext.key || ''
    const page = ext.page || 1
    if (!keyword) return jsonify({ list: [] })

    let searchUrl = `${SITE}/?s=${encodeURIComponent(keyword)}`
    if (page > 1) {
      searchUrl = `${SITE}/page/${page}/?s=${encodeURIComponent(keyword)}`
    }

    const { data } = await $fetch.get(searchUrl, {
      headers: {
        'User-Agent': UA,
        'Referer': SITE + '/',
      },
    })

    const list = parseCardsFromHtml(data)
    return jsonify({ list })
  } catch (error) {
    return jsonify({ list: [] })
  }
}
