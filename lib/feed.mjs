// 사이트 밖에서 읽는 파일 두 개: RSS(구독 앱용)와 사이트맵(검색 엔진용).

import { SITE, SITE_URL, esc, excerpt } from './render.mjs';

const byNewest = (posts) => [...posts].sort((a, b) => String(b.date).localeCompare(String(a.date)));

const rfc822 = (iso) => new Date(`${iso}T00:00:00Z`).toUTCString();

export function renderFeed(posts) {
  const items = byNewest(posts)
    .map((p) => {
      const url = `${SITE_URL}posts/${p.slug}.html`;
      return `  <item>
    <title>${esc(p.title)}</title>
    <link>${url}</link>
    <guid isPermaLink="true">${url}</guid>
    <pubDate>${rfc822(p.date)}</pubDate>
    <description>${esc(excerpt(p.html, 300) || p.aide.summary)}</description>
  </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${SITE}</title>
  <link>${SITE_URL}</link>
  <atom:link href="${SITE_URL}feed.xml" rel="self" type="application/rss+xml"/>
  <description>Android Weekly에서 고른 글을 한국어로 풀어 정리하고, Aide에 적용할 방법을 적습니다.</description>
  <language>ko</language>
${items}
</channel>
</rss>
`;
}

export function renderSitemap(posts) {
  const urls = [
    { loc: SITE_URL, lastmod: byNewest(posts)[0]?.date },
    { loc: `${SITE_URL}aide.html` },
    ...posts.map((p) => ({ loc: `${SITE_URL}posts/${p.slug}.html`, lastmod: p.date })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(({ loc, lastmod }) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`)
  .join('\n')}
</urlset>
`;
}
