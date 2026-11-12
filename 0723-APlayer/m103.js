const cheerio = createCheerio()

const SITE = 'http://103.236.72.182:3688'
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20261002,
    title: '103影视资源库',
    site: SITE,
    tabs: [
        { name: '电影', ext: { type: '1' }, ui: 1 },
        { name: '电视剧', ext: { type: '2' }, ui: 1 },
        { name: '动漫', ext: { type: '4' }, ui: 1 },
        { name: '综艺', ext: { type: '3' }, ui: 1 },
        { name: '短剧', ext: { type: '23' }, ui: 1 },
        { name: '纪录片', ext: { type: '27' }, ui: 1 },
        { name: '少儿', ext: { type: '35' }, ui: 1 },
    ],
}

// 友好源名称映射
const SOURCE_NAMES = {
    bfzym3u8: '暴风资源',
    ffm3u8: '非凡资源',
    dyttm3u8: '电影天堂',
    lzm3u8: '量子资源',
    zijianm3u8: '自建直链',
    JD4K: '京东4K超清',
    CO4K: 'CO4K超清',
    NBY: 'NBY秒播',
    PAN1: '网盘线路',
    BBA: 'BBA线路',
    qiyi: '爱奇艺源',
    youku: '优酷源',
    bilibili: 'B站源',
    qq: '腾讯源',
    mgtv: '芒果源',
}

async function getLocalInfo() {
    return jsonify({ api: SITE })
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let { page = 1, type = '1' } = ext
    let url = `${SITE}/api.php/provide/vod/?ac=detail&t=${type}&pg=${page}`

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const json = typeof data === 'string' ? JSON.parse(data) : data
    const list = []

    if (json && Array.isArray(json.list)) {
        json.list.forEach(item => {
            list.push({
                vod_id: String(item.vod_id),
                vod_name: item.vod_name || '',
                vod_pic: item.vod_pic || '',
                vod_remarks: item.vod_remarks || `${item.vod_year || ''} ${item.type_name || ''}`.trim(),
                ext: { id: String(item.vod_id), url: String(item.vod_id) },
            })
        })
    }

    return jsonify({ list })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = ext.id || ext.url || ext.vod_id || ''
    if (!id) {
        return jsonify({ list: [] })
    }

    const url = `${SITE}/api.php/provide/vod/?ac=detail&ids=${id}`
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const json = typeof data === 'string' ? JSON.parse(data) : data
    const list = []

    if (json && Array.isArray(json.list) && json.list.length > 0) {
        const item = json.list[0]
        const froms = (item.vod_play_from || '').split('$$$')
        const urlGroups = (item.vod_play_url || '').split('$$$')

        froms.forEach((fromKey, i) => {
            const rawUrlStr = urlGroups[i] || ''
            if (!rawUrlStr) return

            const tracks = []
            const episodes = rawUrlStr.split('#')

            episodes.forEach((ep, idx) => {
                if (!ep) return
                const parts = ep.split('$')
                let name = `第${idx + 1}集`
                let playUrl = ''

                if (parts.length >= 2) {
                    name = parts[0].trim() || name
                    playUrl = parts[1].trim()
                } else {
                    playUrl = parts[0].trim()
                }

                if (playUrl) {
                    tracks.push({
                        name: name,
                        pan: '',
                        ext: { url: playUrl },
                    })
                }
            })

            if (tracks.length > 0) {
                const groupTitle = SOURCE_NAMES[fromKey] || fromKey.toUpperCase()
                list.push({
                    title: groupTitle,
                    tracks: tracks,
                })
            }
        })
    }

    return jsonify({ list })
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
    const keyword = ext.text || ext.keyword || ext.wd || ext.key || ''
    const page = ext.page || 1
    if (!keyword) return jsonify({ list: [] })

    const url = `${SITE}/api.php/provide/vod/?ac=detail&wd=${encodeURIComponent(keyword)}&pg=${page}`
    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
        },
    })

    const json = typeof data === 'string' ? JSON.parse(data) : data
    const list = []

    if (json && Array.isArray(json.list)) {
        json.list.forEach(item => {
            list.push({
                vod_id: String(item.vod_id),
                vod_name: item.vod_name || '',
                vod_pic: item.vod_pic || '',
                vod_remarks: item.vod_remarks || `${item.vod_year || ''} ${item.type_name || ''}`.trim(),
                ext: { id: String(item.vod_id), url: String(item.vod_id) },
            })
        })
    }

    return jsonify({ list })
}
