import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_URL, excerpt, renderIndex, renderPost } from '../lib/render.mjs';
import { renderFeed, renderSitemap } from '../lib/feed.mjs';

const post = (over = {}) => ({
  slug: '749-a',
  issue: 749,
  date: '2026-10-18',
  title: '제목 <A&B>',
  original_title: 'Original',
  url: 'https://example.com/a',
  author: 'Ravi',
  tags: [],
  aide: { status: 'candidate', module: 'core:ai', summary: '요약' },
  html: '<h2>한 줄 요약</h2>\n<p>첫 <strong>문단</strong> &amp; 설명이다.</p>\n<p>둘째 문단</p>',
  ...over,
});

test('excerpt 는 첫 문단의 글자만 꺼내고 길면 자른다', () => {
  assert.equal(excerpt(post().html), '첫 문단 & 설명이다.');
  assert.equal(excerpt(`<p>${'가'.repeat(200)}</p>`, 10), `${'가'.repeat(10)}…`);
});

test('글 페이지는 공유 미리보기 카드 정보를 절대 주소로 담는다', () => {
  const html = renderPost(post());
  assert.match(html, /<meta property="og:title" content="제목 &lt;A&amp;B&gt;">/);
  assert.match(html, /<meta property="og:description" content="첫 문단 &amp; 설명이다\.">/);
  assert.match(html, new RegExp(`<meta property="og:url" content="${SITE_URL}posts/749-a\\.html">`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${SITE_URL}assets/og\\.png">`));
  assert.match(html, /<meta property="og:type" content="article">/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE_URL}posts/749-a\\.html">`));
});

test('모든 페이지 머리에 RSS 구독 주소를 알린다', () => {
  assert.match(renderIndex([post()]), /<link rel="alternate" type="application\/rss\+xml"[^>]*href="[^"]*feed\.xml"/);
  assert.match(renderPost(post()), /<link rel="alternate" type="application\/rss\+xml"[^>]*href="[^"]*feed\.xml"/);
});

test('RSS 는 최신 글이 먼저 오고 제목을 escape 한다', () => {
  const xml = renderFeed([post({ slug: '748-b', issue: 748, date: '2026-10-11', title: '예전' }), post()]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.ok(xml.indexOf('749-a') < xml.indexOf('748-b'));
  assert.match(xml, /<title>제목 &lt;A&amp;B&gt;<\/title>/);
  assert.match(xml, new RegExp(`<link>${SITE_URL}posts/749-a\\.html</link>`));
  assert.match(xml, /<pubDate>Sun, 18 Oct 2026 00:00:00 GMT<\/pubDate>/);
});

test('사이트맵은 홈·모아보기·모든 글의 절대 주소를 담는다', () => {
  const xml = renderSitemap([post()]);
  for (const path of ['', 'aide.html', 'posts/749-a.html']) {
    assert.match(xml, new RegExp(`<loc>${SITE_URL}${path.replace('.', '\\.')}</loc>`));
  }
});
