# 안드로이드 위클리 공부 노트

[Android Weekly](https://androidweekly.net/)에서 고른 글을 읽고 한국어로 정리하는 블로그입니다.
글마다 만들고 있는 앱 [Aide](https://github.com/2giwon/Aide-Android)에 어떻게 적용할지도 함께 적습니다.

사이트: https://2giwon.github.io/android-weekly-study/

- 원문 전문을 옮기지 않습니다. 요약과 코드는 직접 썼고, 원문 저작권은 각 저자에게 있습니다.

## 로컬에서 보기

```bash
node --test test/*.test.mjs   # 테스트
node build.mjs                # dist/ 에 사이트 생성
python3 -m http.server -d dist 8765
```

의존성 설치는 필요 없습니다 (Node 22 이상, 마크다운 변환기 `marked` 는 `vendor/` 에 들어 있습니다).
