// === 66大片网 XPTV 扩展脚本 (dpw66.js) ===

const BASE_URL = 'https://www.77dpw.vip';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/'
};

async function getLocalInfo() {
    return jsonify({
        name: '66大片网',
        icon: 'https://www.77dpw.vip/favicon.ico',
        version: '1.0.0',
        description: '66大片网 - 最新电影、热播剧集、动漫、短剧、综艺手机高清在线看',
        author: 'antigravity'
    });
}

async function getConfig() {
    return jsonify({
        tabs: [
            {
                name: '电影',
                ext: {
                    url: BASE_URL + '/vodtype/1-{page}.html'
                }
            },
            {
                name: '动漫',
                ext: {
                    url: BASE_URL + '/vodtype/2-{page}.html'
                }
            },
            {
                name: '剧集',
                ext: {
                    url: BASE_URL + '/vodtype/3-{page}.html'
                }
            },
            {
                name: '短剧',
                ext: {
                    url: BASE_URL + '/vodtype/4-{page}.html'
                }
            },
            {
                name: '综艺',
                ext: {
                    url: BASE_URL + '/vodtype/5-{page}.html'
                }
            }
        ]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    let url = ext.url || (BASE_URL + '/vodtype/1-{page}.html');
    url = url.replace('{page}', page);

    try {
        const res = await $fetch.get(url, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        const cardRegex = /<a[^>]+href=["'](\/voddetail\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const rawA = match[0];
            const link = BASE_URL + match[1].trim();
            const titleMatch = rawA.match(/title=["']([^"']+)["']/i) || match[2].match(/alt=["']([^"']+)["']/i);
            const picMatch = rawA.match(/data-original=["']([^"']+)["']/i) || rawA.match(/data-src=["']([^"']+)["']/i) || rawA.match(/src=["']([^"']+)["']/i);
            const remarksMatch = match[2].match(/<span class="[^"]*note[^"]*">([^<]*)<\/span>|<span class="[^"]*pic-text[^"]*">([^<]*)<\/span>/i);

            const title = titleMatch ? titleMatch[1].trim() : '';
            const pic = picMatch ? picMatch[1].trim() : '';
            const remarks = remarksMatch ? (remarksMatch[1] || remarksMatch[2] || '').trim() : '';

            if (title && pic && !cards.find(c => c.ext.url === link)) {
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

async function getTracks(ext) {
    ext = argsify(ext);
    const detailUrl = ext.url;
    if (!detailUrl) return jsonify({ list: [] });

    try {
        const res = await $fetch.get(detailUrl, { headers: HEADERS });
        const html = res.data;

        // Group episodes by sid
        const epRegex = /href=["']\/vodplay\/(\d+)-(\d+)-(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/gi;
        let em;
        const lineMap = {};

        while ((em = epRegex.exec(html)) !== null) {
            const [_, id, sid, nid] = em;
            let epName = em[4].replace(/<[^>]+>/g, '').trim() || `第${nid}集`;
            if (!lineMap[sid]) lineMap[sid] = [];
            const epUrl = `${BASE_URL}/vodplay/${id}-${sid}-${nid}.html`;
            if (!lineMap[sid].find(x => x.ext.url === epUrl)) {
                lineMap[sid].push({
                    name: epName,
                    pan: '',
                    ext: {
                        url: epUrl
                    }
                });
            }
        }

        const lines = [];
        const sidKeys = Object.keys(lineMap);
        for (const sid of sidKeys) {
            lines.push({
                title: `播放线路 ${sid}`,
                tracks: lineMap[sid]
            });
        }

        if (lines.length === 0) {
            const fallbackTracks = [];
            const anyEp = /href=["'](\/vodplay\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            while ((em = anyEp.exec(html)) !== null) {
                const epUrl = BASE_URL + em[1];
                const epName = em[2].replace(/<[^>]+>/g, '').trim() || `第${fallbackTracks.length + 1}集`;
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

        // Extract player_aaaa or player_data
        const pMatch = html.match(/player_aaaa\s*=\s*({[^<]+?})</) || 
                      html.match(/var\s+player_aaaa\s*=\s*({.+?});/) ||
                      html.match(/player_data\s*=\s*({[^<]+?})</) || 
                      html.match(/var\s+player_data\s*=\s*({.+?});/);

        if (pMatch) {
            try {
                const pObj = JSON.parse(pMatch[1]);
                let rawUrl = pObj.url;

                if (pObj.encrypt === 2) {
                    try {
                        rawUrl = unescape(atob(rawUrl));
                    } catch (err) {}
                } else if (pObj.encrypt === 1) {
                    try {
                        rawUrl = unescape(rawUrl);
                    } catch (err) {}
                }

                if (rawUrl && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
                    return jsonify({ urls: [rawUrl] });
                }
            } catch (err) {}
        }

        // Fallback: direct m3u8
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
        const searchUrl = `${BASE_URL}/vodsearch/${encodeURIComponent(keyword)}-------------.html`;
        const res = await $fetch.get(searchUrl, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        const cardRegex = /<a[^>]+href=["'](\/voddetail\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const rawA = match[0];
            const link = BASE_URL + match[1].trim();
            const titleMatch = rawA.match(/title=["']([^"']+)["']/i) || match[2].match(/alt=["']([^"']+)["']/i);
            const picMatch = rawA.match(/data-original=["']([^"']+)["']/i) || rawA.match(/data-src=["']([^"']+)["']/i) || rawA.match(/src=["']([^"']+)["']/i);
            const remarksMatch = match[2].match(/<span class="[^"]*note[^"]*">([^<]*)<\/span>|<span class="[^"]*pic-text[^"]*">([^<]*)<\/span>/i);

            const title = titleMatch ? titleMatch[1].trim() : '';
            const pic = picMatch ? picMatch[1].trim() : '';
            const remarks = remarksMatch ? (remarksMatch[1] || remarksMatch[2] || '').trim() : '';

            if (title && pic && !cards.find(c => c.ext.url === link)) {
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
