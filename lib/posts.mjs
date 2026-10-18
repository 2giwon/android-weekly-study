import { createRequire } from 'node:module';
import { splitFrontmatter } from './frontmatter.mjs';

const require = createRequire(import.meta.url);
const { marked } = require('../vendor/marked.min.cjs');

export const STATUSES = ['candidate', 'planned', 'applied', 'dropped'];

const REQUIRED = ['issue', 'date', 'title', 'original_title', 'url', 'author'];
const REQUIRED_AIDE = ['status', 'module', 'summary'];

/**
 * 마크다운 파일 하나를 글 객체로 만든다.
 * 형식이 틀리면 조용히 빼지 않고 파일명을 담아 실패한다 — 빠진 글을 눈치채지 못하는 일을 막는다.
 */
export function toPost(filename, raw) {
  const { data, body } = splitFrontmatter(raw);
  const fail = (why) => {
    throw new Error(`${filename}: ${why}`);
  };

  // 값을 비워 두면 파서가 '' 나 {} 를 돌려주므로, 있는지가 아니라 채워진 글자인지를 본다
  const filled = (v) => (typeof v === 'string' && v !== '') || typeof v === 'number';

  for (const key of REQUIRED) if (!filled(data[key])) fail(`${key} 가 비어 있습니다`);
  if (!Number.isInteger(data.issue)) fail('issue 는 따옴표 없는 숫자여야 합니다');
  if (typeof data.aide !== 'object' || Array.isArray(data.aide)) fail('aide 가 없습니다');
  for (const key of REQUIRED_AIDE) if (!filled(data.aide[key])) fail(`aide.${key} 가 비어 있습니다`);
  if (!STATUSES.includes(data.aide.status)) {
    fail(`aide.status 는 ${STATUSES.join(' · ')} 중 하나여야 합니다 (받은 값: ${data.aide.status})`);
  }

  const slug = filename.replace(/\.md$/, '');
  if (!slug.startsWith(`${data.issue}-`)) fail(`파일명은 "${data.issue}-" 로 시작해야 합니다`);

  return { ...data, tags: data.tags ?? [], slug, html: marked.parse(body) };
}

/** 이슈 번호별로 묶는다. 최신 이슈가 먼저, 같은 이슈 안은 넣은 순서 그대로. */
export function groupByIssue(posts) {
  const groups = new Map();
  for (const post of posts) {
    if (!groups.has(post.issue)) groups.set(post.issue, []);
    groups.get(post.issue).push(post);
  }
  return [...groups]
    .sort(([a], [b]) => b - a)
    .map(([issue, items]) => ({ issue, posts: items }));
}

/** Aide 적용 후보를 상태 순서대로 묶는다. 비어 있는 상태도 칸을 남긴다. */
export function aideBoard(posts) {
  return STATUSES.map((status) => ({
    status,
    posts: posts.filter((p) => p.aide.status === status),
  }));
}
