// posts/*.md 를 읽어 dist/ 에 정적 사이트를 굽는다. Node 내장 기능 + vendor/marked 만 쓴다.
// 글 하나라도 형식이 틀리면 전부 굽지 않고 실패한다 — 빠진 글을 모르고 배포하지 않기 위해서다.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toPost } from './lib/posts.mjs';
import { renderIndex, renderPost, renderAide } from './lib/render.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const postsDir = join(root, 'posts');
const dist = join(root, 'dist');

const files = readdirSync(postsDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const errors = [];
const posts = [];
for (const file of files) {
  try {
    posts.push(toPost(file, readFileSync(join(postsDir, file), 'utf8')));
  } catch (e) {
    errors.push(e.message);
  }
}

if (errors.length) {
  console.error(`글 ${errors.length}개의 형식이 틀렸습니다:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'posts'), { recursive: true });

copyFileSync(join(root, 'lib/style.css'), join(dist, 'style.css'));
writeFileSync(join(dist, 'index.html'), renderIndex(posts));
writeFileSync(join(dist, 'aide.html'), renderAide(posts));
for (const post of posts) writeFileSync(join(dist, 'posts', `${post.slug}.html`), renderPost(post));
// GitHub Pages 가 _ 로 시작하는 경로를 숨기지 않도록 한다
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`글 ${posts.length}개를 dist/ 에 구웠습니다.`);
