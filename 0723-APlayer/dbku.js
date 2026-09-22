const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

// 独播库 dbku.tv — maccms myui 模板
// 已验证事实:
//   列表卡片  a.myui-vodlist__thumb[data-original][href*="/voddetail/"]
//   第1页     /vodtype/{id}.html
//   翻页      /vodshow/{id}--------{page}---.html
//   详情集数  div[id^="playlist"] > ul.myui-content__list > a[href*="/vodplay/"]
//   线路名    ul.nav-tabs li a (与 playlist 容器顺序对应)
//   播放数据  var player_data = {"encrypt":2,"url":"<base64>"} → unescape(base64decode(url)) = m3u8
//   搜索      /vodsearch/-------------.html?wd=关键词

let appConfig = {
    ver: 20260903,
    title: 'dbku',
    site: 'https://www.dbku.tv',
    tabs: [
        { name: '电影', ext: { typeid: 1 }, ui: 1 },
        { name: '连续剧', ext: { typeid: 2 }, ui: 1 },
        { name: '综艺', ext: { typeid: 3 }, ui: 1 },
        { name: '动漫', ext: { typeid: 4 }, ui: 1 },
        { name: '陆剧', ext: { typeid: 13 }, ui: 1 },
        { name: '日韩剧', ext: { typeid: 15 }, ui: 1 },
        { name: '台泰剧', ext: { typeid: 14 }, ui: 1 },
        { name: '短剧', ext: { typeid: 21 }, ui: 1 },
    ],
}

async function getLocalInfo() { return jsonify({ api: appConfig.site }) }
async function getConfig() { return jsonify(appConfig) }

function parseCards($) {
    const cards = []
    const seen = {}
    $('a.myui-vodlist__thumb').each((_, element) => {
        const el = $(element)
        const href = el.attr('href') || ''
        const title = el.attr('title') || ''
        if (!href || !title || href.indexOf('voddetail') === -1) return
        if (seen[href]) return
        seen[href] = 1
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: el.attr('data-original') || el.attr('data-src') || '',
            vod_remarks: el.find('.pic-text').text().trim(),
            ext: { url: appConfig.site + href },
        })
    })
    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const typeid = ext.typeid
    // myui 模板翻页是 vodshow 筛选 URL, 不是 ?page=
    const url = page > 1
        ? `${appConfig.site}/vodshow/${typeid}--------${page}---.html`
        : `${appConfig.site}/vodtype/${typeid}.html`

    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    return jsonify({ list: parseCards($) })
}

async function getDetail(ext) {
    ext = argsify(ext)
    const { data } = await $fetch.get(ext.url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)

    const detail = {
        vod_name: $('h1.title').first().text().trim(),
        vod_pic: $('.myui-content__thumb img').attr('data-original') || $('.myui-content__thumb img').attr('src') || '',
        vod_remarks: '',
        vod_content: $('#desc .sketch').first().text().trim() || $('#desc span.data p').first().text().trim(),
        vod_director: '',
        vod_actor: '',
        vod_year: '',
        vod_area: '',
        vod_type: '',
    }

    // 结构: <p class="data"><span>主演：</span><a>孟鹤堂</a>...</p>
    $('p.data').each((_, p) => {
        $(p).children('span').each((_, s) => {
            const label = $(s).text().replace(/[：:]\s*$/, '').trim()
            const value = $(s).next('a').text().trim()
            if (!value) return
            if (label.indexOf('分类') > -1 || label.indexOf('类型') > -1) detail.vod_type = value
            else if (label.indexOf('地区') > -1) detail.vod_area = value
            else if (label.indexOf('年份') > -1) detail.vod_year = value
            else if (label.indexOf('导演') > -1) detail.vod_director = value
            else if (label.indexOf('主演') > -1 || label.indexOf('演员') > -1) detail.vod_actor = value
        })
    })

    return jsonify({ detail })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const { data } = await $fetch.get(ext.url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    const list = []

    // myui 模板: 每条线路一个 <div id="playlistN"> 容器
    const boxes = $('div[id^="playlist"]')
    if (boxes.length > 0) {
        const names = []
        $('ul.nav-tabs li a').each((_, el) => names.push($(el).text().trim()))
        boxes.each((i, box) => {
            const tracks = []
            $(box).find('a[href*="/vodplay/"]').each((_, a) => {
                const href = $(a).attr('href') || ''
                if (!href) return
                tracks.push({
                    name: $(a).text().trim() || `第${tracks.length + 1}集`,
                    pan: '',
                    ext: { url: appConfig.site + href },
                })
            })
            if (tracks.length > 0) {
                list.push({ title: names[i] || `线路${i + 1}`, tracks: tracks })
            }
        })
    }

    // 回退: 直接收集页面全部播放链接
    if (list.length === 0) {
        const tracks = []
        $('a[href*="/vodplay/"]').each((_, a) => {
            const href = $(a).attr('href') || ''
            if (!href) return
            tracks.push({
                name: $(a).text().trim() || `第${tracks.length + 1}集`,
                pan: '',
                ext: { url: appConfig.site + href },
            })
        })
        if (tracks.length > 0) list.push({ title: '播放列表', tracks: tracks })
    }

    return jsonify({ list: list })
}

// maccms myui 模板播放数据: var player_data = {"encrypt":2,"url":"<base64>"}
// encrypt 0=明文  1=unescape  2=unescape(base64decode)
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

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })

    // 1) player_data 解密
    const seg = data.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*</)
    if (seg) {
        try {
            const pd = JSON.parse(seg[1])
            let raw = pd.url || ''
            if (pd.encrypt == 1) raw = unescapeStr(raw)
            else if (pd.encrypt == 2) raw = unescapeStr(b64decode(raw))
            if (raw && /^https?:\/\//.test(raw)) return jsonify({ urls: [raw] })
        } catch (e) { /* fallthrough */ }
    }

    // 2) 明文直链
    const m3u8 = data.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/)
    if (m3u8) return jsonify({ urls: [m3u8[0]] })
    const mp4 = data.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/)
    if (mp4) return jsonify({ urls: [mp4[0]] })

    // 3) iframe 播放器内层提取
    const iframe = data.match(/<iframe[^>]+src=["']([^"']+)["']/)
    if (iframe) {
        let src = iframe[1]
        if (!/^https?:\/\//.test(src)) src = appConfig.site + src
        try {
            const resp = await $fetch.get(src, { headers: { 'User-Agent': UA, Referer: url } })
            const inner = (resp.data || '').match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/)
            if (inner) return jsonify({ urls: [inner[0]] })
        } catch (e) { /* ignore */ }
    }

    return jsonify({ urls: [] })
}

async function search(ext) {
    ext = argsify(ext)
    const wd = ext.keyword || ext.wd || ''
    if (!wd) return jsonify({ list: [] })

    const url = `${appConfig.site}/vodsearch/-------------.html?wd=${encodeURIComponent(wd)}`
    const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } })
    const $ = cheerio.load(data)
    return jsonify({ list: parseCards($) })
}
