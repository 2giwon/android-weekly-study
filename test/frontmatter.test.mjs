import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFrontmatter } from '../lib/frontmatter.mjs';

test('스칼라·인라인 리스트·한 단계 맵을 읽는다', () => {
  const raw = [
    '---',
    'issue: 749',
    'title: "콜론: 이 있는 제목"',
    'tags: [Konsist, Lint, Compose]',
    'aide:',
    '  status: candidate',
    '  module: core:designsystem',
    '---',
    '',
    '본문',
  ].join('\n');

  const { data, body } = splitFrontmatter(raw);

  assert.equal(data.issue, 749);
  assert.equal(data.title, '콜론: 이 있는 제목');
  assert.deepEqual(data.tags, ['Konsist', 'Lint', 'Compose']);
  assert.deepEqual(data.aide, { status: 'candidate', module: 'core:designsystem' });
  assert.equal(body, '본문');
});

test('날짜는 문자열 그대로 둔다', () => {
  const { data } = splitFrontmatter('---\ndate: 2026-10-18\n---\n');
  assert.equal(data.date, '2026-10-18');
});

test('공백 뒤 # 부터는 주석으로 버리고, 따옴표 안이나 주소 속 # 은 남긴다', () => {
  const raw = [
    '---',
    'date: 2026-10-18   # 이슈 발행일',
    'title: "C# 이야기 # 그대로"',
    'url: https://example.com/a#part',
    'aide:   # Aide 적용안',
    '  status: candidate   # 검토 전',
    '---',
  ].join('\n');

  const { data } = splitFrontmatter(raw);

  assert.equal(data.date, '2026-10-18');
  assert.equal(data.title, 'C# 이야기 # 그대로');
  assert.equal(data.url, 'https://example.com/a#part');
  assert.equal(data.aide.status, 'candidate');
});

test('frontmatter 가 없으면 빈 객체와 원문을 돌려준다', () => {
  assert.deepEqual(splitFrontmatter('그냥 글'), { data: {}, body: '그냥 글' });
});
