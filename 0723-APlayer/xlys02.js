const cheerio = createCheerio()
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'

let appConfig = {
    ver: 20250826,
    title: 'xlys02',
    site: 'https://www.xlys02.com',
    tabs: [
        { name: '动画', ext: { typeurl: 'donghua' }, ui: 1 },
        { name: '韩剧', ext: { typeurl: 'hanju' }, ui: 1 },
        { name: '国剧', ext: { typeurl: 'guoju' }, ui: 1 },
        { name: '美剧', ext: { typeurl: 'meiju' }, ui: 1 },
        { name: '港台剧', ext: { typeurl: 'gangtaiju' }, ui: 1 },
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
    let url = appConfig.site + '/' + ext.typeurl + '.htm'
    if (ext.page) {
        url = appConfig.site + '/' + ext.typeurl + '/' + ext.page + '.htm'
    }
    let html = await $fetch.get(url, {
        headers: { 'User-Agent': UA }
    })
    let $ = cheerio.load(html.data)
    let items = []
    let seen = new Set()

    $('a[href$=".htm"]').each(function(i, el) {
        let href = $(el).attr('href') || ''
        if (!href || seen.has(href)) return
        if (href.startsWith('/play/') || href.startsWith('/s/') || href === '/') return

        let idMatch = href.match(//(w+)/(d+).htm/)
        if (!idMatch) return

        let title = $(el).attr('title') || ''
        let shortTitle = title
        let titleMatch = title.match(/《(.+?)》/)
        if (titleMatch) {
            shortTitle = titleMatch[1]
        }
        if (!shortTitle) {
            shortTitle = $(el).find('h4, h3').first().text().trim()
        }
        if (!shortTitle) {
            let parent = $(el).closest('.card, .module-item, [class*="card"]')
            shortTitle = parent.find('h4, h3').first().text().trim()
        }
        if (!shortTitle) return

        let img = $(el).find('img').first().attr('data-src') || $(el).find('img').first().attr('src') || ''
        let badge = $(el).find('span').first().text().trim()

        seen.add(href)
        items.push({
            id: idMatch[2],
            title: shortTitle,
            img: img,
            remark: badge,
            ext: { url: appConfig.site + href },
        })
    })

    let nextPage = ''
    $('a').each(function(i, el) {
        let text = $(el).text().trim()
        let href = $(el).attr('href') || ''
        if (text === '下一页' || text === 'Next' || text === '>') {
            nextPage = href
        }
    })

    if (nextPage) {
        let nextNum = nextPage.match(//(d+).htm/)?.[1] || ''
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
