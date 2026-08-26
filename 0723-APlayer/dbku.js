const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20250826,
    title: 'dbku',
    site: 'https://www.dbku.tv',
    tabs: [
        { name: '电影', ext: { typeurl: 'vodtype/1.html' }, ui: 1 },
        { name: '连续剧', ext: { typeurl: 'vodtype/2.html' }, ui: 1 },
        { name: '综艺', ext: { typeurl: 'vodtype/3.html' }, ui: 1 },
        { name: '动漫', ext: { typeurl: 'vodtype/4.html' }, ui: 1 },
        { name: '港剧', ext: { typeurl: 'vodtype/20.html' }, ui: 1 },
    ],
}

async function getLocalInfo() { return jsonify({ api: appConfig.site }) }
async function getConfig() { return jsonify(appConfig) }

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, typeurl } = ext
    let url = `${appConfig.site}/${typeurl}`
    if (page > 1) url += `.html?page=${page}`

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    $('a.myui-vodlist__thumb').each((_, element) => {
        const el = $(element)
        const href = el.attr('href')
        const title = el.attr('title')
        const cover = el.attr('data-original')
        const remark = el.find('.pic-text').text().trim()
        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover || '',
                vod_remarks: remark || '',
                ext: { url: href },
            })
        }
    })

    return jsonify({ list: cards })
}

async function getDetail(ext) {
    ext = argsify(ext)
    let url = ext.url

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    let detail = {
        vod_name: $('h1.title').text().trim() || '',
        vod_pic: $('img.myui-content__thumb').attr('src') || '',
        vod_remarks: '',
        vod_content: $('p.intro').text().trim() || '',
        vod_director: '',
        vod_actor: '',
        vod_year: '',
        vod_area: '',
        vod_type: '',
    }

    // Parse info list
    $('.myui-content__detail .data span').each((_, el) => {
        const text = $(el).text()
        if (text.includes('年份')) detail.vod_year = text.replace(/.*?：/, '').trim()
        if (text.includes('地区')) detail.vod_area = text.replace(/.*?：/, '').trim()
        if (text.includes('导演')) detail.vod_director = text.replace(/.*?：/, '').trim()
        if (text.includes('演员')) detail.vod_actor = text.replace(/.*?：/, '').trim()
        if (text.includes('分类') || text.includes('类型')) detail.vod_type = text.replace(/.*?：/, '').trim()
    })

    return jsonify({ detail })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    // If url is detail page, first fetch play links
    if (url.includes('voddetail')) {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
        const $ = cheerio.load(data)

        // Get episode links grouped by play source
        let sources = []
        $('.myui-panel .myui-panel__head').each((_, head) => {
            const title = $(head).find('.text').first().text().trim()
            if (title) sources.push(title)
        })

        // Get episode list
        let idx = 0
        $('.myui-panel .myui-panel__foot .myui-panel__list').each((_, panel) => {
            let sourceName = sources[idx] || ('线路' + (idx + 1))
            let sourceTracks = []
            $(panel).find('a[href*="/vodplay/"]').each((_, element) => {
                const el = $(element)
                const name = el.text().trim()
                const href = el.attr('href')
                if (name && href) {
                    sourceTracks.push({
                        name: name,
                        pan: '',
                        ext: { url: `${appConfig.site}${href}` },
                    })
                }
            })
            if (sourceTracks.length > 0) {
                tracks.push({ title: sourceName, tracks: sourceTracks })
            }
            idx++
        })

        // If no structured panels found, fallback: grab all play links
        if (tracks.length === 0) {
            let flatTracks = []
            $('a[href*="/vodplay/"]').each((_, element) => {
                const el = $(element)
                const name = el.text().trim()
                const href = el.attr('href')
                if (name && href) {
                    flatTracks.push({
                        name: name,
                        pan: '',
                        ext: { url: `${appConfig.site}${href}` },
                    })
                }
            })
            if (flatTracks.length > 0) {
                tracks.push({ title: '播放列表', tracks: flatTracks })
            }
        }

        return jsonify({ list: tracks })
    }

    // If url is already a play page, parse episodes from it
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    let sources = []
    $('.myui-panel .myui-panel__head').each((_, head) => {
        const title = $(head).find('.text').first().text().trim()
        if (title) sources.push(title)
    })

    let idx = 0
    $('.myui-panel .myui-panel__foot .myui-panel__list').each((_, panel) => {
        let sourceName = sources[idx] || ('线路' + (idx + 1))
        let sourceTracks = []
        $(panel).find('a[href*="/vodplay/"]').each((_, element) => {
            const el = $(element)
            const name = el.text().trim()
            const href = el.attr('href')
            if (name && href) {
                sourceTracks.push({
                    name: name,
                    pan: '',
                    ext: { url: `${appConfig.site}${href}` },
                })
            }
        })
        if (sourceTracks.length > 0) {
            tracks.push({ title: sourceName, tracks: sourceTracks })
        }
        idx++
    })

    if (tracks.length === 0) {
        let flatTracks = []
        $('a[href*="/vodplay/"]').each((_, element) => {
            const el = $(element)
            const name = el.text().trim()
            const href = el.attr('href')
            if (name && href) {
                flatTracks.push({
                    name: name,
                    pan: '',
                    ext: { url: `${appConfig.site}${href}` },
                })
            }
        })
        if (flatTracks.length > 0) {
            tracks.push({ title: '播放列表', tracks: flatTracks })
        }
    }

    return jsonify({ list: tracks })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    let url = ext.url

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    const html = $.html()

    // Try to extract m3u8/mp4 direct links from page
    const m3u8Match = html.match(/https?:\/\/[^"'\s<>]*\.m3u8[^"'\s<>]*/);
    const mp4Match = html.match(/https?:\/\/[^"'\s<>]*\.mp4[^"'\s<>]*/);

    if (m3u8Match) return jsonify({ urls: [m3u8Match[0]] })
    if (mp4Match) return jsonify({ urls: [mp4Match[0]] })

    // Try iframe source
    const iframeSrc = $('iframe').first().attr('src')
    if (iframeSrc) {
        try {
            const iframeUrl = iframeSrc.startsWith('http') ? iframeSrc : `${appConfig.site}${iframeSrc}`
            const resp = await $fetch.get(iframeUrl, { headers: { 'User-Agent': UA } })
            const respHtml = resp.data || ''
            const innerM3u8 = respHtml.match(/https?:\/\/[^"'\s<>]*\.m3u8[^"'\s<>]*/)
            const innerMp4 = respHtml.match(/https?:\/\/[^"'\s<>]*\.mp4[^"'\s<>]*/)
            if (innerM3u8) return jsonify({ urls: [innerM3u8[0]] })
            if (innerMp4) return jsonify({ urls: [innerMp4[0]] })
        } catch (e) {
            // ignore
        }
        return jsonify({ urls: [iframeSrc] })
    }

    // Fallback: return play page URL
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    let keyword = ext.keyword || ''
    let page = ext.page || 1

    let url = `${appConfig.site}/search.html?wd=${encodeURIComponent(keyword)}`
    if (page > 1) url += `&page=${page}`

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    let cards = []
    $('a.myui-vodlist__thumb').each((_, element) => {
        const el = $(element)
        const href = el.attr('href')
        const title = el.attr('title')
        const cover = el.attr('data-original')
        const remark = el.find('.pic-text').text().trim()
        if (href && title) {
            cards.push({
                vod_id: href,
                vod_name: title,
                vod_pic: cover || '',
                vod_remarks: remark || '',
                ext: { url: href },
            })
        }
    })

    return jsonify({ list: cards })
}
