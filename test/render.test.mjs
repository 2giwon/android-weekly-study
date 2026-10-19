import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, renderIndex, renderPost, renderAide } from '../lib/render.mjs';

const post = {
  slug: '749-konsist',
  issue: 749,
  date: '2026-10-18',
  title: '<script>제목</script>',
  original_title: 'Original',
  url: 'https://example.com/a?x=1&y=2',
  author: 'Ravi',
  tags: ['Konsist'],
  aide: { status: 'planned', module: 'core:designsystem', summary: '요약' },
  html: '<p>본문</p>',
};

test('esc 는 HTML 특수문자를 바꾼다', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('글 목록은 제목을 escape 하고 글로 가는 상대 경로를 쓴다', () => {
  const html = renderIndex([post]);
  assert.match(html, /&lt;script&gt;제목/);
  assert.doesNotMatch(html, /<script>제목/);
  assert.match(html, /href="posts\/749-konsist\.html"/);
  assert.match(html, /#749/);
});

test('글 페이지는 한 단계 위로 올라가는 경로로 스타일과 홈을 가리킨다', () => {
  const html = renderPost(post);
  assert.match(html, /href="\.\.\/style\.css"/);
  assert.match(html, /href="\.\.\/index\.html"/);
  assert.match(html, /<p>본문<\/p>/);
  assert.match(html, /href="https:\/\/example\.com\/a\?x=1&amp;y=2"/);
});

test('표의 각 칸에 그 열의 제목을 data-label 로 붙인다 (좁은 화면에서 카드로 쌓을 때 쓴다)', () => {
  const html = renderPost({
    ...post,
    html: '<table><thead><tr><th>방법</th><th>"효과" &amp; 결과</th></tr></thead><tbody><tr><td>숨기기</td><td>줄어든다</td></tr></tbody></table>',
  });
  assert.match(html, /<td data-label="방법">숨기기<\/td>/);
  assert.match(html, /<td data-label="&quot;효과&quot; &amp; 결과">줄어든다<\/td>/);
});

test('Aide 모아보기는 상태 이름을 한국어로 보여주고 글에 링크한다', () => {
  const html = renderAide([post]);
  assert.match(html, /적용 예정/);
  assert.match(html, /core:designsystem/);
  assert.match(html, /href="posts\/749-konsist\.html"/);
});
