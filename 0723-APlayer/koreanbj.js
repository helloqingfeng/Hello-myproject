const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20261002,
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

        const $ = cheerio.load(detailHtml)
        let iframeSrc = $('iframe[src*="/embed/"]').first().attr('src') || $('iframe').first().attr('src') || ''

        if (iframeSrc) {
            iframeSrc = fullUrl(iframeSrc)

            const { data: iframeHtml } = await $fetch.get(iframeSrc, {
                headers: {
                    'User-Agent': UA,
                    Referer: targetUrl,
                },
            })

            const htmlStr = String(iframeHtml)
            const fileMatch = htmlStr.match(/file:\s*["']([^"']+)["']/)
            if (fileMatch) {
                let streamUrl = fileMatch[1].replace(/\\\//g, '/')
                tracks.push({
                    name: '高清播放',
                    pan: '',
                    ext: { url: streamUrl },
                })
            } else {
                const mediaMatch = htmlStr.match(/https?:\/\/[^\s"'<>]+\.(?:txt|m3u8|mp4)[^\s"'<>]*/g)
                if (mediaMatch && mediaMatch.length > 0) {
                    const unique = Array.from(new Set(mediaMatch))
                    unique.forEach((mUrl, i) => {
                        tracks.push({
                            name: `线路 ${i + 1}`,
                            pan: '',
                            ext: { url: mUrl.replace(/\\\//g, '/') },
                        })
                    })
                }
            }
        }

        // 回退: 详情页直接提取
        if (!tracks.length) {
            const directMatch = String(detailHtml).match(/https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|webm)[^\s"'<>]*/g)
            if (directMatch && directMatch.length > 0) {
                directMatch.forEach((mUrl, i) => {
                    tracks.push({
                        name: `播放源 ${i + 1}`,
                        pan: '',
                        ext: { url: mUrl },
                    })
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
