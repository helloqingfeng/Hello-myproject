const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20260918,
    title: 'xlys02',
    site: 'https://www.xlys02.com',
    tabs: [
        { name: '电影', ext: { typeurl: 's/all?type=0' }, ui: 1 },
        { name: '剧集', ext: { typeurl: 's/all?type=1' }, ui: 1 },
        { name: '动作', ext: { typeurl: 's/dongzuo' }, ui: 1 },
        { name: '爱情', ext: { typeurl: 's/aiqing' }, ui: 1 },
        { name: '喜剧', ext: { typeurl: 's/xiju' }, ui: 1 },
        { name: '科幻', ext: { typeurl: 's/kehuan' }, ui: 1 },
        { name: '恐怖', ext: { typeurl: 's/kongbu' }, ui: 1 },
        { name: '战争', ext: { typeurl: 's/zhanzheng' }, ui: 1 },
        { name: '剧情', ext: { typeurl: 's/juqing' }, ui: 1 },
        { name: '动画', ext: { typeurl: 's/donghua' }, ui: 1 },
        { name: '惊悚', ext: { typeurl: 's/jingsong' }, ui: 1 },
        { name: '悬疑', ext: { typeurl: 's/xuanyi' }, ui: 1 },
        { name: '犯罪', ext: { typeurl: 's/fanzui' }, ui: 1 },
        { name: '纪录', ext: { typeurl: 's/jilu' }, ui: 1 },
        { name: '综艺', ext: { typeurl: 's/zongyi' }, ui: 1 },
    ],
}

function fullUrl(url) {
    if (!url) return ''
    if (url.indexOf('http://') === 0 || url.indexOf('https://') === 0) return url
    return appConfig.site + (url.indexOf('/') === 0 ? url : '/' + url)
}

// Custom crypto/AES-128-ECB and MD5 helper since we are in XPTV runtime
// CryptoJS is available in node / some environments, but let's implement MD5 and use standard CryptoJS if available,
// or fallback to clean JS if needed. XPTV provides CryptoJS by default in global scope for JS extensions.
function md5(text) {
    return CryptoJS.MD5(text).toString()
}

function encryptAesEcb(text, keyStr) {
    const key = CryptoJS.enc.Utf8.parse(keyStr)
    const encrypted = CryptoJS.AES.encrypt(text, key, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
    })
    return encrypted.toString()
}

function base64ToHex(str) {
    const raw = atob(str)
    let hex = ''
    for (let i = 0; i < raw.length; i++) {
        const charHex = raw.charCodeAt(i).toString(16).padStart(2, '0')
        hex += charHex
    }
    return hex.toUpperCase()
}

function parseCards(data) {
    const $ = cheerio.load(data)
    const cards = []
    const seen = new Set()

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || ''
        if (!href || seen.has(href)) return
        if (href.startsWith('/play/') || href.startsWith('/s/') || href === '/') return

        const idMatch = href.match(/\/(\w+)\/(\d+)\.htm/)
        if (!idMatch) return

        const title = ($(el).attr('title') || $(el).text() || '').trim()
        if (!title) return

        let img = $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src') || ''
        if (img && img.startsWith('data:image/')) {
            img = '' // Ignore lazyloaded transparent gif placeholder
        }
        const badge = $(el).find('span').first().text().trim() || $(el).text().match(/\d+\.\d+/)?.[0] || ''

        seen.add(href)
        cards.push({
            vod_id: fullUrl(href),
            vod_name: title,
            vod_pic: img ? fullUrl(img) : '',
            vod_remarks: badge,
            ext: { url: fullUrl(href) },
        })
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
    let { page = 1, typeurl = '' } = ext
    let url = `${appConfig.site}/${typeurl}`

    if (page > 1) {
        url += `/${page}`
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
    const url = ext.url || ''
    const tracks = []

    if (!url) {
        return jsonify({ list: [] })
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    const $ = cheerio.load(data)

    // Check if we are on a play page or detail page
    // Play page has a different structure or list, but let's fetch all plays from both
    $('a[href*="/play/"]').each((_, el) => {
        const href = $(el).attr('href') || ''
        const name = $(el).text().trim()
        if (href && name) {
            const fullHref = fullUrl(href)
            if (!tracks.some(t => t.ext.url === fullHref)) {
                tracks.push({
                    name: name,
                    pan: '',
                    ext: { url: fullHref },
                })
            }
        }
    })

    return jsonify({
        list: [{
            title: '播放线路',
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

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    // Extract pid and time from the play page
    const pidMatch = data.match(/var\s+pid\s*=\s*(\d+)/)
    const timeMatch = data.match(/var\s+time\s*=\s*(\d+)/)

    if (!pidMatch) {
        // Fallback: If no pid, just return current page URL
        return jsonify({ urls: [url] })
    }

    const pid = pidMatch[1]
    const t = Date.now().toString()

    // We compute the cryptographic signature (sg) just like xlplayer.js does:
    // var key = CryptoJS.enc.Utf8.parse(md5(pid + '-' + t).substring(0, 16));
    // var encrypted = CryptoJS.AES.encrypt(pid + '-' + t, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
    // var sg = base64ToHex(encrypted.toString());
    const md5Key = md5(pid + '-' + t).substring(0, 16)
    const encrypted = encryptAesEcb(pid + '-' + t, md5Key)
    const sg = base64ToHex(encrypted)

    // Call the lines API to get play URLs
    const linesUrl = `${appConfig.site}/lines?t=${t}&sg=${sg}&pid=${pid}`

    try {
        const linesResponse = await $fetch.get(linesUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': url,
                'X-Requested-With': 'XMLHttpRequest'
            }
        })

        const linesJson = typeof linesResponse.data === 'string' ? JSON.parse(linesResponse.data) : linesResponse.data
        if (linesJson && linesJson.code === 0 && linesJson.data) {
            const urls = []

            // Collect play URLs from lines data
            if (linesJson.data.m3u8) {
                // Remove suffix #name
                urls.push(linesJson.data.m3u8.split('#')[0])
            }
            if (linesJson.data.m3u8_2) {
                const subLines = linesJson.data.m3u8_2.split(',')
                subLines.forEach(sub => {
                    urls.push(sub.split('#')[0])
                })
            }
            if (linesJson.data.url3) {
                const subLines = linesJson.data.url3.split(',')
                subLines.forEach(sub => {
                    urls.push(sub)
                })
            }

            if (urls.length > 0) {
                return jsonify({ urls: urls })
            }
        }
    } catch (e) {
        // Log or silent ignore
    }

    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    const wd = ext.text || ext.wd || ext.keyword || ''
    if (!wd) {
        return jsonify({ list: [] })
    }

    const url = `${appConfig.site}/s/all?type=${encodeURIComponent(wd)}`
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            Referer: appConfig.site + '/',
        },
    })

    const cards = parseCards(data)
    return jsonify({ list: cards })
}
