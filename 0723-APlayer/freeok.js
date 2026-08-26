const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20250826,
    title: 'freeok',
    site: 'https://freeok.day',
    tabs: [
        { name: '电影', ext: { typeurl: 'type/1.html' }, ui: 1 },
        { name: '连续剧', ext: { typeurl: 'type/2.html' }, ui: 1 },
        { name: '动漫', ext: { typeurl: 'type/3.html' }, ui: 1 },
        { name: '综艺', ext: { typeurl: 'type/4.html' }, ui: 1 },
    ],
}

async function getLocalInfo() {
    return jsonify({ api: appConfig.site })
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let url = appConfig.site + '/' + ext.typeurl
    if (ext.page) {
        url += '?page=' + ext.page
    }
    let html = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        }
    })
    let $ = cheerio.load(html.data)
    let items = []
    $('a.module-poster-item').each((i, el) => {
        let href = $(el).attr('href') || ''
        let title = $(el).attr('title') || $(el).find('.module-poster-item-title').text().trim()
        let img = $(el).find('.module-poster-item-image img').attr('src') || $(el).find('.module-poster-item-image img').attr('data-src') || ''
        let remark = $(el).find('.module-poster-item-episode').text().trim()
        if (href && title) {
            let id = href.match(/\/detail\/(\d+)/)?.[1] || href
            items.push({
                id: id,
                title: title,
                img: img,
                remark: remark,
                ext: { url: appConfig.site + href },
            })
        }
    })
    let pager = $('div.pagination a')
    let nextPage = pager.filter('a:contains("下一页")').attr('href') || ''
    if (nextPage) {
        let nextNum = nextPage.match(/page=(\d+)/)?.[1] || ''
        if (nextNum) {
            items.push({
                id: 'nextpage',
                title: '下一页',
                img: '',
                remark: '第' + nextNum + '页',
                ext: { typeurl: ext.typeurl, page: nextNum },
            })
        }
    }
    return jsonify(items)
}

async function getDetail(ext) {
    ext = argsify(ext)
    let url = ext.url || appConfig.site + '/detail/' + ext.id + '.html'
    let html = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        }
    })
    let $ = cheerio.load(html.data)
    let detail = {
        id: ext.id || url.match(/\/detail\/(\d+)/)?.[1] || '',
        title: $('h1.module-poster-item-title, .detail-info-title, h1').first().text().trim(),
        img: $('.detail-info-image img, .module-poster-item-image img').first().attr('src') || '',
        desc: $('.detail-info-content, .module-info-content').first().text().trim(),
        content: '',
        playLinks: [],
    }
    // 获取播放链接
    let playLinks = []
    $('#playlist a, .module-play-list a, .play-list a').each((i, el) => {
        let href = $(el).attr('href') || ''
        let name = $(el).text().trim()
        if (href && name) {
            playLinks.push({
                name: name,
                url: appConfig.site + href,
            })
        }
    })
    detail.playLinks = playLinks
    return jsonify(detail)
}

async function getTracks(ext) {
    ext = argsify(ext)
    let url = ext.url
    if (!url) {
        return jsonify([])
    }
    let html = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        }
    })
    let $ = cheerio.load(html.data)
    let tracks = []
    // 从播放页获取选集
    // 尝试多种选择器
    let selectors = [
        'div.module-play-list a',
        '.play-list a',
        '#playlist a',
        'a[data-episode]',
        '.episode-list a',
    ]
    for (let sel of selectors) {
        $(sel).each((i, el) => {
            let name = $(el).text().trim()
            let href = $(el).attr('href') || ''
            if (name && href) {
                tracks.push({
                    name: name,
                    url: appConfig.site + href,
                })
            }
        })
        if (tracks.length > 0) break
    }
    // 如果没有找到选集，尝试从页面JS中提取
    if (tracks.length === 0) {
        let scripts = $('script').html() || ''
        let episodeMatch = scripts.match(/episodeManager\([^)]*\)/)
        if (episodeMatch) {
            // 提取选集信息
            let episodeData = scripts.match(/episodeCount['":\s]+(\d+)/)?.[1]
            if (episodeData) {
                for (let i = 1; i <= parseInt(episodeData); i++) {
                    tracks.push({
                        name: '第' + i + '集',
                        url: url,
                    })
                }
            }
        }
    }
    return jsonify(tracks)
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url
    if (!url) {
        return jsonify({ playUrl: '' })
    }
    let html = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        }
    })
    // 尝试从页面中提取视频直链
    let playUrl = ''
    // 匹配 m3u8 或 mp4 链接
    let m3u8Match = html.data.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/i)
    if (m3u8Match) {
        playUrl = m3u8Match[0]
    }
    let mp4Match = html.data.match(/https?:\/\/[^\s"']+\.mp4[^\s"']*/i)
    if (mp4Match && !playUrl) {
        playUrl = mp4Match[0]
    }
    // 如果没有找到直链，返回播放页URL供app处理
    if (!playUrl) {
        playUrl = url
    }
    return jsonify({ playUrl: playUrl })
}

async function search(ext) {
    ext = argsify(ext)
    let wd = ext.wd || ext.keyword || ''
    if (!wd) {
        return jsonify([])
    }
    let url = appConfig.site + '/search?wd=' + encodeURIComponent(wd)
    let html = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        }
    })
    let $ = cheerio.load(html.data)
    let items = []
    $('a.module-poster-item').each((i, el) => {
        let href = $(el).attr('href') || ''
        let title = $(el).attr('title') || $(el).find('.module-poster-item-title').text().trim()
        let img = $(el).find('.module-poster-item-image img').attr('src') || $(el).find('.module-poster-item-image img').attr('data-src') || ''
        let remark = $(el).find('.module-poster-item-episode').text().trim()
        if (href && title) {
            let id = href.match(/\/detail\/(\d+)/)?.[1] || href
            items.push({
                id: id,
                title: title,
                img: img,
                remark: remark,
                ext: { url: appConfig.site + href },
            })
        }
    })
    return jsonify(items)
}
