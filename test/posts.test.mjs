import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPost, groupByIssue, aideBoard } from '../lib/posts.mjs';

const valid = (over = '') =>
  [
    '---',
    'issue: 749',
    'date: 2026-10-18',
    'title: 디자인 시스템은 계약이다',
    'original_title: Your Design System Is a Contract',
    'url: https://example.com/a',
    'author: Ravi',
    'tags: [Konsist]',
    'aide:',
    '  status: planned',
    '  module: core:designsystem',
    '  summary: 디자인 토큰 규칙을 Konsist 로 검사',
    over,
    '---',
    '',
    '## 한 줄 요약',
    '',
    '**강조**',
  ].join('\n');

test('파일명에서 slug 를 만들고 본문을 HTML 로 바꾼다', () => {
  const post = toPost('749-konsist-design-system.md', valid());
  assert.equal(post.slug, '749-konsist-design-system');
  assert.equal(post.issue, 749);
  assert.equal(post.aide.status, 'planned');
  assert.match(post.html, /<strong>강조<\/strong>/);
});

test('필수 필드가 없으면 파일명을 담아 실패한다', () => {
  const raw = valid().replace('url: https://example.com/a\n', '');
  assert.throws(() => toPost('749-x.md', raw), /749-x\.md.*url/);
});

test('필수 필드를 비워 두면 실패한다', () => {
  assert.throws(() => toPost('749-x.md', valid().replace('title: 디자인 시스템은 계약이다', 'title:')), /title/);
  assert.throws(
    () => toPost('749-x.md', valid().replace('summary: 디자인 토큰 규칙을 Konsist 로 검사', 'summary:   # 나중에')),
    /aide\.summary/,
  );
});

test('이슈 번호가 숫자가 아니면 실패한다', () => {
  assert.throws(() => toPost('749-x.md', valid().replace('issue: 749', 'issue: "749"')), /issue/);
});

test('aide.status 가 정해진 값이 아니면 실패한다', () => {
  const raw = valid().replace('status: planned', 'status: maybe');
  assert.throws(() => toPost('749-x.md', raw), /status/);
});

test('파일명이 이슈번호로 시작하지 않거나 frontmatter issue 와 다르면 실패한다', () => {
  assert.throws(() => toPost('konsist.md', valid()), /파일명/);
  assert.throws(() => toPost('700-konsist.md', valid()), /파일명/);
});

test('이슈별로 묶고 최신 이슈가 먼저 온다', () => {
  const posts = [
    { issue: 748, slug: 'b' },
    { issue: 749, slug: 'a' },
    { issue: 748, slug: 'c' },
  ];
  const groups = groupByIssue(posts);
  assert.deepEqual(
    groups.map((g) => [g.issue, g.posts.map((p) => p.slug)]),
    [
      [749, ['a']],
      [748, ['b', 'c']],
    ],
  );
});

test('Aide 모아보기는 상태 순서대로 묶고 빈 상태도 남긴다', () => {
  const posts = [
    { slug: 'x', aide: { status: 'applied' } },
    { slug: 'y', aide: { status: 'candidate' } },
  ];
  const board = aideBoard(posts);
  assert.deepEqual(
    board.map((c) => [c.status, c.posts.map((p) => p.slug)]),
    [
      ['candidate', ['y']],
      ['planned', []],
      ['applied', ['x']],
      ['dropped', []],
    ],
  );
});
