const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20260822,
    title: 'sexbjcam',
    site: 'https://sexbjcam.net',
    tabs: [
        {
            name: '全部',
            ext: { typeurl: '' },
            ui: 1,
        },
        {
            name: 'Korean BJ',
            ext: { typeurl: 'category/video/korean-bj' },
            ui: 1,
        },
        {
            name: 'Chinese Girl',
            ext: { typeurl: 'category/video/chinese-girl' },
            ui: 1,
        },
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

    $('a[href*="/video/watch/"]').each((_, element) => {
        const link = $(element)
        const href = fullUrl(link.attr('href'))
        const title = (link.attr('title') || link.find('.title').text() || link.find('h2').text()).trim()
        const cover = fullUrl(link.find('img').attr('src') || link.find('img').attr('data-src'))
        const duration = link.find('.duration').text().trim()

        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
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
    $('.box-server button[onclick]').each((_, element) => {
        const button = $(element)
        const onclick = button.attr('onclick') || ''
        const match = onclick.match(/switchServer\([^,]+,\s*['"]([^'"]+)['"]\)/)
        if (match) {
            tracks.push({
                name: button.text().trim() || `线路${tracks.length + 1}`,
                pan: '',
                ext: { url: match[1].replace(/\\\//g, '/') },
            })
        }
    })

    if (!tracks.length) {
        const iframe = $('iframe#ifvideo').attr('src')
        if (iframe) {
            tracks.push({ name: '播放', pan: '', ext: { url: fullUrl(iframe) } })
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

    // 详情页给出的是第三方 iframe；XPTV 播放器需要最终媒体地址。
    // 这里只提取页面公开暴露的 video/source 地址，不绕过登录、验证码或 DRM。
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        })
        const $ = cheerio.load(data)
        let playUrl = $('video source').first().attr('src') || $('video').first().attr('src') || ''

        if (!playUrl) {
            const html = String(data)
            const match = html.match(/https?:\/\/[^"'\s]+\.(?:m3u8|mp4)(?:\?[^"'\s]*)?/i)
            if (match) playUrl = match[0].replace(/\\\//g, '/')
        }

        if (playUrl) return jsonify({ urls: [playUrl] })
    } catch (e) {
        $print('getPlayinfo extract failed: ' + e)
    }

    // 第三方页面禁止抓取或仅动态生成时，返回原地址作为回退。
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    let text = encodeURIComponent(ext.text || '')
    let page = ext.page || 1
    let url = `${appConfig.site}/?search=${text}`

    if (page > 1) {
        url = `${appConfig.site}/?search=${text}&page=${page}`
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    return jsonify({ list: parseCards(data) })
}
