const cheerio = createCheerio()

const SITE_URL = 'https://www.alipzn.com'
const USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20261010,
    title: '泥鳅影院',
    site: SITE_URL,
    tabs: [
        { name: '电影', ext: { type_id: '1', page: 1 }, ui: 1 },
        { name: '电视剧', ext: { type_id: '2', page: 1 }, ui: 1 },
        { name: '短剧', ext: { type_id: '3', page: 1 }, ui: 1 },
        { name: '动漫', ext: { type_id: '4', page: 1 }, ui: 1 },
        { name: '综艺', ext: { type_id: '5', page: 1 }, ui: 1 },
        { name: '网飞新剧', ext: { type_id: '48', page: 1 }, ui: 1 },
        { name: '国产剧', ext: { type_id: '12', page: 1 }, ui: 1 },
        { name: '韩剧', ext: { type_id: '14', page: 1 }, ui: 1 },
        { name: '欧美剧', ext: { type_id: '25', page: 1 }, ui: 1 },
        { name: '日剧', ext: { type_id: '15', page: 1 }, ui: 1 },
        { name: '动作片', ext: { type_id: '7', page: 1 }, ui: 1 },
        { name: '科幻片', ext: { type_id: '21', page: 1 }, ui: 1 },
        { name: '喜剧片', ext: { type_id: '9', page: 1 }, ui: 1 },
        { name: '恐怖片', ext: { type_id: '11', page: 1 }, ui: 1 },
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

function getHtml(res) {
    if (!res) return ''
    if (typeof res === 'string') return res
    if (res.data !== undefined) return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
    if (typeof res.text === 'function') return res.text()
    return ''
}

async function getLocalInfo() {
    return jsonify({ api: SITE_URL })
}

async function getConfig() {
    return jsonify(appConfig)
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seenIds = new Set()

    $('a[href*="/video/"]').each((i, el) => {
        const href = $(el).attr('href') || ''
        const idMatch = href.match(/\/video\/([0-9a-zA-Z_\-]+)\.html/)
        if (!idMatch) return
        const id = idMatch[1]
        if (seenIds.has(id)) return

        const container = $(el).closest('li, .myui-vodlist__box, .myui-vodlist__media > li, .myui-vodlist__item')
        let title = $(el).attr('title') || container.find('.title a, h4.title a, h3 a').text().trim() || $(el).text().trim()
        if (title === '正片' || title === 'HD' || title === '详情 >' || title === '查看详情' || title.length < 2) {
            const parentTitle = container.find('.title a, h4.title a, h3 a, h4 a').text().trim()
            if (parentTitle) title = parentTitle
        }
        title = title.replace(/\s+/g, ' ').trim()

        let cover = $(el).attr('data-original') || $(el).attr('data-src') || $(el).find('img').attr('data-original') || $(el).find('img').attr('src') || container.find('img, .myui-vodlist__thumb').attr('data-original') || container.find('img').attr('src') || ''
        if (cover.startsWith('//')) cover = 'https:' + cover
        else if (cover.startsWith('/')) cover = SITE_URL + cover

        let remarks = container.find('.pic-text, .text-right, .remarks, .pic-tag').text().trim()

        seenIds.add(id)
        cards.push({
            vod_id: id,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks || 'HD',
            ext: {
                url: href.startsWith('http') ? href : SITE_URL + href,
                id: id,
                title: title,
                cover: cover,
            },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const typeId = ext.type_id || '1'
    const page = ext.page || 1
    let targetUrl = SITE_URL + '/tv/' + typeId
    if (page > 1) {
        targetUrl += '_' + page
    }
    targetUrl += '.html'

    const res = await $fetch.get(targetUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const cards = parseCards(html)

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const detailUrl = ext.url || (SITE_URL + '/video/' + ext.id + '.html')

    const res = await $fetch.get(detailUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const $ = cheerio.load(html)
    const list = []

    // Find tabs / line names
    const tabTitles = []
    $('.nav-tabs li a, a[data-toggle="tab"], .myui-panel__head .nav-tabs li a').each((i, el) => {
        const text = $(el).text().trim()
        if (text && !text.includes('展开') && !text.includes('折叠') && !text.includes('排序')) {
            tabTitles.push(text)
        }
    })

    // Find corresponding episode lists
    const panes = $('.tab-content .tab-pane, ul.myui-content__list')
    if (panes.length > 0) {
        panes.each((i, pane) => {
            const lineTitle = tabTitles[i] || ('线路 ' + (i + 1))
            const tracks = []
            $(pane).find('li a').each((j, a) => {
                const epName = $(a).text().trim()
                const epHref = $(a).attr('href')
                if (epHref && (epHref.includes('/play/') || epHref.includes('/vodplay/'))) {
                    tracks.push({
                        name: epName || ('第 ' + (j + 1) + ' 集'),
                        pan: '',
                        ext: {
                            url: epHref.startsWith('http') ? epHref : SITE_URL + epHref,
                        },
                    })
                }
            })

            if (tracks.length > 0) {
                list.push({
                    title: lineTitle,
                    tracks: tracks,
                })
            }
        })
    }

    // Fallback: collect all play links if list is empty
    if (list.length === 0) {
        const tracks = [];
        $('a[href*="/play/"], a[href*="/vodplay/"]').each((i, a) => {
            const epName = $(a).text().trim()
            const epHref = $(a).attr('href')
            if (epHref) {
                tracks.push({
                    name: epName || ('第 ' + (i + 1) + ' 集'),
                    pan: '',
                    ext: {
                        url: epHref.startsWith('http') ? epHref : SITE_URL + epHref,
                    },
                })
            }
        })
        if (tracks.length > 0) {
            list.push({
                title: '默认线路',
                tracks: tracks,
            })
        }
    }

    return jsonify({
        list: list,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const playUrl = ext.url

    const res = await $fetch.get(playUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    let streamUrl = ''

    // 1. Search player_aaaa / player_xxxx
    const playerMatch = html.match(/player_\w+\s*=\s*(\{[\s\S]*?\})/)
    if (playerMatch) {
        try {
            const config = JSON.parse(playerMatch[1])
            let rawUrl = config.url || ''
            if (config.encrypt === 1) {
                rawUrl = unescape(rawUrl)
            } else if (config.encrypt === 2) {
                rawUrl = unescape(atob(rawUrl))
            }
            streamUrl = rawUrl.replace(/\\/g, '')
        } catch (e) {}
    }

    // 2. Direct regex search for m3u8 or mp4
    if (!streamUrl) {
        const m = html.match(/(https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4)[^\s"'<>]*)/i)
        if (m) {
            streamUrl = m[1].replace(/\\/g, '').replace(/&amp;/g, '&')
        }
    }

    return jsonify({
        urls: [streamUrl],
        headers: [
            {
                'User-Agent': USER_AGENT,
                'Referer': SITE_URL + '/',
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = ext.text || ext.wd || ext.keyword || ''
    const page = ext.page || 1
    let targetUrl = SITE_URL + '/search.html?wd=' + encodeURIComponent(keyword)
    if (page > 1) {
        targetUrl += '&page=' + page
    }

    const res = await $fetch.get(targetUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': SITE_URL + '/',
        },
    })

    const html = getHtml(res)
    const cards = parseCards(html)

    return jsonify({
        list: cards,
    })
}
