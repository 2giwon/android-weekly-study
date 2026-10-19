# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 리포지토리 성격

Android Weekly 에서 **사용자가 직접 고른** 아티클을 공부·요약하고, Aide-Android 에 적용할 방법을 정리하는 **공개** 블로그.
원본은 `posts/*.md`, `build.mjs` 가 정적 사이트로 굽고 GitHub Actions 가 Pages 에 배포한다.
글 작성 절차는 `/android-weekly` 스킬에 있다. 설계 문서: `~/Documents/personal-docs/android-weekly-study/`.

## 명령

```bash
node --test test/*.test.mjs   # 테스트 (디렉터리 대신 파일을 명시해야 Node 22에서도 돈다)
node build.mjs                # dist/ 생성. 글 형식이 하나라도 틀리면 실패한다
```

`package.json` 이 없다. 일부러다 — Node 내장 기능과 `vendor/marked.min.cjs` 만 쓴다.
`marked` 확장자가 `.cjs` 인 이유: 상위 폴더(`~/package.json`)가 `"type":"module"` 이라 `.js` 면 로컬에서 못 읽는다.

## 글 규격

파일명 `posts/<이슈번호>-<영문-slug>.md`. 이슈번호가 frontmatter `issue` 와 다르면 빌드 실패.

```yaml
---
issue: 749
date: 2026-10-18            # 이슈 발행일
title: 한국어 제목
original_title: 원문 제목
url: https://...
author: 원문 저자
tags: [Compose, Coroutines]
aide:
  status: candidate         # candidate(검토 전) · planned(적용 예정) · applied(적용함) · dropped(보류)
  module: core:data         # Aide 의 대상 모듈
  task: Task 7              # 선택. Aide 계획의 Task 번호나 단계(1-b 등)
  summary: 한 줄 적용안
---
```

본문 h2 순서: `한 줄 요약` → `먼저 알아 둘 말` → (원문 순서대로: `서론` → 원문의 각 장) → `코드로 보기 — Aide 구조로 옮긴 스케치` → `배운 점` → `Aide에 적용하면` → `출처`. 기준 글은 `posts/748-*.md`.
**`## Aide에 적용하면` 제목은 글자 그대로 쓴다** — 렌더러가 이 제목을 찾아 형광펜 구역으로 감싼다.

## 글쓰기 — 줄이지 말고 풀어 쓴다 (2026-10-19 사용자 지시)

#748 첫 판이 "축약이 과해서 무슨 의미인지 알아보기 힘들다"는 지적을 받고 전부 다시 썼다.
**독자가 용어를 미리 안다고 가정하지 않는다.** 기준은 #748 두 번째 판이다.

- 본문 앞에 `## 먼저 알아 둘 말` 섹션을 두고, 글에 나오는 용어를 하나씩 풀어 쓴다. Android 에 대응되는 것이 있으면 함께 적는다 (예: Koin = Hilt 와 같은 역할)
- 본문에서도 용어가 처음 나오면 그 자리에서 괄호로 뜻을 붙인다 → `HIDDEN`(빈 껍데기만 내보냄)
- 각 단계는 **개괄식**(굵은 한 줄 요지 + 아래 불릿)으로, "무엇을 했나 → 왜 → 결과" 순서로 쓴다
- 한 단어·명사구로 끝나는 축약 금지. "Koin 2,000→22줄" 이 아니라 "Koin은 약 2,000줄에서 22줄이 됐다"
- 표의 칸도 완결된 문장으로 쓴다 (좁은 화면에서는 렌더러가 표를 카드로 쌓는다)
- 원문의 수치·이름·버전은 빠뜨리지 않고 옮긴다 — 요약은 "말을 줄이는 것"이 아니라 "원문을 그대로 베끼지 않는 것"이다
- **원문 흐름을 따른다** — 서론부터 원문 순서대로. 서론·코드·그림을 빼지 않는다 (#748 2판이 셋 다 빠뜨려 3판을 다시 씀)

## 원문 코드와 그림 가져오기 (2026-10-19 결정)

먼저 **라이선스를 확인**한다 (`gh api repos/<owner>/<repo>/license`, 블로그 페이지 하단).

| 대상 | 라이선스가 있을 때 (Apache-2.0·MIT 등) | 없을 때 |
|---|---|---|
| 코드 | 블록으로 인용하고 **블록 바로 아래 `> 출처: 파일명 (링크, 라이선스)`**. 이어서 줄 단위로 풀어 설명 | 직접 쓴 스케치로 대신하고 "직접 쓴 스케치"라고 밝힌다 |
| 그림 | 출처를 적고 `assets/` 에 넣어도 된다 | **파일을 복사하지 않는다** (공개 repo 재배포). 같은 내용을 `assets/<이슈>-<이름>.svg` 로 **한국어로 다시 그리고**, 캡션에 "원문 그림을 바탕으로 다시 그림" + 원문 링크 |

- 다시 그린 SVG 는 파일 안 `<style>` 에 `@media (prefers-color-scheme: dark)` 를 넣어 다크 모드를 맞춘다 (`assets/748-modules.svg` 참고)
- 그림은 `<figure><a class="figure-scroll" href="../assets/X.svg"><img ...></a><figcaption>…</figcaption></figure>` 로 넣는다 — 좁은 화면에서 옆으로 밀어 보고, 누르면 크게 열린다

## 공유·구독·검색 (빌드가 자동으로 만든다)

- 페이지마다 공유 미리보기 카드 정보(Open Graph). 카드 이미지는 `assets/og.png` 하나를 함께 쓴다. 글의 설명은 첫 문단(`한 줄 요약`)에서 뽑으므로 **첫 문단을 공들여 쓴다**
- `feed.xml`(RSS) · `sitemap.xml` 을 굽는다. `robots.txt` 는 도메인 맨 위여야 해서 `2giwon/2giwon.github.io` repo 에 있다
- 주소 `SITE_URL` 은 `lib/render.mjs` 에 있다. 도메인을 바꾸면 여기만 고친다

## 원칙

- **원문 글을 그대로 번역하지 않는다.** 원문 흐름을 따르되 설명은 내 말로 쓴다. 코드·그림은 위 "원문 코드와 그림 가져오기" 기준을 따른다
- 원문을 실제로 읽지 못했으면 쓰지 않는다 (Medium 은 자동 접근을 403 으로 막는다 — 사용자에게 알리고 본문을 받는다)
- Aide 적용안은 Aide 의 `decisions.md` 와 계획을 읽고 쓴다. 이미 정한 결정과 충돌하면 그 사실을 적는다. **Aide 코드는 건드리지 않는다**
- 링크는 전부 상대 경로 (Pages 가 `/android-weekly-study/` 아래에 올린다)
