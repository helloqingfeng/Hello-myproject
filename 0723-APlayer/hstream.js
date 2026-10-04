const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20261002,
    title: 'HStream',
    site: 'https://hstream.moe',
    tabs: [
        { name: '最新推荐', ext: { typeurl: '' }, ui: 1 },
        { name: '全部浏览', ext: { typeurl: 'search' }, ui: 1 },
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

    $('a[href*="/hentai/"]').each((_, el) => {
        const link = $(el)
        const href = fullUrl(link.attr('href'))
        if (!href || seen.has(href)) return

        const container = link.closest('.episode-item, .group, div[wire\\:key], div.relative')
        const target = container.length ? container : link

        let title = target.find('h3').first().text().trim() ||
                    target.find('.title').first().text().trim() ||
                    link.attr('title') ||
                    target.find('img').first().attr('alt') || ''

        if (!title) {
            const text = link.text().trim()
            const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
            if (lines.length > 0) {
                title = lines.find(l => !l.includes('fps') && !l.includes('4k') && !l.includes('FHD')) || lines[0]
            }
        }

        let cover = fullUrl(target.find('img').first().attr('src') || target.find('img').first().attr('data-src'))
        const duration = target.find('.duration').first().text().trim()
        const views = target.find('i.fa-eye, i.fa-regular.fa-eye').parent().text().trim()
        const remarks = [duration, views].filter(Boolean).join(' | ')

        if (title && href.includes('/hentai/')) {
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
    let { typeurl = '' } = ext
    let url = `${appConfig.site}/${typeurl}`

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
        const res = await $fetch.get(targetUrl, {
            headers: {
                'User-Agent': UA,
                Referer: appConfig.site + '/',
            },
        })

        const html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
        const $ = cheerio.load(html)

        const eId = $('#e_id').val()
        const token = $('input[name="_token"]').val()

        let cookies = ''
        if (res.headers && res.headers['set-cookie']) {
            const sc = res.headers['set-cookie']
            cookies = Array.isArray(sc) ? sc.join('; ') : String(sc)
        }

        if (eId && token) {
            try {
                const postHeaders = {
                    'User-Agent': UA,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': token,
                    'Referer': targetUrl,
                }
                if (cookies) {
                    postHeaders['Cookie'] = cookies
                }

                const apiRes = await $fetch.post(
                    `${appConfig.site}/player/api`,
                    JSON.stringify({ episode_id: parseInt(eId) }),
                    { headers: postHeaders }
                )

                let apiData = apiRes.data
                if (typeof apiData === 'string') {
                    try {
                        apiData = JSON.parse(apiData)
                    } catch (e) {}
                }

                if (apiData && apiData.stream_url && (apiData.stream_domains || apiData.asia_stream_domains)) {
                    const { stream_domains = [], stream_url, asia_stream_domains = [] } = apiData
                    const domains = asia_stream_domains.length > 0
                        ? asia_stream_domains.concat(stream_domains)
                        : stream_domains

                    const uniqueDomains = Array.from(new Set(domains))

                    uniqueDomains.forEach((domain, idx) => {
                        tracks.push({
                            name: `线路 ${idx + 1} (720P MP4 直链)`,
                            pan: '',
                            ext: { url: `${domain}/${stream_url}/x264.720p.mp4` },
                        })
                        tracks.push({
                            name: `线路 ${idx + 1} (1080P MPD)`,
                            pan: '',
                            ext: { url: `${domain}/${stream_url}/1080/manifest.mpd` },
                        })
                        tracks.push({
                            name: `线路 ${idx + 1} (720P MPD)`,
                            pan: '',
                            ext: { url: `${domain}/${stream_url}/720/manifest.mpd` },
                        })
                    })
                }
            } catch (err) {
                $print('player/api post failed: ' + err)
            }
        }

        // 回退: 正则提取直链
        if (!tracks.length) {
            const mediaRegex = /https?:\/\/[^\s"'<>]+\.(?:m3u8|mp4|mpd)[^\s"'<>]*/g
            const mediaList = html.match(mediaRegex) || []
            const uniqueMedia = Array.from(new Set(mediaList))
            uniqueMedia.forEach((mUrl, idx) => {
                tracks.push({
                    name: `播放源 ${idx + 1}`,
                    pan: '',
                    ext: { url: mUrl },
                })
            })
        }
    } catch (e) {
        $print('getTracks failed: ' + e)
    }

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
    return jsonify({ urls: [url] })
}

async function search(ext) {
    ext = argsify(ext)
    const keyword = ext.text || ext.keyword || ext.wd || ext.key || ''
    if (!keyword) return jsonify({ list: [] })

    try {
        const getRes = await $fetch.get(`${appConfig.site}/search`, {
            headers: { 'User-Agent': UA, Referer: appConfig.site + '/' },
        })

        const html = typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data)
        const $ = cheerio.load(html)
        const token = $('input[name="_token"]').val() || $('script[data-csrf]').attr('data-csrf')

        let cookies = ''
        if (getRes.headers && getRes.headers['set-cookie']) {
            const sc = getRes.headers['set-cookie']
            cookies = Array.isArray(sc) ? sc.join('; ') : String(sc)
        }

        let snapshotStr = ''
        $('[wire\\:snapshot]').each((_, el) => {
            const s = $(el).attr('wire:snapshot')
            if (s && s.includes('live-search')) {
                snapshotStr = s
            }
        })

        if (token && snapshotStr) {
            const payload = {
                _token: token,
                components: [
                    {
                        snapshot: snapshotStr,
                        updates: { search: keyword },
                        calls: [],
                    },
                ],
            }

            const postHeaders = {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Accept': 'text/html, application/xhtml+xml',
                'X-Livewire': 'true',
                'X-CSRF-TOKEN': token,
                Referer: `${appConfig.site}/search`,
            }
            if (cookies) postHeaders['Cookie'] = cookies

            const updateRes = await $fetch.post(
                `${appConfig.site}/livewire/update`,
                JSON.stringify(payload),
                { headers: postHeaders }
            )

            let resData = updateRes.data
            if (typeof resData === 'string') {
                try {
                    resData = JSON.parse(resData)
                } catch (e) {}
            }

            const resHtml = resData?.components?.[0]?.effects?.html || ''
            if (resHtml) {
                const list = parseCards(resHtml)
                return jsonify({ list })
            }
        }

        // 回退机制
        const allCards = parseCards(html)
        const filtered = allCards.filter(c => c.vod_name.toLowerCase().includes(keyword.toLowerCase()))
        return jsonify({ list: filtered })
    } catch (error) {
        return jsonify({ list: [] })
    }
}
