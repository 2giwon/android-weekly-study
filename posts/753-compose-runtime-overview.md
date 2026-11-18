---
issue: 753
date: 2026-11-15
title: Compose 런타임 지도 한 장 — Composition부터 스냅샷까지 일곱 부품
original_title: A Rough First Sketch of the Compose Runtime
url: https://www.grokkingandroid.com/a-rough-first-sketch-of-the-compose-runtime/
author: Wolfram Rittmeyer (Grokking Android)
tags: [Compose, Compose Runtime, Recomposition, Snapshot]
aide:
  status: candidate
  module: app
  task: Task 8
  summary: Aide는 setContent가 MainActivity 한 곳뿐이라 Composition이 하나다. 이 구조를 지키고, currentComposer를 쓰지 않는 규칙을 Konsist로 걸고, 상태가 바뀌면 스냅샷 알림으로 다시 그린다는 흐름을 Task 8 입력 막대 결정(TextFieldState를 어디에 둘지)의 근거로 쓴다
---

## 한 줄 요약

Jetpack Compose가 화면을 그리고 다시 그리는 일은 **런타임(runtime, 앱이 돌아가는 동안 뒤에서 일하는 Compose 라이브러리 부분)** 의 부품 일곱 개가 나눠서 한다. 저자 Wolfram Rittmeyer는 Compose 내부를 파고드는 연재를 시작하면서, 앞으로 계속 나올 부품의 관계를 그림 한 장과 짧은 설명으로 먼저 정리했다. 일곱 부품은 `Composition`, `Recomposer`, `Composer`, `Owner`, `SlotTable`, `Applier`(그리고 `LayoutNode`), 스냅샷 시스템이다. 흐름은 이렇다. 상태가 바뀌면 **스냅샷 시스템**이 `Recomposer`에게 알린다. `Recomposer`는 다음 프레임에 다시 그리기를 시작한다. `Composition`이 쓰는 `Composer`는 `SlotTable`에 저장해 둔 이전 값과 비교해서 바뀐 부분만 다시 계산하고, 화면 나무 구조가 바뀌면 `Applier`에게 넘겨 `LayoutNode` 나무를 고친다. `Owner`는 이 모든 것을 Android의 View 같은 플랫폼 화면과 이어 준다.

> 원문에는 코드가 없고 그림이 1장 있다. 블로그에 라이선스 표시가 없어서(하단에 저작권 표시만 있다) 그림 파일은 복사하지 않고 원문 서버 주소를 걸어 보여 준다. 그림이 사라져도 알 수 있게 그림 내용을 글로도 적었다. "코드로 보기" 절의 코드는 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **런타임(Compose Runtime)**: Compose에서 `@Composable` 함수를 실제로 실행하고, 결과를 저장하고, 상태가 바뀌면 다시 실행하는 라이브러리 부분이다. `androidx.compose.runtime` 패키지에 있다. 버튼이나 글자 같은 화면 부품(`compose.ui`, `material3`)과는 따로 있다.
- **컴포저블(Composable)**: `@Composable`이 붙은 함수다. 화면에 무엇을 그릴지 적는 함수라고 보면 된다.
- **Compose 컴파일러 플러그인(Compose Compiler plugin)**: Kotlin 코드를 빌드할 때 `@Composable` 함수 안에 런타임을 부르는 코드를 몰래 끼워 넣는 도구다. 개발자가 쓰지 않은 `startRestartGroup()` 같은 호출이 이 플러그인 때문에 생긴다.
- **컴포지션(composition)**: 컴포저블을 처음 실행해서 화면 나무 구조를 만드는 일이다. 대문자로 쓴 `Composition`은 이 일을 관리하는 객체 이름이다.
- **리컴포지션(recomposition, 다시 그리기 계산)**: 상태가 바뀌었을 때 그 상태를 읽은 컴포저블만 다시 실행하는 일이다. View 시스템의 `invalidate()`와 비슷한 역할이지만, 다시 계산하는 범위를 Compose가 스스로 고른다.
- **상태(state)**: 바뀌면 화면이 다시 그려져야 하는 값이다. `mutableStateOf()`로 만든다. Android ViewModel의 `StateFlow`도 `collectAsStateWithLifecycle()`을 거치면 이 상태가 된다.
- **스냅샷(snapshot)**: 어느 한 순간의 상태 값들을 사진 찍듯 묶어 둔 것이다. 데이터베이스의 트랜잭션처럼, 스냅샷 안에서 바꾼 값은 "적용(apply)"하기 전까지 밖에서 보이지 않는다.
- **노드(node)**: 화면 나무 구조의 마디 하나다. Android 화면에서는 `LayoutNode`다. View 시스템의 `View` 하나와 비슷한 자리다.
- **노드 나무(node tree)**: 노드들이 부모와 자식으로 이어진 구조다. View 시스템의 View 계층과 같은 자리다.
- **그룹(group)과 슬롯(slot)**: `SlotTable`이 데이터를 담는 두 가지 단위다. 그룹은 "이 덩어리에 슬롯이 몇 개 있고 어떤 종류인지"를 적은 목차이고, 슬롯은 실제 값을 담는 칸이다.
- **프레임 시계(MonotonicFrameClock)**: 화면이 새로 그려지는 순간(보통 1초에 60번 이상)마다 신호를 주는 시계다. Android에서는 `Choreographer`(화면 갱신 신호를 주는 Android 장치)와 이어져 있다.
- **인터페이스와 구현(interface / implementation)**: 인터페이스는 "이런 함수가 있다"는 약속만 적은 것이고, 구현은 그 약속을 실제로 지키는 클래스다. 원문은 부품마다 인터페이스인지 구체 클래스인지를 짚는다.
- **Compose Multiplatform**: JetBrains가 Compose를 iOS, 데스크톱, 웹에서도 돌게 만든 것이다. 런타임은 같고 플랫폼과 잇는 부분만 다르다.

## 서론 — 연재를 위해 먼저 그린 지도

**무엇을 하는 글인가**
- 저자는 Jetpack Compose(그리고 Compose Multiplatform)가 안에서 어떻게 도는지 다루는 연재를 쓰고 있다. 연재 중에 런타임의 특정 부품 이름이 계속 나오는데, 부품마다 따로 글을 쓸 예정이고 아직 대부분 나오지 않았다.
- 그래서 이 글은 각 부품을 자세히 파는 대신, 전체 그림을 먼저 보여 주는 높은 곳에서 본 지도 역할을 한다. 연재를 읽다가 부품끼리 어떻게 이어지는지 헷갈리면 이 글로 돌아오라고 한다.

**다루는 부품 일곱 가지**
- `Composition`과 그 구현 `CompositionImpl`
- `Recomposer`
- `Composer`와 그 구현 `GapComposer`, `LinkComposer`
- `Owner`
- `SlotTable`
- `Applier`와 `LayoutNode`
- 스냅샷 시스템(Snapshot System)

<figure class="media"><img src="https://www.grokkingandroid.com/wordpress/wp-content/uploads/2026/11/compose_runtime_overview-461x700.png" alt="Compose Runtime Overview라는 제목의 세로 흐름도. 오른쪽 위 초록 상자 Snapshot System에서 점선 화살표가 notifies of state changes / invalidations 라는 이름표를 달고 파란 상자 Recomposer로 내려간다. Recomposer에서 triggers and coordinates 화살표가 가운데 파란 상자 Composition으로 간다. 왼쪽 위 주황 상자 Owner에서는 두 화살표가 나간다. 하나는 manages layout and drawing and combines with 이름표를 달고 주황 상자 Plattform UI (Android/Desktop/Web/iOS)로, 다른 하나는 점선으로 provides context/bridge to 이름표를 달고 Composition으로 간다. Composition에서 uses 화살표가 파란 상자 Composer로 내려간다. Composer에서 왼쪽으로 reads / writes 화살표가 파란 상자 SlotTable로, 오른쪽으로 passes on structural changes 화살표가 파란 상자 Applier로 간다. Applier에서 builds / modifies nodes in 화살표가 맨 아래 주황 상자 LayoutNode Tree로 간다" loading="lazy"><figcaption>원문 그림 "Compose Runtime Overview". 위에서 아래로 읽는다. 스냅샷 시스템이 상태 변경을 Recomposer에게 알리고, Recomposer가 Composition을 움직이고, Composition이 Composer를 쓰고, Composer가 SlotTable을 읽고 쓰면서 구조 변경은 Applier에게 넘기고, Applier가 LayoutNode 나무를 만들고 고친다. 옆에서는 Owner가 Composition에 플랫폼과 이어지는 다리를 주고, 플랫폼 화면(Android, 데스크톱, 웹, iOS)과 함께 레이아웃과 그리기를 맡는다. 파란 상자는 런타임 부품, 주황 상자는 플랫폼과 화면 쪽, 초록 상자는 스냅샷 시스템이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.grokkingandroid.com/a-rough-first-sketch-of-the-compose-runtime/">원문</a>)</figcaption></figure>

## 1. Composition — 전체를 관리하는 객체

**무엇인가**
- [`Composition`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Composition.kt)은 저자 표현으로 "모든 것의 관리자"다. 만들 때 `Applier`를 넘겨받고, `Composer`와 `CompositionContext`(부모 컴포지션과 이어 주는 연결 정보)를 쥐고 있다.
- 화면 나무 구조의 생애(만들어지고 없어지는 흐름)와 상태를 관리한다. 개발자가 쓴 컴포저블을 런타임과 묶고, 바뀐 내용이 실제로 반영되게 한다.

**인터페이스와 구현**
- `Composition`은 인터페이스이고, 실제 일은 내부 구현 클래스 [`CompositionImpl`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Composition.kt;l=481)이 한다.

**누가 만드나**
- 개발자가 직접 만들 일은 거의 없다. Activity의 `onCreate()`에서 `setContent()`를 부르면 Compose가 대신 만든다. 원문 각주에 따르면 `ComponentActivity`의 `setContent()`는 안에서 `ComposeView`의 `setContent()`를 부른다.
- Compose Multiplatform에서는 플랫폼별 진입 클래스가 만든다. iOS는 [`ComposeUIViewController`](https://github.com/JetBrains/compose-multiplatform-core/blob/42a67cbc7f13dce0b57956f7bf38ebadd7c35889/compose/ui/ui/src/iosMain/kotlin/androidx/compose/ui/window/ComposeUIViewController.ios.kt#L25), 데스크톱은 [`ComposeWindow`](https://github.com/JetBrains/compose-multiplatform-core/blob/42a67cbc7f13dce0b57956f7bf38ebadd7c35889/compose/ui/ui/src/desktopMain/kotlin/androidx/compose/ui/awt/ComposeWindow.desktop.kt#L62)다. 원문 각주에 따르면 `ComposeWindow`는 Java 데스크톱 창 클래스 `JFrame`을 상속한다.

**`setContent()` 한 번에 Composition 하나**
- `setContent()`를 부를 때마다 새 `Composition`이 생긴다.
- 그래서 예전 View 시스템과 섞어 쓰면서 Fragment 여러 개나 `ComposeView` 여러 개에서 각각 `setContent()`를 부르면, `Composition`도 여러 개, `Composer`도 여러 개 생길 수 있다.

## 2. Recomposer — 다시 그리기를 돌리는 엔진

**무엇을 하나**
- [`Recomposer`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Recomposer.kt;l=193)는 컴포지션 반복(상태 변경을 기다렸다가 다시 계산하는 순환)을 돌린다.
- 안에 [`MonotonicFrameClock`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/MonotonicFrameClock.kt;l=29)(프레임 시계)을 쥐고 있다. 이 시계가 일정한 간격으로 신호를 준다.

**언제 다시 그리나**
- 스냅샷 시스템이 "상태가 바뀌었다"고 알려 오면, `Recomposer`는 시계의 다음 신호에 리컴포지션을 시작한다.
- 다시 말해 `Recomposer`가 반복을 돌리긴 하지만, 앞서 상태가 바뀌어서 다시 그릴 필요가 있을 때만 일한다. 아무것도 안 바뀌면 프레임마다 다시 계산하지 않는다.

**생애를 안다**
- `Recomposer`는 생애를 안다(lifecycle aware). 화면이 살아 있어서 필요한 동안에만 리컴포지션을 일으킨다.
- `Recomposer`는 인터페이스 없이 구체 클래스 하나다. 저자는 "여기는 추상화가 필요 없다"고 적었다.

## 3. Composer — 컴파일러가 만든 코드가 부르는 런타임 엔진

**누가 부르나**
- Compose 컴파일러 플러그인이 컴포저블 함수 안에 끼워 넣은 코드는 [`Composer`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Composer.kt;l=158) 인터페이스를 부른다.

**무엇을 하나**
- 저자는 `Composer`를 "런타임 엔진"이라고 부른다. 노드 나무를 관리하고, 리컴포지션을 줄이는 최적화에서 아주 중요한 역할을 한다. 원문 각주에 따르면 Compose에는 나무가 두 종류 있다. 하나는 `SlotTable` 안의 그룹 나무이고, 다른 하나는 `Applier`가 다루는 노드 나무다.
- `Composer`는 `SlotTable`을 쥐고 관리한다. 중요한 함수는 두 묶음이다.
  - 그룹을 다루는 높은 수준 함수: `startRestartGroup()` 같은 것
  - 노드를 다루는 함수: `startNode()`, `startReusableNode()`
- 주된 일은 `SlotTable`에 필요한 그룹 처리, 슬롯 처리 함수를 부르는 것이다. 저자가 "슬롯 포인터 처리"라고 부르는 일, 즉 지금 `SlotTable`의 어느 칸을 읽고 있는지 가리키는 위치를 옮기는 일도 맡는다.

**직접 건드리지 말 것**
- 컴포저블 안에서 `currentComposer`로 지금의 `Composer`를 꺼낼 수는 있다. 하지만 저자는 그렇게 하면 "무슨 일이 생길지 장담할 수 없다"고 경고한다.
- 이유는 대부분의 함수가 슬롯 포인터를 옮기기 때문이다. 겉보기엔 아무 해가 없어 보이는 `changed(someVar)`(값이 바뀌었는지 확인하는 함수)조차 포인터를 옮긴다. 포인터가 컴파일러가 예상한 위치에서 어긋나면, 다음 리컴포지션에서 다른 칸의 값을 읽게 된다.
- 공식 문서에도 분명히 적혀 있지만 "누가 문서를 읽겠느냐"며, `Composer`는 런타임에게만 맡기라고 한다.

**인터페이스와 구현 두 개**
- `Composer`는 인터페이스이고, 실제 일은 구현 클래스 [`GapComposer`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/GapComposer.kt;l=211;bpv=1;bpt=1)나 [`LinkComposer`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/LinkComposer.kt;l=288;bpv=1;bpt=1) 둘 중 하나가 한다.
- 저자는 왜 구현이 두 개인지는 연재에서 다루지 않을 것 같다고 했다. 대신 [`LinkComposer`가 왜 생겼는지 설명한 글](https://doveletter.dev/articles/compose-linkbuffer-slottable)을 각주로 걸어 두었다.

## 4. Owner — 플랫폼과 이어 주는 다리

**무엇인가**
- [`Owner`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/node/Owner.kt;l=67)는 Compose와 운영체제의 화면 시스템을 잇는 다리다. Android에서 그 화면 시스템은 예전의 View 시스템이다.
- 개발자가 Activity에서 `setContentView()`를 한 번도 부르지 않아도, Android는 여전히 `View` 하나를 만들어 `setContentView()`로 화면에 올린다. 데스크톱의 `JFrame`, iOS의 `UIViewController`도 마찬가지로 바깥 그릇 역할을 한다.

**무엇을 주고받나**
- 바깥에서 오는 신호를 받는다. 예를 들어 레이아웃을 다시 잡아야 할 때나 화면을 다시 그려야 할 때(invalidate)다.
- 접근성 서비스(화면 낭독기 TalkBack 같은 보조 기능)와 주고받는 일도 모두 `Owner`를 거친다.
- 저자는 `Owner`가 런타임에서 과소평가된 부품이라고 보고, 나중에 글 두 편으로 따로 다루겠다고 했다.

**플랫폼별 구현**
- iOS와 데스크톱에서는 [`OwnerImpl`](https://github.com/JetBrains/compose-multiplatform-core/blob/42a67cbc7f13dce0b57956f7bf38ebadd7c35889/compose/ui/ui/src/skikoMain/kotlin/androidx/compose/ui/node/RootNodeOwner.skiko.kt#L420)이 `Owner` 인터페이스의 구현이다.
- Android에서는 [`AndroidComposeView`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/platform/AndroidComposeView.android.kt;l=285)가 구현이다. `setContent()`를 부를 때 만들어져 View 나무에 들어가는 가장 바깥 View다.

## 5. SlotTable — 화면을 위한 메모리 속 저장소

**무엇인가**
- [`SlotTable`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/composer/gapbuffer/SlotTable.kt;l=121?q=SlotTable&ss=androidx%2Fplatform%2Fframeworks%2Fsupport)은 저자 말로 "UI를 위한 메모리 속 캐시(cache, 다시 계산하지 않으려고 저장해 두는 곳)"다.
- 그룹과 슬롯으로 이루어진다.
  - **그룹**은 데이터의 목차다. 이 그룹에 슬롯이 몇 개 딸려 있는지, 어떤 종류의 그룹인지 같은 정보를 담는다. 그룹끼리는 나무 구조를 이루고, 각 그룹은 자기에게 딸린 슬롯을 가리킨다.
  - **슬롯**은 그냥 데이터다. `Any?` 타입 배열의 한 칸일 뿐이다.

**슬롯에 무엇이 들어가나**
- 예를 들어 [`LayoutNode`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/node/LayoutNode.kt;l=78) 객체가 들어간다.
- 컴포저블에 넘긴 매개변수 값도 전부 들어간다. 다음 리컴포지션에서 새 매개변수와 비교하려고 저장해 둔다.
- 이렇게 아무 종류의 값이나 들어가야 해서 타입이 `Any?`다.

**Composer가 어떻게 쓰나**
- `Composer`는 `SlotTable`을 많이 쓴다. 처음 컴포지션할 때, 또는 리컴포지션에서 무엇이 바뀌었을 때 여기에 객체를 만든다.
- 리컴포지션 중에는 저장해 둔 값과, 컴파일러가 미리 해 둔 최적화를 보고 어느 부분을 건너뛸지(skip) 정한다. 성능을 위해서다.

**왜 평평한 배열인가**
- 성능 때문에 그룹은 `int` 값의 평평한 배열 하나에, 슬롯은 `Any?`의 평평한 배열 하나에 담는다. 객체를 하나하나 따로 만들지 않고 배열 칸에 숫자와 값을 늘어놓는 방식이다.

## 6. Applier — 노드 나무를 실제로 고치는 부품

**무엇을 하나**
- [`Applier`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Applier.kt;l=36)는 Compose 안에서 노드를 다루는 데 필요한 부품이다. 노드를 만드는 컴포저블은 자기 노드를 `Applier`에 넣는다. 그 과정은 저자가 다른 글에서 자세히 다루겠다고 했다.
- `Applier`는 노드들과 노드 사이의 관계(누가 누구의 부모이고 자식인지)를 관리한다.

**어떤 Applier를 쓰나**
- `Composition`마다 `Applier`가 하나씩 만들어진다.
- 보통 Android Compose에서는 [`UiApplier`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/node/UiApplier.android.kt;l=21)를 쓴다. 화면 노드를 다루기에 맞춘 것이다.
- iOS와 데스크톱에서는 공통으로 [`DefaultUiApplier`](https://github.com/JetBrains/compose-multiplatform-core/blob/42a67cbc7f13dce0b57956f7bf38ebadd7c35889/compose/ui/ui/src/skikoMain/kotlin/androidx/compose/ui/platform/DefaultUiApplier.skiko.kt#L22)를 쓴다.
- `UiApplier`와 `DefaultUiApplier` 둘 다 [`LayoutNode`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/node/LayoutNode.kt;l=78)를 다룬다.

**다른 노드를 다루는 Applier도 있다**
- Jetpack Compose 안에서도 벡터 그림(vector drawable)용으로는 다른 Applier인 [`VectorApplier`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/graphics/vector/VectorCompose.kt;l=137)를 쓴다. 이 Applier는 `LayoutNode`가 아니라 [`VNode`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/ui/ui/src/commonMain/kotlin/androidx/compose/ui/graphics/vector/Vector.kt;l=99)를 다룬다.
- Jetpack Compose 화면이 아닌 곳에서도 런타임을 쓴다. 홈 화면 위젯을 만드는 [Glance](https://developer.android.com/develop/ui/compose/glance)는 자기만의 Applier를 쓴다. Jake Wharton이 만든 터미널(글자만 나오는 명령 창) 화면 라이브러리 [Mosaic](https://github.com/JakeWharton/mosaic)은 [`MosaicNodeApplier`](https://github.com/JakeWharton/mosaic/blob/00897990ab256beac140eb1713e05afac05b8289/mosaic-runtime/src/commonMain/kotlin/com/jakewharton/mosaic/mosaic.kt#L133)를 쓴다.

**Applier가 노드 종류를 정한다**
- 그래서 Applier는 항상 다루려는 노드 종류에 묶여 있다.
- `Composition`을 만들 때 생성자에 Applier를 넘기므로, 그 `Composition`도 그 노드 종류에 묶인다. 런타임 자체는 노드가 화면 부품인지 벡터 조각인지 글자 창인지 모른다. 그것을 아는 것은 Applier뿐이다.

## 7. 스냅샷 시스템 — 상태 변경을 알리는 장치

**어디서 만나나**
- 코드에서 `mutableStateOf()` 같은 것을 쓸 때마다, 개발자는 모르는 사이에 Compose의 스냅샷 시스템을 쓰고 있다.
- 이름처럼, 화면의 어떤 부분에 대해 지금 상태를 나타내는 `Snapshot`이 만들어진다. 인터페이스 이름도 [`Snapshot`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/snapshots/Snapshot.kt;l=63)이다.

**상태 객체 안에는 무엇이 있나**
- `mutableStateOf()`로 [`State`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/SnapshotState.kt;l=75) 객체를 만들면, 돌려받은 객체는 [`StateObject`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/snapshots/Snapshot.kt;l=1450)를 구현한다.
- `StateObject`는 [`StateRecord`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/snapshots/Snapshot.kt;l=1391) 목록을 쥐고 있다. 각 `StateRecord`는 특정 시점에 맞는 값을 담는다. 값 하나가 아니라 "언제의 값"을 여러 벌 들고 있는 셈이다.

**Recomposer는 어떻게 아나**
- 알림을 받고 싶은 관찰자(observer)는 "스냅샷이 적용(commit)되면 알려 달라"고 등록해 둔다.
- `Recomposer`도 그런 관찰자다. 그래서 상태가 바뀐 스냅샷이 적용되면 `Recomposer`가 알게 되고, 2절에서 본 것처럼 다음 프레임에 리컴포지션을 시작한다.

## 8. 더 알고 싶다면

- 저자는 이 글이 높은 곳에서 본 개요라고 다시 말한다. 여기 나온 클래스와 개념 대부분을 뒤의 글에서 하나씩 다룰 예정이다.
- 그때까지 부품끼리의 관계가 궁금하면 이 개요로 돌아오라며 글을 맺는다.
- 바로 앞 글은 [The Different Node Types in Jetpack Compose](https://www.grokkingandroid.com/the-different-node-types-in-jetpack-compose/)(Compose의 여러 노드 종류)다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문에는 코드가 없다. 그래서 원문의 부품 설명이 Aide 코드의 어디에 닿는지 직접 확인하고, 거기에 맞춰 스케치 세 개를 썼다. 첫 번째는 Aide의 실제 코드이고, 두 번째와 세 번째는 **직접 쓴 스케치**다. 스케치는 Aide에 넣거나 빌드해 보지 않았다.

### 1) Aide의 Composition은 몇 개인가 — 실제 코드

Aide 저장소(최신 커밋 `31ad4dc`)에서 `setContent`를 찾으면 `app` 모듈의 `MainActivity` 한 곳만 나온다.

```kotlin
@AndroidEntryPoint
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            AideAndroidTheme {
                AideApp()
            }
        }
    }
}
```

> 출처: Aide-Android `app/src/main/kotlin/com/giwon/aide/ui/MainActivity.kt` (사용자 본인 저장소)

- `setContent { … }` 한 번이 원문 1절의 규칙대로 `Composition` 하나를 만든다. 그 안에서 `AndroidComposeView`(4절의 `Owner`)가 Activity 화면에 올라가고, `UiApplier`(6절)가 `LayoutNode` 나무를 만든다.
- 캘린더 탭은 `CalendarRoute`에서 `AndroidFragment<CalendarFragment>`로 Note-Android에서 옮겨 온 View 기반 Fragment를 끼워 넣는다. 이 Fragment 쪽 코드에는 `ComposeView`도 `setContent`도 없다. 그래서 지금 Aide 전체에 `Composition`은 하나다.
- 원문 1절의 경고(Fragment나 `ComposeView`마다 `setContent()`를 부르면 `Composition`이 여러 개 생긴다)는, 나중에 캘린더 Fragment 안에 Compose 부품을 넣을 때 해당한다. 그 순간 `Composition`이 두 개가 되고, 바깥 화면의 `CompositionLocal`(나무 아래로 값을 내려 주는 장치, 예를 들어 테마)이 Fragment 안의 Compose로 저절로 이어지지 않을 수 있다.

### 2) `currentComposer`를 쓰지 않는다는 규칙 — Konsist 테스트 스케치

원문 3절은 `currentComposer`를 꺼내 쓰면 슬롯 포인터가 어긋날 수 있다고 경고한다. Aide는 이미 `coding-convention` 모듈에서 Konsist(코드 구조 규칙을 테스트로 검사하는 라이브러리)로 화면 규칙을 검사하고 있으니, 같은 자리에 한 줄 규칙을 더하는 모양을 생각해 봤다.

```kotlin
// 직접 쓴 스케치 — coding-convention/src/test/.../ComposeRuntimeConventionTest.kt
class ComposeRuntimeConventionTest {

    @Test
    fun `앱 코드는 currentComposer 를 직접 쓰지 않는다`() {
        Konsist.scopeFromProject()
            .files
            .filterNot { it.path.contains("/scheduler/") }
            .assertFalse { file -> "currentComposer" in file.text }
    }
}
```

- `Konsist.scopeFromProject().files`: Aide 프로젝트의 Kotlin 파일 전체를 가져온다.
- `filterNot { … "/scheduler/" … }`: 기존 Konsist 규칙과 같은 방식으로, Note-Android에서 옮겨 온 캘린더 이식 코드는 빼 둔다. 다만 그 이식 코드에는 Compose가 없으니 빼지 않아도 결과는 같다.
- `assertFalse { "currentComposer" in file.text }`: 파일 글자 안에 `currentComposer`라는 말이 있으면 테스트가 실패한다. 문자열로 찾기 때문에 주석에 적어도 걸린다. 규칙을 알리는 데는 그 편이 오히려 낫다고 봤다.
- 이 테스트는 JUnit 5로 돌고, 기존 `ScreenConventionTest`와 같은 `org.junit.jupiter.api.Test`를 쓴다.

### 3) 상태를 바꾸면 누가 알게 되나 — 스냅샷 알림 테스트 스케치

원문 7절은 "관찰자가 스냅샷 적용 알림을 받아서 `Recomposer`가 변경을 안다"고 한다. 이 흐름은 화면 없이도 JUnit 5에서 볼 수 있다. Compose 런타임은 Android 기기 없이 JVM(PC의 Java 실행 환경)에서도 돌기 때문이다.

```kotlin
// 직접 쓴 스케치 — 스냅샷 알림을 눈으로 보는 테스트
class SnapshotNotificationTest {

    @Test
    fun `스냅샷 안에서 바꾸고 적용하면 관찰자가 바뀐 상태를 받는다`() {
        val input = mutableStateOf("")
        val changed = mutableListOf<Set<Any>>()
        val handle = Snapshot.registerApplyObserver { objects, _ -> changed += objects }

        try {
            Snapshot.withMutableSnapshot { input.value = "우유 사기" }

            assertEquals("우유 사기", input.value)
            assertTrue(changed.any { input in it })
        } finally {
            handle.dispose()
        }
    }

    @Test
    fun `전역 스냅샷에서 바꾸면 알림 보내기 전까지 관찰자는 모른다`() {
        val input = mutableStateOf("")
        val changed = mutableListOf<Set<Any>>()
        val handle = Snapshot.registerApplyObserver { objects, _ -> changed += objects }

        try {
            input.value = "우유 사기"
            assertTrue(changed.none { input in it })

            Snapshot.sendApplyNotifications()
            assertTrue(changed.any { input in it })
        } finally {
            handle.dispose()
        }
    }
}
```

- `mutableStateOf("")`: 원문 7절의 `State` 객체를 만든다. 이 객체가 `StateObject`라서 스냅샷 시스템이 지켜본다. Aide Task 8의 입력 막대 글자를 떠올리며 빈 글자로 시작했다.
- `Snapshot.registerApplyObserver { objects, _ -> … }`: "스냅샷이 적용되면 알려 달라"고 관찰자를 등록한다. `Recomposer`가 하는 등록을 테스트가 흉내 내는 셈이다. `objects`에는 그 스냅샷에서 바뀐 상태 객체들이 들어온다.
- 첫 번째 테스트의 `Snapshot.withMutableSnapshot { … }`: 새 스냅샷을 열어 그 안에서 값을 바꾸고, 블록이 끝나면 적용한다. 적용되는 순간 관찰자가 `input`이 바뀌었다는 알림을 받는다.
- 두 번째 테스트: 스냅샷을 따로 열지 않고 바꾸면 전역 스냅샷(앱 전체가 함께 쓰는 기본 스냅샷)에 쓴다. 이때는 `Snapshot.sendApplyNotifications()`를 부르기 전까지 관찰자가 모른다. Android에서는 Compose가 이 알림 보내기를 화면 갱신 흐름에 맞춰 대신 불러 준다. 그래서 개발자가 `state.value = …`만 써도 다음 프레임에 화면이 바뀐다.
- `handle.dispose()`: 등록한 관찰자를 지운다. 테스트끼리 서로 알림을 받지 않게 한다.
- 이 스케치는 빌드해 보지 않았다. 함수 이름은 Compose 런타임 공개 API 기준이지만, Aide의 `feature:home` 단위 테스트 실행 환경에서 그대로 도는지는 확인이 필요하다.

## 배운 점

- **부품 이름을 알면 오류 문구와 스택이 읽힌다.** 리컴포지션 문제를 찾다 보면 스택 트레이스(오류가 난 함수 호출 순서)에 `Recomposer`, `CompositionImpl`, `GapComposer`, `SlotTable` 같은 이름이 줄줄이 나온다. 이 글의 그림 한 장이 있으면 "지금 어느 단계에서 터졌는지"를 짐작할 수 있다.
- **`setContent()` 한 번이 `Composition` 하나다.** View 시스템과 섞을 때 `ComposeView`를 여러 개 두면 컴포지션도 여러 개가 된다. 화면이 하나로 보여도 런타임 입장에서는 따로 도는 나무 여러 개다.
- **다시 그리기는 상태 변경 알림으로 시작한다.** `Recomposer`는 프레임마다 무조건 다시 계산하지 않는다. 스냅샷 시스템이 알려 줄 때만 움직인다. 그래서 화면이 바뀌어야 할 값은 반드시 스냅샷 상태(`mutableStateOf`, 또는 `collectAsStateWithLifecycle()`로 바꾼 `StateFlow`)로 들고 있어야 한다. 일반 변수에 넣으면 알림이 안 가서 화면이 안 바뀐다.
- **`SlotTable`은 매개변수까지 저장해 둔다.** 리컴포지션에서 건너뛸지 정하려고 이전 매개변수를 슬롯에 넣어 두고 새 값과 비교한다. 매번 새로 만들어지는 객체(예를 들어 매번 새 리스트)를 매개변수로 넘기면 비교가 늘 "바뀌었다"로 나와 건너뛰기가 줄어든다.
- **`currentComposer`는 꺼내지 않는다.** `changed()` 한 번에도 슬롯 포인터가 움직인다. 런타임은 컴파일러가 끼워 넣은 순서를 믿고 움직이므로, 손으로 끼어들면 다른 칸의 값을 읽게 될 수 있다.
- **런타임은 화면을 모른다.** 무엇을 그릴지는 Applier가 정한다. 그래서 같은 런타임으로 Glance 위젯도, 벡터 그림도, 터미널 화면(Mosaic)도 만든다.

## Aide에 적용하면

Aide 1-a 계획과 결정 기록(`decisions.md`)을 함께 읽고 정리했다. 원문은 개념 지도라서 바로 고칠 코드는 없다. 대신 지금 구조를 지키는 규칙과, 남아 있는 결정의 근거로 쓴다.

| # | 원문에서 가져올 것 | 판단 | Aide에서 어떻게 |
|---|---|---|---|
| 1 | `setContent()` 한 번에 `Composition` 하나가 생긴다 | **가져온다** | Aide는 `MainActivity`의 `setContent` 한 곳에서 `AideApp()`을 그리고, 캘린더 Fragment에는 Compose가 없어서 `Composition`이 하나다. 이 구조를 지킨다. 나중에 캘린더 Fragment 안에 Compose 부품을 넣어야 하면, 그때 `Composition`이 두 개가 되고 테마 같은 `CompositionLocal`이 이어지지 않을 수 있다는 점을 계획에 적고 시작한다. |
| 2 | `currentComposer`를 직접 쓰지 않는다 | **바꿔서 가져온다** | 원문은 "조심하라"는 말로 끝나지만, Aide는 이미 `coding-convention` 모듈에서 Konsist로 화면 규칙을 검사한다. 그래서 말로만 두지 않고, 파일에 `currentComposer`가 있으면 실패하는 Konsist 테스트(위 스케치 2번)를 같은 모듈에 더하는 방식으로 가져온다. 지금 Aide 코드에는 `currentComposer`가 한 번도 안 나오니 넣어도 바로 통과한다. 넣을지와 언제 넣을지는 사용자가 정한다. |
| 3 | 상태가 바뀌면 스냅샷 알림으로 `Recomposer`가 다시 그린다 | **가져온다 (Task 8 입력 막대 결정의 근거로)** | Task 8 계획은 `HomeUiState` 하나를 `StateFlow`로 들고 `collectAsStateWithLifecycle()`로 화면에 넘긴다. `StateFlow`는 이 함수를 거쳐야 스냅샷 상태가 되고, 그래야 `Recomposer`가 변경을 안다. 아직 정하지 않은 입력 막대 결정이 여기에 닿는다. (가)안은 `TextFieldState`를 `HomeRoute`에 두고 버튼을 누를 때만 글을 Event로 보내는 방식이다. `TextFieldState`는 그 자체가 스냅샷 상태라서, 글자를 칠 때마다 `StateFlow`를 한 바퀴 돌지 않아도 입력칸이 바로 다시 그려진다. (나)안은 입력 글을 `HomeUiState`에 넣고 `onValueChange`로 ViewModel까지 보냈다가 돌아오게 하는 원래 계획이다. 이 글은 (가)안 쪽 근거를 하나 더 주지만, 결정은 사용자가 한다. |
| 4 | 스냅샷 알림을 JUnit 5에서 직접 본다 | **지금은 안 한다** | 위 스케치 3번은 원리를 눈으로 보는 학습용 테스트다. Aide의 테스트는 ViewModel과 저장소의 동작을 확인하는 데 쓰고, Compose 런타임 자체를 시험하는 테스트는 Aide 기능을 지켜 주지 않는다. 런타임 동작이 궁금할 때 스크래치(임시 프로젝트)에서 돌려 보는 정도로 둔다. |
| 5 | `SlotTable`이 매개변수를 저장해 두고 비교해서 건너뛴다 | **지금은 안 한다** | 건너뛰기를 늘리려고 `@Stable`, `@Immutable`을 붙이거나 리스트 타입을 바꾸는 일은, 화면이 실제로 느릴 때 측정하고 나서 한다. 지금 Aide 화면 3개는 거의 비어 있다. 같은 이슈의 RevenueCat 페이월 글에서도 "측정하기 전에는 성능 수정을 하지 않는다"고 정리했다. |

## 출처

- 원문: Wolfram Rittmeyer, [A Rough First Sketch of the Compose Runtime](https://www.grokkingandroid.com/a-rough-first-sketch-of-the-compose-runtime/), Grokking Android, 2026-11-13. 블로그에 라이선스 표시가 없어 그림은 원문 서버 주소로 걸었고, 설명은 내 말로 다시 썼다.
- 원문이 실린 곳: [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문이 걸어 둔 소스 코드: AOSP [androidx `compose/runtime`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/)과 `compose/ui`(Apache 2.0), JetBrains [compose-multiplatform-core](https://github.com/JetBrains/compose-multiplatform-core)(Apache 2.0). 이 글에서는 소스 코드를 인용하지 않고 링크만 걸었다.
- 원문 각주의 참고 글: [Why LinkComposer was introduced](https://doveletter.dev/articles/compose-linkbuffer-slottable)
- Aide 코드: Aide-Android `MainActivity.kt`, `CalendarRoute.kt`, `coding-convention/.../ScreenConventionTest.kt` (최신 커밋 `31ad4dc`에서 읽기만 함)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md`, `plans/2026-10-12-aide-1a-plan.md` 의 Task 8
