// === 开心影院 XPTV 扩展脚本 (kxyy.js) ===

const BASE_URL = 'https://www.kxyy1.cc';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/'
};

async function getLocalInfo() {
    return jsonify({
        name: '开心影院',
        icon: 'https://www.kxyy1.cc/favicon.ico',
        version: '1.0.0',
        description: '开心影院 - 海量超清电影、热播电视剧、短剧、动漫、综艺免费在线播放',
        author: 'antigravity'
    });
}

async function getConfig() {
    return jsonify({
        tabs: [
            {
                name: '电视剧',
                ext: {
                    url: BASE_URL + '/vodtype/dianshiju-{page}.html'
                }
            },
            {
                name: '电影',
                ext: {
                    url: BASE_URL + '/vodtype/dianying-{page}.html'
                }
            },
            {
                name: '短剧',
                ext: {
                    url: BASE_URL + '/vodtype/duanju-{page}.html'
                }
            },
            {
                name: '综艺',
                ext: {
                    url: BASE_URL + '/vodtype/zongyi-{page}.html'
                }
            },
            {
                name: '动漫',
                ext: {
                    url: BASE_URL + '/vodtype/dongman-{page}.html'
                }
            }
        ]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    let url = ext.url || (BASE_URL + '/vodtype/dianying-{page}.html');
    url = url.replace('{page}', page);

    try {
        const res = await $fetch.get(url, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        // Match Tabler UI card structure in kxyy
        const cardRegex = /<div class="col-4[^>]*>[\s\S]*?<a\s+title="([^"]+)"\s+href="([^"]+)"[\s\S]*?(?:data-src|src)="([^"]+)"[\s\S]*?(?:<span class="badge[^>]*>([^<]*)<\/span>)?[\s\S]*?<\/div>\s*<\/div>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const title = match[1].trim();
            let link = match[2].trim();
            const pic = match[3].trim();
            const remarks = (match[4] || '').trim();

            if (!link.startsWith('http')) {
                link = BASE_URL + (link.startsWith('/') ? '' : '/') + link;
            }

            if (title && link) {
                cards.push({
                    vod_id: link,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remarks,
                    ext: {
                        url: link
                    }
                });
            }
        }

        // Fallback card regex if class names vary slightly
        if (cards.length === 0) {
            const fallbackRegex = /<a[^>]+title="([^"]+)"[^>]+href="(\/voddetail\/[^"]+)"[\s\S]*?(?:data-src|src)="([^"]+)"[\s\S]*?<\/a>/gi;
            while ((match = fallbackRegex.exec(html)) !== null) {
                const title = match[1].trim();
                const link = BASE_URL + match[2].trim();
                const pic = match[3].trim();
                if (!cards.find(c => c.ext.url === link)) {
                    cards.push({
                        vod_id: link,
                        vod_name: title,
                        vod_pic: pic,
                        vod_remarks: '',
                        ext: {
                            url: link
                        }
                    });
                }
            }
        }

        return jsonify({ list: cards });
    } catch (e) {
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const detailUrl = ext.url;
    if (!detailUrl) return jsonify({ list: [] });

    try {
        const res = await $fetch.get(detailUrl, { headers: HEADERS });
        const html = res.data;

        // Parse tab headers (line names)
        const tabHeaders = [];
        const tabRegex = /<(?:a|button)[^>]+(?:data-bs-target|href)=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/(?:a|button)>/gi;
        let m;
        while ((m = tabRegex.exec(html)) !== null) {
            const targetId = m[1];
            let title = m[2].replace(/<[^>]+>/g, '').trim();
            // clean up title (e.g. "BD源 &nbsp; 8" -> "BD源")
            title = title.replace(/&nbsp;.*$/, '').trim();
            if (title && !title.includes('简介') && !title.includes('nav') && !tabHeaders.find(x => x.targetId === targetId)) {
                tabHeaders.push({ targetId, title });
            }
        }

        const lines = [];

        for (const tab of tabHeaders) {
            const paneRegex = new RegExp(`<div[^>]+id=["']${tab.targetId}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
            const paneMatch = html.match(paneRegex);
            if (paneMatch) {
                const epTracks = [];
                const epRegex = /<a[^>]+href=["'](\/vodplay\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
                let em;
                while ((em = epRegex.exec(paneMatch[1])) !== null) {
                    let epUrl = em[1].trim();
                    if (!epUrl.startsWith('http')) epUrl = BASE_URL + (epUrl.startsWith('/') ? '' : '/') + epUrl;
                    const epName = em[2].replace(/<[^>]+>/g, '').trim() || `第${epTracks.length + 1}集`;
                    epTracks.push({
                        name: epName,
                        pan: '',
                        ext: {
                            url: epUrl
                        }
                    });
                }
                if (epTracks.length > 0) {
                    lines.push({
                        title: tab.title || `播放线路 ${lines.length + 1}`,
                        tracks: epTracks
                    });
                }
            }
        }

        // Fallback if no multi-tab structure was matched
        if (lines.length === 0) {
            const fallbackTracks = [];
            const epRegex = /<a[^>]+href=["'](\/vodplay\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            while ((m = epRegex.exec(html)) !== null) {
                let epUrl = m[1].trim();
                if (!epUrl.startsWith('http')) epUrl = BASE_URL + (epUrl.startsWith('/') ? '' : '/') + epUrl;
                const epName = m[2].replace(/<[^>]+>/g, '').trim() || `第${fallbackTracks.length + 1}集`;
                if (!fallbackTracks.find(t => t.ext.url === epUrl)) {
                    fallbackTracks.push({
                        name: epName,
                        pan: '',
                        ext: {
                            url: epUrl
                        }
                    });
                }
            }
            if (fallbackTracks.length > 0) {
                lines.push({
                    title: '默认线路',
                    tracks: fallbackTracks
                });
            }
        }

        return jsonify({ list: lines });
    } catch (e) {
        return jsonify({ list: [] });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const playUrl = ext.url;
    if (!playUrl) return jsonify({ urls: [] });

    try {
        const res = await $fetch.get(playUrl, { headers: { ...HEADERS, 'Referer': playUrl } });
        const html = res.data;

        // Extract player_data or player_aaaa
        const pMatch = html.match(/player_data\s*=\s*({[^<]+?})</) || 
                      html.match(/var\s+player_data\s*=\s*({.+?});/) ||
                      html.match(/player_aaaa\s*=\s*({[^<]+?})</) ||
                      html.match(/var\s+player_aaaa\s*=\s*({.+?});/);

        if (pMatch) {
            try {
                const pObj = JSON.parse(pMatch[1]);
                let rawUrl = pObj.url;

                // Handle MacCMS encryption
                if (pObj.encrypt === 2) {
                    try {
                        rawUrl = unescape(atob(rawUrl));
                    } catch (err) {}
                } else if (pObj.encrypt === 1) {
                    try {
                        rawUrl = unescape(rawUrl);
                    } catch (err) {}
                }

                // If direct http/https stream URL
                if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
                    return jsonify({ urls: [rawUrl] });
                }

                // Handle NBY player encryption
                if (rawUrl && rawUrl.startsWith('NBY-') || pObj.from === 'NBY') {
                    const signUrl = BASE_URL + '/static/player/nby.php?get_signed_url=1&url=' + encodeURIComponent(rawUrl);
                    const sRes = await $fetch.get(signUrl, {
                        headers: { ...HEADERS, 'Referer': BASE_URL + '/static/player/nby.php?url=' + encodeURIComponent(rawUrl) }
                    });
                    const signJson = typeof sRes.data === 'string' ? JSON.parse(sRes.data) : sRes.data;
                    if (signJson && signJson.signed_url) {
                        const fullDataUrl = signJson.signed_url.startsWith('http') ? signJson.signed_url : (BASE_URL + '/static/player/nby.php' + signJson.signed_url);
                        const dRes = await $fetch.get(fullDataUrl, {
                            headers: { ...HEADERS, 'Referer': BASE_URL + '/static/player/nby.php' }
                        });
                        const dataJson = typeof dRes.data === 'string' ? JSON.parse(dRes.data) : dRes.data;
                        if (dataJson && dataJson.jmurl) {
                            return jsonify({ urls: [dataJson.jmurl] });
                        }
                    }
                }
            } catch (err) {}
        }

        // Fallback: search for direct m3u8 URL in page
        const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (m3u8Match) {
            return jsonify({ urls: [m3u8Match[0]] });
        }

        return jsonify({ urls: [] });
    } catch (e) {
        return jsonify({ urls: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const keyword = ext.text || '';
    if (!keyword) return jsonify({ list: [] });

    try {
        // Search request
        const searchUrl = BASE_URL + '/vodsearch/-------------.html?wd=' + encodeURIComponent(keyword);
        const res = await $fetch.get(searchUrl, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        const cardRegex = /<div class="col-4[^>]*>[\s\S]*?<a\s+title="([^"]+)"\s+href="([^"]+)"[\s\S]*?(?:data-src|src)="([^"]+)"[\s\S]*?(?:<span class="badge[^>]*>([^<]*)<\/span>)?[\s\S]*?<\/div>\s*<\/div>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const title = match[1].trim();
            let link = match[2].trim();
            const pic = match[3].trim();
            const remarks = (match[4] || '').trim();

            if (!link.startsWith('http')) {
                link = BASE_URL + (link.startsWith('/') ? '' : '/') + link;
            }

            if (title && link) {
                cards.push({
                    vod_id: link,
                    vod_name: title,
                    vod_pic: pic,
                    vod_remarks: remarks,
                    ext: {
                        url: link
                    }
                });
            }
        }

        return jsonify({ list: cards });
    } catch (e) {
        return jsonify({ list: [] });
    }
}
