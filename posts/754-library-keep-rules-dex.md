---
issue: 754
date: 2026-11-22
title: 라이브러리가 넓은 keep 규칙을 싣지 않아야 앱이 줄어든다 — Play의 DEX 최적화 기준과 좁은 consumer keep 규칙
original_title: "Ship smarter keep rules: How library providers can unblock app-level DEX code optimization"
url: https://developer.android.com/blog/posts/ship-smarter-keep-rules-unblock-dex-optimization
author: Breana Tate
tags: [R8, keep 규칙, 앱 최적화, Google Play]
aide:
  status: candidate
  module: app
  task: Task 17
  summary: Task 17에서 R8을 켤 때 Aide가 받는 라이브러리들의 consumer keep 규칙을 R8 Configuration Analyzer로 한 번 보고 넓은 규칙이 있는지 기록한다. 캘린더 이식 코드의 Class.forName 경로는 지금 아무도 쓰지 않으므로, keep 규칙을 쓰기보다 리플렉션을 없애는 쪽을 제안한다
---

## 한 줄 요약

R8(Android의 앱 최적화 도구)은 앱이 넘겨준 **keep 규칙**(이 코드는 지우거나 이름을 바꾸지 말라는 지시) 안에서만 최적화를 한다. 그런데 앱이 받는 라이브러리 안에도 **consumer keep 규칙**(라이브러리가 자기 AAR이나 JAR에 넣어 배포하는 keep 규칙)이 들어 있고, 앱을 빌드할 때 이 규칙이 앱 규칙과 합쳐진다. 라이브러리가 `-keep class com.example.** { *; }` 처럼 패키지 전체를 지키는 넓은 규칙을 실으면, 그 라이브러리를 쓰는 모든 앱이 쓰지도 않는 코드를 떠안는다. Google Play가 2026년 8월에 앱과 게임의 **DEX 코드 최적화 기준**을 발표하면서, 이 문제는 앱 개발자 혼자 풀 수 없는 생태계 전체의 숙제가 됐다. Android 개발자 관계팀의 Breana Tate는 라이브러리 제공자에게 네 가지를 권한다. 리플렉션 대신 코드 생성을 쓴다. 리플렉션이 꼭 필요하면 진입점만 지키는 좁은 규칙을 쓴다. 규칙은 문서가 아니라 consumer keep 규칙으로 함께 배포한다. 읽을 수 없는 스택 트레이스 때문에 `keepnames` 를 쓰지 않는다.

> 원문은 Android 개발자 블로그 글이다. 원문 코드 한 줄은 [Android 개발자 사이트 콘텐츠 라이선스](https://developer.android.com/license)에 따라 Apache 2.0으로 인용하고 출처를 적었다. 원문 그림은 표지 1장이고, 원문 서버 주소를 걸어 보여 준다. 그 밖의 keep 규칙과 Kotlin 코드는 **직접 쓴 스케치**이고, 컴파일하거나 R8로 돌려 보지 않았다.

## 먼저 알아 둘 말

- **R8**: Android 빌드가 릴리스 앱을 만들 때 돌리는 최적화 도구다. 쓰지 않는 코드를 지우고(shrinking, 줄이기), 남은 코드를 더 빠르게 다듬고(optimization, 최적화), 클래스와 메서드 이름을 `a`, `b` 같은 짧은 이름으로 바꾼다(obfuscation, 난독화). 예전 ProGuard와 같은 일을 하고, ProGuard 규칙 문법을 그대로 읽는다.
- **DEX**: Android가 실행하는 코드 파일 형식이다. Kotlin과 Java 코드는 컴파일된 뒤 `.dex` 파일로 바뀌어 APK나 AAB에 들어간다.
- **DEX 코드 최적화 기준**: Google Play가 2026년 8월에 발표한 기술 요구 사항이다. 앱의 DEX 코드가 R8로 얼마나 줄이고 최적화하고 난독화됐는지를 비율로 보고, 기준에 못 미치는 앱을 가려낸다. 시작 시간과 메모리 사용을 줄이려는 것이다. Play Console에 "DEX 코드 최적화 인사이트"로 수치가 보인다.
- **keep 규칙**: R8에게 "이 클래스나 메서드는 지우지 말고, 이름도 바꾸지 말라"고 알려 주는 한 줄 지시다. `-keep class 패키지.클래스 { 멤버; }` 처럼 쓴다.
- **consumer keep 규칙**: 라이브러리가 자기 AAR이나 JAR 안에 넣어 배포하는 keep 규칙이다. 그 라이브러리를 쓰는 앱(consumer, 소비자)을 빌드할 때 R8이 자동으로 읽는다. 앱 개발자가 따로 적지 않아도 되는 대신, 앱 개발자는 그 규칙이 얼마나 넓은지 잘 모른다.
- **전체 앱 최적화(whole-program optimization)**: R8이 앱 코드와 라이브러리 코드를 한꺼번에 보고 최적화하는 것이다. 라이브러리 안의 코드도 앱이 실제로 쓰는 부분만 남길 수 있다. keep 규칙이 넓으면 이 범위가 줄어든다.
- **리플렉션(reflection)**: 코드에 클래스 이름을 직접 쓰지 않고, 실행 중에 `Class.forName("패키지.클래스")` 처럼 문자열로 클래스를 찾아 쓰는 방식이다. R8은 빌드할 때 문자열 안의 이름까지 따라가지 못해서, keep 규칙이 없으면 그 클래스를 "아무도 안 쓴다"고 보고 지우거나 이름을 바꾼다. 그러면 실행 중에 `ClassNotFoundException` 으로 앱이 죽는다.
- **코드 생성(codegen)**: 빌드할 때 필요한 코드를 미리 만들어 두는 방식이다. Hilt, Room, kotlinx-serialization이 이 방식을 쓴다. 만들어진 코드가 클래스를 직접 부르므로 R8이 다 보고, keep 규칙이 거의 필요 없다.
- **JNI(Java Native Interface)**: Kotlin이나 Java 코드와 C나 C++로 만든 네이티브 코드가 서로 부르는 통로다. 네이티브 코드가 Java 클래스를 이름으로 부르므로, R8이 그 클래스를 지우지 못하게 keep 규칙이 필요하다.
- **진입점(entry point)**: R8이 "여기서부터 쓰인다"고 보고 출발하는 코드다. keep 규칙으로 지킨 클래스와 메서드가 진입점이 된다. R8은 진입점에서 이어지는 코드를 따라가 그래프를 만들고, 그래프에 닿지 않는 코드는 지운다.
- **조건부 keep 규칙(conditional keep rule)**: `-if class A` 다음 줄에 `-keep class B` 를 쓰는 규칙이다. "앱에 A가 남아 있을 때만 B를 지킨다"는 뜻이다.
- **`-keepnames`**: "이름만 바꾸지 말라"는 규칙이다. 쓰지 않으면 지우는 것은 허락하지만, 남은 코드의 이름 바꾸기와 그에 딸린 최적화를 막는다.
- **mapping 파일**: R8이 원래 이름과 바뀐 이름의 짝을 적어 두는 파일(`mapping.txt`)이다. 이 파일이 있으면 난독화된 스택 트레이스를 원래 이름으로 되돌려 읽을 수 있다(deobfuscation, 난독화 풀기).
- **R8 Configuration Analyzer**: 앱의 R8 설정을 분석해 줄이기, 최적화, 난독화 비율을 보여 주고, 어떤 keep 규칙이 최적화를 막는지 알려 주는 Android 도구다. 규칙이 앱에서 왔는지 라이브러리에서 왔는지도 보여 준다.
- **Android CLI의 `analyze` 명령**: AAR이나 JAR 파일 하나가 얼마나 최적화될 수 있는지, keep 규칙 때문에 남는 클래스, 메서드, 필드가 몇 개인지 알려 주는 명령이다. 라이브러리 제공자가 쓰는 도구다.
- **Google Play SDK Console**: SDK(라이브러리) 제공자가 자기 SDK의 버전별 사용 현황과 충돌을 보는 Google Play의 관리 화면이다. 앱 개발자의 Play Console에 해당한다.

## 서론 — 기준은 앱에 걸리지만, 책임은 라이브러리도 나눠 진다

<figure class="media"><img src="https://developer.android.com/static/blog/assets/1109_ABL_160_Ship_smarter_keep_rules_How_library_providers_can_unblock_app_level_DEX_code_optimization_1_44aba4f3cd_1kr2I.webp" alt="원문 표지 그림. 초록색 배경에 동심원이 그려져 있고, 가운데에 바늘이 오른쪽 끝까지 올라간 속도계 모양의 계기판이 있다. 둘레에 번개 모양 배지, 중괄호 기호가 그려진 타일, 반짝이는 별, 체크 표시가 흩어져 있다" loading="lazy"><figcaption>원문 표지 그림. 속도계 바늘이 끝까지 올라간 계기판을 가운데 두고, 번개(빠르기), 중괄호(코드), 체크 표시(통과)를 둘레에 그렸다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/ship-smarter-keep-rules-unblock-dex-optimization">원문</a>)</figcaption></figure>

**R8은 빠른 앱을 만드는 핵심 도구다.**

- 원문은 앱 개발자와 라이브러리 개발자가 같은 목표, 곧 빠르고 매끄러운 앱을 바란다고 말하며 시작한다.
- 그 목표의 큰 부분을 R8이 맡는다. R8은 쓰지 않는 코드를 지우고, 남은 코드를 최적화하고 난독화한다.

**Google Play가 2026년 8월에 DEX 코드 최적화 기준을 발표했다.**

- 이 기준은 앱과 게임에 걸린다. 목적은 앱 시작 시간을 줄이고, 메모리를 덜 쓰게 하고, 메모리를 지나치게 쓰는 앱이 사용자 경험을 해치지 않게 하는 것이다.
- 기준은 앱에 걸리지만, 원문은 기준을 맞추는 일이 생태계 전체의 공동 책임이라고 말한다. R8은 주어진 조건 안에서만 앱을 최적화할 수 있고, 그 조건에는 앱이 받는 라이브러리들이 싣고 온 keep 규칙도 들어간다.

**R8 Configuration Analyzer는 넓은 규칙이 어디서 왔는지까지 보여 준다.**

- R8 Configuration Analyzer는 앱의 최적화, 줄이기, 난독화 비율을 잰다. 이 비율이 Google Play 기술 요구 사항의 중심이다.
- 비율만 보여 주는 것이 아니라, 비효율적인 keep 규칙이 앱에서 왔는지, 아니면 앱이 받는 라이브러리의 consumer keep 규칙에서 왔는지도 드러낸다.
- 원문은 라이브러리 제공자가 흔히 부딪히는 문제를 풀고, 좁고 성능 좋은 규칙을 배포해 고객 앱이 Play 기준을 맞추도록 돕는 방법을 정리한다고 밝힌다.

## 1. consumer keep 규칙이란

**무엇인가: 라이브러리 안에 묶여 배포되고, 앱을 빌드할 때 R8에게 "이 라이브러리 코드는 최적화하지 말라"고 알려 주는 지시다.**

- 라이브러리가 자기 산출물을 줄일 때 쓰는 보통 keep 규칙과 다르다. consumer keep 규칙은 라이브러리 안에 들어 있다가, **앱 전체를 최적화할 때** 그 라이브러리 코드가 어떻게 줄어드는지를 정한다.
- 좋은 점은 앱 개발자가 라이브러리 내부의 리플렉션 대상이나 네이티브 통로를 몰라도 된다는 것이다. 라이브러리가 알아서 지켜 준다.

**왜 중요한가: 넓은 consumer keep 규칙은 쓰지 않는 코드를 남겨 앱의 최적화와 성능을 깎는다.**

- 원문은 의도가 분명하고 범위가 좁은 consumer keep 규칙이 라이브러리와 앱 모두에 이로운 모범 사례라고 말한다.
- Play Console에 DEX 코드 최적화 인사이트가 생기면서, 앱 개발자가 보는 수치는 앱 규칙과 라이브러리 규칙이 **합쳐진 결과**가 됐다. 라이브러리 규칙이 넓으면 앱 개발자의 수치가 나빠진다.

## 2. 안정성과 성능 사이에서

**라이브러리 제공자가 넓은 규칙을 싣는 것은 대개 좋은 뜻에서다.**

- 리플렉션으로 부르던 클래스를 R8이 지워 자기 SDK 때문에 앱이 죽는 일을 아무도 바라지 않는다. 그래서 "패키지 전체를 지키면 안전하다"고 생각하기 쉽다.
- 하지만 패키지 전체나 넓은 범위를 지키는 규칙은 오래 쓸 충돌 방지책이 아니라고 원문은 말한다. R8이 앱 전체를 최적화할 여지를 크게 줄이기 때문이다.
- 원문은 안정성을 잃지 않고 좁은 규칙을 배포하는 방법을 세 갈래로 정리한다.

### 2-1. 좁은 규칙을 시험하고 내보내기

좁은 규칙을 자신 있게 내보내려고 원문이 권하는 일은 다섯 가지다.

- **샘플 앱에서 시험한다.** Android 문서의 "Test your optimization" 안내는 샘플 앱에도 그대로 쓸 수 있다. 샘플 앱에서 R8을 켜고, 사용자가 꼭 거치는 흐름(critical user journey)을 돌려 기능이 제대로 도는지 본다.
- **샘플 앱에 R8 Configuration Analyzer를 돌린다.** 앱 개발자가 자기 R8 설정을 점검할 때 보는 화면을 라이브러리 제공자도 똑같이 본다. 내 keep 규칙이 내 라이브러리를 쓰는 앱에 어떤 영향을 주는지 눈으로 확인한다.
- **Android CLI의 `analyze` 명령으로 AAR이나 JAR을 잰다.** keep 규칙 때문에 남는 메서드, 클래스, 필드 수를 알려 준다. 버전마다 이 숫자를 비교하면, 새 버전에서 규칙이 다시 넓어지는 일(회귀, 나아졌던 것이 다시 나빠지는 일)을 잡을 수 있다.
- **Google Play SDK Console에서 버전별 사용 현황과 충돌을 지켜본다.** 좁은 규칙을 낸 뒤 충돌이 늘지 않는지 확인한다.
- **"Optimization for library authors" 안내와 R8 문서의 모범 사례를 참고한다.**

### 2-2. 넓은 규칙 없이 리플렉션과 JNI 대상을 지키기

**넓은 규칙은 SDK 하나의 문제가 아니라, 그 SDK를 쓰는 앱 전체의 문제다.**

- 패키지 전체를 지키는 규칙을 실은 라이브러리를 받으면, 앱 개발자는 쓰지 않는 코드를 함께 떠안아야 한다. 원문은 그 결과로 앱 시작이 느려지고, 다운로드 크기와 메모리 사용이 늘고, ANR(앱이 응답하지 않아 시스템이 띄우는 "앱이 응답하지 않습니다" 창) 비율이 오른다고 말한다.
- 성능을 챙기는 앱은 라이브러리가 실은 규칙을 걸러 내고 자기 규칙으로 바꿔 쓸 수도 있다. 그러면 그 앱은 위험을 줄이려고 라이브러리의 새 버전을 잘 받지 않게 된다. 라이브러리 제공자에게도 손해다.

**네이티브 코드를 쓰는 SDK는 JNI로 부르는 클래스를 빠짐없이 규칙으로 지킨다.**

- 게임, 사진 편집 앱, 영상 편집 앱이 네이티브 코드를 많이 쓴다.
- 대부분의 게임은 Unity나 Unreal 같은 게임 엔진 위에서 돌고, 엔진이 게임을 네이티브 코드로 컴파일한다. 게임의 네이티브 코드와 SDK 플러그인은 JNI 호출로 Android 프레임워크와 이야기한다. 그래서 JNI로 불리는 클래스를 모두 지키는 규칙을 함께 싣는다.

**Jetpack Keep 어노테이션(지금 알파)으로 리플렉션 관리를 덜 수 있다.**

- 리플렉션을 쓰는 곳에 어노테이션을 붙이면, 빌드할 때 그 어노테이션을 보고 keep 규칙을 만들어 준다. 규칙 파일을 손으로 고치는 일이 줄어든다.

#### 리플렉션 대신 코드 생성을 쓴다

- 원문의 가장 큰 조언은 **리플렉션을 피하고, 할 수 있으면 코드 생성을 쓰라**는 것이다.
- 이유: 실행 중의 리플렉션은 R8이 컴파일할 때 그 코드가 쓰인다는 사실을 가린다. 그래서 충돌을 막으려면 keep 규칙이 필요하다. 코드 생성을 쓰면 빌드 과정에서 코드가 만들어지고 최적화되므로, R8이 다 보고 최소한의 keep 규칙으로 안전하게 최적화한다.
- 코드 생성이 잘 맞는 곳으로 원문은 직렬화와 역직렬화(객체를 JSON 같은 형식으로 바꾸고 되돌리기), 의존성 주입을 꼽는다. Hilt가 코드 생성을 쓰는 라이브러리의 예다.
- 하지만 모든 경우에 맞지는 않는다. **선택적 의존성**(앱에 있으면 쓰고 없으면 건너뛰는 다른 라이브러리)처럼 리플렉션이 꼭 필요한 패턴이 있다. 이럴 때는 필요한 진입점만 지키는 좁은 규칙과 리플렉션을 함께 쓰라고 권한다. Android 문서의 "Reflection to support optional dependencies" 안내가 이 경우를 다룬다.

아래는 선택적 의존성을 리플렉션으로 찾는 모양과, 그 진입점 하나만 지키는 좁은 규칙의 **직접 쓴 스케치**다.

```kotlin
// 직접 쓴 스케치: 앱에 이미지 라이브러리가 있으면 그 로더를 쓰고, 없으면 기본 로더를 쓴다
internal object ImageLoaderLocator {
    fun find(context: Context): ImageLoader =
        runCatching {
            Class.forName("com.example.sdk.coil.CoilImageLoader")
                .getDeclaredConstructor(Context::class.java)
                .newInstance(context) as ImageLoader
        }.getOrElse { DefaultImageLoader(context) }
}
```

```proguard
# 직접 쓴 스케치: 리플렉션으로 찾는 클래스 하나와, 그 클래스의 Context 생성자 하나만 지킨다
-keep class com.example.sdk.coil.CoilImageLoader {
    <init>(android.content.Context);
}
```

- `Class.forName("com.example.sdk.coil.CoilImageLoader")` 는 클래스 이름을 문자열로 찾는다. R8은 이 문자열을 따라가지 못하므로, 규칙이 없으면 `CoilImageLoader` 를 지우거나 이름을 바꾼다.
- `-keep class com.example.sdk.coil.CoilImageLoader { <init>(android.content.Context); }` 는 그 클래스와 `Context` 하나를 받는 생성자만 진입점으로 지킨다. `{ *; }` 로 모든 멤버를 지키지 않는다. 생성자 안에서 부르는 코드는 R8이 진입점에서 따라가며 알아서 남긴다.

#### 미리 최적화한 라이브러리라도 규칙은 좁게

- 리플렉션을 피할 수 없다면, consumer keep 규칙에는 **라이브러리가 리플렉션으로 건드리는 것만** 적는다. 라이브러리가 클래스나 메서드를 동적으로 부를 때는 진입점만 적으면 되고, 나머지는 R8이 처리한다. R8은 진입점에서 출발해 참조된 코드의 그래프를 만들고, 닿지 않는 클래스, 메서드, 필드를 지운다.
- 라이브러리를 배포하기 전에 이미 R8로 최적화하거나 난독화해 두었어도 마찬가지다. 원문은 라이브러리를 미리 최적화하는 것 자체는 가볍고 빠른 SDK를 만드는 좋은 습관이라고 말한다. 그래도 consumer keep 규칙은 앱을 컴파일할 때 적용되므로, R8은 앱이 실제로 쓰는 클래스와 메서드에 맞춰 라이브러리를 한 번 더 줄일 수 있다. 규칙이 넓으면 그 두 번째 줄이기가 막힌다.
- Android CLI의 `analyze` 명령은 최적화를 막는 패키지 전체 규칙을, 실제로 쓰이는 것과 쓰이지 않는 것으로 나눠 먼저 알려 준다.

#### 다른 회사 라이브러리를 지키는 규칙도 좁게

원문이 자주 본다는 패턴이 이것이다.

```proguard
-keep public class com.google.android.gms.** { *; }
```

> 출처: 원문 예시 ([Ship smarter keep rules](https://developer.android.com/blog/posts/ship-smarter-keep-rules-unblock-dex-optimization), Android 개발자 사이트 코드 라이선스 [Apache 2.0](https://developer.android.com/license))

- `-keep public class com.google.android.gms.**` 는 Google Play 서비스(GMS) 패키지 아래의 모든 public 클래스를 지킨다. `**` 는 하위 패키지까지 모두라는 뜻이다.
- `{ *; }` 는 그 클래스들의 모든 필드와 메서드를 지킨다는 뜻이다.
- 문제: SDK에 이 규칙이 들어 있고, 그 SDK를 쓰는 앱이 다른 GMS 라이브러리도 쓰면서 남는 코드를 줄이려고 규칙을 좁게 써 두었다고 하자. 이 넓은 규칙이 앱의 좁은 규칙을 덮어 버리고, 앱은 쓸데없이 커진다.
- 원문의 권고: 다른 라이브러리를 부를 때도, 내 라이브러리가 리플렉션으로 건드리는 요소만 엄격하게 지키는 규칙을 짠다.
- 게다가 GMS를 비롯한 많은 라이브러리는 이미 자기 consumer keep 규칙을 싣고 있다. 패키지 전체 규칙을 넣으면, 그 라이브러리가 공들여 좁게 쓴 규칙까지 집어삼킨다.

#### 광고 미디에이션 어댑터에는 조건부 규칙을

- 광고 라이브러리가 **미디에이션 어댑터**(여러 광고 네트워크를 갈아 끼우게 해 주는 연결 모듈)로 불러오는 구조여도, 좁은 규칙을 쓸 수 있다.
- 원문은 조건부 keep 규칙으로 "앱에 해당 어댑터가 들어 있을 때만" 그 기능이나 광고 형식을 지키라고 권한다. 그러면 앱이 쓰지 않는 광고 형식은 R8이 계속 지울 수 있다.
- 복잡한 규칙을 손으로 쓰는 대신, 리플렉션 호출에 Jetpack Keep 어노테이션을 붙여 조건부 consumer keep 규칙을 자동으로 만들 수도 있다. 선택해서 붙이는 추가 모듈(add-on module)에도 쓸 수 있다고 원문은 말한다.

```proguard
# 직접 쓴 스케치: 앱에 동영상 광고 어댑터가 남아 있을 때만 동영상 광고 형식을 지킨다
-if class com.example.ads.mediation.VideoAdapter
-keep class com.example.ads.format.VideoAdFormat {
    <init>();
}
```

- `-if class com.example.ads.mediation.VideoAdapter` 는 "R8이 줄이고 난 뒤에도 `VideoAdapter` 가 앱에 남아 있으면"이라는 조건이다.
- 조건이 맞을 때만 다음 줄 `-keep class com.example.ads.format.VideoAdFormat { <init>(); }` 가 적용된다. 앱이 동영상 광고 어댑터를 넣지 않았다면 `VideoAdFormat` 은 지워진다.

#### 규칙은 문서가 아니라 consumer keep 규칙으로 싣는다

- consumer keep 규칙을 라이브러리와 함께 배포하면, R8을 켠 앱은 따로 설정하지 않아도 그 라이브러리를 바로 쓰고 최적화도 최대로 받는다.
- 규칙을 문서에 적어 두면 앱 개발자가 손으로 옮겨야 한다. AAR과 JAR이 consumer keep 규칙을 품는 기능은 이미 몇 년 전부터 있었으니, 이 수고는 필요 없는 수고다.
- 유지 보수도 어려워진다. 라이브러리를 고칠 때마다(리팩터링, 클래스 이름 바꾸기, 리플렉션 쓰는 방식 바꾸기) 문서를 고쳐야 하고, 앱은 새 규칙이 있는지 매번 확인해야 한다.
- 시간이 지나 앱이 라이브러리 버전을 여러 번 올리면, 이제 필요 없는 옛 규칙이 앱에 쌓인다. 그 옛 규칙 때문에 앱은 쓸데없이 커진다.

### 2-3. 릴리스 스택 트레이스 읽기

**난독화된 스택 트레이스를 읽으려고 `-keepnames` 를 쓰고 싶어진다.**

- 난독화된 코드에서 나온 스택 트레이스는 `a.b.c` 같은 이름뿐이라 읽을 수 없다. 급한 분석을 하려고 `-keepnames` 를 쓰고 싶어진다.
- `-keepnames` 는 줄이기는 허락하지만, 앱 쪽에서의 이름 바꾸기 같은 추가 최적화를 막는다. 원문은 그 막힌 최적화가 바로 앱이 기준을 맞추는 데 필요한 값이라고 말한다.

**읽을 수 있는 스택 트레이스를 얻으려고 최적화를 막을 필요는 없다.**

- Firebase Crashlytics, Play Console, Android Studio의 Logcat은 앱 개발자를 위해 스택 트레이스의 난독화를 풀어 준다. 그래서 앱 개발자가 스택 트레이스를 보내 주면, 라이브러리 제공자는 난독화를 막지 않아도 읽을 수 있다.
- 라이브러리 제공자가 자기 mapping 파일을 SDK Console에 올리면, SDK Console에서도 난독화가 풀린 스택 트레이스를 볼 수 있다.

## 3. 감으로 하는 최적화에서 벗어나기

- 원문은 라이브러리 최적화가 "해 보고 안 되면 다시 하는" 일이 되어선 안 된다고 말한다.
- 라이브러리 제공자가 consumer keep 규칙을 잘 관리하면, 그 라이브러리를 쓰는 생태계의 앱들이 최적화에서 막히지 않는다.
- 라이브러리가 더 나은 규칙을 실으면 앱은 더 작고 빨라진다. 원문은 오늘부터 자기 consumer keep 규칙을 점검하라고 권하며 끝난다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide는 라이브러리를 배포하지 않는다. 그래서 원문의 "라이브러리 제공자" 자리에 서지 않고, **라이브러리를 받는 앱** 자리에 선다. 다만 Aide 안의 `feature:calendar` 같은 모듈도 Android 라이브러리 모듈이라, "keep 규칙을 어디에 둘까"라는 같은 질문이 생긴다.

지금 Aide(최신 커밋 `31ad4dc`)의 상태는 이렇다.

- `app/build.gradle.kts` 의 릴리스 빌드는 `optimization { enable = false }` 로 R8을 꺼 두었다. #750 Grab 글을 정리할 때 "출시 Task 17에서 다시 본다"고 적어 둔 상태 그대로다.
- `app/src/main/keepRules/rules.keep` 에는 프로젝트를 만들 때 생긴 주석만 있고, 실제 규칙은 0줄이다. 다른 모듈에는 keep 규칙 파일이 없다.
- 주요 의존성(Hilt 2.60.1, Room 2.8.5, kotlinx-serialization 1.10.0, Navigation 3, Compose)은 모두 코드 생성을 쓰거나 자기 consumer keep 규칙을 싣는다.
- 리플렉션은 한 곳에 있다. 캘린더 이식 코드의 `feature/calendar/.../scheduler/util/CalendarUtils.kt` 가 `Class.forName(itemViewClass)` 로 달력 한 달 칸의 View 클래스를 이름으로 찾아 만든다. 이 이름은 `CalendarView.monthViewClass` 에서 오는데, `CalendarView.kt` 가 XML 속성 `cv_monthViewClass` 를 읽어 채운다. 그런데 Aide의 XML과 Kotlin 어디에도 이 속성이나 `monthViewClass` 에 값을 넣는 곳이 없다. 그래서 지금은 `itemViewClass` 가 늘 `null` 이고, 리플렉션 경로는 실행되지 않는다.

아래 스케치는 모두 **직접 쓴 스케치**이고, Aide 코드는 고치지 않았다.

### 1. 쓰지 않는 리플렉션 경로를 함수 하나로 바꾸기

```kotlin
// 직접 쓴 스케치: feature/calendar/.../scheduler/CalendarView.kt
// 지금: var monthViewClass: String? = null  (XML 속성 cv_monthViewClass 로 클래스 이름을 받음)
var monthViewFactory: ((Context) -> ViewGroup)? = null

// 직접 쓴 스케치: feature/calendar/.../scheduler/util/CalendarUtils.kt
val itemView = monthViewFactory?.invoke(rootLayout.context)
```

- 지금 코드는 클래스 이름 문자열을 받아 `Class.forName(...).getDeclaredConstructor(Context::class.java).newInstance(...)` 로 만든다. R8을 켜면 그 클래스를 지키는 keep 규칙이 필요해진다.
- 스케치는 문자열 대신 "`Context` 를 받아 `ViewGroup` 을 만드는 함수"를 받는다. 함수 안에서 생성자를 직접 부르므로 R8이 다 보고, keep 규칙이 필요 없다. 원문이 말한 "리플렉션 대신 코드가 직접 부르게 하기"와 같은 생각이다.
- 지금 Aide는 이 경로를 쓰지 않으므로, 바꾸는 대신 경로를 통째로 지워도 된다.

### 2. 리플렉션을 남긴다면 규칙은 그 모듈에, 좁게

```proguard
# 직접 쓴 스케치: feature:calendar 모듈의 consumer keep 규칙 파일
# 이유: CalendarUtils 가 cv_monthViewClass 로 받은 이름을 Class.forName 으로 만든다
-keep class com.giwon.aide.feature.calendar.scheduler.view.CustomMonthView {
    <init>(android.content.Context);
}
```

- 클래스 이름 `CustomMonthView` 는 지금 Aide에 없는 이름이다. 누군가 `cv_monthViewClass` 에 클래스를 넣는 날이 오면, 그 클래스 하나와 `Context` 생성자 하나만 지킨다는 뜻으로 적었다.
- 규칙을 `app/src/main/keepRules/rules.keep` 이 아니라 `feature:calendar` 의 consumer keep 규칙으로 두는 것이 원문의 "규칙은 문서가 아니라 consumer keep 규칙으로"와 같은 생각이다. 리플렉션을 쓰는 코드와 그 코드를 지키는 규칙이 같은 모듈에 있어야, 코드를 고칠 때 규칙도 같이 보인다.
- `-keep class * extends android.view.ViewGroup { <init>(android.content.Context); }` 처럼 "ViewGroup을 상속한 모든 클래스"를 지키는 규칙은 쓰지 않는다. 원문이 말하는 넓은 규칙이다.
- AGP 9.2.1에서 라이브러리 모듈의 consumer keep 규칙을 어떤 DSL로 등록하는지는 확인하지 않았다. 옛 방식 `consumerProguardFiles` 와 AGP 9.3 이후의 `keepRules` 폴더 방식 가운데 어느 쪽인지는 Task 17에서 확인해야 한다.

### 3. R8을 켠 뒤 라이브러리 규칙 점검하기

```bash
# 직접 쓴 스케치: Task 17에서 R8을 켠 릴리스 빌드에 대해 (AGP 9.3 이상 필요)
./gradlew :app:analyzeReleaseR8Config
```

- #750 글에서 정리한 대로 이 명령은 AGP 9.3.0 이상에서 쓸 수 있다. Aide는 지금 AGP 9.2.1이다.
- 결과에서 볼 것은 두 가지다. 하나는 줄이기, 최적화, 난독화 비율이다. 다른 하나는 최적화를 막는 규칙이 Aide에서 왔는지, Aide가 받은 라이브러리에서 왔는지다. 라이브러리에서 온 넓은 규칙이 있으면 그 라이브러리 이름과 규칙을 기록해 둔다.

## 배운 점

- **앱의 최적화 수치는 앱 혼자 만드는 것이 아니다.** 앱 규칙과 라이브러리가 싣고 온 consumer keep 규칙이 합쳐진 결과다. 라이브러리 하나의 넓은 규칙이 앱의 좁은 규칙을 덮어 버릴 수 있다.
- **리플렉션은 R8의 눈을 가린다.** 코드 생성이나 직접 부르는 함수로 바꾸면 keep 규칙이 필요 없어진다. 리플렉션이 꼭 필요할 때만 진입점 하나를 좁게 지킨다.
- **진입점만 지키면 나머지는 R8이 따라간다.** `{ *; }` 로 모든 멤버를 지킬 필요가 없다.
- **조건부 규칙은 "있을 때만 지킨다"를 표현한다.** 선택해서 붙이는 모듈이 있는 라이브러리에서 쓸모가 크다.
- **규칙은 그 규칙이 필요한 코드와 같은 곳에 둔다.** 문서에 적은 규칙은 코드가 바뀔 때 함께 바뀌지 않고, 옛 규칙이 앱에 쌓인다.
- **스택 트레이스를 읽으려고 `-keepnames` 를 쓰지 않는다.** mapping 파일로 난독화를 풀면 된다.

## Aide에 적용하면

Aide는 라이브러리를 배포하지 않으므로, 원문의 조언은 "라이브러리를 받는 앱" 쪽에서 다시 읽어야 한다. 지금 Aide는 릴리스 R8이 꺼져 있고(`optimization { enable = false }`), 직접 쓴 keep 규칙은 0줄이다. R8을 켜는 일은 #750 Grab 글의 적용안에서 "Task 17(내부 테스트 트랙 배포)에서 처음부터 전체 모드로 켠다"고 정리해 두었다. 다만 `decisions.md` 에는 R8에 관한 결정이 아직 없고, 1-a 계획의 Task 17에도 R8 단계가 없다. 아래 항목은 모두 그 Task 17 작업에 붙는다.

1. **Task 17에서 R8을 켠 뒤, 라이브러리에서 온 넓은 규칙이 있는지 R8 Configuration Analyzer로 한 번 본다 — 가져온다.**
   - 이유: Play의 DEX 코드 최적화 기준은 Aide 같은 앱에 걸린다. 수치가 기준에 못 미칠 때 원인이 Aide 규칙인지 라이브러리 규칙인지 알아야 고칠 곳을 안다.
   - Aide의 의존성은 대부분 Google과 JetBrains 라이브러리라 넓은 규칙이 나올 가능성은 낮다고 보지만, 확인하지 않았다. 첫 결과를 `decisions.md` 나 Task 17 기록에 남긴다.
   - 걸림돌: `analyzeReleaseR8Config` 는 AGP 9.3.0 이상이 필요하고 Aide는 9.2.1이다. #750 글의 제안처럼 최신화 PR에서 AGP를 9.3 이상으로 올린 뒤에 쓴다. 2026-10-20 결정("최신화는 Task 4 뒤 별도 PR")과 같은 방향이다.
2. **캘린더 이식 코드의 `Class.forName` 경로는 keep 규칙을 쓰기보다 없애는 쪽을 제안한다 — 바꿔서 가져온다(사용자가 정한다).**
   - 지금은 `cv_monthViewClass` 에 아무 값도 넣지 않아서 경로가 실행되지 않는다. 그래서 R8을 켜도 당장 앱이 죽지는 않는다.
   - 위험: 나중에 누군가 이 속성에 클래스 이름을 넣으면, R8이 그 클래스를 지우거나 이름을 바꾼다. 그런데 `CalendarUtils` 는 `runCatching` 으로 실패를 삼키고 `Log.e` 만 남기므로, 앱이 죽지도 않고 달력 칸이 조용히 기본 모양으로 그려진다. 찾기 어려운 버그가 된다.
   - 제안: "코드로 보기" 1번처럼 함수를 받게 바꾸거나 경로를 지운다. 다만 2026-10-28 Task 6 결정 3번이 "이식 코드는 원본 구조(LiveData)를 그대로 둔다"고 정해서, 이식 코드를 고치는 일은 이 결정과 부딪힌다. 이식 코드를 손댈지는 사용자가 정한다. 손대지 않는다면, `cv_monthViewClass` 를 쓰지 않는다는 사실을 `decisions.md` 에 한 줄 적어 두는 것만으로도 위험을 줄일 수 있다.
3. **keep 규칙이 생기면 그 규칙이 필요한 모듈에 두고, 규칙마다 이유를 한 줄 적는다 — 가져온다. 규칙이 처음 생길 때.**
   - 이유: 원문의 "규칙은 문서가 아니라 consumer keep 규칙으로"를 Aide 안의 모듈에 옮긴 것이다. `app` 의 `rules.keep` 에 모든 규칙을 모으면, `feature:calendar` 코드를 지울 때 `app` 의 규칙이 남는다. 원문이 말한 "옛 규칙이 쌓이는" 일이 Aide 안에서도 생긴다.
   - "이유 한 줄"은 #750 글 적용안 4번에서 정한 습관과 같다.
   - 라이브러리 모듈의 consumer keep 규칙을 AGP 9.2.1에서 어떤 DSL로 등록하는지는 확인하지 않았다. Task 17에서 확인한다.
4. **스택 트레이스를 읽으려고 `-keepnames` 를 쓰지 않고, mapping 파일로 난독화를 푼다 — 가져온다.**
   - Aide는 Crashlytics를 쓰지 않는다(수집 없음 정책). 원문이 말한 대로 Play Console이 mapping 파일로 난독화를 풀어 준다. #750 글 적용안 5번에서 정한 "AAB에 mapping이 함께 들어가는지 확인하고, 출시 워크플로가 `mapping.txt` 를 GitHub Actions 산출물로 남긴다"를 그대로 따른다.
5. **Jetpack Keep 어노테이션, 조건부 keep 규칙, JNI 규칙, Android CLI `analyze` — 지금은 안 한다.**
   - 이유: Aide에는 리플렉션 경로가 1곳(그마저 쓰이지 않음)뿐이고, 네이티브 코드와 광고 미디에이션이 없고, 배포하는 AAR이나 JAR도 없다. Jetpack Keep 어노테이션은 아직 알파다.
   - 1-b 이후 리플렉션을 쓰는 라이브러리를 직접 만들거나, Aide 모듈을 다른 앱과 나눠 쓰게 되면 그때 다시 본다.

## 출처

- 원문: Breana Tate, [Ship smarter keep rules: How library providers can unblock app-level DEX code optimization](https://developer.android.com/blog/posts/ship-smarter-keep-rules-unblock-dex-optimization), Android 개발자 블로그, 2026-11-17. 원문 코드 한 줄은 [Android 개발자 사이트 콘텐츠 라이선스](https://developer.android.com/license)에 따라 Apache 2.0으로 인용했다. 표지 그림 1장은 원문 서버 주소로 걸었다. 설명은 내 말로 다시 썼다.
- 원문이 실린 곳: [Android Weekly #754](https://androidweekly.net/issues/issue-754)
- Android 문서: [Optimization for library authors](https://developer.android.com/topic/performance/app-optimization/library-optimization), [R8 Configuration Analyzer](https://developer.android.com/topic/performance/app-optimization/r8-configuration-analyzer), [Keep rule examples](https://developer.android.com/topic/performance/app-optimization/keep-rule-examples), [Add keep rules](https://developer.android.com/topic/performance/app-optimization/add-keep-rules), [Jetpack Keep annotations](https://developer.android.com/topic/performance/app-optimization/jetpack-keep-annotations)
- Google Play 고객센터: [DEX 코드 최적화 기술 요구 사항](https://support.google.com/googleplay/android-developer/answer/17492799)
- 이 블로그의 이전 글: [#750 Grab은 R8과 프로필 최적화로 ANR을 32%, 시작 시간을 35% 줄였다](750-grab-r8-profiles.html)
- Aide 코드: Aide-Android `app/build.gradle.kts`, `app/src/main/keepRules/rules.keep`, `gradle/libs.versions.toml`, `feature/calendar/.../scheduler/util/CalendarUtils.kt`, `feature/calendar/.../scheduler/CalendarView.kt`, `feature/calendar/src/main/res/values/attrs.xml` (최신 커밋 `31ad4dc`에서 읽기만 함)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-20 Task 4 결정과 2026-10-28 Task 6 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 17
