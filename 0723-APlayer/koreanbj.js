const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20261009,
    title: 'Korean BJ Live',
    site: 'https://koreanbj.live',
    tabs: [
        { name: '最新视频', ext: { typeurl: '?filter=latest' }, ui: 1 },
        { name: '韩国主播', ext: { typeurl: 'category/korean-bj/' }, ui: 1 },
        { name: '最多观看', ext: { typeurl: '?filter=most-viewed' }, ui: 1 },
        { name: '最长视频', ext: { typeurl: '?filter=longest' }, ui: 1 },
        { name: 'Panda TV', ext: { typeurl: 'category/pandatv/' }, ui: 1 },
        { name: 'OnlyFans', ext: { typeurl: 'category/onlyfans/' }, ui: 1 },
        { name: 'Twitch', ext: { typeurl: 'category/twitch/' }, ui: 1 },
        { name: 'Fantrie', ext: { typeurl: 'category/fantrie/' }, ui: 1 },
        { name: 'StripChat', ext: { typeurl: 'category/stripchat/' }, ui: 1 },
    ],
}

function fullUrl(url) {
    if (!url) return ''
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url
    return appConfig.site + (url.indexOf('/') === 0 ? url : '/' + url)
}

function rot13(str) {
    return (str || '').replace(/[a-zA-Z]/g, function(c) {
        return String.fromCharCode(
            (c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
        )
    })
}

function decodeVoe(rawStr) {
    try {
        let s = rot13(rawStr)
        s = s.replace(/@\$|\^\^|~@|%\?|\*~|!!|#&/g, '')
        const b1 = atob(s)
        let shifted = ''
        for (let i = 0; i < b1.length; i++) {
            shifted += String.fromCharCode(b1.charCodeAt(i) - 3)
        }
        const reversed = shifted.split('').reverse().join('')
        const jsonStr = atob(reversed)
        return JSON.parse(jsonStr)
    } catch (e) {
        return null
    }
}

function parseCards(data) {
    const $ = cheerio.load(data)
    const cards = []
    const seen = new Set()

    $('article, .video-item, .item, .thumb-block').each((_, el) => {
        const link = $(el).find('a[href*="/video/"]').first()
        const href = fullUrl(link.attr('href') || $(el).find('a').attr('href'))
        if (!href || !href.includes('/video/') || seen.has(href)) return

        let title = (link.attr('title') || $(el).find('.title, h2, h3').text() || link.text()).trim()
        let cover = fullUrl($(el).find('img').attr('data-src') || $(el).find('img').attr('src'))
        const duration = $(el).find('.duration, .time').text().trim()
        const views = $(el).find('.views, .view').text().trim()
        const remarks = [duration, views].filter(Boolean).join(' | ')

        if (href && title) {
            seen.add(href)
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks,
                ext: { url: href },
            })
        }
    })

    return cards
}

async function getLocalInfo() {
    return jsonify({ api: appConfig.site })
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let { page = 1, typeurl = '?filter=latest' } = ext
    let url = ''

    if (typeurl.indexOf('http://') === 0 || typeurl.indexOf('https://') === 0) {
        url = typeurl
    } else {
        if (typeurl.indexOf('?') === 0 || typeurl.indexOf('/?') === 0) {
            const query = typeurl.replace(/^\/?\?/, '')
            if (page > 1) {
                url = `${appConfig.site}/page/${page}/?${query}`
            } else {
                url = `${appConfig.site}/?${query}`
            }
        } else {
            const cleanPath = typeurl.replace(/^\/+|\/+$/g, '')
            if (page > 1) {
                url = `${appConfig.site}/${cleanPath}/page/${page}/`
            } else {
                url = `${appConfig.site}/${cleanPath}/`
            }
        }
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    const cards = parseCards(data)
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const targetUrl = ext.url || ''
    const tracks = []

    if (!targetUrl) {
        return jsonify({ list: [] })
    }

    try {
        const { data: detailHtml } = await $fetch.get(targetUrl, {
            headers: {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        })

        const htmlStr = String(detailHtml)

        // 1. 从事件脚本或 DOM 中提取真实的视频嵌入页地址 (支持多种 pattern)
        const m1 = htmlStr.match(/iframe\.setAttribute\(['"]src['"],\s*['"]([^'"]+)['"]\)/i)
        const m2 = htmlStr.match(/<iframe[^>]+src=["']([^"']+)["']/i)
        const m3 = htmlStr.match(/src=["'](https?:\/\/[^"']+\/(?:e|embed)\/[^"']+)["']/i)
        const m4 = htmlStr.match(/https?:\/\/[^\s"'<>]+\/(?:e|embed)\/[a-zA-Z0-9_-]+/gi)

        let embedUrl = m1?.[1] || m2?.[1] || m3?.[1] || m4?.[0] || ''
        if (embedUrl && !embedUrl.startsWith('http')) {
            embedUrl = fullUrl(embedUrl)
        }

        if (embedUrl) {
            try {
                const { data: iframeHtml } = await $fetch.get(embedUrl, {
                    headers: {
                        'User-Agent': UA,
                        Referer: targetUrl,
                    },
                })

                const ifrStr = String(iframeHtml)

                // 2. 检查并解密 VOE (io12379storege/voe.sx) 加密数据包
                const jsonMatch = ifrStr.match(/<script\s+type=["']application\/json["']>([\s\S]*?)<\/script>/i)
                if (jsonMatch) {
                    try {
                        const payloadArray = JSON.parse(jsonMatch[1])
                        const payloadStr = Array.isArray(payloadArray) ? payloadArray[0] : payloadArray
                        const decoded = decodeVoe(payloadStr)
                        if (decoded) {
                            if (decoded.source && decoded.source.includes('.m3u8')) {
                                tracks.push({
                                    name: 'HLS 超清原画',
                                    pan: '',
                                    ext: { url: decoded.source },
                                })
                            }
                            if (decoded.direct_access_url && (decoded.direct_access_url.includes('.mp4') || decoded.direct_access_url.includes('.m3u8'))) {
                                tracks.push({
                                    name: 'MP4 极速直链',
                                    pan: '',
                                    ext: { url: decoded.direct_access_url },
                                })
                            }
                        }
                    } catch (e) {}
                }

                // 3. 嵌入页常规直接提取 (过滤测试视频和预告片)
                if (!tracks.length) {
                    const fileMatch = ifrStr.match(/file:\s*["']([^"']+)["']/)
                    if (fileMatch) {
                        let streamUrl = fileMatch[1].replace(/\\\//g, '/')
                        if (!streamUrl.includes('bigbuckbunny') && !streamUrl.includes('trailers')) {
                            tracks.push({
                                name: '高清播放',
                                pan: '',
                                ext: { url: streamUrl },
                            })
                        }
                    }
                }
            } catch (err) {}
        }

        // 4. 详情页兜底提取 (严格过滤 .webm 和 trailers 广告片段)
        if (!tracks.length) {
            const directMatch = htmlStr.match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*/g)
            if (directMatch && directMatch.length > 0) {
                const unique = Array.from(new Set(directMatch))
                unique.forEach((mUrl, i) => {
                    if (!mUrl.includes('trailers') && !mUrl.includes('bigbuckbunny') && !mUrl.endsWith('.webm')) {
                        tracks.push({
                            name: `播放源 ${i + 1}`,
                            pan: '',
                            ext: { url: mUrl },
                        })
                    }
                })
            }
        }
    } catch (e) {
        $print('getTracks failed: ' + e)
    }

    return jsonify({
        list: [{
            title: '播放列表',
            tracks: tracks,
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url || ''
    if (!url) {
        return jsonify({ urls: [] })
    }
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = encodeURIComponent(ext.text || ext.keyword || ext.wd || ext.key || '')
    const page = ext.page || 1
    if (!keyword) return jsonify({ list: [] })

    let searchUrl = `${appConfig.site}/?s=${keyword}`
    if (page > 1) {
        searchUrl = `${appConfig.site}/page/${page}/?s=${keyword}`
    }

    const { data } = await $fetch.get(searchUrl, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    const cards = parseCards(data)
    return jsonify({ list: cards })
}
