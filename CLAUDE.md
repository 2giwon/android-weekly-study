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

본문 h2 순서: `한 줄 요약` → `핵심 내용` → `코드로 보기` → `배운 점` → `Aide에 적용하면` → `출처`.
**`## Aide에 적용하면` 제목은 글자 그대로 쓴다** — 렌더러가 이 제목을 찾아 형광펜 구역으로 감싼다.

## 원칙

- **원문 전문 번역·복사 금지.** 요약 + 직접 쓴 설명·코드 + 원문 링크. 원문 코드를 그대로 옮기지 않는다
- 원문을 실제로 읽지 못했으면 쓰지 않는다 (Medium 은 자동 접근을 403 으로 막는다 — 사용자에게 알리고 본문을 받는다)
- Aide 적용안은 Aide 의 `decisions.md` 와 계획을 읽고 쓴다. 이미 정한 결정과 충돌하면 그 사실을 적는다. **Aide 코드는 건드리지 않는다**
- 링크는 전부 상대 경로 (Pages 가 `/android-weekly-study/` 아래에 올린다)
