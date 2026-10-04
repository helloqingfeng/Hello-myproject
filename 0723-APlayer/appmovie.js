// === APP影院 XPTV 扩展脚本 (appmovie.js) ===

const BASE_URL = 'https://www.appmovie.art';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': BASE_URL + '/'
};

async function getLocalInfo() {
    return jsonify({
        name: 'APP影院',
        icon: 'https://www.appmovie.art/favicon.ico',
        version: '1.0.0',
        description: 'APP影院 - 全网最新热门电影、连续剧、综艺、动漫高清在线观看',
        author: 'antigravity'
    });
}

async function getConfig() {
    return jsonify({
        tabs: [
            {
                name: '电影',
                ext: {
                    url: BASE_URL + '/index.php/vod/type/id/1/page/{page}.html'
                }
            },
            {
                name: '连续剧',
                ext: {
                    url: BASE_URL + '/index.php/vod/type/id/2/page/{page}.html'
                }
            },
            {
                name: '综艺',
                ext: {
                    url: BASE_URL + '/index.php/vod/type/id/3/page/{page}.html'
                }
            },
            {
                name: '动漫',
                ext: {
                    url: BASE_URL + '/index.php/vod/type/id/4/page/{page}.html'
                }
            },
            {
                name: '国产剧',
                ext: {
                    url: BASE_URL + '/index.php/vod/show/id/13/page/{page}.html'
                }
            },
            {
                name: '欧美剧',
                ext: {
                    url: BASE_URL + '/index.php/vod/show/id/16/page/{page}.html'
                }
            },
            {
                name: '日韩剧',
                ext: {
                    url: BASE_URL + '/index.php/vod/show/id/15/page/{page}.html'
                }
            }
        ]
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    let url = ext.url || (BASE_URL + '/index.php/vod/type/id/1/page/{page}.html');
    url = url.replace('{page}', page);

    try {
        const res = await $fetch.get(url, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        const regex = /<a[^>]+href=["'](\/index\.php\/vod\/detail\/id\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = regex.exec(html)) !== null) {
            const rawA = m[0];
            const link = BASE_URL + m[1].trim();
            const titleMatch = rawA.match(/title=["']([^"']+)["']/i) || m[2].match(/alt=["']([^"']+)["']/i);
            const picMatch = rawA.match(/data-original=["']([^"']+)["']/i) || rawA.match(/data-src=["']([^"']+)["']/i) || rawA.match(/src=["']([^"']+)["']/i);
            const remarksMatch = m[2].match(/<span class="[^"]*note[^"]*">([^<]*)<\/span>|<span class="[^"]*pic-text[^"]*">([^<]*)<\/span>|<div class="module-item-note">([^<]*)<\/div>/i);

            const title = titleMatch ? titleMatch[1].trim() : m[2].replace(/<[^>]+>/g, '').trim();
            const pic = picMatch ? picMatch[1].trim() : '';
            const remarks = remarksMatch ? (remarksMatch[1] || remarksMatch[2] || remarksMatch[3] || '').trim() : '';

            if (title && !cards.find(c => c.ext.url === link)) {
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
        const epRegex = /href=["'](\/index\.php\/vod\/play\/id\/(\d+)\/sid\/(\d+)\/nid\/(\d+)\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let em;
        const lineMap = {};

        while ((em = epRegex.exec(html)) !== null) {
            const epPath = em[1];
            const id = em[2];
            const sid = em[3];
            const nid = em[4];
            const epName = em[5].replace(/<[^>]+>/g, '').trim() || `第${nid}集`;
            const epUrl = BASE_URL + epPath;

            if (!lineMap[sid]) lineMap[sid] = [];
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
        for (const sid of Object.keys(lineMap)) {
            lines.push({
                title: `播放线路 ${sid}`,
                tracks: lineMap[sid]
            });
        }

        // Fallback for general vodplay links
        if (lines.length === 0) {
            const fallbackTracks = [];
            const anyEp = /href=["'](\/index\.php\/vod\/play\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
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

        // Fallback: direct m3u8 in page
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
        const searchUrl = `${BASE_URL}/index.php/vod/search.html?wd=${encodeURIComponent(keyword)}`;
        const res = await $fetch.get(searchUrl, { headers: HEADERS });
        const html = res.data;
        const cards = [];

        const regex = /<a[^>]+href=["'](\/index\.php\/vod\/detail\/id\/\d+\.html)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let m;
        while ((m = regex.exec(html)) !== null) {
            const rawA = m[0];
            const link = BASE_URL + m[1].trim();
            const titleMatch = rawA.match(/title=["']([^"']+)["']/i) || m[2].match(/alt=["']([^"']+)["']/i);
            const picMatch = rawA.match(/data-original=["']([^"']+)["']/i) || rawA.match(/data-src=["']([^"']+)["']/i) || rawA.match(/src=["']([^"']+)["']/i);
            const remarksMatch = m[2].match(/<span class="[^"]*note[^"]*">([^<]*)<\/span>|<span class="[^"]*pic-text[^"]*">([^<]*)<\/span>|<div class="module-item-note">([^<]*)<\/div>/i);

            const title = titleMatch ? titleMatch[1].trim() : m[2].replace(/<[^>]+>/g, '').trim();
            const pic = picMatch ? picMatch[1].trim() : '';
            const remarks = remarksMatch ? (remarksMatch[1] || remarksMatch[2] || remarksMatch[3] || '').trim() : '';

            if (title && !cards.find(c => c.ext.url === link)) {
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
