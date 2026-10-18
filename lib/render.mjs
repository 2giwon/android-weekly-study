// 글 객체를 HTML 페이지로 바꾼다. 링크는 전부 상대 경로다 —
// GitHub Pages 가 /android-weekly-study/ 아래에 올리므로 / 로 시작하면 깨진다.

import { aideBoard, groupByIssue } from './posts.mjs';

const SITE = '안드로이드 위클리 공부 노트';

export const STATUS_LABEL = {
  candidate: '검토 전',
  planned: '적용 예정',
  applied: '적용함',
  dropped: '보류',
};

export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function koDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&family=IBM+Plex+Sans+KR:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231B2733'/%3E%3Crect x='6' y='18' width='20' height='6' fill='%23F2D54A'/%3E%3Ctext x='16' y='22' font-size='14' font-family='serif' font-weight='700' text-anchor='middle' fill='%23EEF1F4'%3EW%3C/text%3E%3C/svg%3E";

function layout({ title, root, current, body }) {
  const nav = [
    ['index.html', '글 목록', 'index'],
    ['aide.html', 'Aide 적용 후보', 'aide'],
  ]
    .map(
      ([href, label, key]) =>
        `<a href="${root}${href}"${current === key ? ' aria-current="page"' : ''}>${label}</a>`,
    )
    .join('');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="${root}style.css">
</head>
<body>
<header class="masthead">
  <a class="brand" href="${root}index.html">${SITE}</a>
  <nav>${nav}</nav>
</header>
${body}
<footer class="colophon">
  <p>원문은 <a href="https://androidweekly.net/">Android Weekly</a>에서 골랐습니다. 요약과 코드는 직접 썼고, 원문 저작권은 각 저자에게 있습니다.</p>
</footer>
</body>
</html>
`;
}

function statusChip(status) {
  return `<span class="chip chip-${status}">${STATUS_LABEL[status]}</span>`;
}

function tagList(tags) {
  if (!tags.length) return '';
  return `<ul class="tags">${tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
}

export function renderIndex(posts) {
  const groups = groupByIssue(posts);
  const issues = groups
    .map(
      ({ issue, posts: items }) => `
<section class="issue" aria-labelledby="issue-${issue}">
  <div class="issue-spine">
    <h2 id="issue-${issue}"><a href="https://androidweekly.net/issues/issue-${issue}">#${issue}</a></h2>
    <p>${koDate(items[0].date)}</p>
  </div>
  <ol class="entries">
    ${items
      .map(
        (p) => `<li class="entry">
      <a class="entry-title" href="posts/${p.slug}.html">${esc(p.title)}</a>
      <p class="entry-original">${esc(p.original_title)}</p>
      <p class="entry-aide">${statusChip(p.aide.status)}<span>${esc(p.aide.summary)}</span></p>
      ${tagList(p.tags)}
    </li>`,
      )
      .join('\n    ')}
  </ol>
</section>`,
    )
    .join('\n');

  const empty = `<p class="empty">아직 정리한 글이 없습니다. <code>/android-weekly</code> 에 아티클 링크를 넘기면 첫 글이 생깁니다.</p>`;

  return layout({
    title: SITE,
    root: '',
    current: 'index',
    body: `<main class="index">
<p class="lede">매주 Android Weekly에서 고른 글을 읽고 정리합니다. 노란 형광펜은 만들고 있는 앱 Aide에 가져다 쓸 부분입니다.</p>
${groups.length ? issues : empty}
</main>`,
  });
}

/** "Aide에 적용하면" 제목부터 다음 h2 전까지를 형광펜 구역으로 감싼다. */
function markAideSection(html) {
  return html.replace(
    /(<h2[^>]*>Aide에 적용하면<\/h2>)([\s\S]*?)(?=<h2|$)/,
    '<section class="aide-note">$1$2</section>',
  );
}

export function renderPost(post) {
  const { aide } = post;
  const where = [aide.module, aide.task].filter(Boolean).map((s) => `<code>${esc(s)}</code>`).join(' ');

  return layout({
    title: `${post.title} — ${SITE}`,
    root: '../',
    current: null,
    body: `<main class="post">
<header class="post-head">
  <p class="post-issue"><a href="../index.html#issue-${post.issue}">#${post.issue}</a> <time datetime="${esc(post.date)}">${koDate(post.date)}</time></p>
  <h1>${esc(post.title)}</h1>
  <p class="post-source">원문 <a href="${esc(post.url)}">${esc(post.original_title)}</a>, ${esc(post.author)}</p>
  ${tagList(post.tags)}
  <aside class="aide-card" aria-label="Aide 적용 후보">
    <p>${statusChip(aide.status)} ${where}</p>
    <p>${esc(aide.summary)}</p>
  </aside>
</header>
<article class="prose">
${markAideSection(post.html)}
</article>
</main>`,
  });
}

export function renderAide(posts) {
  const columns = aideBoard(posts)
    .map(
      ({ status, posts: items }) => `
<section class="lane lane-${status}" aria-labelledby="lane-${status}">
  <h2 id="lane-${status}">${STATUS_LABEL[status]} <span class="count">${items.length}</span></h2>
  ${
    items.length
      ? `<ul>${items
          .map(
            (p) => `<li>
    <code>${esc(p.aide.module)}</code>${p.aide.task ? ` <span class="task">${esc(p.aide.task)}</span>` : ''}
    <p>${esc(p.aide.summary)}</p>
    <a href="posts/${p.slug}.html">${esc(p.title)}</a> <span class="from">#${p.issue}</span>
  </li>`,
          )
          .join('\n  ')}</ul>`
      : '<p class="lane-empty">없음</p>'
  }
</section>`,
    )
    .join('\n');

  return layout({
    title: `Aide 적용 후보 — ${SITE}`,
    root: '',
    current: 'aide',
    body: `<main class="aide">
<h1>Aide 적용 후보</h1>
<p class="lede">글마다 남긴 적용안을 상태별로 모았습니다. 상태는 각 글의 <code>aide.status</code> 값을 바꾸면 옮겨집니다.</p>
<div class="board">${columns}
</div>
</main>`,
  });
}
