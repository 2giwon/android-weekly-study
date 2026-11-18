---
issue: 753
date: 2026-11-15
title: Navigation 3의 타입 안전 딥링크 — 들어온 링크를 첫 뒤로 가기 목록으로 바꾸기
original_title: "Type-safe deep links in Jetpack Navigation 3"
url: https://ardakazanci.com/posts/type-safe-deep-links-jetpack-navigation-3/
author: Arda Kazancı
tags: [Navigation 3, 딥링크, kotlinx.serialization, Multiplatform]
aide:
  status: candidate
  module: app
  task: Task 4 뒤 최신화
  summary: Aide에는 아직 앱 안으로 들어오는 링크가 없어 딥링크 API는 지금 쓰지 않는다. 대신 Navigation 3 1.2.1은 compileSdk 36으로도 받을 수 있다는 것을 최신화 PR의 입력으로 남기고, 링크가 생기면 "어떤 링크가 어떤 뒤로 가기 목록이 되는가"를 Intent 없이 JUnit 5로 시험한다
---

## 한 줄 요약

Jetpack Navigation 3는 2025년 11월 1.0이 나올 때 딥링크(deep link, 웹 주소나 알림을 눌러 앱의 특정 화면으로 바로 들어가는 링크) 기능을 라이브러리에 넣지 않았다. 그래서 개발자들은 공식 예제 저장소 nav3-recipes의 도우미 코드를 복사해 썼다. **`navigation3-runtime` 1.2.0부터(지금 1.2.1)** 이 도우미들이 정식 API가 됐다. 핵심은 네 가지다. 들어온 링크를 담는 `DeepLinkRequest`, 주소 모양과 화면 키(`NavKey`)를 짝짓는 `UriDeepLinkMatcher`, 문자열 하나를 객체로 바꾸는 `DeepLinkSerializer`, 그리고 이긴 링크에만 가짜 뒤로 가기 목록을 만들어 주는 `withBackStack` 이다. Navigation 3는 "뒤로 가기 목록은 앱이 직접 들고 있다"가 원칙이라, 딥링크 API가 할 일은 하나뿐이다. **들어온 링크를 처음 보여 줄 `NavKey` 목록으로 바꾸는 것**이다. Arda Kazancı가 Android Dev Summit 세션 "Building type-safe deep links with Jetpack Navigation 3"(Ian Lake, Clara Fok 발표)를 바탕으로 정리한 글이다.

> 원문에는 그림이 없고 코드 블록이 7개 있다. 원문 블로그는 저작권 표시(© 2026 Arda Kazancı)만 있고 공개 라이선스가 없어서, 원문 코드는 옮기지 않고 무엇을 하는 코드인지 글로 설명했다. 대신 원문이 말하는 API를 Google Maven의 `navigation3-runtime` 1.2.1 소스에서 직접 확인했고, 필요한 몇 줄은 AOSP 소스(Apache 2.0)에서 인용했다. "코드로 보기" 절의 코드는 **직접 쓴 스케치**이거나, 표시해 둔 Aide의 실제 코드다.

## 먼저 알아 둘 말

- **딥링크(deep link)**: 앱의 첫 화면이 아니라 특정 화면으로 바로 여는 링크. 웹 주소(`https://...`), 앱 전용 주소(`myapp://...`), 알림을 눌렀을 때 넘어오는 Intent 등이 있다.
- **Navigation 3**: Jetpack의 새 화면 이동 라이브러리. 예전 Navigation(Navigation 2)은 라이브러리가 뒤로 가기 목록을 감추고 관리했지만, Navigation 3는 **앱이 뒤로 가기 목록을 평범한 리스트로 직접 들고**, 라이브러리(`NavDisplay`)는 그 리스트를 그리기만 한다.
- **`NavKey`**: Navigation 3에서 화면 하나를 가리키는 키. 보통 `@Serializable data object Home : NavKey` 나 `@Serializable data class Session(val id: String) : NavKey` 처럼 만든다. 예전 Navigation의 "route 문자열"을 타입이 있는 객체로 바꾼 것이다.
- **뒤로 가기 목록(back stack)**: 지금까지 거쳐 온 화면 키의 목록. 마지막 키가 지금 보이는 화면이고, 뒤로 가기를 누르면 마지막 키를 뺀다. Navigation 3에서는 `List<NavKey>` 나 `NavBackStack<NavKey>` 다.
- **`NavDisplay`**: 뒤로 가기 목록을 받아 마지막 키에 맞는 화면을 그리는 Navigation 3의 컴포저블.
- **합성 뒤로 가기 목록(synthetic back stack)**: 사용자가 실제로 거쳐 오지 않았지만, 거쳐 왔다면 있었을 화면들을 미리 깔아 둔 목록. 알림으로 세션 화면에 바로 들어와도 뒤로 가기를 누르면 세션 목록, 그다음 홈으로 가게 만든다.
- **kotlinx.serialization**: Kotlin 공식 직렬화(serialization, 객체를 문자열 같은 형태로 바꾸고 되돌리는 것) 라이브러리. `@Serializable` 을 붙이면 컴파일러 플러그인이 변환 코드(`KSerializer`)를 만들어 준다.
- **`KSerializer`**: 어떤 타입을 어떻게 직렬화하고 되돌릴지 정한 객체. `serializer<Session>()` 으로 꺼낸다.
- **자리표시(placeholder)**: 주소 모양 안의 `{id}` 처럼 중괄호로 감싼 칸. 실제 주소의 그 자리에 있는 값을 꺼내 같은 이름의 속성에 넣는다.
- **스킴(scheme)**: 주소 맨 앞의 `https`, `http`, `myapp` 같은 부분. **호스트(host)** 는 그다음의 `ads.android.com` 같은 도메인 부분이다.
- **Intent 필터(`<intent-filter>`)**: `AndroidManifest.xml` 에서 "이런 주소나 동작이 오면 이 Activity가 연다"고 시스템에 알리는 선언.
- **MIME 타입**: 파일이나 데이터의 종류를 나타내는 문자열. 예: `image/jpg`.
- **SavedState**: 화면 회전(구성 변경)이나 프로세스가 죽었다 살아날 때 값을 보존하는 Android의 저장 장치. `SavedStateHandle` 이 이것을 쓴다.
- **Binder 트랜잭션 한도**: 프로세스 사이에 데이터를 넘기는 Android의 Binder가 한 번에 넘길 수 있는 크기 제한(약 1MB를 여러 곳이 나눠 쓴다). SavedState에 큰 데이터를 넣으면 이 한도에 걸려 앱이 죽을 수 있다.
- **멀티바인딩(multibinding)**: 의존성 주입(DI)에서 여러 모듈이 같은 `Set` 에 원소를 하나씩 보태게 하는 기능. Hilt(Dagger)에서는 `@IntoSet` 을 붙인다.
- **KMP(Kotlin Multiplatform)와 commonMain**: 한 Kotlin 코드를 Android, iOS, 데스크톱, 웹에서 함께 쓰는 방식. 모든 플랫폼이 함께 쓰는 코드가 `commonMain` 에 있다.

## 서론 — 복사해 쓰던 도우미가 정식 API가 됐다

**무엇이 바뀌었나**
- Navigation 3 1.0(2025년 11월)에는 딥링크 API가 없었다. 공식 예제 저장소 nav3-recipes에 있는 도우미 코드를 앱에 복사해 쓰는 방식이었다.
- `androidx.navigation3:navigation3-runtime` 1.2.0부터 이 도우미들이 라이브러리의 정식 API가 됐다. 이 글을 쓸 때 최신 안정판은 1.2.1이다(Google Maven에는 1.3.0-alpha04까지 올라와 있다).
- 정식 API의 중심은 `DeepLinkRequest`, `UriDeepLinkMatcher`, `DeepLinkSerializer`, `withBackStack` 이다.

**왜 딥링크 API의 일이 하나뿐인가**
- Navigation 3의 원칙은 "뒤로 가기 목록은 앱이 가진다"다. 앱이 `List<NavKey>` 를 직접 들고 있고, `NavDisplay` 는 그 목록을 그린다.
- 그러니 딥링크 API가 할 일은 화면 이동이 아니다. **들어온 링크를 보고 `NavDisplay` 가 처음 그릴 `NavKey` 목록을 만들어 주는 것**이 전부다. 이동은 그 목록을 받은 앱이 한다.

## 1. 주소 짝짓기 — DeepLinkRequest와 UriDeepLinkMatcher

**의존 추가**
- 원문은 `gradle/libs.versions.toml` 에 `navigation3` 1.2.1과 `kotlinxSerialization` 1.9.0 버전을 적고, `navigation3-runtime`, `navigation3-ui`, `kotlinx-serialization-core` 라이브러리를 등록하는 예를 보여 준다. Kotlin Serialization 컴파일러 플러그인도 함께 켠다.

**Manifest는 여전히 필요하다**
- 시스템이 "어떤 링크를 이 Activity가 여는지" 알아야 하므로 `AndroidManifest.xml` 의 `<intent-filter>` 선언은 그대로 해야 한다. 딥링크 API는 Activity가 열린 **뒤의** 일만 맡는다.

**`DeepLinkRequest` — 들어온 것을 한 상자에 담는다**
- Activity가 열리면 Navigation 3는 들어온 입력을 `DeepLinkRequest` 로 감싼다. 이 클래스는 KMP 공통 코드에 있다.
- Android에서는 `DeepLinkRequest(intent)` 가 Intent의 주소(`intent.data`), 동작(action), MIME 타입, 그리고 Intent extras를 읽는다. extras는 `DeepLinkRequest.IntentExtrasKey` 아래에 SavedState로 들어간다.
- 공통 코드나 단위 테스트에서는 `android.content.Intent` 를 가짜로 만들 필요 없이 `DeepLinkUri` 나 문자열로 `DeepLinkRequest` 를 바로 만든다. 1.2.1 소스를 보면 `DeepLinkRequest(uri: String, ...)` 생성자도 있다.

**원문 코드 1: 세션 화면과 짝짓기**
- 원문은 `Home`(data object)과 `Session(val id: String)`(data class) 두 `NavKey` 를 만든다.
- `UriDeepLinkMatcher` 에 주소 모양 `DeepLinkUri("ads.android.com/session/{id}")` 와 `serializer<Session>()` 을 넘겨 `sessionMatcher` 를 만든다. 스킴을 빼서 http와 https를 모두 받는다는 주석이 붙어 있다.
- `https://ads.android.com/session/abcd` 로 `DeepLinkRequest` 를 만들어 `sessionMatcher.match(request)` 를 부르면 `UriMatchResult<Session>?` 이 나온다.
- 마지막 줄은 `listOf(matchResult?.key ?: Home)` 이다. 짝이 맞으면 `Session(id = "abcd")`, 안 맞으면 `Home` 하나짜리 뒤로 가기 목록이 된다.

**자리표시 이름은 속성 이름과 같아야 한다**
- `{id}` 같은 중괄호 칸은 경로 조각, 쿼리 매개변수(`?id=...`), 프래그먼트(`#...`)에서 값을 꺼낸다.
- `UriDeepLinkMatcher` 는 꺼낸 문자열을 kotlinx.serialization의 전용 디코더(decoder, 문자열을 객체로 되돌리는 장치)에 넘긴다. 그래서 자리표시 이름은 `Session` 의 속성 이름(또는 `@SerialName` 으로 바꾼 이름)과 같아야 한다.

**스킴 규칙은 일부러 비대칭이다**
- 주소 모양에 스킴을 빼거나 `http://` 를 적으면 http와 https 요청을 **둘 다** 받는다.
- `https://` 를 적으면 https 요청**만** 받는다.
- 호스트는 대소문자를 가리지 않지만 와일드카드(`*`)는 없다. 그래서 `ads.android.com` 과 `www.ads.android.com` 은 따로 짝짓기를 만들거나, 미리 주소를 한쪽으로 고쳐 넣어야 한다.

1.2.1 소스에서 이 규칙이 그대로 보인다.

```kotlin
private const val DEFAULT_SCHEME_PATTERN = "http[s]?://"
private const val STRICT_SCHEME_PATTERN = "https://"
// ...
            scheme == null -> uriRegex.append(DEFAULT_SCHEME_PATTERN)
            scheme.equals("https", true) -> uriRegex.append(STRICT_SCHEME_PATTERN)
            scheme.equals("http", true) -> uriRegex.append(DEFAULT_SCHEME_PATTERN)
            else -> uriRegex.append(Regex.escape(scheme)).append("://")
```

> 출처: `UriDeepLinkMatcher.kt`, androidx.navigation3:navigation3-runtime 1.2.1 소스 ([AOSP androidx](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:navigation3/), Apache 2.0)

- 스킴이 없거나(`null`) `http` 면 `http[s]?://`, 곧 "http 뒤에 s가 있어도 되고 없어도 된다"는 정규식이 된다.
- `https` 면 `https://` 만 받는다.
- 그 밖의 스킴(예: `myapp`)은 그 글자 그대로 받는다. 그래서 앱 전용 스킴도 같은 클래스로 짝짓는다.

## 2. 겹치는 주소 고르기와 여러 모듈에서 짝짓기 모으기

**같은 화면에 주소가 여러 개일 때**
- 실제 앱은 한 화면에 여러 주소를 받는다. 예를 들어 예전 뉴스레터 링크와 지금 웹 주소가 같은 화면을 연다.
- 주소 모양마다 `UriDeepLinkMatcher` 를 하나씩 만들어 리스트에 넣는다.

**원문 코드 2: 두 주소가 겹칠 때**
- 원문은 일반 세션용 `ads.android.com/session/{id}` 를 두고, 기조연설 전용 `Keynote` 화면을 `ads.android.com/session/keynote` 에 더한다.
- 두 짝짓기를 리스트에 넣고, `/session/keynote` 요청에 대해 `matchers.mapNotNull { it.match(request) }.maxOrNull()?.key ?: Home` 으로 하나를 고른다.

**왜 `Keynote` 가 이기나**
- `/session/keynote` 는 두 짝짓기에 다 맞는다. 하나는 `Session(id = "keynote")`, 하나는 `Keynote` 다.
- 일치 결과 `DeepLinkMatcher.MatchResult` 는 `Comparable`(크기를 비교할 수 있는 타입)이라 `maxOrNull()` 로 가장 좋은 것을 고른다.
- `UriMatchResult` 의 순위 규칙은 이렇다. 1.2.1 소스의 `compareTo` 를 보면 순서가 그대로 나온다.
  - 경로가 자리표시 없이 **글자 그대로 맞은 결과(exact path)** 가 먼저 이긴다. 그래서 `Keynote` 가 이긴다.
  - 그래도 같으면 경로에서 꺼낸 값의 수를 비교한다.
  - 그래도 같으면 꺼낸 값이 있는 쪽, 그다음 꺼낸 값 전체의 수를 비교한다.

**여러 모듈이면 짝짓기를 `:app` 한곳에 모으지 않는다**
- 화면 키는 `:feature:api` 에, 화면 구현은 `:feature:impl` 에 두는 멀티 모듈 앱에서 `:app` 에 짝짓기 목록을 직접 적으면, `:app` 이 모든 기능의 주소를 알아야 해서 묶임이 강해진다.
- 원문 코드 3은 Hilt 멀티바인딩으로 이것을 푼다. 기능 모듈마다 `@Module @InstallIn(ActivityRetainedComponent::class)` 모듈을 두고, `@IntoSet @Provides` 함수가 자기 `UriDeepLinkMatcher` 를 `DeepLinkMatcher<*, *>` 타입으로 내놓는다.
- `MainActivity`(`@AndroidEntryPoint`)는 `Set<@JvmSuppressWildcards DeepLinkMatcher<*, *>>` 를 주입받는다. `@JvmSuppressWildcards` 는 Kotlin의 제네릭이 Java로 바뀔 때 생기는 `? extends` 를 막아 Dagger가 같은 타입으로 알아보게 하는 표시다.
- Navigation 팀은 Hilt, Metro, Koin 예제와 Now in Android 앱에서 같은 방식을 쓴다.

## 3. 문자열이 아닌 값 읽기와 직접 만드는 DeepLinkSerializer

**대부분의 타입은 그냥 된다**
- `UriDeepLinkMatcher` 는 객체 만들기를 kotlinx.serialization에 맡긴다. 그래서 따로 코드를 쓰지 않아도 이런 타입을 읽는다.
  - 기본 타입: `Int`, `Long`, `Float`, `Double`, `Boolean`.
  - enum.
  - 같은 쿼리 이름이 여러 번 나오는 목록: `?tag=compose&tag=nav3` 가 `List<String>` 이 된다.
  - 펼쳐진 중첩 `@Serializable` 클래스.

**원문 코드 4: 숫자 id와 선택 값**
- 주소 모양 `ads.android.com/session/{id}#referrer={referrer}` 에 맞춰 `Session(val id: Int, val referrer: String? = null)` 을 만든다.
- `id` 는 경로에서, `referrer` 는 `#` 뒤 프래그먼트에서 온다.

**타입이 안 맞아도 앱이 죽지 않는다**
- `ads.android.com/session/not-an-int` 처럼 숫자 자리에 글자가 오면, 안에서 디코딩이 실패하고 `matcher.match(request)` 가 `null` 을 돌려준다. 그러면 다음 짝짓기가 이어서 시도된다.
- 쿼리나 프래그먼트에서 오는 선택 값은 Kotlin 기본값을 둔 속성(`val referrer: String? = null`)에 넣는다. 값이 없으면 기본값이 쓰인다.
- 다만 키 클래스에 `Map<String, String>` 이나 `List<List<String>>` 같은 지원하지 않는 모양이 있으면 `UriDeepLinkMatcher` 가 예외를 던진다. 이건 링크가 들어올 때가 아니라 키를 잘못 설계한 것이므로 개발 중에 바로 드러난다.

**한 칸에 이상한 값이 들어 있을 때 — `DeepLinkSerializer<T>`**
- 다른 팀이 만든 웹 주소는 깔끔하지 않을 때가 많다. 매개변수 하나에 Base64로 인코딩한 썸네일, `key:value` 꼴의 필터 토큰, 쉼표로 이은 id 목록이 들어 있기도 하다.
- 이때 `DeepLinkSerializer<T>` 를 상속한다. 이 클래스는 "문자열 하나 ↔ 객체 하나"용 `KSerializer<T>` 라서, 직접 쓸 것이 셋뿐이다.
  - `serialName`: 겹치지 않는 이름.
  - `deserialize(value: String): T`: 들어온 주소의 문자열을 객체로 바꾼다.
  - `serialize(value: T): String`: 객체를 다시 문자열로 바꾼다. 딥링크를 받을 때는 안 쓰지만, `rememberNavBackStack` 이 화면 회전이나 프로세스 종료 뒤에도 같은 `NavKey` 를 SavedState에 저장하려면 필요하다.

**원문 코드 5: Bitmap을 주소로 받기**
- 원문은 `BitmapSerializer` 를 `DeepLinkSerializer<Bitmap>` 으로 만든다. `deserialize` 는 Base64를 풀어 `BitmapFactory.decodeByteArray` 로 그림을 만들고, `serialize` 는 그림을 JPEG 품질 100으로 압축해 Base64 문자열로 만든다.
- `SessionWithPreview(val id: String, @Serializable(with = BitmapSerializer::class) val placeholderImage: Bitmap? = null)` 처럼 속성에 붙여 쓴다.
- 원문은 바로 경고를 붙인다. **Bitmap이나 직접 만든 값은 아주 작게 유지한다.** SavedState에 큰 객체를 넣으면 Binder 트랜잭션 한도에 걸릴 수 있다.

## 4. 직렬화 전에 값 다듬기 — matchArguments 덮어쓰기

**언제 쓰나**
- 주소에 커다란 JSON 쿼리(`?session={"id":"42","tracking":"..."}`)가 붙어 있는데 화면에는 그 안의 `id` 하나만 필요할 때, 직렬화 도구를 통째로 만드는 것은 지나치다.

**어디를 덮어쓰나**
- `UriDeepLinkMatcher` 는 `open class` 이고, 덮어쓸 수 있는 함수가 세 단계로 있다. 요청 전체를 보는 `matchRequest`, 주소를 보는 `matchUri`, 꺼낸 값을 보는 `matchArguments` 다.
- `matchArguments` 는 경로, 쿼리, 프래그먼트에서 꺼낸 값을 각각 `Map<String, List<String>>` 으로 받는다. 이 함수를 덮어쓰면 kotlinx.serialization이 돌기 **전에** 값을 고쳐 넣을 수 있다.

**원문 코드 6: JSON에서 id만 꺼내기**
- 원문의 `SessionUriDeepLinkMatcher` 는 `UriDeepLinkMatcher<Session>` 을 상속하고 `matchArguments` 를 덮어쓴다.
- 쿼리 값을 새 맵에 옮겨 담으면서 `session` 항목을 빼고, 그 JSON 덩어리에서 id를 꺼내 `id` 항목으로 넣는다. 그런 다음 `super.matchArguments(...)` 에 고친 쿼리 맵을 넘긴다.
- 결과: `Session` 키는 바깥 JSON 모양을 전혀 모른다. 웹 팀이 JSON 구조를 바꿔도 고칠 곳은 짝짓기 하나다.

## 5. 이긴 링크에만 뒤로 가기 목록 만들기 — withBackStack

**문제: 알림으로 들어온 화면에서 뒤로 가기를 누르면 앱이 닫힌다**
- 알림을 눌러 `listOf(Session(id = 42))` 로 앱을 열면, 뒤로 가기 목록에 화면이 하나뿐이라 뒤로 가기를 누르는 순간 앱이 닫힌다.
- 사용자는 손으로 거쳐 왔을 순서를 기대한다. 세션이면 `Home -> SessionList -> Session(42)`, 알림 설정 화면이면 `Home -> Settings -> NotificationSettings` 다.

**해결: 짝짓기마다 목록 만드는 방법을 붙이되, 이긴 것만 만든다**
- 짝짓기마다 "나로 들어오면 이런 목록"을 붙이면 계층 문제는 풀린다. 하지만 후보 짝짓기마다 목록을 미리 만들면, 이기는 것은 하나뿐인데 앱 시작 시간을 낭비한다.
- `withBackStack` 확장 함수가 이것을 미룬다.

**원문 코드 7: 홈과 세션에 목록 붙이기**
- `ads.android.com/home` 짝짓기에는 `.withBackStack { listOf(it.key) }`, 세션 짝짓기에는 `.withBackStack { listOf(Home, SessionList, it.key) }` 를 붙인다.
- 둘을 `List<BackStackMatcher<out NavKey, *>>` 에 넣고, 요청마다 `mapNotNull { it.match(request) }.maxOrNull()` 로 이긴 결과를 고른다.
- 첫 뒤로 가기 목록은 `bestMatch?.backStack ?: listOf(Home)` 이다.

**어떻게 미루나**
- `withBackStack` 은 원래 짝짓기를 `BackStackMatcher` 로 감싼다. 순위 비교는 안쪽 `MatchResult` 에 그대로 맡긴다.
- 목록을 만드는 람다는 이긴 결과의 `.backStack` 을 **읽을 때만** 돈다. 1.2.1 소스를 보면 짝짓기 단계에서는 람다를 결과 객체에 넘겨 두기만 한다.

```kotlin
override fun matchRequest(request: DeepLinkRequest): BackStackMatchResult<T, K>? {
    val result = matcher.match(request) ?: return null
    return BackStackMatchResult(result, backStackBuilder)
}
```

> 출처: `BackStackMatcher.kt`, androidx.navigation3:navigation3-runtime 1.2.1 소스 ([AOSP androidx](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:navigation3/), Apache 2.0)

- `matcher.match(request) ?: return null`: 안쪽 짝짓기가 실패하면 바로 `null` 이다.
- `BackStackMatchResult(result, backStackBuilder)`: 성공해도 목록을 만들지 않고, 결과와 "목록 만드는 법"을 함께 담아 돌려준다.

## 6. 미리 거르기, 고정 키, RequestExtras

**주소를 해석할 필요가 없는 딥링크도 있다**
- 사진 편집 앱이 다른 앱에서 `Intent.ACTION_VIEW` 로 공유된 `image/jpg` 를 받을 때는 MIME 타입만 보면 된다.
- 첫 사용 안내 화면을 A/B 테스트하는 앱은 바깥에서 온 실험 값에 따라 갈라야 한다.

**`DeepLinkMatcher.Filter` — 주소 해석 전에 거른다**
- 아무 짝짓기에나 미리 조건(필터)을 붙인다. 조건이 틀리면 주소 해석이나 직렬화를 아예 하지 않고 끝난다.
- 제공되는 필터는 `DeepLinkMatcher.actionFilter(...)`, `DeepLinkMatcher.mimeTypeFilter(...)` 이고, 람다 하나로 직접 만들 수도 있다(`Filter` 는 메서드가 하나뿐인 `fun interface` 다). 1.2.1 소스에서 확인해 보면 `mimeTypeFilter` 는 공통 코드에 있지만 `actionFilter` 는 **Android 전용 코드**(`androidMain`)에 있다.

**`StaticKeyDeepLinkMatcher` — 필터만 통과하면 정해진 키**
- 주소를 전혀 해석하지 않고, 필터를 통과하면 늘 같은 `NavKey` 를 돌려준다.
- 원문은 여기에 선을 긋는다. `ads.android.com/home` 같은 **고정된 웹 주소에는 쓰지 않는다.** 웹 주소는 계속 `UriDeepLinkMatcher` 로 짝지어야 `UriMatchResult` 의 순위가 자리표시가 있는 다른 주소들과 제대로 비교된다.

**`RequestExtras` — 바깥 신호를 필터에 넘기기**
- 타입이 있는 키-값 상자다. `RequestExtrasKey<T>` 로 키를 만들고 `requestExtras { ... }` 로 채운다.
- 원문 코드 8은 이렇게 짠다. 이미지 화면 키 `ImagesKey` 와 실험 그룹 키 `ExperimentBucketKey : RequestExtrasKey<String>` 를 만든다. `mimeTypeFilter("image/jpg")` 와 "실험 그룹이 `variant_b` 인가"를 보는 람다 필터를 만들어 `StaticKeyDeepLinkMatcher(key = ImagesKey, filters = listOf(...))` 에 넘긴다. 실험 값은 `requestExtras { put(ExperimentBucketKey, "variant_b") }` 로 요청에 싣는다.

**맺음: 거의 전부 공통 코드다**
- `DeepLinkRequest`, `UriDeepLinkMatcher`, `StaticKeyDeepLinkMatcher`, `BackStackMatcher`, `RequestExtras` 가 모두 Navigation 3의 `commonMain` 에 있다.
- 그래서 주소 짝짓기와 합성 뒤로 가기 목록 만들기를 통째로 Android와 다른 KMP 플랫폼이 함께 쓴다. Android에만 남는 것은 Activity 입구의 `DeepLinkRequest(intent)` 한 줄이다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide는 이미 Navigation 3를 쓴다. 다만 버전이 **1.1.7** 이라 이 글의 딥링크 API(1.2.0부터)가 아직 없다. `AndroidManifest.xml` 에는 런처용 `<intent-filter>` 하나뿐이고, 앱 안으로 들어오는 링크는 없다. 1-a 계획의 리마인더 알림은 누르면 Aide가 아니라 **기본 캘린더 앱**에서 그 회차를 연다.

### 1. Aide는 이미 "합성 뒤로 가기 목록"을 손으로 만들고 있다

아래는 **Aide의 실제 코드** 일부다.

```kotlin
@Composable
fun AideApp(startTab: TopLevelDestination = TopLevelDestination.HOME) {
    val backStack = rememberNavBackStack(
        *TopLevelDestination.entries
            .filter { destination -> destination == TopLevelDestination.HOME || destination == startTab }
            .map { destination -> destination.key }
            .toTypedArray()
    )
```

> 출처: Aide `AideApp` (`app/src/main/kotlin/com/giwon/aide/navigation/AideNavDisplay.kt`)

- `startTab` 이 캘린더면 첫 뒤로 가기 목록은 `[HomeKey, CalendarKey]` 다. 캘린더에서 뒤로 가기를 누르면 홈으로 오고, 홈에서 한 번 더 누르면 앱이 닫힌다(2026-10-20 결정 "하단 탭을 누르면 뒤로 가기 목록은 [홈, 그 탭]").
- 원문 5장의 `withBackStack { listOf(Home, SessionList, it.key) }` 와 같은 생각이다. 지금은 Preview가 이 매개변수를 쓴다. 나중에 알림이나 링크로 특정 탭을 열게 되면 같은 규칙을 딥링크 쪽에 옮기면 된다.

### 2. 링크가 생기면 — 짝짓기 목록과 Intent 없는 단위 테스트

Navigation 3를 1.2.1로 올린 뒤, 예를 들어 08:30 숫자 알림을 눌러 Aide의 캘린더 탭을 열기로 한다면 이런 모양이 된다. 아래는 **직접 쓴 스케치**이고, 1.2.1 API 이름은 소스로 확인했지만 컴파일해 보지는 않았다.

```kotlin
object AideDeepLinks {

    private val matchers: List<BackStackMatcher<out NavKey, *>> = listOf(
        UriDeepLinkMatcher(
            uriPattern = DeepLinkUri("aide://home"),
            serializer = serializer<HomeKey>(),
        ).withBackStack { match -> listOf(match.key) },
        UriDeepLinkMatcher(
            uriPattern = DeepLinkUri("aide://calendar"),
            serializer = serializer<CalendarKey>(),
        ).withBackStack { match -> listOf(HomeKey, match.key) },
    )

    fun initialBackStack(request: DeepLinkRequest): List<NavKey> =
        matchers
            .mapNotNull { matcher -> matcher.match(request) }
            .maxOrNull()
            ?.backStack
            ?: listOf(HomeKey)
}
```

- 스킴을 `aide` 로 적었으므로 1장의 스킴 규칙에 따라 `aide://` 로 시작하는 요청만 받는다. Aide에는 웹 도메인이 없어서 웹 주소는 쓰지 않는다.
- 캘린더 쪽 목록은 `[HomeKey, CalendarKey]` 로, 위 1번의 하단 탭 규칙과 같게 맞춘다.
- 짝이 없으면 `listOf(HomeKey)` 로 홈을 연다.
- Aide는 화면 키가 `feature:home`, `feature:calendar`, `feature:settings` 에 있다. 원문 2장처럼 Hilt 멀티바인딩으로 모듈마다 보탤 수도 있지만, 탭 셋에 링크 몇 개라면 `:app` 에 목록 하나를 두는 편이 읽기 쉽다. 그래서 **바꿔서** `:app` 에 모은다.

이 짝짓기는 Intent 없이 JUnit 5로 시험한다.

```kotlin
class AideDeepLinksTest {

    @Test
    fun `캘린더 링크는 홈 위에 캘린더를 쌓는다`() {
        val backStack = AideDeepLinks.initialBackStack(DeepLinkRequest("aide://calendar"))

        assertEquals(listOf(HomeKey, CalendarKey), backStack)
    }

    @Test
    fun `모르는 링크는 홈 하나로 연다`() {
        val backStack = AideDeepLinks.initialBackStack(DeepLinkRequest("aide://unknown"))

        assertEquals(listOf(HomeKey), backStack)
    }
}
```

- `DeepLinkRequest("aide://calendar")` 는 1.2.1의 문자열 생성자다. Android의 `Intent` 를 만들지 않으므로 Robolectric 없이 JVM 단위 테스트로 돈다.
- 둘째 테스트가 "모르는 링크로 앱이 죽거나 빈 화면이 되지 않는가"를 지킨다.

## 배운 점

- **라이브러리가 뒤로 가기 목록을 갖지 않으면, 딥링크는 "첫 목록 만들기"로 줄어든다.** 화면 이동을 대신해 주던 Navigation 2와 달리, Navigation 3의 딥링크 API는 링크를 `List<NavKey>` 로 바꾸는 일만 한다. 책임이 좁으니 시험하기도 쉽다.
- **주소 모양과 화면 키를 타입으로 묶는다.** 자리표시 이름과 속성 이름을 맞추고, 타입 변환은 kotlinx.serialization에 맡긴다. 타입이 안 맞는 링크는 앱을 죽이지 않고 "짝 없음"이 된다.
- **여러 짝이 맞으면 순위로 고른다.** 글자 그대로 맞은 주소가 자리표시 주소보다 앞선다. 직접 `if` 순서를 짤 필요가 없다.
- **비싼 일은 이긴 것에만 한다.** `withBackStack` 은 목록 만드는 법을 들고만 있다가 이긴 결과를 읽을 때 한 번 만든다. 앱 시작 시간을 아낀다.
- **바깥 형식은 입구에서 걸러 낸다.** JSON 덩어리나 이상한 토큰은 `matchArguments` 나 `DeepLinkSerializer` 에서 정리하고, 화면 키는 깔끔하게 둔다.
- **SavedState에 들어가는 키는 작게 둔다.** 딥링크로 받은 값도 `rememberNavBackStack` 에 저장되므로 Bitmap 같은 큰 값은 Binder 한도에 걸릴 수 있다.
- **API가 어디에 있는지 확인한다.** 대부분 공통 코드지만 `actionFilter` 와 `DeepLinkRequest(intent)` 는 Android 전용이다.

## Aide에 적용하면

Aide는 Navigation 3 **1.1.7** 을 쓴다. 2026-10-20 결정에 따르면 당시 최신 1.2.0이 **compileSdk 37** 을 요구해서 1.1.7로 갔고, "최신화는 Task 4 뒤 별도 PR로 한다"고 정했다. Aide의 compileSdk는 지금 36이다. 앱 안으로 들어오는 링크는 없고, 1-a 리마인더 알림은 누르면 기본 캘린더 앱을 연다.

1. **딥링크 API를 Aide에 넣는 것 — 지금은 안 한다.**
   - 이유: Aide에는 지금 앱 안의 특정 화면으로 들어오는 링크가 없다. 리마인더 알림은 기본 캘린더 앱을 열고, 08:30 숫자 알림은 계획에 누르면 어디로 가는지 정해져 있지 않다. 받을 링크가 없으면 짝짓기를 만들 이유도 없다.
   - 이유: 딥링크 API는 Navigation 3 1.2.0부터라 버전을 먼저 올려야 한다(아래 2번).
   - 1-b에서 알림이나 위젯으로 Aide의 특정 탭이나 화면을 열기로 하면, 그때 "코드로 보기" 2번처럼 `UriDeepLinkMatcher` 와 `withBackStack` 으로 가져온다.
2. **Navigation 3 1.2.1은 compileSdk 36으로도 받을 수 있다 — 최신화 PR에 입력으로 가져온다.**
   - Google Maven의 AAR 정보(aar-metadata)를 확인하니 `navigation3-runtime-android` 와 `navigation3-ui-android` 의 최소 compileSdk가 **1.2.0은 37, 1.2.1은 36** 이다. 2026-10-20 결정이 1.1.7에 머문 이유(compileSdk 37 요구)가 1.2.1에는 맞지 않는다.
   - 다만 1.2.1은 Compose runtime 1.11.2와 ui 1.10.0, activity-compose 1.12.0, lifecycle 2.10.0, savedstate 1.4.0을 끌어온다. Aide의 Compose BOM 2026.02.01은 Compose 1.10.x를 고르므로 Gradle이 runtime을 1.11.2로 올리게 된다. Compose runtime 1.11.2의 최소 compileSdk는 34라 compileSdk 문제는 없어 보이지만, **빌드해 보지는 않았다.**
   - 결정 기록의 원칙대로 Task 8 같은 기능 작업에 섞지 않고, 최신화 PR에서 스크래치로 `assembleDebug test lint` 를 돌려 확인한다.
3. **링크가 생기면 "어떤 링크가 어떤 뒤로 가기 목록이 되는가"를 Intent 없이 JUnit 5로 시험한다 — 가져온다. 링크를 처음 만들 때.**
   - `DeepLinkRequest` 를 문자열로 만들어 Robolectric 없이 JVM 테스트로 돌린다("코드로 보기" 2번). 모르는 링크가 홈으로 가는지도 함께 시험한다.
4. **딥링크로 연 화면의 뒤로 가기 목록은 하단 탭 규칙 [홈, 그 탭]과 같게 맞춘다 — 가져온다. 링크를 처음 만들 때.**
   - Aide의 `AideApp(startTab)` 은 이미 이 목록을 만든다("코드로 보기" 1번). 알림으로 캘린더를 열어도 뒤로 가기 한 번이면 홈, 두 번이면 앱 종료가 되어야 탭으로 들어왔을 때와 똑같이 움직인다.

## 출처

- [Type-safe deep links in Jetpack Navigation 3 — Arda Kazancı](https://ardakazanci.com/posts/type-safe-deep-links-jetpack-navigation-3/) (2026-11-12)
- Android Dev Summit 세션 "Building type-safe deep links with Jetpack Navigation 3" (Ian Lake, Clara Fok)
- [androidx.navigation3 navigation3-runtime (Google Maven)](https://maven.google.com/web/index.html#androidx.navigation3:navigation3-runtime) 1.2.1 소스와 AAR 정보
- [Navigation 3 소스 (AOSP androidx, Apache 2.0)](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:navigation3/)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문 블로그 코드는 공개 라이선스가 없어 글로 설명했다. 인용한 코드는 Navigation 3 라이브러리 소스이고 Apache 2.0을 따른다.
