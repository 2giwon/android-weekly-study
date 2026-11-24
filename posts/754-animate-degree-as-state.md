---
issue: 754
date: 2026-11-22
title: 각도를 애니메이션할 때 0° 선에서 한 바퀴 휙 돌지 않게 하기 — animateDegreeAsState
original_title: Animating Angles in Jetpack Compose
url: https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/
author: sinasamaki
tags: [Compose, Animation]
aide:
  status: candidate
  module: core:designsystem
  task: Task 14
  summary: 1-a에는 다이얼처럼 각도나 색상환 숫자를 움직이는 화면이 없고 아바타 움직임은 Rive가 맡으므로 animateDegreeAsState는 지금 넣지 않는다. 원 위의 값은 가까운 쪽을 골라야 한다는 생각은 Task 14 nextMorningAt(하루를 한 바퀴로 보고 오늘 08:30인지 내일 08:30인지 고르기)의 테스트 표와 같은 문제라서, 그 표를 그대로 지키면 된다
---

## 한 줄 요약

다이얼 같은 것을 돌릴 때 각도를 `animateFloatAsState` 로 애니메이션하면, 350°에서 10°로 갈 때 0° 선을 넘어 20°만 돌면 되는데도 숫자가 350에서 10으로 **340°를 거꾸로 휙 돌아간다**. `animateFloatAsState` 는 숫자 두 개 사이를 이을 뿐, 360°와 0°가 같은 자리라는 것을 모르기 때문이다. 저자 sinasamaki는 `animateFloatAsState` 와 매개변수 모양이 똑같은 `animateDegreeAsState` 를 만든다. 이 함수는 **0~360으로 접지 않은 "실제로 돈 각도"를 따로 들고 있다가, 새 목표 각도가 오면 시계 방향과 반시계 방향 중 가까운 쪽으로만 더한다.** 그리고 바깥에는 다시 0~360으로 접은 값만 돌려준다. 같은 함수로 색상환의 색상(hue) 값을 움직이면, 분홍에서 주황으로 바뀔 때 무지개색이 번쩍이며 지나가지 않고 가까운 색들만 거쳐 간다.

> 원문 블로그 하단에는 "sinasamaki"라는 이름 표시만 있고 공개 라이선스가 없다. 그래서 원문 코드는 그대로 옮기지 않고, 같은 내용을 **직접 쓴 스케치**로 다시 썼다. 원문의 그림 1장과 영상 4개는 파일을 복사하지 않고 원문 서버 주소를 걸어 보여 준다. 이 글의 스케치는 컴파일해 보지 않았다.

<figure class="media"><img src="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/images/size/w2000/2026/11/dialAnimateDegreesFinalThumbnail.png" alt="원문 대표 그림. 어두운 배경에 둥근 다이얼의 위쪽 절반이 보인다. 다이얼 둘레에 눈금이 촘촘히 있고 30도마다 굵은 흰 눈금과 330, 0, 30, 60, 300 같은 숫자가 있다. 맨 위 0 자리의 눈금 하나만 노란색으로 빛난다" width="600" loading="lazy"><figcaption>원문 대표 그림. 0°를 가리키는 노란 눈금이 있는 다이얼이다. 이 글은 이 다이얼이 0° 선을 넘을 때 어떻게 돌아야 하는지를 다룬다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/">원문</a>)</figcaption></figure>

## 먼저 알아 둘 말

- **`animateFloatAsState`**: Compose의 애니메이션 함수다. 목표 숫자(`targetValue`)를 넘기면, 목표가 바뀔 때마다 지금 값에서 새 목표까지 숫자를 부드럽게 바꿔 가며 돌려준다. View 시스템의 `ValueAnimator.ofFloat(지금 값, 목표 값)` 을 목표가 바뀔 때마다 다시 시작해 주는 것과 같은 일을 한다.
- **`State<Float>`**: Compose가 "값이 바뀌면 이 값을 읽은 화면을 다시 그린다"고 알아보는 값 상자다. `animateFloatAsState` 는 이 상자를 돌려주고, 애니메이션하는 동안 상자 안의 숫자가 계속 바뀐다. LiveData를 화면에서 관찰하는 것과 비슷하다.
- **`remember { mutableFloatStateOf(…) }`**: 화면을 다시 그려도(recomposition, 리컴포지션) 사라지지 않는 Float 값 상자를 만든다. View 시스템에서 커스텀 View의 필드에 값을 들고 있는 것과 비슷하다.
- **`derivedStateOf { }`**: 다른 `State` 값으로 계산한 새 `State` 를 만든다. 원래 값이 바뀌면 계산을 다시 하고, 계산 결과가 실제로 바뀔 때만 화면에 알린다.
- **`mod`**: Kotlin의 나머지 함수다. `%` 연산자와 달리 결과가 항상 0 이상이다. `(-40f).mod(360f)` 는 320이고, `-40f % 360f` 는 -40이다. 각도를 0 이상 360 미만으로 접을 때 쓴다.
- **0° 선**: 다이얼의 0°와 360°가 만나는 자리다. 숫자로는 0과 360이 멀리 떨어져 있지만, 원 위에서는 같은 자리다. 이 글의 문제는 전부 이 차이에서 나온다.
- **시계 방향 거리**: 한 각도에서 다른 각도까지 시계 방향으로만 돌았을 때의 거리다. 340°에서 20°까지는 시계 방향으로 40°이고, 20°에서 340°까지는 시계 방향으로 320°다.
- **색상(hue)**: 색을 색상, 채도, 명도(HSV)로 나타낼 때의 색상 값이다. 빨강 0°, 노랑 60°, 초록 120°, 파랑 240°, 분홍 330° 근처처럼 **색상환이라는 원 위의 각도**로 나타낸다. 그래서 각도와 같은 0° 선 문제가 생긴다. Compose에서는 `Color.hsv(색상, 채도, 명도)` 로 색을 만든다.
- **유사색(analogous colors)**: 색상환에서 서로 가까이 있는 색들이다. 분홍과 빨강과 주황이 그렇다. 유사색 사이를 움직이면 색이 자연스럽게 바뀌어 보인다.

## 서론 — 350°에서 10°는 20°만 돌면 된다

- **무엇이 문제인가**
  - 저자는 360° 안에서 각도를 애니메이션할 때마다 같은 문제를 겪었다고 한다.
  - 사람은 350°에서 10°까지 가장 짧은 길이 0° 선을 넘어 20°만 도는 것이라고 바로 안다.
  - 그런데 `animateFloatAsState` 에 350에서 10을 주면 숫자를 350, 300, 200, 100, 10으로 줄여 가며 **340°를 반대로 돈다**.
- **이 글에서 하는 일**
  - `animateDegreeAsState` 라는 함수를 만든다. 이 함수로 바꾸면 다이얼이 0° 선을 넘어 어느 방향으로든 부드럽게 돈다.

<figure class="media"><video src="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/media/2026/11/dial_drag.webm" poster="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/images/2026/11/dial_drag-thumb.jpg" controls playsinline preload="metadata"></video><figcaption>원문 첫 영상(약 2초). 손가락으로 다이얼 둘레를 끌어 돌리고, 다이얼이 0° 선을 넘을 때도 끊기지 않고 손가락을 따라 돈다. 원문 영상(약 0.8MB), 원문 서버에서 불러옴 (<a href="https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/">원문</a>)</figcaption></figure>

## 1. 문제 — `animateFloatAsState` 는 0° 선을 모른다

- **원문이 처음에 쓴 코드**
  - 손가락으로 끈 각도를 `dragAngle` 이라는 상태에 넣고, 이 값을 `animateFloatAsState` 로 애니메이션해서 다이얼의 회전값으로 넘긴다.

```kotlin
// 직접 쓴 스케치: 원문 "The problem" 코드와 같은 모양
var dragDegrees by remember { mutableFloatStateOf(0f) }   // 손가락이 가리키는 각도(0 이상 360 미만)
val shownDegrees by animateFloatAsState(targetValue = dragDegrees)

Dial(rotation = shownDegrees)
```

- **왜 거꾸로 도나**
  - `animateFloatAsState` 는 목표 숫자를 향해 가는 것이 일이다. 숫자 359와 0이 원 위에서 이웃이라는 것은 모른다.
  - 그래서 손가락이 359°에서 0°로 넘어가면 숫자 359에서 0으로 가는 길, 즉 **거의 한 바퀴를 반대로 도는 길**을 택한다. 원문 표현대로 함수는 "옳게" 동작한 것이다. 숫자 사이의 관계를 모를 뿐이다.
  - 결과: 화면에서는 다이얼이 채찍처럼 휙 반 바퀴 넘게 돌아 목표에 도착한다. 보기 불편하다.

<figure class="media"><video src="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/media/2026/11/dial_compare.webm" poster="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/images/2026/11/dial_compare-thumb.jpg" controls playsinline preload="metadata"></video><figcaption>원문 비교 영상(약 3초). 다이얼 두 개를 나란히 놓고 같은 각도로 돌린다. 왼쪽 animateFloatAsState 다이얼은 0° 선을 넘을 때 거의 한 바퀴를 거꾸로 휙 돌고, 오른쪽 animateDegreeAsState 다이얼은 0° 선을 그대로 넘어간다. 두 다이얼 아래에 지금 각도(예: 331°)가 숫자로 나온다. 원문 영상(약 1.8MB), 원문 서버에서 불러옴 (<a href="https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/">원문</a>)</figcaption></figure>

- 우리가 원하는 것은 오른쪽 다이얼처럼 0° 선을 자연스럽게 넘는 움직임이다.

## 2. `animateDegreeAsState` 만들기

- **매개변수 모양을 `animateFloatAsState` 와 똑같이 둔다**
  - 이유: 기존 코드에서 `animateFloatAsState` 를 `animateDegreeAsState` 로 이름만 바꾸면 되게 하려고.
  - 받는 것: 목표 각도(`targetValue`), 애니메이션 방식(`animationSpec`, 기본은 스프링), 디버깅 도구에 보이는 이름(`label`), 애니메이션이 끝났을 때 부를 함수(`finishedListener`).

```kotlin
// 직접 쓴 스케치: 원문 animateDegreeAsState 와 같은 생각, 이름과 짜임은 다르게 씀
@Composable
fun animateAngleAsState(
    targetDegrees: Float,
    animationSpec: AnimationSpec<Float> = spring(),
    label: String = "AngleAnimation",
    finishedListener: ((Float) -> Unit)? = null,
): State<Float> {
    // 0~360으로 접지 않은 "지금까지 실제로 돈 각도". 380°, -20° 같은 값도 들어간다
    var unwrappedDegrees by remember { mutableFloatStateOf(targetDegrees) }
    // 새 목표가 오면 가까운 쪽으로 돈 만큼만 더한다
    unwrappedDegrees += shortestTurn(from = unwrappedDegrees, to = targetDegrees)

    val rawAnimation = animateFloatAsState(
        targetValue = unwrappedDegrees,
        animationSpec = animationSpec,
        label = label,
        finishedListener = { endDegrees -> finishedListener?.invoke(endDegrees.mod(360f)) },
    )
    // 바깥에는 0 이상 360 미만으로 접은 값만 보여 준다
    return remember { derivedStateOf { rawAnimation.value.mod(360f) } }
}

/** from 에서 to 로 가는 가장 짧은 회전. 시계 방향이면 양수, 반시계 방향이면 음수 */
fun shortestTurn(from: Float, to: Float): Float {
    val clockwise = (to - from).mod(360f)          // 시계 방향 거리, 0 이상 360 미만
    return if (clockwise > 180f) clockwise - 360f  // 반 바퀴보다 멀면 반대로 도는 편이 짧다
    else clockwise
}
```

- **줄마다 무엇을 하나**
  - `unwrappedDegrees`: 원문 이름은 `totalRotation` 이다. 0~360으로 접지 않은 각도를 들고 있다. **이 값이 핵심이다.** `animateFloatAsState` 는 숫자 사이만 이을 줄 아니까, 숫자 자체를 "가까운 쪽"에 놓아 주면 된다.
  - `shortestTurn(...)`: 원문 이름은 `degreeDelta` 다. 지금 값과 새 목표 사이에서 가장 짧은 회전량을 구한다. 이 값을 `unwrappedDegrees` 에 더한다.
  - `animateFloatAsState(targetValue = unwrappedDegrees, ...)`: 바깥에서 받은 `animationSpec`, `label` 을 그대로 넘긴다. 매개변수 이름을 붙여서 넘긴다. `animateFloatAsState` 는 `animationSpec` 다음 자리에 `visibilityThreshold`(이만큼 가까우면 다 왔다고 보는 값)가 있어서, 이름 없이 순서대로 넘기면 `label` 이 엉뚱한 자리로 들어간다.
  - `finishedListener`: 애니메이션이 끝난 값도 0~360으로 접어서 넘긴다. 부르는 쪽은 380 같은 값을 볼 일이 없다.
  - `derivedStateOf { rawAnimation.value.mod(360f) }`: 애니메이션 중인 숫자를 0~360으로 접어서 돌려준다. 원문 설명대로 **부르는 쪽은 `unwrappedDegrees` 안의 예측하기 어려운 숫자를 절대 보지 않는다.**

- **예로 따라가 보기: 340°에서 20°로**
  - 지금 `unwrappedDegrees` 는 340이고 새 목표는 20이다.
  - `shortestTurn(340, 20)` 은 +40을 돌려준다(아래에서 계산).
  - `unwrappedDegrees` 는 340 + 40 = **380** 이 된다. 380°는 원 위에서 20°와 같은 자리이고, 340에서 숫자로도 40만 떨어져 있다.
  - `animateFloatAsState` 는 340에서 380까지 숫자를 올린다. 화면에는 이 값을 접은 340, 350, 0, 10, 20이 차례로 보인다. **0° 선을 넘어 40°만 돈다.**

- **`shortestTurn` 은 어떻게 계산하나**
  - 먼저 시계 방향으로만 돌았을 때의 거리를 잰다. `(to - from).mod(360f)` 이다.
  - 340°에서 20°로: (20 - 340) = -320이고, `mod 360` 은 **40**이다. 반 바퀴(180°)보다 짧으니 그대로 +40을 쓴다.
  - 20°에서 340°로 되돌아가면: (340 - 20) = 320이고, `mod 360` 도 **320**이다. 반 바퀴보다 머니까 반대로 도는 편이 짧다. 320 - 360 = **-40**, 즉 반시계 방향으로 40°를 돌려준다.
  - 정확히 반 바퀴(180°)일 때는 `> 180f` 조건에 걸리지 않아 시계 방향 +180을 쓴다. 양쪽 길이가 같으니 어느 쪽이어도 되지만, 늘 같은 쪽을 고른다는 점은 알아 둔다.

<figure class="media"><video src="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/media/2026/11/degree_delta.webm" poster="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/images/2026/11/degree_delta-thumb.jpg" controls playsinline preload="metadata"></video><figcaption>원문 설명 영상(약 3초). 다이얼 바깥에 고리 세 개를 그려 세 값을 함께 보여 준다. 흰 고리는 목표 각도(targetValue, 예: 20°), 파란 고리는 접지 않은 회전값(totalRotation, 예: 380°)으로 한 바퀴를 넘어 더 감겨 있고, 노란 고리는 animateDegreeAsState가 돌려주는 값(예: 9°)이다. 아래에 세 값이 숫자로도 나온다. 원문 영상(약 0.9MB), 원문 서버에서 불러옴 (<a href="https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/">원문</a>)</figcaption></figure>

- 결과: 다이얼이 0° 선을 넘어 부드럽게 돈다.

## 3. 덤 — 색상(hue)도 같은 방법으로 움직인다

- **왜 색상에도 필요한가**
  - 저자는 유사색 사이를 애니메이션할 때 색 자체가 아니라 색상(hue) 값을 움직이곤 한다. 색이 더 보기 좋게 바뀌어서다.
  - 그런데 색상도 0°~360° 원 위의 값이다. 분홍(약 340°)에서 주황(약 30°)으로 갈 때 숫자만 보고 움직이면 340에서 30으로 **보라, 파랑, 초록, 노랑을 다 거쳐** 간다. 화면에서는 무지개색이 번쩍인다.
  - `animateDegreeAsState` 를 쓰면 0° 선(빨강)을 넘는 짧은 길로 간다. 분홍, 빨강, 주황처럼 가까운 색만 지난다.

```kotlin
// 직접 쓴 스케치: 원문 "Bonus" 코드와 같은 모양
var hueDegrees by remember { mutableFloatStateOf(30f) }
val shownHue by animateAngleAsState(targetDegrees = hueDegrees)

Text(
    text = "Hello",
    color = Color.hsv(shownHue, 0.72f, 1f),   // 색상만 움직이고 채도와 명도는 고정
)
```

- `Color.hsv(색상, 채도, 명도)` 의 색상 자리에 애니메이션 값을 넣는다. 채도 0.72와 명도 1은 원문 값이다.

<figure class="media"><video src="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/media/2026/11/hue.webm" poster="https://storage.ghost.io/c/11/5c/115c7f82-cbbe-4cf5-b8f9-506e7a681ffa/content/images/2026/11/hue-thumb.jpg" controls playsinline preload="metadata"></video><figcaption>원문 색상 비교 영상(약 3초). 화면이 점선으로 위아래로 나뉘고, 가운데 큰 글자 Hello가 걸쳐 있다. 위쪽 절반은 animateDegreeAsState, 아래쪽 절반은 animateFloatAsState로 색을 바꾸고, 양쪽 모서리의 색상환 손잡이로 색상을 고른다. 위쪽 글자는 분홍에서 주황으로 가까운 색만 거쳐 바뀌고, 아래쪽 글자는 여러 색이 번쩍이며 지나간다. 원문 영상(약 0.7MB), 원문 서버에서 불러옴 (<a href="https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/">원문</a>)</figcaption></figure>

- 원문은 "읽어 줘서 고맙다"는 인사로 끝난다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide 1-a에는 다이얼처럼 각도를 돌리는 화면도, 색상 숫자를 움직이는 화면도 없다. 그래서 아래 1번은 "나중에 필요해지면 이렇게 둔다"는 스케치다. 2번은 1-a 계획에 이미 있는 Task 14 `nextMorningAt` 이 같은 문제를 어떻게 다루는지 나란히 놓아 본 것이다. 두 스케치 모두 직접 썼고 컴파일해 보지 않았다. Aide 코드는 고치지 않았다.

### 1. 필요해지면 `core:designsystem` 에 두고, 계산 함수만 단위 테스트한다

```kotlin
// 직접 쓴 스케치: core/designsystem/.../animation/AngleAnimation.kt (지금은 만들지 않음)
// 위 2장의 animateAngleAsState 와 shortestTurn 을 그대로 둔다.
// shortestTurn 은 Compose 없이 도는 순수 함수라서 JVM 단위 테스트로 확인한다.
```

```kotlin
// 직접 쓴 스케치: core/designsystem/src/test/.../animation/ShortestTurnTest.kt (JUnit 5)
class ShortestTurnTest {
    @ParameterizedTest(name = "{0}° → {1}° 는 {2}° 돈다")
    @CsvSource(
        "340, 20, 40",     // 0° 선을 시계 방향으로 넘는다
        "20, 340, -40",    // 0° 선을 반시계 방향으로 넘는다
        "10, 50, 40",      // 0° 선과 상관없는 보통 경우
        "380, 20, 0",      // 이미 같은 자리면 돌지 않는다(접지 않은 값이 와도)
        "0, 180, 180",     // 정확히 반 바퀴는 시계 방향
    )
    fun shortestTurn(from: Float, to: Float, expected: Float) {
        assertEquals(expected, shortestTurn(from, to), 0.001f)
    }
}
```

- 네 번째 줄 `380, 20, 0` 이 중요하다. 화면을 다시 그릴 때마다 `unwrappedDegrees += shortestTurn(...)` 이 다시 실행되는데, 목표가 그대로면 0이 나와서 값이 더 바뀌지 않는다. 이 줄이 그 약속을 지킨다.

### 2. Task 14 `nextMorningAt` 은 "하루"라는 원 위에서 같은 고르기를 한다

- 하루의 시각도 원 위의 값이다. 23:59 다음은 00:00이다. 계획서 Task 14의 `nextMorningAt(now, zone, time)` 은 "지금 다음에 오는 08:30"을 고른다. 오늘 08:30이 아직 안 왔으면 오늘, 지났으면 내일이다. 원문이 "같은 자리를 가리키는 여러 숫자 중 지금에서 가까운 것"을 고른 것과 같은 생각이다. 다른 점은 원문은 앞뒤 중 가까운 쪽을 고르고, 알람은 **앞쪽(미래)만** 고른다는 것이다.

```kotlin
// 직접 쓴 스케치: Task 14 nextMorningAt 의 생각을 원문 말로 옮겨 본 것 (Aide 코드 아님)
fun nextMorningAt(now: Instant, zone: ZoneId, time: LocalTime): Instant {
    val today = now.atZone(zone).toLocalDate()
    val todayAt = ZonedDateTime.of(today, time, zone).toInstant()   // 이번 바퀴의 08:30
    return if (todayAt.isAfter(now)) todayAt
    else ZonedDateTime.of(today.plusDays(1), time, zone).toInstant() // 다음 바퀴의 08:30
}
```

- 계산을 `LocalTime` 끼리 빼서 하지 않고 `Instant`(시간대와 상관없는 한 순간)로 비교한다. 그래서 원문의 "359에서 0으로 거꾸로 감" 같은 일이 생기지 않는다. 다음 날 08:30을 만들 때도 시각에 24시간을 더하지 않고 날짜에 하루를 더한 뒤 현지 08:30을 만든다. 서머타임이 바뀌는 날 하루는 23시간이나 25시간이라, 24시간을 더하면 07:30이나 09:30이 된다.

## 배운 점

- **원 위의 값은 숫자 하나로 들고 있으면 안 되는 순간이 있다.** 각도, 색상, 하루의 시각, 요일처럼 끝과 처음이 이어지는 값은 "숫자로 가까운 것"과 "원 위에서 가까운 것"이 다르다. 애니메이션이나 거리 계산처럼 **두 값 사이를 다룰 때** 차이가 드러난다.
- **고치는 방법은 애니메이션을 바꾸는 것이 아니라 목표 숫자를 바꾸는 것이다.** `animateFloatAsState` 는 그대로 쓰고, 목표를 0~360 밖(380, -20 등)에 놓아 숫자로도 가까워지게 만들었다. 바깥에는 접은 값만 보여 줘서 부르는 쪽 코드는 바뀌지 않는다.
- **같은 매개변수 모양으로 만들면 바꿔 끼우기 쉽다.** 원문 함수는 `animateFloatAsState` 와 매개변수가 같아서 이름만 바꾸면 된다. 다만 이름 없이 순서대로 넘기면 `visibilityThreshold` 자리로 잘못 들어갈 수 있으니 이름을 붙여 넘긴다.
- **색을 바꿀 때는 먼저 `animateColorAsState` 로 충분한지 본다.** Compose의 `animateColorAsState` 는 색을 색상 숫자로 돌리지 않고 Oklab이라는 색 공간(사람 눈에 고르게 보이게 만든 색 좌표)에서 섞는다(Compose 소스 `ColorVectorConverter.kt` 에서 확인). 그래서 원문의 무지개 번쩍임은 **색상 숫자를 직접 움직일 때만** 생긴다. 원문처럼 색상환을 따라 도는 느낌을 일부러 내고 싶을 때 `animateDegreeAsState` 방식을 쓴다.
- 내가 덧붙이는 주의: 원문 함수는 화면을 그리는 도중(컴포지션 중)에 `totalRotation` 값을 바꾼다. 목표가 그대로면 더하는 값이 0이라 다시 그리기가 이어지지 않지만, 이 약속이 깨지면(예: `shortestTurn` 이 0이 아닌 값을 계속 내면) 다시 그리기가 끝없이 이어질 수 있다. 그래서 1번 스케치의 테스트에 "이미 같은 자리면 0"을 넣었다.

## Aide에 적용하면

Aide 코드에서 `animate*AsState`, `Animatable`, `rotate`, `graphicsLayer`, `Color.hsv` 를 찾아보면 하나도 없다(최신 커밋 `31ad4dc`). 이식 원본인 Note-Android에도 회전이나 색상 애니메이션이 없다. 1-a 계획(Task 1~18)에도 다이얼, 원형 게이지, 색상 슬라이더 같은 화면은 없다.

1. **`animateDegreeAsState` 를 지금 Aide에 넣지 않는다 — 지금은 안 한다.**
   - 이유: 쓰는 곳이 없다. 쓰는 곳이 없는 공통 코드를 `core:designsystem` 에 미리 두면, 테스트와 이름을 관리할 일만 늘어난다.
   - 첫 화면 아바타의 움직임은 2026-10-08 결정대로 **Rive 상태 머신**이 맡는다. 앱 코드는 `activity` 와 `weather` 두 값만 넘기고, 회전 같은 움직임은 Rive 파일 안에서 만든다. 그래서 아바타 때문에 Compose에서 각도를 애니메이션할 일도 없다.
   - 나중에 쓸 곳이 생기면 "코드로 보기" 1번처럼 `core:designsystem` 에 두고, `shortestTurn` 을 JUnit 5 단위 테스트(2026-10-12 결정, JUnit 5.14.4)로 먼저 확인한다.
2. **Task 10 일정 추가 화면의 캘린더 색 점은 `animateColorAsState` 로 충분하다 — 바꿔서 가져온다(필요할 때).**
   - 계획서 Task 10 Step 2는 캘린더 선택 목록을 "색 점 + 이름 + 계정"으로 그린다. 선택한 캘린더에 따라 색이 바뀌는 연출을 넣는다면 `animateColorAsState` 를 쓴다.
   - 이유: `animateColorAsState` 는 Oklab 색 공간에서 섞어서 원문의 무지개 번쩍임이 생기지 않는다. 원문 방식(색상 숫자를 직접 움직이기)은 필요 없다. 연출을 넣을지 말지는 Task 10을 할 때 사용자가 정한다.
3. **Task 14 `nextMorningAt` 은 계획서의 테스트 표를 그대로 지킨다 — 가져온다(이미 계획에 있다).**
   - 원문의 생각("원 위에서 같은 자리를 가리키는 숫자 중 알맞은 것을 고른다")이 Task 14의 "오늘 08:30인지 내일 08:30인지 고르기"와 같다("코드로 보기" 2번).
   - 계획서 표의 4개 경우(07:00이면 오늘 08:30, 08:30 정각이면 내일 08:30, 09:00이면 내일 08:30, 서머타임 시작 전날이면 다음 날 현지 08:30)가 이 고르기의 경계를 이미 다 덮는다. 특히 2번 "정각이면 내일"은 원문의 "정확히 반 바퀴면 시계 방향" 처럼 **경계에서 어느 쪽을 고를지 정해 둔 줄**이다. 이 줄을 빼지 않는다.
   - 계산은 `LocalTime` 끼리 빼지 않고 `Instant` 로 비교하고, 다음 날은 24시간을 더하지 않고 날짜에 하루를 더한다. 계획서 Interfaces의 `nextMorningAt(now: Instant, zone: ZoneId, time: LocalTime): Instant` 모양이 이미 그렇게 짜여 있다. 바꿀 것은 없다.

## 출처

- 원문: sinasamaki, [Animating Angles in Jetpack Compose](https://www.sinasamaki.com/animate-degree-as-state-in-jetpack-compose/), 2026-11-18. 원문 블로그는 하단에 이름 표시만 있고 공개 라이선스가 없어서, 코드는 옮기지 않고 직접 쓴 스케치로 대신했고 설명은 내 말로 다시 썼다. 그림 1장과 영상 4개는 원문 서버 주소를 걸어 보여 준다.
- 원문이 실린 곳: [Android Weekly #754](https://androidweekly.net/issues/issue-754)
- Compose 문서: [Value-based animations](https://developer.android.com/develop/ui/compose/animation/value-based)
- Compose 소스: `androidx.compose.animation` 의 `ColorVectorConverter.kt` (로컬 Gradle 캐시의 animation-android 1.6.7 소스에서 읽음. `Color` 를 `ColorSpaces.Oklab` 로 바꿔 애니메이션한다)
- Aide 코드: Aide-Android 전체에서 애니메이션, 회전, `Color.hsv` 사용처를 찾아봄 (최신 커밋 `31ad4dc` 에서 읽기만 함, 사용처 없음)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-08 아바타 Rive 결정, 2026-10-12 JUnit 5 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 10과 Task 14
