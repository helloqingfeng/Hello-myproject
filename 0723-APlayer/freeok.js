const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

// FreeOK freeok.day — mxone 模板
// 已验证事实:
//   列表卡片  a.module-poster-item  标题在 title 属性  封面在 .module-item-pic img[data-original]  备注 .module-item-note
//   详情页    /detail/{id}.html — 站内没有选集列表, 播放区 .play_source 全部是第三方站外链(wbbb1/hqvod 等)
//   搜索      /search/{wd}-------------.html  搜索结果卡片是 a.module-card-item-poster + .module-card-item-title
//   分页      分类页为 AJAX 加载, 无静态分页 URL
//   XPTV 要求 getCards/getTracks 返回 {list:[...]}, getPlayinfo 返回 {urls:[...]}

let appConfig = {
    ver: 20260903,
    title: 'freeok',
    site: 'https://freeok.day',
    tabs: [
        { name: '电影', ext: { typeid: 1 }, ui: 1 },
        { name: '连续剧', ext: { typeid: 2 }, ui: 1 },
        { name: '动漫', ext: { typeid: 3 }, ui: 1 },
        { name: '综艺', ext: { typeid: 4 }, ui: 1 },
    ],
}

async function getLocalInfo() { return jsonify({ api: appConfig.site }) }
async function getConfig() { return jsonify(appConfig) }

function parsePoster($) {
    const cards = []
    const seen = {}
    $('a.module-poster-item').each((_, element) => {
        const el = $(element)
        const href = el.attr('href') || ''
        const title = el.attr('title') || el.find('.module-poster-item-title').text().trim()
        if (!href || !title || seen[href]) return
        seen[href] = 1
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: el.find('.module-item-pic img').attr('data-original') || el.find('img').attr('data-original') || el.find('img').attr('src') || '',
            vod_remarks: el.find('.module-item-note').text().trim(),
            ext: { url: href.indexOf('http') === 0 ? href : appConfig.site + href },
        })
    })
    return cards
}

// 搜索结果页用的是另一套卡片结构
function parseSearchCards($) {
    const cards = []
    const seen = {}
    $('a.module-card-item-poster, a.module-poster-item').each((_, element) => {
        const el = $(element)
        const href = el.attr('href') || ''
        if (!href || seen[href]) return
        const box = el.closest('.module-card-item').length ? el.closest('.module-card-item') : el
        const title = box.find('.module-card-item-title, .module-poster-item-title').first().text().trim() || el.attr('title') || ''
        if (!title) return
        seen[href] = 1
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: el.find('img').attr('data-original') || el.find('img').attr('data-src') || el.find('img').attr('src') || '',
            vod_remarks: box.find('.module-item-note, .module-card-item-note').first().text().trim(),
            ext: { url: href.indexOf('http') === 0 ? href : appConfig.site + href },
        })
    })
    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const typeid = ext.typeid
    let url = `${appConfig.site}/type/${typeid}.html`
    if (page > 1) url = `${appConfig.site}/type/${typeid}-${page}.html`

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    const cards = parsePoster($)

    // 该站翻页是 AJAX, 若模板回退返回了首页内容则不再输出, 避免重复列表
    if (page > 1) {
        const first = cards.length ? cards[0].vod_id : ''
        const firstPageFirst = $('a.module-poster-item').first().attr('href') || ''
        if (first && firstPageFirst && first === appConfig.site + firstPageFirst) {
            return jsonify({ list: [] })
        }
    }
    return jsonify({ list: cards })
}

async function getDetail(ext) {
    ext = argsify(ext)
    const { data } = await $fetch.get(ext.url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    return jsonify({
        detail: {
            vod_name: $('h1.title, .module-info-heading h1').first().text().trim() || ($('.module-poster-info-title').first().text().trim()),
            vod_pic: $('.module-info-poster img').attr('data-original') || $('.module-info-poster img').attr('src') || '',
            vod_remarks: $('.module-info-item').filter((_, el) => $(el).text().indexOf('更新') > -1).text().trim(),
            vod_content: $('.module-info-introduction-content, .module-info-content').first().text().trim(),
            vod_director: '',
            vod_actor: '',
            vod_year: '',
            vod_area: '',
            vod_type: '',
        },
    })
}

function hostOf(url) {
    const m = String(url).match(/^https?:\/\/([^\/]+)/)
    return m ? m[1].replace(/^www\./, '') : '外链'
}

// 兼容 maccms encrypt 0/1/2
function b64decode(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const str = String(input).replace(/[^A-Za-z0-9+/=]/g, '')
    let out = ''
    for (let i = 0; i < str.length; i += 4) {
        const e1 = chars.indexOf(str.charAt(i))
        const e2 = chars.indexOf(str.charAt(i + 1))
        const e3 = chars.indexOf(str.charAt(i + 2))
        const e4 = chars.indexOf(str.charAt(i + 3))
        const n = (e1 << 18) | (e2 << 12) | ((e3 < 0 ? 0 : e3) << 6) | (e4 < 0 ? 0 : e4)
        out += String.fromCharCode((n >> 16) & 255)
        if (e3 >= 0) out += String.fromCharCode((n >> 8) & 255)
        if (e4 >= 0) out += String.fromCharCode(n & 255)
    }
    return out
}

function unescapeStr(s) {
    return String(s).replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

// 从 maccms 风格页面提取播放直链 (player_aaaa / player_data)
// 注意: 只接受 .m3u8/.mp4 媒体地址, player_aaaa.url 若是 iqiyi 等网页链接则视为不可播
function isMediaUrl(u) {
    return /\.m3u8|\.mp4/i.test(String(u))
}

function extractMacCmsUrl(html) {
    const seg = html.match(/(?:var\s+)?(?:player_aaaa|player_data)\s*=\s*(\{[\s\S]*?\})\s*</)
    if (seg) {
        try {
            const pd = JSON.parse(seg[1])
            let raw = pd.url || ''
            if (pd.encrypt == 1) raw = unescapeStr(raw)
            else if (pd.encrypt == 2) raw = unescapeStr(b64decode(raw))
            if (raw && /^https?:\/\//.test(raw) && isMediaUrl(raw)) return raw
        } catch (e) { /* fallthrough */ }
    }
    const m3u8 = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/)
    if (m3u8) return m3u8[0]
    const mp4 = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/)
    if (mp4) return mp4[0]
    return ''
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [] })

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    const list = []

    // 1) 站内选集(若模板提供)
    const inSite = []
    $('a[href*="/play/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const name = $(el).text().trim()
        if (href && name && name.length < 30) {
            inSite.push({ name: name, pan: '', ext: { url: href.indexOf('http') === 0 ? href : appConfig.site + href } })
        }
    })
    if (inSite.length > 0) list.push({ title: 'FreeOK', tracks: inSite })

    // 2) 站内无选集 — freeok 详情页播放区是第三方站外链, 每个外链站作为一条线路
    const sources = []
    const seen = {}
    $('.play_source a[href], .module-info-play a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (!/^https?:\/\//.test(href)) return
        if (href.indexOf('freeok.day') > -1) return
        // 过滤搜索引擎与推广外链, 只保留详情/播放型链接
        if (!/\/(detail|xiangqing|play|vodplay|video|vod)/i.test(href)) return
        if (/toutiao|kuaishou|ixigua|douyin|baidu|douban|so\.com|sogou/i.test(href)) return
        const key = hostOf(href)
        if (seen[key]) return
        seen[key] = 1
        sources.push({ host: key, url: href })
    })

    for (let i = 0; i < sources.length; i++) {
        const src = sources[i]
        const tracks = []
        try {
            const resp = await $fetch.get(src.url, { headers: { 'User-Agent': UA, Referer: url } })
            const $$ = cheerio.load(resp.data || '')
            $$('a[href*="/play/"], a[href*="vplay"], a[href*="vodplay"], a[href*="bofang"]').each((_, el) => {
                const href = $(el).attr('href') || ''
                const name = $(el).text().trim()
                if (!href || !name || name.length > 30) return
                let full = href
                if (href.indexOf('http') !== 0) {
                    const m = src.url.match(/^(https?:\/\/[^\/]+)/)
                    full = (m ? m[1] : '') + href
                }
                tracks.push({ name: name, pan: '', ext: { url: full, host: src.host } })
            })
        } catch (e) { /* 外链站有防护时走降级 */ }
        if (tracks.length > 0) {
            list.push({ title: src.host, tracks: tracks })
        } else {
            // 降级: 保留外链入口, getPlayinfo 再尝试提取直链
            list.push({
                title: src.host,
                tracks: [{ name: '播放', pan: '', ext: { url: src.url, host: src.host, raw: 1 } }],
            })
        }
    }

    return jsonify({ list: list })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ urls: [] })

    let data = ''
    try {
        const resp = await $fetch.get(url, { headers: { 'User-Agent': UA, Referer: appConfig.site + '/' } })
        data = resp.data || ''
    } catch (e) { return jsonify({ urls: [] }) }

    // maccms 播放页 / 明文直链
    const direct = extractMacCmsUrl(data)
    if (direct) return jsonify({ urls: [direct] })

    // 页面内嵌 iframe 播放器, 再进一层提取
    const iframe = data.match(/<iframe[^>]+src=["']([^"']+)["']/)
    if (iframe) {
        let src = iframe[1]
        if (!/^https?:\/\//.test(src)) {
            const m = url.match(/^(https?:\/\/[^\/]+)/)
            src = (m ? m[1] : '') + src
        }
        try {
            const resp2 = await $fetch.get(src, { headers: { 'User-Agent': UA, Referer: url } })
            const inner = extractMacCmsUrl(resp2.data || '')
            if (inner) return jsonify({ urls: [inner] })
        } catch (e) { /* ignore */ }
    }

    return jsonify({ urls: [] })
}

async function search(ext) {
    ext = argsify(ext)
    const wd = ext.keyword || ext.wd || ''
    if (!wd) return jsonify({ list: [] })

    const url = `${appConfig.site}/search/${encodeURIComponent(wd)}-------------.html`
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    return jsonify({ list: parseSearchCards($) })
}
