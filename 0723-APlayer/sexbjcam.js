const cheerio = createCheerio()

const SITE_URL = 'https://sexbjcam.com'
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20261107,
    title: 'SexBJCam',
    site: SITE_URL,
    tabs: [
        { name: '最新收录', ext: { type: 'latest' }, ui: 1 },
        { name: '最多观看', ext: { type: 'most-viewed' }, ui: 1 },
        { name: 'Korean BJ', ext: { type: 'category', slug: 'korean-bj' }, ui: 1 },
        { name: 'Chinese Girl', ext: { type: 'category', slug: 'chinese-gril' }, ui: 1 },
    ],
}

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

function jsonify(obj) {
    return JSON.stringify(obj)
}

function getHtml(res) {
    if (!res) return ''
    if (typeof res === 'string') return res
    if (res.data !== undefined) return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    if (typeof res.text === 'function') return res.text()
    return ''
}

function unpack(p, a, c, k, e, d) {
    while (c--) {
        if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c])
    }
    return p
}

function extractFromPacker(html) {
    if (!html) return null
    const match = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/)
    if (!match) return null
    const str = match[0]
    const argsMatch = str.match(/}\('(.*)',\s*(\d+),\s*(\d+),\s*'(.*)'\.split\('\|'\)/)
    if (!argsMatch) return null
    const [_, p, a, c, kStr] = argsMatch
    const k = kStr.split('|')
    return unpack(p, parseInt(a, 10), parseInt(c, 10), k)
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seenUrls = new Set()

    $('article.thumb-block, article.post, .video-preview-item').each((_, el) => {
        const item = $(el)
        const link = item.find('a[href*="/20"]').first()
        let href = link.attr('href') || item.find('a').first().attr('href') || ''
        if (!href) return
        if (href.startsWith('/')) href = SITE_URL + href
        if (seenUrls.has(href)) return
        seenUrls.add(href)

        let title = link.attr('title') || item.find('.entry-title a').text().trim() || item.find('img').attr('alt') || ''
        title = title.replace(/\s+/g, ' ').trim()
        if (!title) {
            const parts = href.split('/').filter(Boolean)
            title = parts[parts.length - 1] || 'Video'
        }

        const img = item.find('img')
        let cover = img.attr('data-src') || img.attr('data-original') || img.attr('src') || ''
        if (cover.startsWith('//')) cover = 'https:' + cover
        else if (cover.startsWith('/')) cover = SITE_URL + cover

        const duration = item.find('.duration, .time').first().text().trim() || 'HD'

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: duration,
            ext: {
                url: href,
                title: title,
                cover: cover,
            },
        })
    })

    return cards
}

async function getLocalInfo() {
    return jsonify({ api: SITE_URL })
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    let url = SITE_URL

    if (ext.type === 'category' && ext.slug) {
        url = page > 1 ? `${SITE_URL}/category/${ext.slug}/page/${page}/` : `${SITE_URL}/category/${ext.slug}/`
    } else if (ext.type === 'most-viewed') {
        url = page > 1 ? `${SITE_URL}/page/${page}/?filter=most-viewed` : `${SITE_URL}/?filter=most-viewed`
    } else {
        url = page > 1 ? `${SITE_URL}/page/${page}/?filter=latest` : `${SITE_URL}/?filter=latest`
    }

    const res = await $fetch.get(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const cards = parseCards(html)
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const detailUrl = ext.url || ''
    if (!detailUrl) return jsonify({ list: [] })

    const res = await $fetch.get(detailUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const $ = cheerio.load(html)

    let iframeSrc = ''
    $('.responsive-player iframe, .video-player iframe').each((_, el) => {
        const src = $(el).attr('src') || ''
        if (src.startsWith('http')) iframeSrc = src
    })

    if (!iframeSrc) {
        $('iframe').each((_, el) => {
            const src = $(el).attr('src') || ''
            if (src.startsWith('http') && !src.includes('trackwilltrk') && !src.includes('smartpop') && !src.includes('doubleclick')) {
                iframeSrc = src
            }
        })
    }

    const tracks = []

    if (iframeSrc) {
        // StreamOrigin / PlayerRecord
        const codeMatch = iframeSrc.match(/\/e\/([a-zA-Z0-9]+)/)
        if (codeMatch && (iframeSrc.includes('playerrecord') || iframeSrc.includes('streamorigin') || iframeSrc.includes('origin'))) {
            const code = codeMatch[1]
            try {
                let origin = 'https://video.playerrecord.cfd'
                try {
                    origin = new URL(iframeSrc).origin
                } catch (e) {}

                const apiRes = await $fetch.get(`https://embedorigin.cc/app/v1/play/${code}?embed=1&ref=${encodeURIComponent(detailUrl)}`, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Referer': iframeSrc,
                        'Origin': origin,
                    },
                })
                const rawApi = getHtml(apiRes)
                let playData = null
                try {
                    playData = JSON.parse(rawApi)
                } catch (e) {}

                if (playData && playData.hls) {
                    tracks.push({
                        name: '极速播放 (HLS 原画)',
                        pan: '',
                        ext: { url: playData.hls, referer: 'https://embedorigin.cc/' },
                    })
                }
                if (playData && playData.mp4) {
                    tracks.push({
                        name: '备用播放 (MP4)',
                        pan: '',
                        ext: { url: playData.mp4 },
                    })
                }
            } catch (e) {
                console.log('StreamOrigin API parse error: ' + e)
            }
        }

        // RecordPlay / StreamHG / Packer Player
        if (!tracks.length) {
            try {
                const iframeRes = await $fetch.get(iframeSrc, {
                    headers: {
                        'User-Agent': USER_AGENT,
                        'Referer': detailUrl,
                    },
                })
                const iframeContent = getHtml(iframeRes)
                const unpacked = extractFromPacker(iframeContent) || iframeContent
                const m3u8Match = unpacked.match(/https?:\/\/[^"'\s\\]+\.m3u8[^"'\s\\]*/i)
                if (m3u8Match) {
                    tracks.push({
                        name: '极速播放 (HLS 直链)',
                        pan: '',
                        ext: { url: m3u8Match[0], referer: iframeSrc },
                    })
                } else {
                    const mp4Match = unpacked.match(/https?:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/i)
                    if (mp4Match) {
                        tracks.push({
                            name: '极速播放 (MP4 直链)',
                            pan: '',
                            ext: { url: mp4Match[0], referer: iframeSrc },
                        })
                    }
                }
            } catch (e) {
                console.log('Iframe parse error: ' + e)
            }
        }
    }

    // Fallback: direct video tags
    if (!tracks.length) {
        let vSrc = $('video source').first().attr('src') || $('video').first().attr('src') || ''
        if (!vSrc) {
            const m = html.match(/https?:\/\/[^"'\s]+\.(?:m3u8|mp4)(?:\?[^"'\s]*)?/i)
            if (m) vSrc = m[0]
        }
        if (vSrc) {
            tracks.push({
                name: '默认播放',
                pan: '',
                ext: { url: vSrc },
            })
        }
    }

    // Last fallback: raw iframe
    if (!tracks.length && iframeSrc) {
        tracks.push({
            name: '内嵌线路',
            pan: '',
            ext: { url: iframeSrc },
        })
    }

    return jsonify({
        list: [
            {
                title: '播放线路',
                tracks: tracks.length ? tracks : [{ name: '默认', pan: '', ext: { url: detailUrl } }],
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url || ''
    const referer = ext.referer || SITE_URL + '/'
    return jsonify({
        urls: [url],
        headers: [
            {
                'User-Agent': USER_AGENT,
                'Referer': referer,
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = ext.text || ext.wd || ''
    const page = ext.page || 1
    const url = page > 1 ? `${SITE_URL}/page/${page}/?s=${encodeURIComponent(keyword)}` : `${SITE_URL}/?s=${encodeURIComponent(keyword)}`

    const res = await $fetch.get(url, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const cards = parseCards(html)
    return jsonify({ list: cards })
}
