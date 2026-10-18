---
issue: 749
date: 2026-10-18
title: AI 에이전트는 일하기 전에 계획부터 보여줘야 한다
original_title: Why my Android AI app shows its plan before it does anything
url: https://dev.to/grokkris_267433fde5540f5b/why-my-android-ai-app-shows-its-plan-before-it-does-anything-4kmo
author: Grokkris
tags: [AI 에이전트, UX, LLM]
aide:
  status: candidate
  module: core:ai
  task: 1-b
  summary: 사용자 키로 부르는 AI에 작업당 비용 상한을 두고, 아바타가 지금 하는 일을 단계로 보여준다
---

## 한 줄 요약

에이전트가 똑똑하게 숨어서 일하는 것보다, **지루하더라도 무엇을 하는지 다 보이는 것**이 폰에서는 더 낫다는 글. 저자는 오픈소스 AI 앱 Kryzz AI를 만들며 이 원칙을 지켰다.

## 핵심 내용

### 문제: 에이전트가 무엇을 했는지 알 수 없다

다른 앱의 에이전트를 써 보니 이런 것을 확인할 길이 없었다고 한다.

- 페이지를 정말 열어 봤는지, 출처를 지어낸 건지
- 반복 작업이 돌면서 API 요금을 얼마나 쓰고 있는지

폰에서는 사용자가 화면을 반쯤만 보고 있는 경우가 많아서, 이 문제가 더 커진다.

### 해결: 보이게, 그리고 한도를 두게

| 장치 | 하는 일 |
|---|---|
| 계획 카드 | 일을 시작하기 전에 짧은 계획을 쓰고, 단계를 끝낼 때마다 체크한다 |
| 작업 기록 칩 | 검색·페이지 읽기·파일 접근을 하나씩 칩으로 보여줘서 답이 어디서 왔는지 따라갈 수 있다 |
| 중간에 멈추기 | 계획이 이상해 보이면 사용자가 바로 멈출 수 있다 |
| 링크 필터 | 모델이 지어낸 주소가 아니라 허용된 링크만 읽는다 |
| 작업당 비용 상한 | 기본 $0.25, 최대 $2. 반복이 폭주해 사용자 키 요금을 다 써 버리는 일을 막는다 |

대화는 기기 안에만 두고, **사용자 자신의 API 키**로 제공자를 직접 부른다. 원격 수집(텔레메트리)도 없다.

### 글이 다루지 않는 것

계획을 승인·수정·거절하는 흐름, 실행 내부 구조, 실패 처리는 글에 없다. 저자도 자세한 것은 GitHub 저장소(kriddss3/kryzz-ai)를 보라고 한다.

## 코드로 보기

> 원문에는 코드가 없다. 아래는 이 글의 "작업당 비용 상한"을 Aide 구조에 옮기면 어떤 모양일지 직접 써 본 스케치다.

```kotlin
// core:ai — 한 번의 요청(작업)이 쓸 수 있는 돈의 한도
class CostCap(private val limitUsd: Double) {
    private var spentUsd = 0.0

    fun charge(inputTokens: Int, outputTokens: Int, price: ModelPrice) {
        spentUsd += inputTokens * price.inputPerToken + outputTokens * price.outputPerToken
        if (spentUsd > limitUsd) throw CostCapExceeded(spentUsd, limitUsd)
    }
}
```

도구 호출이 이어질 때마다 `charge` 를 부르고, 한도를 넘으면 그 작업만 멈춘다. 멈췄다는 사실은 숨기지 않고 사용자에게 말한다.

## 배운 점

- **에이전트의 신뢰는 결과의 질보다 과정의 가시성에서 먼저 생긴다.** 답이 맞아도 어디서 왔는지 모르면 다시 확인하게 된다.
- 사용자 키 모델에서는 **요금이 곧 사용자의 돈**이다. 폭주를 막는 장치는 기능이 아니라 기본 예의다.
- "계획 먼저"는 만능이 아니다. 여러 단계를 거치는 작업에서 빛나고, 한 번에 끝나는 일에는 오히려 귀찮은 단계가 된다.

## Aide에 적용하면

Aide 1-b도 **사용자가 고른 제공자를 사용자 키로 앱에서 직접 부르고 서버가 없다**. 이 글과 전제가 같다.

1. **작업당 비용 상한 — 가져온다.** `core:ai` 에 위 스케치 같은 한도를 둔다. 아침 브리핑처럼 앱이 스스로 부르는 호출에는 특히 필요하다. 한도는 설정 화면에서 바꿀 수 있게 하고, 넘으면 아바타가 "요금 한도에 걸려서 멈췄어요"라고 말한다.
2. **작업 기록 칩 — 아바타 상태와 잇는다.** Aide는 "일하는 모습은 진짜 일할 때만" 보여준다는 원칙이 있다. 그 순간에 "캘린더 읽는 중 → 할 일 확인 중"처럼 지금 단계를 한 줄로 보여주면 이 글의 작업 기록과 같은 효과가 난다.
3. **계획 카드 — 지금은 넣지 않는다.** Aide는 "시킨 일은 바로 하고 되돌리기를 준다, 떠올린 일은 묻는다"로 정했다. 1-b의 일은 대부분 한 번에 끝나서 계획 카드는 귀찮은 단계만 늘린다. 여러 단계 작업이 생기는 2차 이후에 다시 본다.
4. **링크 필터 — 이미 같은 모양이다.** AI가 부르는 함수를 Repository의 동작 단위(만들기·지우기·완료·완료 취소)로만 열어 둔 것이 이 글의 "허용된 링크만 읽기"와 같은 역할이다.

## 출처

- [Why my Android AI app shows its plan before it does anything — Grokkris (dev.to)](https://dev.to/grokkris_267433fde5540f5b/why-my-android-ai-app-shows-its-plan-before-it-does-anything-4kmo)
- [Android Weekly #749](https://androidweekly.net/issues/issue-749)
