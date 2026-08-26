const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20260826,
    title: 'libvio',
    site: 'https://www.libvio.cam',
    tabs: [
        { name: '电影', ext: { typeurl: 'type/1.html' }, ui: 1 },
        { name: '电视剧', ext: { typeurl: 'type/2.html' }, ui: 1 },
        { name: '纪录片', ext: { typeurl: 'type/3.html' }, ui: 1 },
        { name: '动漫', ext: { typeurl: 'type/4.html' }, ui: 1 },
        { name: '综艺', ext: { typeurl: 'type/5.html' }, ui: 1 },
        { name: '国产剧', ext: { typeurl: 'type/13.html' }, ui: 1 },
        { name: '港台剧', ext: { typeurl: 'type/14.html' }, ui: 1 },
        { name: '日韩剧', ext: { typeurl: 'type/15.html' }, ui: 1 },
        { name: '海外剧', ext: { typeurl: 'type/16.html' }, ui: 1 },
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

    $('a.stui-vodlist__thumb').each((_, element) => {
        const link = $(element)
        const href = fullUrl(link.attr('href'))
        const title = (link.attr('title') || '').trim()
        const cover = link.attr('data-original') || ''
        const remarks = link.find('.pic-text').text().trim()
        const score = link.find('.pic-tag').text().trim()

        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: remarks || score,
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
    let cards = []
    let { page = 1, typeurl = '' } = ext
    let url = `${appConfig.site}/${typeurl}`

    if (page > 1) {
        url += `?page=${page}`
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    cards = parseCards(data)
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    const url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    const $ = cheerio.load(data)

    // Extract play links from the detail page
    // The play links are in format /play/{vod_id}-{episode}-{line}.html
    const playLinks = []
    $('a[href*="/play/"]').each((_, element) => {
        const link = $(element)
        const href = link.attr('href')
        const text = link.text().trim()

        if (href && href.includes('/play/')) {
            const fullHref = fullUrl(href)
            // Avoid duplicates
            if (!playLinks.find(p => p.url === fullHref)) {
                playLinks.push({
                    name: text || `线路${playLinks.length + 1}`,
                    url: fullHref
                })
            }
        }
    })

    // Group by episode if multiple episodes exist
    if (playLinks.length > 0) {
        tracks = playLinks.map(p => ({
            name: p.name,
            pan: '',
            ext: { url: p.url },
        }))
    }

    // Fallback: try to find any play button
    if (!tracks.length) {
        const playBtn = $('a[href*="/play/"]').first()
        if (playBtn.length) {
            const href = fullUrl(playBtn.attr('href'))
            tracks.push({ name: '播放', pan: '', ext: { url: href } })
        }
    }

    return jsonify({
        list: [{
            title: '默认分组',
            tracks,
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url || ''

    // Try to extract direct video URL from the play page
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        })

        // Extract player_aaaa variable
        const playerMatch = data.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;/)
        if (playerMatch) {
            const playerData = JSON.parse(playerMatch[1])
            let videoUrl = playerData.url || ''

            // Handle encryption based on encrypt field
            if (playerData.encrypt == '1') {
                videoUrl = unescape(videoUrl)
            } else if (playerData.encrypt == '2') {
                videoUrl = unescape(base64decode(videoUrl))
            }
            // encrypt == '3' means URL is already in plain text

            // If we have a direct video URL (m3u8 or mp4)
            if (videoUrl && (videoUrl.includes('.m3u8') || videoUrl.includes('.mp4'))) {
                return jsonify({ urls: [videoUrl] })
            }

            // For pan links or other formats, return the URL
            if (videoUrl) {
                return jsonify({ urls: [videoUrl] })
            }
        }
    } catch (e) {
        $print('getPlayinfo extract failed: ' + e)
    }

    // Fallback: return the play page URL
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    let text = encodeURIComponent(ext.text || '')
    let page = ext.page || 1

    // Try POST search first
    let url = `${appConfig.site}/search/-------------.html`

    try {
        const { data } = await $fetch.post(url, {
            body: `wd=${text}&submit=`,
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: appConfig.site + '/',
            },
        })

        const cards = parseCards(data)
        if (cards.length > 0) {
            return jsonify({ list: cards })
        }
    } catch (e) {
        $print('POST search failed, trying GET: ' + e)
    }

    // Fallback to GET search
    try {
        let getUrl = `${appConfig.site}/search.html?wd=${text}`
        if (page > 1) {
            getUrl += `&page=${page}`
        }

        const { data } = await $fetch.get(getUrl, {
            headers: {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        })

        return jsonify({ list: parseCards(data) })
    } catch (e) {
        $print('GET search also failed: ' + e)
        return jsonify({ list: [] })
    }
}
