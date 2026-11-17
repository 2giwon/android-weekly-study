---
issue: 753
date: 2026-11-15
title: 흐린 글자 두 장과 색 행렬 하나로 단어를 녹이기 — Compose Morph Text
original_title: How Morph Text dissolves one word into the next
url: https://dev.to/lightscout/how-morph-text-dissolves-one-word-into-the-next-47cl
author: Juan Silva (Glaze)
tags: [Compose, 애니메이션, graphicsLayer, Multiplatform]
aide:
  status: candidate
  module: feature:home
  task: 1-b
  summary: Morph Text 효과 자체는 1-a 범위 밖이고 Aide는 Android 8부터 지원해 흐림이 안 되는 기기가 많아 지금은 넣지 않는다. 대신 프레임마다 바뀌는 값은 graphicsLayer 람다에서 읽고, 시간으로 움직이는 상태 계산은 순수 함수로 빼서 JUnit 5로 시험하는 습관을 1-b에 가져온다
---

## 한 줄 요약

**Morph Text** 는 한 단어가 흐려지며 녹아서 다음 단어로 다시 또렷해지는 글자 전환 효과다. 만드는 재료는 셋뿐이다. 두 단어를 겹쳐 그린 `Text` 두 개, 각 단어에 거는 **흐림(blur)**, 그리고 둘을 한꺼번에 통과시키는 **색 행렬(color matrix) 필터** 하나다. 사라지는 단어는 점점 흐려지고 나타나는 단어는 점점 또렷해진다. 그 위에 "투명도가 일정 값을 넘으면 꽉 채우고, 못 넘으면 지운다"는 **문턱(threshold)** 을 걸면, 흐린 글자의 옅은 가장자리가 단단한 덩어리가 되고 두 단어의 덩어리가 맞닿은 곳이 한 모양으로 붙는다. 저자 Juan Silva는 React와 SVG 필터로 만든 원본 컴포넌트를 Compose Multiplatform으로 옮겨, Android 12 이상과 iOS와 웹에서 같은 코드로 돌린다. 파일 하나 199줄이고, 셰이더(shader, GPU에서 픽셀마다 도는 작은 프로그램)는 쓰지 않는다.

> 원문 그림은 표지 1장이다. 라이선스 표시가 없어 원문 서버 주소를 걸어 보여 준다. 원문 코드는 저자의 [glaze-components](https://github.com/lightScout/glaze-components/tree/main/components/morph-text) 저장소에 있는 `MorphText.kt` 와 같은 코드이고, 이 저장소는 Apache 2.0 라이선스다(원본 React 컴포넌트의 MIT 고지는 같은 폴더의 `NOTICE` 에 있다). 그래서 원문 코드는 저장소의 파일에서 인용하고 블록마다 출처를 적었다. "코드로 보기" 절의 코드는 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **Morph Text**: 이 글이 다루는 컴포넌트 이름. "모양이 바뀌는 글자"라는 뜻으로, 단어 목록을 받아 하나씩 녹여 가며 다음 단어로 바꾼다.
- **Glaze**: 저자가 만든 Compose Multiplatform 컴포넌트 모음 앱. 브라우저와 Google Play에서 컴포넌트를 직접 움직여 보고 코드를 볼 수 있다.
- **Compose Multiplatform(CMP)**: JetBrains가 만든, Jetpack Compose 코드를 Android 말고도 iOS, 데스크톱, 웹에서 돌리게 해 주는 프레임워크. Android가 아닌 곳에서는 **Skia**(구글의 2D 그리기 엔진)로 화면을 그린다.
- **블러(blur), 흐림**: 픽셀마다 주변 픽셀과 섞어 뿌옇게 만드는 효과. 흐림 반지름이 클수록 더 넓게 번진다. Compose에서는 `BlurEffect` 로 건다.
- **알파(alpha), 투명도**: 픽셀이 얼마나 불투명한지를 나타내는 값. 0이면 완전히 투명하고, 255(또는 1.0)이면 완전히 불투명하다.
- **문턱(threshold)**: 어떤 값이 기준을 넘으면 "있다", 못 넘으면 "없다"로 딱 나누는 처리. 이 글에서는 투명도에 건다. 흐린 글자의 옅은 번짐이 문턱을 넘으면 꽉 찬 색이 된다.
- **색 행렬(ColorMatrix)**: 픽셀의 빨강, 초록, 파랑, 투명도(RGBA) 네 값을 받아 새 네 값을 계산하는 4행 5열의 숫자 표. 각 행이 출력 값 하나를 만든다. 다섯째 열은 곱하지 않고 더하는 **오프셋(offset)** 이다. Android의 `ColorMatrixColorFilter` 와 같은 개념이다.
- **`graphicsLayer`**: 컴포저블을 별도 그리기 층으로 만들어 투명도, 크기, 효과 같은 것을 거는 Modifier. 람다(lambda, 이름 없는 함수)를 받는 형태로 쓰면 그 안에서 읽는 값은 **그리기 단계** 에서 읽힌다.
- **오프스크린 레이어(offscreen layer)**: 화면에 바로 그리지 않고 따로 마련한 그림판에 먼저 그린 뒤, 그 결과 전체에 효과를 걸어 화면에 올리는 방식. `graphicsLayer` 에 색 필터를 걸면 안쪽 내용이 모두 이 그림판에 그려진 뒤 필터가 한 번에 걸린다.
- **`RenderEffect`**: 그리기 층 전체에 흐림 같은 효과를 거는 Android 기능. **Android 12(API 31)부터** 지원한다. Compose의 `BlurEffect` 가 이것이다.
- **`TileMode`**: 흐림처럼 주변 픽셀을 섞는 효과가 그림 바깥을 어떻게 볼지 정하는 값. `Decal` 은 "바깥은 투명하다"로 보고, 기본값 `Clamp` 는 가장자리 픽셀을 바깥으로 늘려 붙인다.
- **`LaunchedEffect`**: 컴포저블이 화면에 있는 동안 코루틴을 돌리는 Compose 함수. 넘긴 키 값이 바뀌면 돌던 코루틴을 멈추고 새로 시작한다.
- **`withFrameMillis`**: 다음 화면 프레임이 그려질 때까지 기다렸다가 그 프레임의 시각(밀리초)을 돌려주는 함수. 반복문 안에서 부르면 화면 주사율(60Hz, 120Hz 등)에 맞춰 한 프레임에 한 번씩 돈다.
- **상태 기계(state machine)**: "지금 어느 상태인가"와 "무엇이 일어나면 어느 상태로 가는가"만으로 동작을 정하는 구조. 이 글에서는 "바뀌는 중"과 "쉬는 중" 두 상태를 오간다.
- **리컴포지션(recomposition)**: 상태가 바뀌어 Compose가 화면 함수를 다시 실행하는 것.

## 서론 — React 컴포넌트를 Compose로 옮기다

<figure class="media"><img src="https://media2.dev.to/dynamic/image/width=1000,height=420,fit=cover,gravity=auto,format=auto/https%3A%2F%2Fdev-to-uploads.s3.us-east-2.amazonaws.com%2Fuploads%2Farticles%2F77j7qyttvmrxdz6ftlde.png" alt="검은 바탕. 왼쪽 위 주황 글씨 COMPOSE MULTIPLATFORM, 그 아래 큰 흰 글씨 How Morph Text dissolves one word into the next, 그 아래 회색 글씨 Blur, alpha and a colour matrix, with no shaders. 오른쪽에 세 줄이 세로로 있다. t = 0 옆에 또렷한 흰 글씨 Compose, t = 0.5 옆에 주황빛으로 뿌옇게 번진 Kompose 같은 글씨, t = 1 옆에 또렷한 흰 글씨 Kotlin. 왼쪽 아래에 Glaze 로고와 Juan Silva, Glaze" loading="lazy"><figcaption>원문 표지. 오른쪽에 전환 진행률 t가 0일 때, 0.5일 때, 1일 때의 모습을 세로로 늘어놓았다. t가 0이면 또렷한 "Compose", 0.5이면 두 단어가 뿌옇게 녹아 섞인 주황빛 덩어리, 1이면 또렷한 "Kotlin"이다. 부제는 "셰이더 없이 흐림, 투명도, 색 행렬만으로"라는 뜻이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://dev.to/lightscout/how-morph-text-dissolves-one-word-into-the-next-47cl">원문</a>)</figcaption></figure>

**무엇을 옮겼나**
- 원본은 Victor Welander가 21st.dev에 올린 React 컴포넌트 [Gooey Text Morphing](https://21st.dev/@victorwelander/components/gooey-text-morphing)이다. 원본은 브라우저의 SVG 필터로 만들어졌다.
- 저자는 이것을 Compose로 옮겨 자기 컴포넌트 모음 앱 [Glaze](https://glaze.lightscout.co.uk)에 넣었다.

**왜 이 글을 썼나**
- 효과가 어떻게 만들어지는지, 각 숫자를 바꾸면 무엇이 달라지는지를 설명하려고 썼다.
- 글을 읽으면서 [Glaze 웹 페이지](https://glaze.lightscout.co.uk/components/morph-text)에서 글에 나오는 값을 모두 슬라이더로 움직여 볼 수 있다.

**결과**
- 같은 Compose 코드가 Android 12 이상, iOS, 웹에서 똑같이 돈다. 흐린 `Text` 두 개와 색 행렬 하나가 전부다.

## 1. 생각 — 겹쳐 그리고, 흐리고, 문턱을 건다

**첫 단계: 두 단어를 겹쳐 그리고 흐림을 엇갈리게 건다**
- 사라지는 단어와 나타나는 단어를 같은 자리에 겹쳐 그린다.
- 사라지는 단어는 투명해지면서 점점 흐려지고, 나타나는 단어는 불투명해지면서 점점 또렷해진다.
- 여기까지만 하면 그냥 흐림이 조금 섞인 **크로스페이드(cross-fade, 하나가 사라지는 동안 다른 하나가 나타나는 전환)** 다.

**둘째 단계: 전체에 투명도 문턱을 건다**
- 투명도가 기준보다 높은 픽셀은 꽉 찬 색이 되고, 낮은 픽셀은 사라진다.
- 흐린 글자는 가장자리가 부드럽고 옅은 번짐이 길게 퍼져 있다. 문턱을 걸면 이 번짐이 단단한 덩어리(blob)로 바뀐다.
- 두 단어의 덩어리가 겹치는 곳은 하나의 모양으로 붙는다. "녹아서 이어지는" 느낌이 여기서 나온다.

**원본과 Compose의 재료 비교**
- CSS 원본은 흐림을 `feGaussianBlur`, 문턱을 `feColorMatrix` 라는 SVG 필터로 만든다.
- Compose에도 두 재료가 다 있다. 흐림은 `BlurEffect`, 문턱은 `ColorFilter.colorMatrix` 다.

## 2. 시간 흐름 — 바뀌는 중과 쉬는 중을 오가는 반복

**무엇을 하나**
- 애니메이션은 두 상태를 오가는 반복이다. `morphTime` 초 동안 녹이며 바꾸고, 새 단어를 `cooldownTime` 초 동안 그대로 보여 준다.
- `LaunchedEffect` 안에서 `withFrameMillis` 로 프레임마다 한 번씩 상태를 갱신한다.

**왜 이렇게 하나**
- 프레임마다 돌기 때문에 화면 주사율을 그대로 따른다.
- `LaunchedEffect` 의 키에 `morphTime` 과 `cooldownTime` 을 넣어 두어서, 슬라이더로 시간을 바꾸면 반복이 새 값으로 바로 다시 시작한다.

```kotlin
LaunchedEffect(textCount, morphTime, cooldownTime) {
    var lastMs = withFrameMillis { it }
    while (true) {
        val frameMs = withFrameMillis { it }
        val dt = (frameMs - lastMs) / 1000f
        lastMs = frameMs
        state = state.run {
            if (inCooldown) {
                val remaining = cooldownRemaining - dt
                if (remaining <= 0f) {
                    copy(
                        textIndex = (textIndex + 1) % textCount,
                        morphFraction = 0f,
                        inCooldown = false,
                        cooldownRemaining = 0f,
                    )
                } else {
                    copy(cooldownRemaining = remaining)
                }
            } else {
                val next = (morphFraction + dt / morphTime).coerceAtMost(1f)
                if (next >= 1f) {
                    copy(morphFraction = 1f, inCooldown = true, cooldownRemaining = cooldownTime)
                } else {
                    copy(morphFraction = next)
                }
            }
        }
    }
}
```

> 출처: `rememberMorphState` 의 반복 부분, [MorphText.kt](https://github.com/lightScout/glaze-components/blob/main/components/morph-text/MorphText.kt) ([lightScout/glaze-components](https://github.com/lightScout/glaze-components), Apache 2.0)

- `var lastMs = withFrameMillis { it }`: 첫 프레임의 시각을 기억해 둔다.
- `val dt = (frameMs - lastMs) / 1000f`: 지난 프레임에서 지금 프레임까지 흐른 시간을 초 단위로 구한다. 이 값만큼 상태를 앞으로 민다.
- `if (inCooldown)`: 쉬는 중이면 남은 쉬는 시간에서 `dt` 를 뺀다. 0 이하가 되면 다음 단어로 넘어가고(`(textIndex + 1) % textCount` 라서 마지막 다음은 처음이다) "바뀌는 중"으로 바꾼다.
- `else`: 바뀌는 중이면 진행률 `morphFraction` 에 `dt / morphTime` 을 더한다. 1에 닿으면 1에서 멈추고 "쉬는 중"으로 바꾼다.
- `state.run { copy(...) }`: 상태를 고치지 않고 새 값으로 바꿔 끼운다. 상태가 `data class` 라서 `copy` 로 필요한 칸만 바꾼다.

**진행률 하나에서 단어별 진행률 둘을 만든다**
- 전체 진행률 `f` 는 0에서 1로 간다. 여기서 사라지는 단어의 진행률 `t1` 과 나타나는 단어의 진행률 `t2` 를 따로 만든다.

```kotlin
val p = (config.morphSequence * 0.5f).coerceIn(0f, 0.499f)
val denom = (1f - p).coerceAtLeast(0.001f)
val t1 = ((1f - f) / denom).coerceIn(0f, 1f)
val t2 = ((f - p) / denom).coerceIn(0f, 1f)
```

> 출처: `MorphText` 의 진행률 계산, [MorphText.kt](https://github.com/lightScout/glaze-components/blob/main/components/morph-text/MorphText.kt) ([lightScout/glaze-components](https://github.com/lightScout/glaze-components), Apache 2.0)

- `p` 는 "사라지는 단어가 처음에 얼마 동안 그대로 버티는가"다. `morphSequence` 의 절반이고, 0.499를 넘지 않게 막는다.
- `p` 가 0이면 두 단어가 전환 시간 전체에 걸쳐 고르게 엇갈린다.
- 기본값 `morphSequence` 0.5이면 `p` 는 0.25다. 이때 `t1` 은 `f` 가 0.25가 될 때까지 1로 남는다. 그래서 사라지는 단어는 처음 4분의 1 동안 가만히 있고, 녹아 섞이는 일은 나머지 4분의 3 동안 일어난다. `t2` 도 `f` 가 0.25를 넘어야 0에서 오르기 시작한다.

**투명도는 진행률 그대로가 아니라 `t` 의 0.4제곱이다**
- `t^0.4` 곡선은 단어가 사라지는 동안 꽤 늦게까지 불투명함을 유지한다. 예를 들어 `t` 가 0.1이어도 투명도는 약 0.4다.
- 그래서 화면에 흐린 재료가 더 오래 남고, 문턱이 덩어리로 바꿀 거리가 많아진다.

## 3. 흐림 곡선 — 끝에 가서 가파르게 번진다

**식**
- 단어마다 흐림 반지름을 진행률 `t` 에서 이렇게 구한다.

```text
blur = min( blurBase / t - blurBase , blurMaxDp )
```

**값을 넣어 보면**
- `t` 가 1이면 `blurBase / 1 - blurBase = 0` 이라 흐림이 없다. 단어가 또렷하다.
- `t` 가 0.5이면 흐림은 `blurBase` 와 같다.
- `t` 가 0.25이면 흐림은 `blurBase` 의 세 배다.
- `t` 가 0에 가까워지면 값이 끝없이 커지므로 `blurMaxDp` 로 막는다.
- 기본값(`blurBase` 8, `blurMaxDp` 40)이면 단어가 절반 세기일 때 8dp 흐려지고, 약 6분의 1 지점에서 40dp 상한에 닿는다.

**왜 직선이 아니라 이 곡선인가**
- 흐림을 직선으로 늘리면 변화가 전환 내내 고르게 퍼진다.
- 이 곡선은 단어가 사라지는 앞쪽 절반 동안에는 흐림을 `blurBase` 아래로 두고, 끝에 가서 가파르게 올린다. 문턱이 흐림을 덩어리로 바꾸는 일이 바로 그 끝에서 일어난다.

**Compose에서 하나 더 챙길 것**
- 흐림은 글자의 레이아웃 경계 밖으로 번진다. 그래서 안쪽 `Box` 에 `blurMaxDp + 8dp` 만큼 여백(padding)을 준다.
- 여백이 없으면 번진 흐림이 문턱을 거는 층의 경계에서 잘린다.

## 4. 문턱 — 색 행렬의 마지막 줄이 투명도를 다시 쓴다

**코드**
- 빨강, 초록, 파랑은 그대로 두고 투명도만 바꾸는 색 행렬이다.

```kotlin
val thresholdFilter = remember(config.thresholdGain, config.thresholdBias) {
    ColorFilter.colorMatrix(
        ColorMatrix(
            floatArrayOf(
                1f, 0f, 0f, 0f, 0f,
                0f, 1f, 0f, 0f, 0f,
                0f, 0f, 1f, 0f, 0f,
                0f, 0f, 0f, config.thresholdGain, config.thresholdBias,
            )
        )
    )
}
```

> 출처: `MorphText` 의 문턱 필터, [MorphText.kt](https://github.com/lightScout/glaze-components/blob/main/components/morph-text/MorphText.kt) ([lightScout/glaze-components](https://github.com/lightScout/glaze-components), Apache 2.0)

- 첫 세 줄은 "빨강은 빨강 그대로, 초록은 초록 그대로, 파랑은 파랑 그대로"라는 뜻이다(대각선에만 1).
- 마지막 줄은 `새 투명도 = thresholdGain × 원래 투명도 + thresholdBias` 다. 결과는 0에서 255 사이로 잘린다.
- Compose는 다섯째 열(더하는 값)을 채널 값과 같은 0에서 255 범위로 받는다. Android의 `ColorMatrixColorFilter` 와 같다.
- `remember` 의 키가 이득(gain)과 치우침(bias)이라, 두 값이 바뀔 때만 필터를 새로 만든다.

**기본값(이득 18, 치우침 -7)으로 계산하면**
- 투명도 0인 픽셀은 `18 × 0 - 7 = -7` 이 잘려 0으로 남는다.
- 원래 투명도가 약 15(불투명도 6%)를 넘으면 `18 × 15 - 7 = 263` 이 잘려 255, 완전히 불투명해진다.
- 그 사이(원래 투명도 약 0.4에서 14.6)는 얇은 부드러운 띠로 남는다. 이 띠 덕분에 덩어리 가장자리가 계단처럼 깨지지 않는다(안티앨리어싱, anti-aliasing).

**그래서 무엇이 보이나**
- 평소라면 거의 안 보일 흐린 글자의 옅은 번짐이 꽉 찬 색이 된다. 두 번짐이 닿으면 한 모양이 된다.
- **이득**은 가장자리가 얼마나 딱딱한지 정한다. 이득이 클수록 부드러운 띠가 얇아진다.
- **치우침**은 기준선을 옮긴다. 더 음수로 내리면 옅은 번짐을 더 많이 무시하므로 덩어리가 작아지고 더 늦게까지 떨어져 있다.

**필터는 바깥 `Box` 에 한 번만 건다**
- `graphicsLayer { colorFilter = thresholdFilter }` 로 부모 `Box` 에 건다. 두 단어가 같은 오프스크린 레이어에 먼저 그려지고, 문턱은 그 결과에 한꺼번에 걸린다.
- 단어마다 따로 문턱을 걸면 덩어리가 두 벌 생기고 서로 붙지 않는다. "녹아 이어지는" 효과는 두 단어가 **한 층에서 함께** 문턱을 지나야 나온다.

**Multiplatform에서 걸리는 함정**
- Skia는 다섯째 열을 -255에서 255가 아니라 -1에서 1 범위로 읽는다.
- 예전 Compose Multiplatform 버전은 이 값을 변환하지 않고 그대로 넘겨서, 같은 행렬이 iOS, 데스크톱, 웹에서 다르게 보였다([compose-multiplatform 이슈 #3461](https://github.com/JetBrains/compose-multiplatform/issues/3461), "Skiko 기반 플랫폼에서 5열 값 범위가 틀리다", 2023-08-08에 닫힘).
- 문턱이 Android에서는 맞는데 다른 곳에서 이상하면 Compose 버전부터 확인하라고 저자는 권한다.

## 5. 합치기 — 층 세 개

**구조**
- 문턱을 거는 바깥 `Box`, 흐림이 잘리지 않게 여백을 준 안쪽 `Box`, 그리고 각자 투명도와 흐림을 가진 `Text` 두 개다.

```kotlin
Box(
    contentAlignment = Alignment.Center,
    modifier = modifier.graphicsLayer { colorFilter = thresholdFilter; clip = false },
) {
    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier.padding(config.blurMaxDp.dp + 8.dp),
    ) {
        Text(text = text1, style = style, modifier = Modifier.graphicsLayer {
            alpha = t1.powF(0.4f)
            val blurPx = (config.blurBase / t1.coerceAtLeast(0.001f) - config.blurBase)
                .coerceIn(0f, config.blurMaxDp).dp.toPx()
            if (blurPx > 0f) renderEffect = BlurEffect(blurPx, blurPx, TileMode.Decal)
            clip = false
        })
        Text(text = text2, style = style, modifier = Modifier.graphicsLayer {
            alpha = t2.powF(0.4f)
            val blurPx = (config.blurBase / t2.coerceAtLeast(0.001f) - config.blurBase)
                .coerceIn(0f, config.blurMaxDp).dp.toPx()
            if (blurPx > 0f) renderEffect = BlurEffect(blurPx, blurPx, TileMode.Decal)
            clip = false
        })
    }
}
```

> 출처: `MorphText` 의 화면 구성, [MorphText.kt](https://github.com/lightScout/glaze-components/blob/main/components/morph-text/MorphText.kt) ([lightScout/glaze-components](https://github.com/lightScout/glaze-components), Apache 2.0)

- 바깥 `Box` 의 `graphicsLayer` 가 문턱 필터를 건다. `clip = false` 로 번진 흐림을 경계에서 자르지 않는다.
- 안쪽 `Box` 의 `padding(config.blurMaxDp.dp + 8.dp)` 이 3장에서 말한 "흐림이 번질 자리"다.
- 두 `Text` 는 각자 `graphicsLayer` 안에서 투명도(`t.powF(0.4f)`)와 흐림 반지름(3장의 식)을 정한다. `t1.coerceAtLeast(0.001f)` 는 0으로 나누지 않게 막는 장치다.
- `.dp.toPx()`: 흐림 반지름을 dp로 계산한 뒤 화면 밀도에 맞는 픽셀로 바꾼다.

**놓치기 쉬운 것 네 가지**
- **`TileMode.Decal`**: 글자 바깥을 투명하다고 보고 흐린다. 기본값은 가장자리 픽셀을 바깥으로 늘려 붙여서 번짐이 지저분하게 퍼진다.
- **흐림이 0보다 클 때만 건다**: 완전히 또렷한 단어는 흐림 처리를 아예 거치지 않고 그린다. 쉬는 중에 보이는 단어가 여기에 해당한다.
- **`powF` 를 따로 만든 이유**: Kotlin 공통 표준 라이브러리에는 `Float.pow` 가 없어서, `Double` 로 바꿔 제곱한 뒤 `Float` 로 되돌린다. 그래서 파일 전체가 Android, iOS, 웹이 함께 쓰는 공통 코드에 남는다.
- **Android 11 이하에서는 녹지 않는다**: `BlurEffect` 는 `RenderEffect` 라서 Android 12(API 31)부터만 된다. Android 11 이하에서는 아무 일도 하지 않으므로, 저자 말로는 단어가 녹지 않고 문턱을 거친 크로스페이드로만 바뀐다. iOS와 웹에는 이 제한이 없다.

상태 기계와 설정까지 넣어 파일 전체가 199줄이다(저장소에 지금 있는 파일은 줄을 더 줄여 143줄이다).

## 6. 값 조정하기 — 코드 기본값과 웹 페이지 값

**웹 페이지는 더 부드러운 값에서 시작한다**
- 코드의 기본값보다 이득을 낮추고 치우침을 깊게 내린 값이다. 그래서 웹 페이지의 가장자리는 딱 끊기지 않고 살짝 빛나듯 번진다.
- 원문의 값으로 계산해 보면, 웹 페이지 값(이득 3.9, 치우침 -38.25)에서는 원래 투명도가 약 10 아래면 사라지고 약 75 위면 꽉 찬다. 부드러운 띠가 기본값(약 0.4에서 14.6)보다 훨씬 넓어서 빛나는 가장자리가 된다.

| 값 | 코드 기본값 | 웹 페이지 값 | 올리면 생기는 일 |
| --- | --- | --- | --- |
| `morphTime` | 1초다. | 1.36초다. | 녹아 바뀌는 속도가 느려진다. |
| `cooldownTime` | 0.25초다. | 0.79초다. | 다음 전환 전에 각 단어가 더 오래 머문다. |
| `blurBase` | 8이다. | 12.19다. | 단어가 사라지는 과정에서 더 일찍 녹기 시작한다. |
| `blurMaxDp` | 40dp다. | 20.76dp다. | 덩어리가 더 멀리 퍼지고 더 먼 글자와도 붙는다. |
| `thresholdGain` | 18이다. | 3.9다. | 가장자리가 더 딱딱해진다. 아주 낮으면 빛나는 번짐이 된다. |
| `thresholdBias` | -7이다. | -38.25다. | 더 음수로 내리면 옅은 번짐을 더 많이 잘라 덩어리가 작아진다. |
| `morphSequence` | 0.5다. | 7.24다. | 사라지는 단어가 엇갈림이 시작되기 전까지 더 오래 버틴다. |

- `morphSequence` 는 절반으로 줄인 뒤 0.5 바로 아래에서 막는다. 그래서 1 이상은 모두 같게 동작한다. 사라지는 단어가 전환의 앞쪽 절반 동안 버티고, 엇갈림은 뒤쪽 절반에서 일어난다. 웹 페이지 값 7.24도 결국 이 경우다.

**저자가 권하는 첫 실험**
- 이득을 2쯤까지 내려 빛나는 번짐을 본다. 다시 20 위로 올려 가장자리가 딱 끊기는 것을 본다.
- 그다음 흐림 상한(Blur Max)으로 같은 실험을 한다.

## 7. 직접 해 보기

- **브라우저에서 바로**: [glaze.lightscout.co.uk/components/morph-text](https://glaze.lightscout.co.uk/components/morph-text). 위 표의 슬라이더가 모두 있다.
- **소스**: [GitHub의 MorphText.kt](https://github.com/lightScout/glaze-components/tree/main/components/morph-text). Apache 2.0이고, 원본 React 컴포넌트의 MIT 고지가 함께 있다.
- **앱**: Google Play의 Glaze. iOS판은 심사 중이다. Morph Text와 다른 컴포넌트를 코드와 설정 방법과 함께 볼 수 있다.
- 저자는 이 컴포넌트로 무언가를 만들거나 더 마음에 드는 값을 찾으면 보여 달라며 글을 맺는다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide에는 아직 글자 전환 애니메이션이 없다. Aide 코드에서 `graphicsLayer`, `BlurEffect`, `RenderEffect`, `animate`, `Crossfade`, `AnimatedContent` 를 검색해도 나오는 것이 없다. 1-b에서 아바타가 말하는 문구를 바꿀 때 쓸 수 있는 모양을 미리 대 본다. 아래 코드는 모두 **직접 쓴 스케치**이고, Aide 코드에 넣지 않았다.

### 1. 시간으로 움직이는 상태 계산은 순수 함수로 빼서 시험한다

원문의 상태 갱신은 `LaunchedEffect` 안에 들어 있어서, 시험하려면 화면을 띄우고 프레임을 돌려야 한다. 같은 계산을 "지금 상태와 흐른 시간을 받아 다음 상태를 돌려주는 함수"로 꺼내면 JVM 단위 테스트로 바로 시험할 수 있다. 아래 `advance` 는 원문 `MorphText.kt` 의 상태 갱신 부분(Apache 2.0)을 함수로 꺼낸 스케치다.

```kotlin
data class MorphState(
    val textIndex: Int,
    val morphFraction: Float,
    val inCooldown: Boolean,
    val cooldownRemaining: Float,
)

fun MorphState.advance(
    dtSec: Float,
    textCount: Int,
    morphTime: Float,
    cooldownTime: Float,
): MorphState =
    if (inCooldown) {
        val remaining = cooldownRemaining - dtSec
        if (remaining <= 0f) {
            copy(textIndex = (textIndex + 1) % textCount, morphFraction = 0f, inCooldown = false, cooldownRemaining = 0f)
        } else {
            copy(cooldownRemaining = remaining)
        }
    } else {
        val next = (morphFraction + dtSec / morphTime).coerceAtMost(1f)
        if (next >= 1f) {
            copy(morphFraction = 1f, inCooldown = true, cooldownRemaining = cooldownTime)
        } else {
            copy(morphFraction = next)
        }
    }
```

화면 쪽 반복문은 `state = state.advance(dt, textCount, morphTime, cooldownTime)` 한 줄만 남는다. 경계 값은 Aide의 JUnit 5로 이렇게 시험한다.

```kotlin
class MorphStateTest {

    @Test
    fun `쉬는 시간이 끝나면 다음 문구로 넘어가고 마지막 다음은 처음이다`() {
        val state = MorphState(textIndex = 2, morphFraction = 1f, inCooldown = true, cooldownRemaining = 0.1f)

        val next = state.advance(dtSec = 0.2f, textCount = 3, morphTime = 1f, cooldownTime = 0.25f)

        assertEquals(0, next.textIndex)
        assertFalse(next.inCooldown)
        assertEquals(0f, next.morphFraction)
    }

    @Test
    fun `바뀌는 중 진행률은 1을 넘지 않고 1이 되면 쉬는 시간으로 들어간다`() {
        val state = MorphState(textIndex = 0, morphFraction = 0.9f, inCooldown = false, cooldownRemaining = 0f)

        val next = state.advance(dtSec = 0.5f, textCount = 3, morphTime = 1f, cooldownTime = 0.25f)

        assertEquals(1f, next.morphFraction)
        assertTrue(next.inCooldown)
        assertEquals(0.25f, next.cooldownRemaining)
    }
}
```

- 첫 테스트는 "마지막 문구(번호 2) 다음은 처음(번호 0)"이라는 경계를 본다. `% textCount` 를 빠뜨리면 여기서 깨진다.
- 둘째 테스트는 "프레임이 늦게 와서 진행률이 1을 넘으려 할 때 1에서 멈추는가"를 본다. 앱이 잠깐 멈췄다 돌아오면 `dt` 가 크게 들어오기 때문이다.
- 이 테스트는 #753 Jev 글에서 정한 "경계 값 테스트를 먼저 쓰는 습관"과 같은 방향이다.

### 2. 프레임마다 바뀌는 값은 `graphicsLayer` 람다 안에서 읽는다

원문 코드는 상태를 컴포저블 본문에서 읽고, 그 값으로 `t1` 과 `t2` 를 계산해 `graphicsLayer` 람다에 넘긴다. 내가 코드를 읽고 짐작하기로는 이렇게 하면 진행률이 바뀌는 프레임마다(쉬는 중에도 `cooldownRemaining` 이 바뀌므로 사실상 매 프레임) `MorphText` 본문이 다시 실행된다. Layout Inspector로 세어 보지는 않았다. #753 RevenueCat 페이월 글의 8장처럼, 값은 그리기 단계에서만 읽게 하면 리컴포지션 없이 다시 그리기만 일어난다.

```kotlin
@Composable
private fun MorphWord(
    text: String,
    progress: () -> Float,
    config: MorphTextConfig,
    style: TextStyle,
) {
    Text(
        text = text,
        style = style,
        modifier = Modifier.graphicsLayer {
            val t = progress()
            alpha = t.powF(0.4f)
            val blurPx = (config.blurBase / t.coerceAtLeast(0.001f) - config.blurBase)
                .coerceIn(0f, config.blurMaxDp).dp.toPx()
            if (blurPx > 0f) renderEffect = BlurEffect(blurPx, blurPx, TileMode.Decal)
            clip = false
        },
    )
}
```

- 진행률은 값이 아니라 `progress: () -> Float` 함수로 받는다. 함수 안의 값은 `graphicsLayer` 람다가 그릴 때 부른다.
- 이렇게 하려면 상태도 나눠야 한다. "지금 몇 번째 문구인가"(`textIndex`)는 전환이 끝날 때 한 번 바뀌므로 컴포저블 본문에서 읽어도 된다. "얼마나 녹았나"(진행률)는 프레임마다 바뀌므로 `mutableFloatStateOf` 같은 별도 상태에 두고 람다 안에서만 읽는다.

### 3. Aide는 Android 8부터라서 Android 12 미만에서는 다른 전환을 쓴다

Aide의 minSdk(앱이 설치되는 가장 낮은 Android 버전)는 26, 곧 Android 8이다. 원문대로라면 Android 8에서 11까지는 흐림이 걸리지 않는다. 여기에 문턱 필터가 그대로 걸린다면 기본값에서는 크로스페이드처럼 보이지도 않는다고 나는 계산했다. 투명도가 `t^0.4` 이므로, 단어의 투명도는 `t` 가 약 0.0008보다 작아질 때까지 문턱(불투명도 약 6%)을 넘어 꽉 찬다. 그러면 전환 시간의 대부분 동안 두 단어가 둘 다 진하게 겹쳐 보이다가 끝에서 하나가 툭 사라진다. 기기에서 확인한 것은 아니다. 그래서 버전으로 나눈다.

```kotlin
@Composable
fun AvatarStatusText(text: String, modifier: Modifier = Modifier) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        MeltText(text = text, modifier = modifier)
    } else {
        Crossfade(targetState = text, modifier = modifier, label = "status") { shown ->
            Text(text = shown)
        }
    }
}
```

- `Build.VERSION_CODES.S` 가 Android 12(API 31)다. 12 이상에서만 녹이는 전환(`MeltText`)을 쓰고, 그 아래는 Compose 기본 `Crossfade` 로 평범하게 바꾼다.
- `MeltText` 는 원문을 바꿔서 만들 것이다. 원문 `MorphText` 는 **문구 목록을 끝없이 돌리는** 컴포넌트다. Aide의 아바타 문구는 ViewModel이 상태에 따라 정하므로, "문구 값이 바뀔 때 한 번 녹이고 멈추는" 모양이 맞다. 끝없이 돌지 않으니 #753 페이월 글 9장의 "아무도 부탁하지 않은 프레임" 문제도 피한다.

## 배운 점

- **복잡해 보이는 효과도 재료를 나누면 작다.** "녹아 붙는 글자"는 겹쳐 그리기, 흐림, 투명도 문턱 세 가지의 조합이었다. 셰이더 없이 Compose 기본 기능만으로 된다.
- **효과는 "함께 지나가는 층"에서 생긴다.** 문턱을 두 단어에 따로 걸면 덩어리가 붙지 않는다. 같은 오프스크린 레이어에 먼저 그리고 한 번에 거는 것이 핵심이었다.
- **곡선은 효과가 일어나는 구간에 변화를 몰아 준다.** 투명도의 `t^0.4` 와 흐림의 `blurBase / t - blurBase` 는 둘 다 "끝에 가서 크게 변하게" 만들어, 문턱이 덩어리를 만드는 순간에 재료를 남겨 둔다.
- **번지는 효과는 자리를 따로 마련해야 한다.** 흐림은 레이아웃 경계 밖으로 번지므로 여백과 `clip = false` 가 필요하고, 가장자리 처리는 `TileMode.Decal` 로 정한다.
- **같은 코드라도 플랫폼마다 숫자의 뜻이 다를 수 있다.** Skia는 색 행렬 오프셋을 -1에서 1로 읽고, 예전 Compose Multiplatform은 이를 변환하지 않았다. Android에서만 맞고 다른 곳에서 틀리면 먼저 버전을 본다.
- **"이 기능은 몇 버전부터인가"를 확인한다.** `RenderEffect` 는 Android 12부터라서, minSdk가 낮은 앱에서는 효과의 절반이 사라진다. 사라진 뒤의 모습이 괜찮은지도 따로 봐야 한다.
- **값을 직접 움직여 볼 수 있게 하면 설명이 짧아진다.** 저자는 모든 숫자를 슬라이더로 열어 두고 "이득을 2까지 내려 보라"고 권한다. 숫자의 뜻을 글보다 빠르게 익힌다.

## Aide에 적용하면

Aide는 1-a 진행 중이고, 1-a 범위에는 AI와 움직이는 아바타가 없다. 결정 기록(2026-10-08)에 따르면 1-b에서 아바타가 Rive 상태 머신으로 움직이고, 브리핑이 아직 준비되지 않았으면 아바타가 일하는 모습과 함께 "브리핑을 만들고 있어요…"라는 문구를 보여 준다. 문구가 바뀌는 연출은 결정 기록에 없다. Aide의 minSdk는 26(Android 8)이다.

1. **Morph Text 효과를 Aide 화면에 넣는 것 — 지금은 안 한다.**
   - 이유: 1-a에는 바뀌는 문구가 나올 화면이 없다. 1-b의 아바타 문구도 결정 기록에는 "보여 준다"까지만 있고, 문구를 녹여 바꾸는 연출은 정한 적이 없다.
   - 이유: Aide는 Android 8부터 지원하므로 Android 8에서 11까지는 흐림이 걸리지 않는다. 그 기기에서 두 단어가 진하게 겹쳐 보일 수 있다는 내 계산이 맞는지 확인해야 하고, 결국 버전별로 다른 전환을 둬야 한다("코드로 보기" 3번).
   - 1-b에서 아바타 문구를 바꾸는 연출을 넣기로 하면, 그때 원문을 "값이 바뀔 때 한 번 녹이기"로 바꿔서 가져오고 Android 12 미만은 `Crossfade` 로 둔다.
2. **프레임마다 바뀌는 값은 `graphicsLayer` 람다 안에서 읽는다 — 가져온다. 1-b에서.**
   - 1-b에서 아바타 주변이나 AI 대기 표시에 투명도, 크기, 흐림 애니메이션을 직접 짜게 되면, 애니메이션 값은 컴포저블 본문이 아니라 `graphicsLayer { }` 람다 안에서 읽는다("코드로 보기" 2번).
   - #753 RevenueCat 페이월 글의 적용안 3번과 5번("AI 대기 표시는 보일 때만 컴포즈한다", "상태는 그 값을 쓰는 경로에서만 읽는다")과 같은 방향이다.
3. **시간으로 움직이는 상태 계산은 순수 함수로 빼서 JUnit 5로 시험한다 — 가져온다. 1-b에서.**
   - 아바타의 상태 전환이나 문구 전환처럼 "흐른 시간에 따라 다음 상태가 정해지는" 계산은 `LaunchedEffect` 안에 두지 않고 `advance(dt)` 같은 함수로 꺼낸다. 화면 없이 경계 값(마지막 다음은 처음, 진행률 상한)을 시험할 수 있다("코드로 보기" 1번).
   - Aide의 단위 테스트는 이미 JUnit 5라서 새 도구가 필요 없다.
4. **새 그리기 기능은 쓰기 전에 지원 버전부터 확인한다 — 가져온다. 지금부터.**
   - `RenderEffect` 처럼 Android 12부터 되는 기능을 쓰면, Android 8에서 11 기기에서 어떻게 보이는지도 정한다. 1-b의 Rive 아바타도 Rive Android 런타임이 지원하는 최소 버전이 Aide의 minSdk 26을 받는지 붙이기 전에 확인한다.

## 출처

- [How Morph Text dissolves one word into the next — DEV Community](https://dev.to/lightscout/how-morph-text-dissolves-one-word-into-the-next-47cl) (Juan Silva, 2026-11-11)
- [lightScout/glaze-components의 morph-text (GitHub, Apache 2.0)](https://github.com/lightScout/glaze-components/tree/main/components/morph-text), 원본 고지 [NOTICE](https://github.com/lightScout/glaze-components/blob/main/components/morph-text/NOTICE) (Victor Welander, MIT)
- [Gooey Text Morphing — Victor Welander (21st.dev)](https://21st.dev/@victorwelander/components/gooey-text-morphing)
- [Glaze의 Morph Text 웹 페이지](https://glaze.lightscout.co.uk/components/morph-text)
- [JetBrains/compose-multiplatform 이슈 #3461](https://github.com/JetBrains/compose-multiplatform/issues/3461)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문 코드는 glaze-components 저장소의 Apache 2.0에 따라 인용했다. 표지 그림은 라이선스 표시가 없어 원문 서버 주소를 걸어 보여 준다.
