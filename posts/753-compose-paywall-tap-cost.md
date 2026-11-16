---
issue: 753
date: 2026-11-15
title: 다시 그리지 않아도 다시 계산한다 — Compose 결제 화면에서 한 번 누르는 비용
original_title: "Recalculated, not recomposed: what does one tap cost in a Compose paywall?"
url: https://www.revenuecat.com/blog/engineering/android-paywall-improve
author: Jaewoong Eum (RevenueCat)
tags: [Compose, 성능, derivedStateOf, 측정, 사례]
aide:
  status: candidate
  module: feature:home
  task: 1-b
  summary: Aide에는 지금 느린 화면이 없어 고칠 것은 없다. 대신 "고치기 전에 재고, 고친 것을 되돌려 A/B로 확인한다"는 습관과, 1-b의 AI 대기 표시와 Rive 아바타는 보일 때만 돌린다는 규칙을 가져온다
---

## 한 줄 요약

RevenueCat Android SDK의 **페이월(paywall, 구독 상품을 고르고 결제하는 화면)** 에서 요금제 하나를 누르면 화면이 약 0.4초 멈춘다는 신고가 들어왔다. 원인은 화면을 **다시 그리는 일(리컴포지션)** 이 아니라, 수백 개 컴포넌트가 저마다 "내가 바뀌어야 하나?"를 **다시 계산하는 일** 이었다. `derivedStateOf` 는 값이 같으면 다시 그리기를 건너뛰게 해 주지만, 같은지 알려면 **새 값을 먼저 계산해야** 한다. 저자는 계측 테스트와 **킬 스위치(kill switch, 고친 것을 한 곳에서 꺼서 옛 동작으로 되돌리는 측정용 플래그)** 로 고친 것 하나하나가 얼마나 줄였는지 따로 쟀다. 300개 글자 컴포넌트 화면에서 한 번 누를 때 걸리는 시간이 **700ms에서 184ms** 로 줄었다. 그 밖에 정규식을 누를 때마다 3,000번 새로 만들던 것, `equals` 가 없어 같은 글꼴을 매번 다른 글꼴로 보던 것, 투명하게 숨긴 로딩 표시가 쉬지 않고 화면을 다시 그리게 하던 것도 다룬다. Jaewoong Eum(엄재웅)이 쓴 RevenueCat 엔지니어링 블로그 글이다.

> 원문 그림 5장(표지, 측정 그래프, 움직이는 그림 3개)은 원문 서버 주소를 걸어 보여 준다. 저자 사진 1장은 내용과 관계가 없어 뺐다. 원문 코드 중 **RevenueCat SDK 코드**는 [purchases-android](https://github.com/RevenueCat/purchases-android) 저장소의 라이선스(MIT)를 따라 인용하고, **Compose 런타임 코드**는 AOSP의 Apache 2.0을 따라 인용했다. 블로그에만 있는 예시 코드(선택 목록 예시, 측정 테스트, 킬 스위치)는 라이선스 표시가 없어 옮기지 않고 글로 설명했다. "코드로 보기" 절의 코드는 **직접 쓴 스케치**이거나, 표시해 둔 Aide의 실제 코드다.

## 먼저 알아 둘 말

- **페이월(paywall)**: 앱 안에서 구독 요금제(월간, 연간 등)를 보여 주고 고르게 하는 결제 화면. 이 글의 요금제 카드 하나를 원문은 **패키지(package)** 라고 부른다.
- **RevenueCat**: 앱 구독 결제를 대신 관리해 주는 서비스. 앱에 넣는 Android SDK가 있고, 대시보드에서 페이월을 디자인하면 SDK가 그 화면을 그린다.
- **서버 주도 UI(server driven UI)**: 화면 모양을 앱 코드에 박지 않고 서버가 "어떤 컴포넌트를 어떤 속성으로 놓을지"를 데이터로 내려 주면, 앱이 그 데이터를 받아 그리는 방식. RevenueCat 페이월이 이렇게 동작하고, Android SDK는 Jetpack Compose로 그린다.
- **오버라이드(override)**: 조건이 맞을 때 컴포넌트의 기본 속성 위에 덮어씌우는 일부 속성 묶음. 예: "이 패키지가 선택되면 테두리를 2.5 두께의 강조색으로". Android의 `<selector>` 드로어블에 `state_selected` 를 쓰는 것과 같은 생각을, 아무 컴포넌트의 아무 속성에나 쓸 수 있게 한 것이다.
- **리컴포지션(recomposition)**: 상태가 바뀌어 Compose가 화면 함수를 다시 실행하는 것. 값이 그대로면 건너뛴다(skip).
- **`derivedStateOf`**: 다른 상태들에서 계산한 값을 상태로 만드는 Compose 함수. 계산 안에서 읽은 상태들을 **의존성(dependency)** 으로 기록해 두고, 그중 하나가 바뀌면 다시 계산한다. 계산 결과가 전과 같으면 그 값을 읽는 화면은 다시 그리지 않는다.
- **재계산(recalculation)과 리컴포지션의 차이**: 재계산은 `derivedStateOf` 블록을 다시 실행하는 것, 리컴포지션은 화면 함수를 다시 실행하는 것. 이 글의 제목은 "리컴포지션은 0번이었지만 재계산은 수백 번이었다"는 뜻이다.
- **읽기 관찰자(read observer)**: Compose가 어떤 블록 안에서 상태 객체가 읽힐 때마다 불러 주는 콜백. `derivedStateOf` 는 이것으로 "무엇을 읽었는지"를 모아 의존성으로 삼는다. **실제로 읽은 것만** 의존성이 된다.
- **계측 테스트(instrumented test)**: 기기나 에뮬레이터의 진짜 Android 런타임에서 도는 테스트(`androidTest`). JVM에서만 도는 단위 테스트와 달리 실제 화면을 그릴 수 있다.
- **`waitForIdle`**: Compose 테스트에서 "Compose가 할 일을 다 끝낼 때까지 기다린다"는 함수. 프레임 단위로 기다리므로 측정의 최소 단위가 한 프레임(약 16.7ms)이다.
- **중앙값(median)**: 측정값을 크기순으로 늘어놓았을 때 가운데 값. 가끔 튀는 값에 덜 흔들려 성능 측정에 자주 쓴다.
- **킬 스위치(kill switch)**: 측정용 빌드에만 있는 플래그. 켜면 고친 코드 한 곳이 옛 동작으로 돌아간다. 고친 것 하나만 껐다 켜며 비교하므로, 그 수정이 얼마나 줄였는지 따로 잴 수 있다.
- **`equals`**: 두 객체가 "같은 값"인지 판단하는 함수. 직접 만들지 않으면 Kotlin과 Java는 **같은 객체인지(identity)** 로만 판단한다. 같은 파일을 가리키는 글꼴 객체 두 개도 따로 만들었으면 "다르다"가 된다.
- **그리기 단계(draw phase)**: Compose가 화면을 만드는 세 단계(컴포지션, 레이아웃, 그리기) 중 마지막. 이 단계에서만 읽는 값은 바뀌어도 컴포지션과 레이아웃을 다시 하지 않는다.
- **`graphicsLayer`**: 컴포저블을 별도 그리기 층으로 만들어 투명도, 크기, 회전 같은 것을 바꾸는 Modifier. 람다(lambda, 이름 없는 함수)를 받는 형태로 쓰면 그 안에서 읽는 값은 그리기 단계에서 읽힌다.
- **무한 애니메이션(indeterminate animation)**: 끝이 정해지지 않고 계속 도는 애니메이션. 진행률을 모를 때 쓰는 빙글빙글 도는 로딩 표시(`CircularProgressIndicator`)가 대표적이다.
- **메인 스레드(main thread)**: 화면을 그리고 터치를 받는 하나뿐인 스레드. 여기서 오래 걸리는 일을 하면 그동안 화면이 멈춘다. 메인 스레드는 쌓인 작업을 **한 번에 하나씩** 처리한다.

## 서론 — 누르고 0.4초 멈추는 결제 화면

**RevenueCat Android SDK의 페이월에 대한 문제 신고가 화면 녹화와 함께 들어왔다.**
- 흐린 배경 위에 아래에서 올라오는 시트가 있고, 그 안에 구독 요금제 두 개가 있다.
- 사용자가 두 번째 요금제를 누르면 물결 효과(ripple)가 시작되고, 화면이 **약 0.4초** 멈춘 뒤에야 새 요금제가 선택된다.
- 이 페이월은 RevenueCat Paywalls(서버 주도 UI)로 만든 것이고, Android SDK가 Jetpack Compose로 그린다.
- 원문이 던지는 질문: 한 번 누르는 일이 Compose 트리에게 무엇을 시키길래 20프레임이 넘게 걸리는가.

**원문은 이 녹화에서 출발해 "한 번 누르는 비용"을 안쪽으로 따라간다.** 다루는 것은 이렇다.
- 서버 주도 페이월 뒤의 오버라이드 모델.
- 한 번 누르는 비용을 재는 계측 테스트와 킬 스위치.
- `derivedStateOf` 가 건너뛰는 것과 건너뛰지 못하는 것.
- 조건 입력을 람다로 바꿔 덜 읽기, 정규식 캐시, `equals` 가 없는 글꼴.
- 그리기 단계로 옮긴 작업, 보이지 않는 로딩 표시, 메인 스레드 작업 하나 안에서 순서를 바꾸는 것의 한계.

<figure class="media"><img src="https://cdn.sanity.io/images/c3qnx9b0/production/5823fe635a2cbccdfe3d38050860ec35f81d998b-1600x850.png?w=1600&q=75&auto=format&fit=max" alt="연두색 모눈 바탕. 왼쪽 흰 상자에 큰 글씨로 Recalculated, not recomposed. 오른쪽 위에 빨간 RC 글자 아이콘, 오른쪽 아래에 파란 육각형 Jetpack Compose 로고 아이콘. 주위에 화살표 커서, 번개, 반짝임 선 그림" loading="lazy"><figcaption>원문 표지. "다시 계산됐지만, 다시 그려지지는 않았다(Recalculated, not recomposed)"라는 제목 옆에 RevenueCat 로고와 Jetpack Compose 로고가 있다. 커서와 번개 그림은 "누르는 순간의 비용"이라는 주제를 나타낸다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.revenuecat.com/blog/engineering/android-paywall-improve">원문</a>)</figcaption></figure>

## 1. 근본 문제 — 선택 하나를 모든 컴포넌트가 읽는다

**RevenueCat 페이월은 대시보드에서 디자인되고, 앱에는 컴포넌트 트리(스택, 글자, 그림, 패키지, 버튼)로 도착한다.**
- 어떤 컴포넌트든 오버라이드를 가질 수 있다. 조건은 여러 가지다. "이 컴포넌트가 속한 패키지가 선택됨", "사용자가 첫 구매 할인(intro offer) 대상임", "어디에 있든 선택된 패키지가 연간 요금제임", 또는 창 크기다.
- 선택되면 테두리가 두껍고 색이 바뀌는 요금제 카드는 SDK 모델에서 이렇게 생겼다.

```kotlin
PackageComponent(
    packageId = "\$rc_annual",
    isSelectedByDefault = true,
    stack = StackComponent(
        components = listOf(planName, planPrice),
        border = Border(color = gray, width = 1.0),
        overrides = listOf(
            ComponentOverride(
                conditions = listOf(ComponentOverride.Condition.Selected),
                properties = PartialStackComponent(border = Border(color = accent, width = 2.5)),
            ),
        ),
    ),
)
```

> 출처: 원문에 실린 RevenueCat SDK 모델 예시 ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `packageId = "\$rc_annual"`: 이 카드가 연간 요금제 패키지라는 뜻이다. `isSelectedByDefault = true` 라 처음부터 선택돼 있다.
- `stack`: 카드의 몸통. 요금제 이름과 가격 두 컴포넌트를 담고, 기본 테두리는 회색 두께 1이다.
- `overrides`: 조건 `Selected`(이 패키지가 선택됨)가 맞으면 테두리만 강조색 두께 2.5로 덮어쓴다. `PartialStackComponent` 는 바꿀 속성만 담는 "부분 속성" 객체다.

**오버라이드를 푼다(resolve)는 것은, 지금 상태와 각 오버라이드의 조건을 맞춰 보고, 맞는 것들을 기본 스타일 위에 합치는 일이다.**
- 그 결과가 컴포넌트가 실제로 그릴 속성이다.
- 컴포넌트마다 상태 보관 객체(state holder)가 있고, 이 일을 `derivedStateOf` 안에서 한다. 그래서 읽은 것이 바뀔 때만 다시 푼다.
- 읽는 입력(이 컴포넌트의 패키지가 선택됐는지, 전체에서 어느 패키지가 선택됐는지)은 Compose 상태로 되어 있고, `derivedStateOf` 는 읽은 상태를 모두 의존성으로 기록한다.

**2026년 10월 전까지 `StackComponentState` 는 오버라이드를 이렇게 풀었고, 다른 컴포넌트 상태도 모두 같았다.**

```kotlin
private val presentedPartial by derivedStateOf {
    val windowCondition = ScreenCondition.from(windowSize)
    val componentState =
        if (packageAwareDelegate.isSelected) ComponentViewState.SELECTED else ComponentViewState.DEFAULT

    style.overrides.buildPresentedPartial(
        windowCondition,
        packageAwareDelegate.offerEligibility,
        componentState,
        conditionContext = ConditionContext(
            selectedPackageId = selectedPackageInfoProvider()?.rcPackage?.identifier,
            customVariables = customVariablesProvider(),
            stateReader = stateStoreProvider()::currentValueOrDefault,
            windowDpSize = windowDpSize,
        ),
    )
}
```

> 출처: `StackComponentState` 의 [PR #4383](https://github.com/RevenueCat/purchases-android/pull/4383) 이전 코드 ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `windowCondition`: 창 크기로 "좁음, 중간, 넓음" 조건을 만든다.
- `componentState`: `packageAwareDelegate.isSelected`(이 컴포넌트의 패키지가 선택됐는가)를 **여기서 바로 읽어** 선택됨이나 기본으로 바꾼다.
- `packageAwareDelegate.offerEligibility`: 첫 구매 할인 대상인지 **바로 읽는다.**
- `selectedPackageId = selectedPackageInfoProvider()?.rcPackage?.identifier`: 전체에서 선택된 패키지의 이름을 **바로 읽는다.**
- `buildPresentedPartial(...)`: 위 값들을 받아 오버라이드 조건을 맞춰 본다.

**순서가 문제다.** `isSelected`, `offerEligibility`, 선택된 패키지 이름을 `buildPresentedPartial` 이 조건 하나를 보기도 **전에** 모두 읽는다.
- 그래서 오버라이드가 **하나도 없는** 컴포넌트도 선택을 읽었고, 선택이 의존성이 됐다.
- "선택이 바뀌었다"와 "이 컴포넌트의 입력이 바뀌었다"는 다른 일이다. 누를 때마다 앞의 일은 일어나지만, 뒤의 일은 오버라이드가 선택을 언급하는 컴포넌트에만 일어나야 한다. 옛 코드는 모든 컴포넌트에서 뒤의 일이 일어나게 만들었다.

**Compose로 선택 가능한 목록을 짜 봤다면 같은 모양을 써 봤을 것이다.** (원문 예시 코드는 블로그에만 있어 글로 옮긴다.)
- 원문 예시는 요금제마다 `remember { derivedStateOf { } }` 로 배지 스타일을 구하는데, 블록 첫 줄에서 `selection.selectedId == plan.id` 로 선택 여부를 먼저 읽고, 그다음 `resolveBadgeStyle(plan.badgeRules, isSelected)` 를 부른다.
- 배지 규칙이 선택을 전혀 보지 않는 요금제라면 그 읽기는 쓸데없고, 그런데도 이 배지는 **누를 때마다** 의존성이 바뀐다.
- 항목이 다섯 개인 목록에서는 해가 없다. 원문의 나머지는 이 목록이 **화면 전체**일 때 드는 비용 이야기다.

## 2. 추측하기 전에 재기 — 녹화와 계측 테스트

**처음 의심한 것은 배경이었다. 누를 때마다 시트 뒤의 페이월을 다시 그리고 다시 흐리게 하는 것 아닐까.**
- 녹화를 보면 그럴 가능성이 낮았다. 초당 30프레임으로 뽑아 보니, 누를 때마다 물결이 시작되고, **똑같은 프레임이 열두 장쯤** 이어지고, 한 프레임 만에 새 선택이 나타났다.
- 이 녹화와 두 번째 녹화에서 멈춤은 **0.33초에서 0.50초** 였다.
- 선택이 바뀌는 프레임에서 배경은 바뀌지 않았다. 배경이 움직이던 두 번째 녹화에서는 멈출 때마다 **배경 애니메이션도 같이 멈췄다.** 서로 관계없는 애니메이션이 동시에 멈추면 보통 메인 스레드가 막힌 것이다.

**상태가 바뀐 직후 메인 스레드가 막히면 컴포지션, 레이아웃, 또는 그것들이 부르는 무언가가 원인이다. 어느 것인지 알기 위해 계측 테스트를 썼다.** (테스트 코드는 블로그에만 있어 글로 옮긴다.)
- 진짜 SDK로 페이월을 그리고, UI 스레드에서 선택된 패키지를 바꾸고, Compose가 할 일을 다 끝낼 때까지(`waitForIdle`) 기다린다.
- 반복할 때마다 두 패키지를 번갈아 고르고, 바꾸기 직전과 기다림이 끝난 직후의 `System.nanoTime()` 차이를 밀리초로 바꿔 기록한다.
- 한 번 돌릴 때 준비 선택 6번과 측정 선택 20번을 하고 중앙값을 낸다. 원문의 모든 시간은 이런 실행을 **세 번 이상** 한 것의 중앙값이다.
- 측정용 페이월은 일부러 만든 화면이다. 오버라이드 없는 평범한 글자 N개와 패키지 두 개뿐이고, **흐림 효과는 전혀 없다.** 그런데도 비용이 재현됐으니 흐림은 원인이 아니다.
- N을 바꿔 보면 느려짐에 대해 가장 먼저 물어야 할 질문에 답할 수 있다. **비용이 컴포넌트 수에 따라 늘어나는가, 아니면 누를 때마다 한 번 드는 고정 비용인가?**

**원문의 모든 시간에는 두 가지 주의가 붙는다.**
- Android 15 에뮬레이터, 디버그 빌드에서 쟀다. 그러니 같은 환경에서의 **전후 비교로만** 의미가 있다. 폰이 더 빠르리라는 보장도 없다. 조사 중 다른 페이월의 이전 빌드는 갤럭시 S23에서 한 번에 190ms, Android 14 에뮬레이터에서 112ms가 걸렸다.
- `waitForIdle` 은 프레임 단위로 넘어가므로 해상도는 한 프레임(16.7ms)이고, 가장 빨라도 두 프레임(약 33ms)이다.

**고친 것 하나하나가 얼마나 줄였는지 보려고, 누르기와 관련된 수정마다 킬 스위치를 달았다.**
- 측정용 빌드의 플래그로, 켜면 한 곳에서 옛 동작으로 돌아간다. 플래그를 모두 끄면 지금의 SDK다. 그래서 원문의 "이전" 숫자는 옛 릴리스가 아니라 **지금 SDK에서 수정 하나를 끈 것**이다.
- 스위치 옆에는 한 번 누를 때 일어나는 일을 세는 카운터가 있다. 오버라이드 풀이 횟수, 글자 리컴포지션 횟수, 글꼴 파일 읽기 횟수, 변수 처리 횟수(글자 템플릿을 몇 번 처리했는지)다.

**글자 300개 화면에서 한 번 누를 때, 이 글의 주된 수정인 [#4383](https://github.com/RevenueCat/purchases-android/pull/4383) 을 끄고 켠 결과다.**

| 상태 | 한 번 누를 때 걸린 시간 | 오버라이드 풀이 | 글자 리컴포지션 | 변수 처리 |
|---|---|---|---|---|
| #4383을 끈 빌드 | 한 번에 700ms가 걸렸다. | 308번 풀었다. | 0번이었다. | 600번 처리했다. |
| 지금의 SDK | 한 번에 184ms가 걸렸다. | 0번 풀었다. | 0번이었다. | 600번 처리했다. |

<figure class="media"><img src="https://cdn.sanity.io/images/c3qnx9b0/production/a369d883df9b62f5148d459b80a3c83ddb8eb659-1600x1089.png?w=1600&q=100&auto=format&fit=max" alt="선 그래프. 제목 Median time per package tap. 부제 Synthetic paywall of plain texts, Android 15 emulator, debug build, 20 taps per run, median of 4 runs. 가로축 Text components on the paywall 20, 100, 300. 세로축 0부터 750 ms. 주황 선 #4383 switched off는 20개에서 약 65 ms, 100개에서 183 ms, 300개에서 700 ms로 가파르게 오른다. 파란 선 Current SDK는 20개에서 약 35 ms, 100개에서 67 ms, 300개에서 184 ms로 완만하게 오른다. 아래 주석 The test advances in whole frames: one frame is 16.7 ms and the fastest possible result is two frames, about 33 ms" loading="lazy"><figcaption>원문 그래프 "패키지를 한 번 누를 때 걸린 시간의 중앙값". 오버라이드 없는 평범한 글자만 있는 페이월, Android 15 에뮬레이터, 디버그 빌드, 한 번 돌릴 때 20번 누르고 4번 돌린 중앙값이다. 가로축은 화면의 글자 컴포넌트 수(20, 100, 300개)다. 주황 선(#4383을 끈 빌드)은 20개에서 약 65ms, 100개에서 183ms, 300개에서 700ms로 가파르게 오른다. 파란 선(지금의 SDK)은 20개에서 약 35ms, 100개에서 67ms, 300개에서 184ms로 완만하게 오른다. 아래 주석은 "테스트는 프레임 단위로 넘어가므로 한 프레임은 16.7ms이고, 가장 빠른 결과는 두 프레임인 약 33ms"라고 적는다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.revenuecat.com/blog/engineering/android-paywall-improve">원문</a>)</figcaption></figure>

**두 선 모두 글자 수에 따라 올라간다. 그러니 이것은 파일 읽기 같은 한 번짜리 비용이 아니라, 누를 때마다 모든 컴포넌트가 하는 일이다.**
- 카운터가 어디로 갔는지 보여 준다. 한 번 누를 때 오버라이드 풀이 308번, 변수 처리 600번인데, 글자 리컴포지션은 **0번** 이다.
- Compose는 화면의 모든 글자를 올바르게 건너뛰었다. 어느 것도 달라 보이지 않았기 때문이다.
- 700ms의 거의 전부가 **값을 다시 계산했더니 그대로였다는 것을 알아내는 데** 들었다.

## 3. derivedStateOf의 건너뛰기 — 리컴포지션은 건너뛰지만 재계산은 건너뛰지 못한다

**건너뛰기가 왜 비쌀 수 있는지 보려면, `derivedStateOf` 가 읽은 상태가 바뀔 때 Compose 런타임이 무엇을 하는지 봐야 한다.**
- 컴포지션은 그 파생 상태를 읽었던 범위(scope)를 모두 "바뀌었을지도 모름" 목록에 올린다.
- 그 범위를 다시 실행하기 직전에, 파생 값이 **정말** 바뀌었는지 확인한다.
- SDK가 쓰는 런타임(1.11.4)과 최신 안정판(1.12.1)에서 이 확인은 `RecomposeScopeImpl` 의 `checkDerivedStateChanged` 다.

```kotlin
private fun DerivedState<*>.checkDerivedStateChanged(
    dependencies: MutableScatterMap<DerivedState<*>, Any?>
): Boolean {
    @Suppress("UNCHECKED_CAST")
    this as DerivedState<Any?>
    val policy = policy ?: structuralEqualityPolicy()
    return !policy.equivalent(currentRecord.currentValue, dependencies[this])
}
```

> 출처: Compose 런타임 `RecomposeScopeImpl.kt` ([AOSP androidx](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/RecomposeScopeImpl.kt), Apache 2.0)

- `policy ?: structuralEqualityPolicy()`: 비교 규칙을 따로 정하지 않았으면 `==`(구조적 동등, 값이 같은지)로 비교한다.
- `dependencies[this]`: 이 범위가 **지난번에 본** 파생 값이다.
- `currentRecord.currentValue`: 여기서 일이 일어난다. 의존성 중 하나라도 지난 계산 뒤에 바뀌었으면, 이 값을 읽는 순간 **계산을 다시 돌린다.**
- 두 값이 같으면(`equivalent`) `false` 를 돌려주고, 그 범위는 다시 실행되지 않는다.

**그래서 한 번 누르면 이런 단계를 거친다.**
1. 선택된 패키지가 바뀐다.
2. 그것을 읽은 파생 상태가 모두 낡은 상태가 된다.
3. 각 읽는 범위를 다시 실행하기 전에, Compose가 파생 상태를 **다시 계산하고**, 범위가 지난번에 본 값과 `==` 로 비교한다.
4. 둘이 같으면 그 범위는 건너뛴다.

**4단계가 `derivedStateOf` 로 유명한 부분이고, 실제로 잘 동작했다. 아무것도 다시 그려지지 않았다.**
- 잊기 쉬운 것은 3단계다. 새 값이 옛 값과 같다는 것을 아는 유일한 방법은 **새 값을 계산해 보는 것**이라 지름길이 없다.

**비용을 곱절로 만드는 것이 하나 더 있다.**
- 비교 규칙을 따로 주지 않은 `derivedStateOf` 는 다시 계산할 때마다, 결과가 같아도 **새 기록(record)** 을 남긴다.
- 그래서 그 위에 쌓은 파생 상태는 "의존성이 바뀌었다"고 보고 자기도 다시 계산한다.
- `TextComponentState` 에서 `presentedPartial` 은 비공개라 컴포지션이 직접 읽지 않는다. 대신 거기서 나온 속성 십여 개(`visible`, `text`, `color`, `fontSize`, `padding`, `fontFamily` 등)를 읽는데, 누를 때마다, 글자마다, 이 속성들이 **각각** 다시 계산되고 비교됐다.

## 4. 덜 읽기 — 조건 입력을 람다로

**#4383의 앞쪽 절반은 이 사슬을 싸게 만들지 않는다. 영향을 받을 수 없는 컴포넌트에서 의존성 자체를 없앤다.**
- 조건 입력을 값이 아니라 **람다**로 바꾸고, 각 조건은 자기에게 필요한 람다만 부른다.

```kotlin
private fun ComponentOverride.Condition.evaluate(
    windowSize: ScreenCondition,
    offerEligibility: () -> OfferEligibility,
    state: () -> ComponentViewState,
    conditionContext: ConditionContext,
): Boolean = when (this) {
    ComponentOverride.Condition.Compact,
    ComponentOverride.Condition.Medium,
    ComponentOverride.Condition.Expanded,
    -> windowSize.applicableConditions.contains(this)
    ComponentOverride.Condition.IntroOffer -> offerEligibility().isIntroOffer
    ComponentOverride.Condition.Selected -> state() == ComponentViewState.SELECTED
    is ComponentOverride.Condition.SelectedPackage -> evaluate(conditionContext.selectedPackageId())
    // ...the other conditions follow the same pattern
}
```

> 출처: [PR #4383](https://github.com/RevenueCat/purchases-android/pull/4383) 이후의 조건 평가 코드, 원문이 줄인 형태 ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `offerEligibility: () -> OfferEligibility` 와 `state: () -> ComponentViewState`: 값 대신 "부르면 값을 주는 함수"를 받는다.
- 창 크기 조건(`Compact`, `Medium`, `Expanded`): 창 크기만 보고, 선택이나 할인 자격은 읽지 않는다.
- `IntroOffer`: 이 갈래에서만 `offerEligibility()` 를 부른다.
- `Selected`: 이 갈래에서만 `state()` 를 불러 선택됐는지 본다.
- `SelectedPackage`: 이 갈래에서만 선택된 패키지 이름을 읽는다.
- 실제 `when` 에는 조건 종류가 더 있고, 모든 갈래가 같은 규칙을 따른다. **람다는 그 값이 필요한 갈래 안에서만 실행된다.**
- 부르는 쪽도 계산한 값 대신 `state = { if (packageAwareDelegate.isSelected) SELECTED else DEFAULT }` 같은 람다를 넘긴다.

**왜 람다로 바꾸면 의존성이 바뀌는가. 파생 상태는 "읽을 수도 있는 것"이 아니라 계산이 "실제로 읽은 것"을 보고 의존성을 배우기 때문이다.**
- `DerivedSnapshotState` 안에서 계산은 읽기 관찰자 아래에서 돈다. 블록 안에서 상태 객체가 읽힐 때마다 Compose가 콜백을 부른다.
- 원문은 그 핵심을 줄여 보여 준다(원문 저자가 줄인 형태라 글로 옮긴다). `Snapshot.observe` 의 첫 인자로 넘긴 콜백이 읽힌 객체를 받아, 자기 자신이면 "파생 상태 계산은 자기를 읽을 수 없다"는 오류를 내고, 상태 객체(`StateObject`)면 `newDependencies` 에 "몇 단계 중첩된 읽기인지"와 함께 넣는다. 세 번째 인자가 실제 계산이다.
- 계산 중에 읽힌 상태 객체는 모두 `newDependencies` 에 들어가고, **그 밖의 것은 들어가지 않는다.**
- 한 번도 불리지 않은 람다는 선택을 읽지 않으므로, 선택은 의존성이 되지 않는다. 오버라이드가 선택을 언급하지 않는 컴포넌트는 누를 때 아무것도 다시 풀지 않는다. 읽은 것 중 바뀐 것이 없기 때문이다.

**원문이 권하는 습관: `derivedStateOf` 안에서, 또는 읽기를 추적하는 모든 범위(컴포저블 본문, `snapshotFlow`, 레이아웃 블록, 그리기 블록) 안에서, 상태는 그 값을 쓰는 경로에서만 읽는다.**
- 원문은 앞의 배지 예시를 고친 모양도 보여 준다(블로그에만 있는 코드라 글로 옮긴다). `resolveBadgeStyle` 이 `isSelected` 를 `Boolean` 대신 `() -> Boolean` 으로 받고, 넘기는 쪽은 `{ selection.selectedId == plan.id }` 람다를 넘긴다. 규칙 중 선택을 보는 것이 있을 때만 그 람다가 불린다.

**이 절반의 킬 스위치는 `buildPresentedPartial` 맨 위에 있다.** (측정용 빌드 코드라 글로 옮긴다.)
- 플래그 `PerfKnobs.eagerConditionReads` 가 켜지면 `offerEligibility()`, `state()`, `conditionContext.selectedPackageId()` 를 **맨 앞에서 모두 불러**, 옛 코드가 가졌던 의존성을 다시 만든다.
- 이 절반만 끄면 글자 300개 화면이 한 번에 **450ms** 가 걸렸다(지금 SDK는 184ms).
- RevenueCat의 실제 페이월 템플릿(컴포넌트 89개, 선택 상태 오버라이드와 가격 변수가 있는 디자인)에서는 한 번 누를 때 오버라이드 풀이가 **99번에서 22번** 으로 줄었다. 남은 22번은 요금제 카드처럼 오버라이드가 정말 선택에 달린 컴포넌트다.

## 5. #4383의 나머지 절반 — 한 번 누를 때 정규식을 3,000번 만들었다

**카운터가 두 번째 비용을 드러냈다. 페이월의 글자는 템플릿이다.**
- `{{ product.price_per_period }}` 같은 변수가 진짜 가격으로 바뀐다. 패키지 바깥에 있는 변수는 **선택된 패키지**를 가리킨다.
- 그래서 패키지 바깥의 모든 글자는 선택을 읽고, 누를 때마다 템플릿을 **두 번** 다시 처리한다. 한 번은 화면용, 한 번은 화면 읽기 프로그램(screen reader)이 소리 내어 읽는 용도다. 예를 들어 화면에는 "$9.99/mo", 소리로는 "$9.99 monthly"가 된다.
- 글자 300개에 변수 처리 600번이 여기서 나온다.

**소리 내어 읽는 용도의 처리는 기간 줄임말(mo, yr 등)을 정규식으로 풀어 쓴다. 정규식은 실행하는 것보다 만드는(컴파일하는) 것이 훨씬 비싸서 보통 한 번만 만든다. 고치기 전에는 부를 때마다 만들었다.**

```kotlin
val replacements = spokenPeriodKeys
    .mapNotNull { (writtenKey, spokenKey) ->
        val written = localizedVariableKeys[writtenKey]?.takeIf { it.isNotEmpty() }
        val spokenWord = localizedVariableKeys[spokenKey]?.takeIf { it.isNotEmpty() }
        if (written != null && spokenWord != null) written to spokenWord else null
    }
    .sortedByDescending { (written, _) -> written.length }
    .map { (written, spokenWord) ->
        Regex("/\\s*${Regex.escape(written)}(?!\\p{L})", RegexOption.IGNORE_CASE) to " $spokenWord"
    }
```

> 출처: 소리 내어 읽는 용도의 변수 처리 코드, [PR #4383](https://github.com/RevenueCat/purchases-android/pull/4383) 이전 ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `spokenPeriodKeys`: "적는 줄임말 키"와 "읽는 단어 키"의 쌍 목록이다.
- `mapNotNull { }`: 현재 언어에서 두 키의 번역(`localizedVariableKeys`)을 찾아, 둘 다 있는 쌍만 남긴다.
- `sortedByDescending { written.length }`: 긴 줄임말부터 바꾸도록 정렬한다. 짧은 것을 먼저 바꾸면 긴 것의 일부가 잘못 바뀔 수 있기 때문이다.
- `.map { Regex(...) }`: 쌍마다 "`/` 뒤 공백, 그다음 줄임말, 그 뒤에 글자가 오지 않음"을 찾는 정규식을 대소문자 무시로 **새로 만든다.** 이 함수가 불릴 때마다 만든다.

**`spokenPeriodKeys` 에는 "day"부터 "annual"까지 짧은 꼴과 긴 꼴 열 개가 있고, 영어는 열 개 모두 정의돼 있다.**
- 그러니 소리용 처리 한 번에 정규식 10개를 만들고, 글자 300개면 **한 번 누를 때 정규식 3,000개** 를 만들었다.
- #4383의 나머지 절반은 만든 정규식 목록을 그 재료인 단어 쌍 옆에 두고, 단어가 그대로면 다시 쓴다. 페이월에서는 결국 **한 번만** 만든다.

**이 수정은 변수 처리를 드물게 하는 것이 아니라 싸게 한다. 그래서 위 표의 변수 처리 횟수(600번)는 그대로다.**
- 캐시만 끄면 한 번에 433ms(지금 SDK는 184ms).
- #4383의 두 절반은 비용이 비슷하고, 서로 더해진다. 둘 다 끄면 글자 300개 화면이 700ms다.
- 컴포넌트 89개 템플릿에서는 같은 비교가 100ms 대 50ms였다.

## 6. derivedStateOf가 두 값을 구별하지 못할 때 — equals 없는 글꼴

**"다시 계산했더니 같아서 건너뜀"은 그나마 싼 경우다. 이번에는 절대 "같음"으로 끝날 수 없는 재계산이다.**
- 대시보드에 올린 글꼴은 SDK가 내려받아 파일에서 읽는다. `FontSpec.Downloaded.resolve()` 는 부를 때마다 **새 `LocalFileFont` 객체들로** `FontFamily` 를 만든다.
- `LocalFileFont` 도, 그 부모인 Compose의 `AndroidFont` 도 `equals` 를 직접 만들지 않았다. `equals` 가 없는 클래스는 같은 객체인지로만 비교되므로, 같은 파일을 가리키는 두 글꼴도 다른 객체다. `FontFamily` 는 글꼴 목록을 비교하므로, 같은 파일로 만든 두 글꼴 묶음도 **절대 같지 않았다.**

**글자의 `fontFamily` 는 글꼴 정보(font spec)에서 나온 파생 상태이고, 글꼴 정보는 풀린 오버라이드에서 나온다.**
- #4383 전에는 오버라이드가 선택을 읽었으므로, 누르면 두 단계 아래 글꼴까지 다시 계산됐다.
- 다시 계산할 때마다 Compose가 "같은 글꼴"로 알아볼 수 없는 새 글꼴 객체가 나와서, 누를 때마다 글꼴이 바뀐 것처럼 보였다. 이어지는 일은 이렇다.
  1. 새 `FontFamily` 가 이전 것과 같지 않으니 `checkDerivedStateChanged` 가 "바뀜"을 알리고, 글자가 다시 그려진다.
  2. 글자의 레이아웃을 다시 하고, `FontFamilyResolver`(`FontFamily` 를 Android `Typeface` 로 바꾸는 Compose 부품)가 캐시에서 이 글꼴 묶음을 찾는다.
  3. 캐시 열쇠는 글꼴 묶음을 포함한 `data class` 다. `data class` 는 모든 칸을 비교하므로 글꼴 묶음이 같아야 열쇠가 맞는데, 한 번도 같지 않았다.
  4. 그 아래 글꼴별 캐시도 글꼴의 `equals` 로 찾으니 역시 빗나간다.
  5. 글꼴 읽기 방식이 `Blocking`(글자를 그리기 전에, 요청한 스레드에서 반드시 읽어야 함)이라, **메인 스레드에서 파일을 다시 해석한다.**

**[#4245](https://github.com/RevenueCat/purchases-android/pull/4245) 가 `LocalFileFont` 에 값 기준 `equals` 와, 같은 네 칸으로 만든 `hashCode` 를 주었다.**

```kotlin
override fun equals(other: Any?): Boolean {
    if (this === other) return true
    if (other !is LocalFileFont) return false
    return file == other.file &&
        weight == other.weight &&
        style == other.style &&
        fileTypefaceLoader == other.fileTypefaceLoader
}
```

> 출처: `LocalFileFont.equals`, [PR #4245](https://github.com/RevenueCat/purchases-android/pull/4245) ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `this === other`: 같은 객체면 바로 같다.
- `other !is LocalFileFont`: 종류가 다르면 다르다.
- 나머지: 파일, 굵기, 기울임, 글꼴을 읽는 부품 네 칸이 모두 같으면 같은 글꼴로 본다. `hashCode` 도 같은 네 칸으로 만들어야 해시 기반 캐시에서 제대로 찾는다.

**내려받은 글꼴을 쓰는 글자 300개 화면에서 잰 결과다.**

| 상태 | 한 번 누를 때 걸린 시간 | 글자 리컴포지션 | 글꼴 파일 읽기 |
|---|---|---|---|
| #4245와 #4383을 모두 끈 빌드 | 한 번에 833ms가 걸렸다. | 300번 다시 그렸다. | 300번 읽었다. |
| #4245만 되살린 빌드 | 한 번에 667ms가 걸렸다. | 0번이었다. | 0번이었다. |

**글꼴 수정은 신고를 조사하는 도중에 출시됐는데, 신고자는 그 릴리스에서 눈에 띄는 차이를 못 느꼈다.**
- 결함은 진짜였고 비용도 진짜였다. 하지만 **결함이 있다는 것을 증명하는 것과, 그 결함이 지금 쫓는 증상의 원인이라는 것을 증명하는 것은 다르다.**
- 측정해 보니 나중에 #4383이 없앤 두 비용이 더 컸다.

**두 수정은 서로 영향을 준다.**
- #4383이 들어간 뒤에는 평범한 글자의 글꼴이 누를 때 다시 계산되지 않는다. 그래서 지금 `equals` 를 꺼도 선택에는 차이가 없다(켜면 193ms, 끄면 184ms로 한 프레임 안).
- 하지만 글꼴이 다시 계산되는 곳(예: 오버라이드가 선택을 읽는 요금제 카드 안의 글자)에서는 여전히 중요하다.
- Snapshot 상태에 들어가는 값은, 오늘의 코드 경로가 그것을 쓰든 안 쓰든 **제대로 된 `equals` 가 있어야 한다.**

**세 비용을 화면으로 보여 주는 시연이다.**
- 글자 148개와 내려받은 글꼴이 있는 일부러 만든 페이월을 진짜 SDK로, 같은 에뮬레이터와 디버그 빌드에서 그리고, `adb shell input tap` 으로 요금제를 누른다.
- 위쪽 표시 칸이 누를 때마다 비용을 보여 준다. 오버라이드 풀이는 "override calcs"로 줄여 적었다. 표시 칸의 빙글 도는 표시는 메인 스레드의 Compose 프레임 시계로 돌아서, 메인 스레드가 바쁘면 멈춘다.
- 왼쪽은 #4245와 #4383을 끈 빌드로, 첫 번째 누르기(둘 다 더 느리다) 뒤에는 한 번에 약 360ms가 걸린다. 오른쪽은 지금의 SDK로 약 75ms다.
- 변수 처리는 거의 같다(296번과 288번). 148개 중 144개 글자가 패키지 바깥에 있어 여전히 선택된 패키지를 읽기 때문이다.
- 표시 칸은 진짜 누르기가 일으키는 모든 일(선택이 바뀌기 전에 클릭 처리기가 하는 검사 포함)을 세므로, 계측 테스트 숫자와 바로 비교할 수 없다.

<figure class="media"><img src="https://cdn.sanity.io/images/c3qnx9b0/production/7cc1e94e253f170b2ebeb866b2970df39e919179-766x528.gif" alt="움직이는 그림. 같은 페이월 화면 두 개가 나란히 있다. 위쪽 검은 표시 칸에 빙글 도는 표시와 숫자. 왼쪽은 BEFORE #4245 and #4383, tap → frame 361 ms, override calcs 169, text recomps 148, font loads 148, variable passes 296. 오른쪽은 AFTER current SDK, tap → frame 79 ms, override calcs 10, text recomps 0, font loads 0, variable passes 288. 아래는 Unlock Premium 제목, Everything you need, on every device 부제, Annual $67.99/year 카드와 Monthly $7.99/month 카드, WHAT YOU GET 아래 Unlimited projects, Sync across all your devices 같은 체크 목록. 시간이 지나면 왼쪽 383 ms, 오른쪽 69 ms로 바뀐다" loading="lazy"><figcaption>원문 시연 그림. 같은 "Unlock Premium" 페이월(연간 $67.99와 월간 $7.99 카드, 그 아래 혜택 목록)을 왼쪽은 #4245와 #4383을 끈 빌드, 오른쪽은 지금의 SDK로 그리고 요금제를 번갈아 누른다. 위쪽 표시 칸에 누를 때마다의 숫자가 뜬다. 왼쪽은 누르고 화면이 바뀌기까지 361ms에서 383ms, 오버라이드 풀이 169번, 글자 리컴포지션 148번, 글꼴 읽기 148번, 변수 처리 296번이다. 오른쪽은 69ms에서 79ms, 오버라이드 풀이 10번, 글자 리컴포지션 0번, 글꼴 읽기 0번, 변수 처리 288번이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.revenuecat.com/blog/engineering/android-paywall-improve">원문</a>)</figcaption></figure>

## 7. 작은 점검 수정들 — 입력이 바뀌는 것보다 더 자주 하던 일

**신고 녹화가 오기 일주일 전, 페이월 렌더러를 Compose 관점에서 점검해 입력이 바뀌는 것보다 더 자주 일하는 곳 세 군데를 더 찾았다. 어느 것도 누르는 시간과 견주어 재지는 않았다.**
- **Markdown 해석([#4194](https://github.com/RevenueCat/purchases-android/pull/4194))**: 모든 글자의 마지막 그리기 부품인 `Markdown` 의 CommonMark 해석을 리컴포지션마다 하지 않고 `remember(text)` 로 감쌌다. 카운트다운 글자는 1초마다 다시 그려지고, #4245 전에는 내려받은 글꼴을 쓰는 모든 글자가 누를 때마다 다시 그려졌다.
- **그림자([#4195](https://github.com/RevenueCat/purchases-android/pull/4195))**: `drawBehind` 가 그릴 때마다 만들던 외곽선, 경로(Path), `Paint`, `BlurMaskFilter` 를 `drawWithCache` 안에서 만들게 했다. 이제 그릴 때마다는 자르고 칠하기만 한다.
- **창 크기 등급([#4200](https://github.com/RevenueCat/purchases-android/pull/4200))**: 컴포넌트마다 `currentWindowAdaptiveInfo()` 를 불러 창 레이아웃 흐름을 모으고 있었는데, 실제로 쓰는 것은 너비 등급뿐이었다. 이제 창 크기와 화면 밀도에서 바로 구하는 도우미 함수를 쓴다.
- 앞의 두 수정에서는 Paparazzi(화면 캡처 테스트 도구) 스크린샷 279장이 전후로 **한 바이트도 다르지 않았다.** 이것은 보이는 것이 바뀌지 않았다는 증거이지, 빨라졌다는 증거는 아니다.

## 8. 그리기 단계의 애니메이션 — 버튼 흐리게 하기

**누르는 것은 요금제만이 아니고, 버튼에는 버튼대로 프레임마다 드는 비용이 있었다.**
- 버튼의 동작(결제 등)이 진행 중이면 버튼 내용이 서서히 사라지고 로딩 표시가 서서히 나타난다.
- `ButtonComponentView` 는 내용의 투명도를 `animateFloatAsState` 로 움직이고 그 `Float` 를 `StackComponentView` 에 넘겼다. 그래서 사라지는 동안 **프레임마다 버튼 스택 전체가 다시 그려졌다.**
- [#4201](https://github.com/RevenueCat/purchases-android/pull/4201) 은 스택에 값 대신 **값을 주는 함수(provider)** 를 넘기고, 스택은 `graphicsLayer` 의 람다 안에서 그것을 읽는다.

```kotlin
private fun Modifier.contentAlpha(provider: (() -> Float)?): Modifier =
    applyIfNotNull(provider) { alpha ->
        graphicsLayer {
            this.alpha = alpha()
            clip = true
        }
    }
```

> 출처: 버튼 내용 투명도 Modifier, [PR #4201](https://github.com/RevenueCat/purchases-android/pull/4201) ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `provider: (() -> Float)?`: 투명도 값을 주는 함수. 없으면(`null`) 아무것도 하지 않는다.
- `applyIfNotNull(provider) { }`: 함수가 있을 때만 뒤의 Modifier를 붙인다.
- `graphicsLayer { this.alpha = alpha() }`: Compose는 이 람다를 **층의 속성을 갱신할 때** 실행한다. 그래서 투명도 값이 바뀌어도 스택을 다시 그리거나 레이아웃을 다시 하지 않고 층만 바꾼다.
- 버튼이 완전히 불투명한 동안은 함수가 `null` 이라 흔한 경우에 쓸데없는 층이 생기지 않는다. 값이 1인 `Modifier.alpha` 와 같은 효과다.

**하지만 출시된 코드도 버튼 자체는 여전히 다시 그린다. 함수를 넘길지 말지를 컴포저블 본문에서 애니메이션 값을 읽어 정하기 때문이다.**

```kotlin
val contentAlphaProvider: (() -> Float)? = if (animatedContentAlpha.value == 1f) {
    null
} else {
    remember(animatedContentAlpha) { { animatedContentAlpha.value } }
}
```

> 출처: `ButtonComponentView` 의 투명도 함수 결정 코드, [PR #4201](https://github.com/RevenueCat/purchases-android/pull/4201) ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- `animatedContentAlpha.value == 1f`: **본문에서** `.value` 를 읽는다. 이 읽기 때문에 버튼은 애니메이션의 **모든 프레임**을 구독한다. `== 1f` 의 답은 두 번밖에 바뀌지 않는데도 그렇다.
- `remember(animatedContentAlpha) { { animatedContentAlpha.value } }`: 같은 람다를 기억해 두고 넘기므로, 스택은 같은 함수를 받아 건너뛴다. 하지만 버튼은 건너뛰지 못한다.

**원문 시연은 이 읽기만 떼어 낸 작은 앱(릴리스 모드, Compose BOM 2026.09.00)에서, 한 번 누를 때 버튼 범위와 스택 범위가 몇 번 실행되는지 센다.**
- 세 번째 방식은 그 확인을 `derivedStateOf { animatedContentAlpha.value != 1f }` 로 옮긴 것이다. 그러면 버튼은 "1인가 아닌가"가 바뀔 때만 다시 그려진다.
- 숫자에는 첫 컴포지션이 포함된다. 한 번 누를 때 `Float` 방식은 두 범위 모두 약 60번, 출시된 함수 방식은 버튼 약 60번과 스택 2번, `derivedStateOf` 방식은 버튼 4번과 스택 2번이었다.
- 실제 `ButtonComponentView` 는 로딩 표시의 투명도도 본문에서 읽으므로, 그 읽기도 컴포지션 밖으로 옮겨야 한다.

<figure class="media"><img src="https://cdn.sanity.io/images/c3qnx9b0/production/782202e84f3c65dafbb2daa62cd1553329925320-540x570.gif" alt="움직이는 그림. 제목 Dimming a button while it works. 보라색 Continue 버튼 세 개가 세로로 있다. 1. Float parameter (before #4201), 그 아래 button scope와 stack scope 숫자. 2. Provider, as shipped in #4201. 3. Provider + derivedStateOf null check. 버튼을 누르면 버튼 글자가 흐려졌다 돌아오고 아래 숫자가 올라간다. 마지막에 1번은 button scope 63, stack scope 61, 2번은 button scope 63, stack scope 3, 3번은 button scope 5, stack scope 3" loading="lazy"><figcaption>원문 시연 그림 "일하는 동안 버튼 흐리게 하기". 같은 "Continue" 버튼을 세 방식으로 만들고, 누를 때 버튼 범위(button scope)와 스택 범위(stack scope)가 몇 번 실행되는지 아래에 센다. 1번 "Float 매개변수(#4201 이전)"는 마지막에 버튼 63번, 스택 61번이다. 2번 "#4201에서 출시된 함수 방식"은 버튼 63번, 스택 3번이다. 3번 "함수 방식과 derivedStateOf로 null 확인"은 버튼 5번, 스택 3번이다. 숫자에는 첫 컴포지션이 포함된다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.revenuecat.com/blog/engineering/android-paywall-improve">원문</a>)</figcaption></figure>

## 9. 아무도 부탁하지 않은 프레임 — 보이지 않는 로딩 표시

**두 번째 신고는 패키지를 누른 뒤 페이월이 갱신을 멈춘다는 것이었다. 이번에는 Android 10 폰의 Flutter 앱이었다([purchases-flutter#1954](https://github.com/RevenueCat/purchases-flutter/issues/1954)).**
- 신고자는 아무도 건드리지 않는데도 페이월이 **계속 다시 그려진다**는 것도 알아챘다. `dumpsys gfxinfo`(그려진 프레임 수를 보여 주는 명령)에 따르면 5초에 307프레임이었다.
- 이 이슈를 맡은 RevenueCat 엔지니어가 컴포넌트 종류를 하나씩 시험해 보니, **버튼만** 이랬다.

**원인은 버튼의 로딩 표시였다. 늘 컴포즈돼 있고, 쉴 때는 투명도만 0으로 움직여 두었다.**

```kotlin
CircularProgressIndicator(
    modifier = Modifier.alpha(animatedProgressAlpha),
    color = progressColorFor(style.stackComponentStyle.background),
)
```

> 출처: 버튼 로딩 표시, [PR #4442](https://github.com/RevenueCat/purchases-android/pull/4442) 이전 ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- 진행률이 없는 `CircularProgressIndicator` 는 **무한 애니메이션**을 돌리고, 투명도 0은 그 애니메이션을 멈추지 않는다.
- 애니메이션 프레임마다 로딩 표시의 그림이 무효화되고, 무효화될 때마다 창이 새 프레임을 그린다. 그래서 보이지 않는 로딩 표시 하나가 **페이월 전체를 화면 주사율로 계속 그리게** 했다.
- Flutter 앱에서 네이티브 페이월은 작은 버퍼 대기열에 그려지고, Flutter가 거기서 읽는다. 누른 뒤 로그에는 그 대기열이 밀리고, `Skipped 36 frames!` 가 나오고, 화면 표면(surface)이 끊어진 뒤 Flutter가 마지막 프레임만 계속 보여 줬다.
- 신고자는 쉬지 않고 나오는 프레임을 의심했다. 그것만 없애서 그 폰이 고쳐졌는지는 **확인되지 않았지만**, 프레임 흐름 자체는 진짜였다.

**[#4442](https://github.com/RevenueCat/purchases-android/pull/4442) 는 로딩 표시를 보일 때만 컴포즈한다.**

```kotlin
// The indeterminate indicator animates forever, so composing it at alpha 0 redraws the paywall
// every frame while idle.
if (animatedProgressAlpha > 0f) {
    CircularProgressIndicator(
        modifier = Modifier.alpha(animatedProgressAlpha),
        color = progressColorFor(style.stackComponentStyle.background),
    )
}
```

> 출처: 버튼 로딩 표시, [PR #4442](https://github.com/RevenueCat/purchases-android/pull/4442) ([RevenueCat/purchases-android](https://github.com/RevenueCat/purchases-android), MIT)

- 주석의 뜻: 진행률 없는 표시는 영원히 움직이므로, 투명도 0으로 컴포즈해 두면 쉬는 동안에도 페이월을 프레임마다 다시 그린다.
- `if (animatedProgressAlpha > 0f)`: 조금이라도 보일 때만 로딩 표시를 만든다. 완전히 투명해지면 컴포지션에서 빠지고, 무한 애니메이션도 함께 멈춘다.

**원문 에뮬레이터에서 옛 동작을 다시 켠 채 아무도 건드리지 않은 페이월은 5초에 302에서 303프레임을 그렸다(세 번 실행). 고친 뒤에는 0프레임이었다.**

<figure class="media"><img src="https://cdn.sanity.io/images/c3qnx9b0/production/e62b528662bc7c71aa46d41a406d0c3264a2e055-726x800.gif" alt="움직이는 그림. 같은 Unlock Premium 페이월 화면 두 개가 나란히 있다. 왼쪽 위 검은 띠에 BEFORE #4442, spinner composed at alpha 0. 오른쪽 위에 AFTER current SDK, spinner composed only while visible. 아래쪽에 Continue 버튼. 왼쪽 화면 아래에는 주황색 막대들이 빽빽하게 계속 오른쪽에서 왼쪽으로 쌓여 흐른다. 오른쪽 화면에는 오른쪽 가장자리에 세로로 긴 색 띠 하나만 있고 새 막대가 생기지 않는다" loading="lazy"><figcaption>원문 시연 그림. 같은 페이월을 왼쪽은 #4442 이전(로딩 표시를 투명도 0으로 컴포즈), 오른쪽은 지금의 SDK(보일 때만 컴포즈)로 띄우고 아무것도 건드리지 않는다. 개발자 옵션 "HWUI 렌더링 프로파일"을 켜서, 그려진 프레임마다 화면 아래에 막대가 하나씩 생긴다. 에뮬레이터는 프레임 교체가 느려 막대 높이는 무시하고, 새 막대가 계속 생기는지만 보면 된다. 왼쪽은 주황 막대가 쉬지 않고 새로 쌓인다. 오른쪽의 오른쪽 가장자리에 있는 긴 띠는 실행 직후 첫 프레임들이 남긴 것이고, 그 뒤로 새 막대가 생기지 않는다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.revenuecat.com/blog/engineering/android-paywall-improve">원문</a>)</figcaption></figure>

**원문이 남기는 규칙: 움직이는 컴포넌트를 투명도로 숨긴다면 그 애니메이션이 무한인지 확인한다. 투명도는 사용자가 무엇을 보는지를 정할 뿐, 프레임을 만들지 말지는 정하지 않는다.**

## 10. 순서 바꾸기로 할 수 있는 것과 없는 것 — 상호작용 리스너

**패키지를 누르면 SDK가 앱의 `PaywallListener.onInteraction` 을 동기적으로(그 자리에서 끝날 때까지) 부른다. 예전에는 선택을 반영하기 전에 불러서, 리스너가 느리면 선택도 늦었다.**
- [#4298](https://github.com/RevenueCat/purchases-android/pull/4298) 은 선택을 먼저 반영한다. 그러면 리스너가 프레임을 늦추지 않을 것처럼 보인다.
- 그렇지 않다. 메인 스레드는 쌓인 작업을 한 번에 하나씩 처리한다. 선택 쓰기와 리스너 호출이 모두 들어 있는 클릭 처리기는 **작업 하나**이고, 그것이 끝나야 다음 프레임이 시작된다.

**컴포넌트 89개 템플릿에서, 300ms 동안 막히는 리스너를 달고, 클릭 처리기 시작부터 새 선택을 그린 프레임까지 쟀다(10번 누르기를 두 번).**

| 방식 | 클릭부터 새 선택이 그려질 때까지 |
|---|---|
| 리스너 먼저(#4298 이전) | 350ms에서 356ms가 걸렸다. |
| 선택 먼저(#4298) | 342ms에서 343ms가 걸렸다. |
| 리스너를 메인 스레드에 post로 미룸 | 348ms에서 369ms가 걸렸다. |
| 리스너를 다음 프레임 뒤로 미룸 | 41ms에서 48ms가 걸렸다. |

- 선택을 먼저 반영해 아낀 것은 약 10ms로, 한 프레임도 안 된다.
- `post` 로 미루는 것도 소용없다. 미룬 작업도 다음 프레임 **전에** 돌기 때문이다.
- 리스너를 프레임 뒤로 미루면 누르기에서 그 비용이 빠진다. 다만 300ms 막힘은 그다음 프레임들을 늦춘다.
- 미루면 앱이 콜백을 받는 시점이 바뀌므로, 이것은 리팩터링이 아니라 **API 결정**이다. 지금은 `onInteraction` 을 짧게 두고, 느린 일은 메인 스레드 밖으로 옮기라고 권한다.

## 11. 맺음말

**이 조사가 남기는 습관은, 많은 컴포저블이 보는 상태에 대해 던지는 질문 하나다. 누가 이것을 읽고, 그들 모두가 정말 읽어야 하나?**
- `derivedStateOf` 는 리컴포지션에서는 지켜 주지만 재계산에서는 지켜 주지 않는다. 쓰는 것보다 많이 읽는 계산은 필요한 것보다 많이 구독한다.
- 이런 것을 고칠 때는 측정용 빌드에서 그 수정을 **다시 끌 수 있는 방법**을 남겨 둔다. "결함을 고쳤다"와 "그것이 원인이었다"는 다른 주장이고, 둘을 가르는 것은 A/B뿐이다.

**증상은 누른 뒤의 짧은 멈춤이었고, 처음 의심은 비싼 그리기였다.**
- 잰 모든 페이월에서 진짜 비용은 **화면에서 바뀐 것을 보는 도구로는 보이지 않았다.** 아무것도 바뀌지 않았기 때문이다.
- 컴포지션은 약속한 대로 똑같아 보이는 컴포넌트를 건너뛰었다. 누르기를 느리게 만든 것은, 수백 개 컴포넌트가 저마다 "내가 할 일이 있나?"를 **올바르게** 물은 일이었다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide에는 아직 느리다고 잰 화면이 없다. 그래서 고칠 코드를 찾는 대신, 원문의 습관을 Aide의 실제 코드와 앞으로 짤 화면에 대 본다.

### 1. Aide에도 "선택 하나를 모든 칸이 읽는" 모양이 있다 — 하지만 재기 전에는 고치지 않는다

Note-Android에서 옮겨 온 캘린더 화면(`feature:calendar`, View 기반)은 날짜를 누르면 이렇게 한다. 아래는 **Aide의 실제 코드**다.

```kotlin
fun onSelectedDay(selectedDay: LocalDate, currentMonth: CalendarMonth) {
    val weeks = currentMonth.weekDays
    _selectedDay = selectedDay

    val newMonthData = currentMonth.copy(
        weekDays = weeks.map { week ->
            week.map { day ->
                day.copy(selected = day.date == selectedDay)
            }
        }
    )

    _monthData.value = newMonthData
    _selectedDayAndHolidays.value =
        selectedDay to getHolidaysStringFromCalendarEvents(selectedDay)
    requestDailySchedule()
}
```

> 출처: Aide `CalendarViewModel.onSelectedDay` (`feature/calendar/.../viewmodel/CalendarViewModel.kt`)

- 날짜 하나를 누르면 그 달의 **모든 날짜 칸**(최대 6주 × 7일 = 42칸)을 `copy` 로 새로 만든다. 선택이 바뀐 칸은 두 개(이전 선택, 새 선택)뿐인데, 42칸 모두가 "나는 선택됐나?"를 다시 묻는다. 원문 1장의 모양과 같다.
- 하지만 원문과 규모가 다르다. 원문은 컴포넌트 수백 개가 저마다 오버라이드를 풀고, 정규식을 만들고, 글꼴을 다시 읽었다. 여기는 작은 `data class` 42개를 만드는 일이다.
- 원문의 교훈은 "고치기 전에 잰다"다. 이 코드는 **재 보지 않았고, 느리다는 증상도 없다.** 그래서 지금은 고치지 않는다. 캘린더를 넘기거나 날짜를 누를 때 멈춤이 보이면, 그때 원문처럼 "칸 수를 늘리면 비용이 따라 늘어나는가"부터 잰다.

### 2. 1-b의 AI 대기 표시는 보일 때만 컴포즈한다

1-b에서 AI에게 물으면 답을 기다리는 동안 로딩 표시가 필요하다. 원문 9장의 실수를 피하는 모양이다(**직접 쓴 스케치**).

```kotlin
@Composable
fun AiReplyWaiting(isWaiting: Boolean) {
    AnimatedVisibility(visible = isWaiting, enter = fadeIn(), exit = fadeOut()) {
        CircularProgressIndicator(modifier = Modifier.size(20.dp))
    }
}
```

- **`AnimatedVisibility`**: 서서히 나타나고 사라지는 애니메이션이 끝나면 안의 내용을 컴포지션에서 **빼낸다.** 그래서 답이 도착해 표시가 사라지면 무한 애니메이션도 함께 멈춘다.
- 피할 모양은 `CircularProgressIndicator(modifier = Modifier.alpha(if (isWaiting) 1f else 0f))` 처럼 **늘 만들어 두고 투명도로 숨기는** 것이다. 첫 화면이 쉬는 동안에도 프레임마다 다시 그려진다.
- 원문 8장처럼 버튼 내용을 흐리게 하는 애니메이션이 필요하면, 투명도 값은 `graphicsLayer { alpha = provider() }` 의 람다 안에서 읽는다.

### 3. 1-b의 Rive 아바타도 같은 규칙을 따른다

1-b에서 첫 화면 아바타 자리의 정지 그림이 Rive 애니메이션(쉬는 중, 일하는 중, 묻는 중, 잠든 모습)으로 바뀐다. 원문 9장의 로딩 표시와 같은 위험이 있다. **끝없이 도는 애니메이션은 보이든 안 보이든 프레임을 만든다.**
- 첫 화면이 다른 탭 뒤로 가거나 앱이 백그라운드에 있을 때 아바타 애니메이션이 멈추는지 확인한다.
- "잠든 모습"이 아주 느린 숨쉬기 반복이라면, 그것만으로도 첫 화면은 계속 다시 그려진다. 필요하면 일정 시간 뒤 정지 프레임으로 바꾼다.
- 확인 방법은 원문과 같다. 개발자 옵션 "HWUI 렌더링 프로파일"을 켜거나 `adb shell dumpsys gfxinfo <패키지>` 로, 첫 화면을 건드리지 않은 5초 동안 새 프레임이 생기는지 본다.

## 배운 점

- **"다시 그리지 않았다"는 "일하지 않았다"가 아니다.** `derivedStateOf` 는 결과가 같으면 다시 그리기를 건너뛰지만, 같은지 알려면 새 값을 계산해야 한다. 리컴포지션 횟수만 보는 도구로는 이 비용이 보이지 않는다.
- **의존성은 "읽을 수도 있는 것"이 아니라 "실제로 읽은 것"이다.** 필요한 갈래에서만 읽도록 람다로 미루면, 영향받지 않는 컴포넌트는 구독 자체가 사라진다. 계산을 싸게 하는 것보다 계산할 일을 없애는 쪽이 크다.
- **비용이 개수에 따라 늘어나는지부터 본다.** 컴포넌트 수를 20, 100, 300으로 바꿔 잰 그래프 하나가 "누를 때마다 모든 컴포넌트가 하는 일"과 "한 번만 하는 일"을 갈랐다.
- **고친 것을 다시 끌 수 있게 남긴다.** 킬 스위치 덕분에 수정마다 효과를 따로 쟀고, 글꼴 수정이 "진짜 결함이지만 이 증상의 주원인은 아님"을 보여 줬다. 결함을 고친 것과 원인을 고친 것은 다르다.
- **상태에 들어가는 값에는 제대로 된 `equals` 가 있어야 한다.** `equals` 가 없으면 같은 글꼴도 매번 다른 글꼴이 되고, 캐시는 빗나가고, 메인 스레드에서 파일을 다시 읽는다.
- **비싼 것은 만들어 두고 다시 쓴다.** 정규식, Markdown 해석, 그림자 경로처럼 입력이 바뀔 때만 다시 만들면 되는 것을 매번 만들면, 개수만큼 곱해진다.
- **투명도는 보이는 것을 정할 뿐, 프레임을 만들지 말지는 정하지 않는다.** 무한 애니메이션은 보일 때만 컴포즈한다.
- **메인 스레드 작업 하나 안에서 순서를 바꿔도 다음 프레임은 빨라지지 않는다.** 클릭 처리기가 끝나야 프레임이 시작된다. 느린 일은 프레임 뒤로 미루거나 메인 스레드 밖으로 옮겨야 한다.

## Aide에 적용하면

Aide는 1-a 진행 중이고, Compose 화면은 하단 탭 정도이며 캘린더 화면은 Note-Android에서 옮겨 온 View 기반이다. Aide 코드에서 `derivedStateOf`, 로딩 표시(`CircularProgressIndicator`), 투명도 애니메이션, 정규식 생성을 검색해도 나오는 것이 없다. 글꼴은 `FontFamily.Default` 만 쓴다. 그래서 **지금 고칠 곳은 없고**, 앞으로 짤 화면에 가져갈 규칙이 남는다.

1. **"고치기 전에 재고, 고친 것을 끄고 켜서 확인한다" — 가져온다. 성능 문제가 처음 보일 때부터.**
   - 화면이 느리다고 느끼면 먼저 "무엇을 늘리면 비용이 늘어나는가"(할 일 수, 일정 수, 캘린더 칸 수)를 재고, 고친 뒤에는 그 수정만 되돌려 비교한다.
   - 원문처럼 측정용 빌드에 플래그를 두는 것까지는 하지 않는다. 혼자 쓰는 앱이라 수정 하나를 되돌린 브랜치로 비교하면 충분하다.
2. **캘린더의 날짜 선택이 한 달 전체를 새로 만드는 것 — 지금은 안 한다.**
   - 이유: `CalendarViewModel.onSelectedDay` 는 날짜 하나를 누를 때 42칸을 모두 `copy` 하지만, 원문과 달리 칸마다 하는 일이 작고, 느리다는 증상도 없고, 재 보지도 않았다. 원문의 교훈대로 재지 않은 것은 고치지 않는다. 멈춤이 보이면 1번 방법으로 잰다.
3. **AI 대기 표시는 보일 때만 컴포즈한다 — 가져온다. 1-b에서.**
   - AI 답을 기다리는 로딩 표시는 `AnimatedVisibility` 나 `if` 로 감싸 답이 오면 컴포지션에서 빠지게 한다. 투명도 0으로 숨겨 두지 않는다("코드로 보기" 2번).
4. **Rive 아바타가 보이지 않을 때 멈추는지 확인한다 — 가져온다. 1-b에서.**
   - 첫 화면이 다른 탭 뒤에 있거나 앱이 백그라운드일 때, 그리고 "잠든 모습"이 반복 애니메이션일 때 프레임이 계속 생기는지 `dumpsys gfxinfo` 나 HWUI 렌더링 프로파일로 본다("코드로 보기" 3번). 쉬는 첫 화면이 계속 그려지면 배터리를 쓴다.
5. **상태는 그 값을 쓰는 경로에서만 읽는다 — 가져온다. Task 8부터.**
   - Task 8 첫 화면은 할 일 목록, 오늘 일정, 다음 일정, 편집 중인 할 일을 한 화면에 보여 준다. 목록의 행마다 "편집 중인 할 일인가"나 "지금 시각" 같은 공통 상태를 읽게 만들면 원문 1장의 모양이 된다. 행에는 그 행에 필요한 값만 넘기고, 공통 상태에서 나온 값은 ViewModel에서 미리 계산한다(계획서도 `NextEventInfo.ongoing` 을 ViewModel에서 계산한다).
   - `derivedStateOf` 를 쓰게 되면, 블록 안에서 조건 갈래 밖에서 상태를 먼저 읽지 않는다.
6. **비싼 것은 한 번 만들기, 상태에 넣는 클래스에는 `equals` — 가져온다. 1-b에서.**
   - 1-b에서 AI 응답을 해석하거나 날짜 표현을 찾는 정규식은 최상위 `val` 로 한 번만 만든다. 함수 안에서 `Regex(...)` 를 부를 때마다 만들지 않는다.
   - UI 상태에 넣는 모델은 `data class` 로 두어 값 기준 `equals` 를 갖게 한다. 지금 Aide의 `Task`, `Event`, `CalendarSource` 는 이미 `data class` 다.
7. **클릭 처리기에서 오래 걸리는 일을 하지 않는다 — 이미 같은 방향이다.**
   - Task 8의 [완료]나 [할 일로]는 ViewModel이 `viewModelScope` 에서 Room의 `suspend` 함수를 부르므로, 클릭 처리기 자체는 Event를 보내고 바로 끝난다. 1-b의 AI 호출도 같은 방식으로 메인 스레드 밖에서 한다.

## 출처

- [Recalculated, not recomposed: what does one tap cost in a Compose paywall? — RevenueCat 블로그](https://www.revenuecat.com/blog/engineering/android-paywall-improve) (Jaewoong Eum, 2026-11-11)
- [RevenueCat/purchases-android (GitHub, MIT)](https://github.com/RevenueCat/purchases-android)와 원문이 다룬 PR: [#4383](https://github.com/RevenueCat/purchases-android/pull/4383), [#4245](https://github.com/RevenueCat/purchases-android/pull/4245), [#4194](https://github.com/RevenueCat/purchases-android/pull/4194), [#4195](https://github.com/RevenueCat/purchases-android/pull/4195), [#4200](https://github.com/RevenueCat/purchases-android/pull/4200), [#4201](https://github.com/RevenueCat/purchases-android/pull/4201), [#4298](https://github.com/RevenueCat/purchases-android/pull/4298), [#4442](https://github.com/RevenueCat/purchases-android/pull/4442)
- [RevenueCat/purchases-flutter 이슈 #1954](https://github.com/RevenueCat/purchases-flutter/issues/1954)
- [Compose 런타임 `RecomposeScopeImpl.kt` (AOSP androidx, Apache 2.0)](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/RecomposeScopeImpl.kt)
- [Android 개발자 문서: Compose 성능 권장사항(상태 읽기를 늦추기)](https://developer.android.com/develop/ui/compose/performance/bestpractices)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- RevenueCat SDK 코드는 MIT, Compose 런타임 코드는 Apache 2.0에 따라 인용했다. 블로그에만 있는 예시 코드는 라이선스 표시가 없어 글로 설명했다.
