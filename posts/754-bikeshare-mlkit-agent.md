---
issue: 754
date: 2026-11-22
title: 기기 안 Gemini Nano 에이전트에 앱의 AppFunctions를 도구로 주기 — ML Kit GenAI agent API로 만든 "Ask BikeShare"
original_title: Creating an on-device AI agent using ML Kit GenAI agent API and AppFunctions
url: https://johnoreilly.dev/posts/bikeshare-mlkit-agent/
author: John O'Reilly
tags: [AI, Gemini Nano, ML Kit, AppFunctions]
aide:
  status: candidate
  module: feature:home
  task: 1-b
  summary: 1-b에서 AI 함수를 짤 때 모델이 숫자나 날짜, 캘린더를 지어내지 않게 도구가 이름을 받아 앱이 직접 찾고, 못 찾으면 에이전트가 그대로 전할 수 있는 오류를 돌려준다. 기기 안 에이전트는 아직 미리보기라 지금은 넣지 않고, 키 없는 보조 경로 후보로만 기록한다
---

## 한 줄 요약

John O'Reilly는 자전거 공유 샘플 앱 BikeShare에 이미 만들어 둔 **AppFunctions**(앱 기능을 기기 안 AI 에이전트가 부를 수 있게 내놓는 Android 장치) 세 개를, Google이 새로 낸 **ML Kit GenAI agent API**(기기 안 Gemini Nano로 AI 에이전트를 돌리는 API)의 도구로 그대로 넘겨 "Ask BikeShare" 채팅을 만들었다. 에이전트를 만드는 코드는 몇 줄이고, `enableAppFunctions(true)` 한 줄이 앱 안의 AppFunctions를 찾아 도구로 쓴다. 저자가 가장 공들인 곳은 **모델이 지어내지 못하게 막는 일**이었다. 장소 이름만 받은 Gemini Nano가 위도와 경도를 짐작해 "타워 브리지 근처"를 3.5km 떨어진 런던 중심가에 찍었다. 그래서 도구가 장소 이름을 받고 앱이 Android `Geocoder` 로 직접 찾게 바꿨고, 못 찾으면 엉뚱한 도시의 결과 대신 에이전트가 그대로 전할 수 있는 오류를 돌려준다.

> 원문 코드는 BikeShare 저장소의 코드이고, 저장소는 Apache-2.0 라이선스다. 그래서 원문 글에 실린 코드 조각을 그대로 인용하고, 블록마다 아래에 출처를 적었다. 원문 그림 2장(앱 화면, 구조도)은 원문 블로그에 라이선스 표시가 없어 파일을 복사하지 않고 원문 서버 주소를 걸어 보여 준다. "코드로 보기" 절의 Aide 코드는 **직접 쓴 스케치**이고 컴파일해 보지 않았다.

## 먼저 알아 둘 말

- **AI 에이전트(agent)**: 사용자 질문을 받고, 스스로 어떤 도구를 부를지 골라 부르고, 그 결과를 보고 다시 도구를 부르거나 답을 쓰는 AI 프로그램이다. 질문 하나에 대답 하나로 끝나는 보통 채팅과 다르게, 여러 번 오가며 일을 한다.
- **도구(tool)와 함수 호출(function calling)**: 에이전트가 부를 수 있게 앱이 내놓는 함수다. 모델은 함수를 직접 실행하지 못하고, "이 함수를 이 값으로 불러 달라"는 요청(FunctionCall)을 낸다. 앱이 실제로 실행해 결과(FunctionResponse)를 돌려준다.
- **Gemini Nano**: Google이 기기 안에서 돌리도록 만든 작은 언어 모델이다. 인터넷이나 API 키 없이 폰 안에서 답한다. 지원하는 기기에서만 쓸 수 있다.
- **AICore**: Gemini Nano를 기기에 내려받고 돌려 주는 Android 시스템 서비스다. 앱은 모델을 직접 품지 않고 AICore에 부탁한다.
- **ML Kit GenAI agent API**: ML Kit(구글의 기기 안 머신러닝 라이브러리 모음)에 새로 들어온 API다. Gemini Nano로 에이전트를 만들고, 대화 세션을 관리하고, 도구 호출을 대신 돌려 준다. 아직 **미리보기(Preview)** 이고, 기기의 Google 계정이 **AICore Developer Preview 프로그램**에 들어 있어야 쓸 수 있다고 공식 문서가 적고 있다.
- **AppFunctions**: 앱이 `@AppFunctionDeclaration` 을 붙인 함수를 Android 시스템에 등록해, 기기 안의 AI 에이전트가 그 함수를 찾아 부를 수 있게 하는 Jetpack 라이브러리다. 이 블로그의 #750 글에서 다뤘다.
- **에이전트 세션(AgentSession)**: 대화 기록을 들고 있는 객체다. 같은 세션으로 다시 물으면 앞의 대화를 이어서 본다.
- **Flow**: Kotlin 코루틴에서 값을 여러 번 차례로 내보내는 흐름이다. 여기서는 에이전트가 도구를 부르고 답을 쓰는 과정을 사건(event) 단위로 하나씩 내보낸다.
- **스트리밍(streaming)**: 답 전체가 다 만들어질 때까지 기다리지 않고, 만들어지는 대로 조금씩 받는 방식이다.
- **칩(chip)**: Material 디자인의 작은 알약 모양 표시다. 여기서는 에이전트가 부른 도구 하나마다 칩 하나를 답 아래에 보여 준다.
- **Geocoder**: 장소 이름이나 주소를 위도와 경도로 바꿔 주는 Android 내장 클래스다(`android.location.Geocoder`). 기기에 따라 없을 수도 있어서 `Geocoder.isPresent()` 로 먼저 확인한다.
- **Markdown**: `**굵게**`, `- 목록` 처럼 기호로 서식을 적는 글 형식이다. Gemini Nano는 답을 Markdown으로 쓰므로, 화면에 그리려면 Markdown 렌더러가 필요하다.
- **adb**: 컴퓨터에서 연결된 Android 기기에 명령을 보내는 도구(Android Debug Bridge)다.
- **ViewModel**: 화면 상태를 들고 있고, 화면이 돌아가도 살아남는 Jetpack 클래스다. Android 개발자에게 익숙한 그 ViewModel이다.

## 서론 — AppFunctions가 이미 있으니 에이전트를 붙여 본다

<figure class="media"><img src="https://johnoreilly.dev/images/bikeshare_mlkit_agent.png" alt="원문 앱 화면. 맨 위에 Ask BikeShare 제목과 Runs on device with Gemini Nano, using BikeShare's AppFunctions 라는 설명이 있다. 사용자가 Any free docks near Tower Bridge in London? 이라고 물었고, 그 아래에 도구 호출 칩 두 개 listNetworks(query=London) 와 findNearbyStations(place=Tower Bridge, networkId=santa...) 가 있다. 그 아래 답에는 타워 브리지 근처 정류장 다섯 곳과 빈 거치대 수가 굵은 글씨 목록으로 나온다. 첫 줄은 200049 - St. Katharine's Way, Tower: 20 empty docks 이다" width="500" loading="lazy"><figcaption>원문 앱 화면. "런던 타워 브리지 근처에 빈 거치대가 있나?"라는 질문에 에이전트가 listNetworks와 findNearbyStations 두 도구를 부르고(답 위의 칩 두 개), 정류장 다섯 곳과 빈 거치대 수를 목록으로 답했다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://johnoreilly.dev/posts/bikeshare-mlkit-agent/">원문</a>)</figcaption></figure>

**무엇을 했나: 이미 있던 AppFunctions 세 개를 기기 안 에이전트의 도구로 써서 "Ask BikeShare" 채팅을 붙였다.**

- 저자는 앞선 글에서 Confetti 앱의 기능을 AppFunctions로 기기 안 AI 에이전트에 내놓는 방법을 다뤘다.
- 같은 때 BikeShare 샘플에도 AppFunctions를 넣어, 함수 세 개를 내놓았다. 자전거 공유 네트워크 목록을 주는 `listNetworks`, 한 네트워크의 정류장 목록을 주는 `listStations`, 어떤 곳 근처의 정류장을 찾는 `findNearbyStations` 다.
- 그 뒤 Google이 ML Kit GenAI agent API를 냈다. 이 API는 기기 안 Gemini Nano로 에이전트를 돌리고, **앱의 AppFunctions를 그 에이전트의 도구로** 쓴다.
- 왜: BikeShare에는 도구로 쓸 AppFunctions가 이미 있었으니 시험해 보기 좋았다.
- 결과: Android 앱에 "Ask BikeShare" 채팅이 생겼다. 위 그림처럼 질문하면 에이전트가 도구를 골라 부르고 답한다.

## 1. 의존성

**무엇을 했나: `libs.versions.toml` 에 AppFunctions와 ML Kit GenAI agent 버전을 넣었다.**

```toml
[versions]
...
androidxAppFunctions = "1.0.0-alpha13"
mlkitGenaiAgent = "1.0.0-alpha1"

[libraries]
...
mlkit-genai-agent = { module = "com.google.mlkit:genai-agent", version.ref = "mlkitGenaiAgent" }
```

> 출처: BikeShare `gradle/libs.versions.toml` (원문 글에 실린 조각, [joreilly/BikeShare](https://github.com/joreilly/BikeShare), Apache-2.0)

- `androidxAppFunctions = "1.0.0-alpha13"` 은 AppFunctions 라이브러리 버전이다.
- `mlkitGenaiAgent = "1.0.0-alpha1"` 은 ML Kit GenAI agent의 첫 알파 버전이다.
- `mlkit-genai-agent = { module = "com.google.mlkit:genai-agent", ... }` 는 앱이 실제로 받는 라이브러리 좌표다.

원문에는 없지만 저장소(최신 커밋 `4d3dc57`)를 열어 보면 버전에 얽힌 사정이 더 있다.

- AppFunctions를 일부러 `alpha13` 에 묶어 두었다. 저장소 주석에 따르면 ML Kit genai-agent `1.0.0-alpha1` 은 AppFunctions `alpha13` 에 맞춰 만들어졌고, AppFunctions `rc01` 에서 `AppFunctionName` 이 다른 패키지로 옮겨 가 에이전트가 도구를 찾을 때 실행 중에 `NoSuchMethodError` 가 난다. 그래서 genai-agent가 따라올 때까지 `alpha13` 에 머문다.
- 저장소는 compileSdk 37, Kotlin `2.5.0-Beta2` 를 쓴다. 공통 minSdk는 24인데, Android 앱 모듈만 "ML Kit genai-agent가 요구한다"는 주석과 함께 minSdk 26이다.

## 2. 구현 — 에이전트 만들기와 지시문

**에이전트를 만드는 데는 몇 줄이면 된다.**

```kotlin
private val agent = Agent.builder()
    .setName("BikeShare")
    .setInstructions(INSTRUCTIONS)
    .enableAppFunctions(true)
    .setMaxTurns(8)
    .build()
```

> 출처: BikeShare `androidApp/src/main/java/dev/johnoreilly/bikeshare/agent/BikeShareAgentViewModel.kt` ([joreilly/BikeShare](https://github.com/joreilly/BikeShare), Apache-2.0)

- `Agent.builder()` 로 에이전트 설정을 시작한다.
- `.setName("BikeShare")` 는 에이전트 이름이다.
- `.setInstructions(INSTRUCTIONS)` 는 에이전트가 늘 따를 지시문(system instruction)이다. 아래에서 본다.
- `.enableAppFunctions(true)` 가 핵심이다. 에이전트가 **이 앱 패키지 안의 AppFunctions를 찾아 도구로** 쓴다. 그래서 도구를 따로 정의할 필요가 없다. AppFunctions에 적은 설명(KDoc)이 곧 도구 설명이 된다.
- `.setMaxTurns(8)` 은 질문 하나에 에이전트가 오갈 수 있는 최대 횟수다. 공식 문서는 기본값을 10으로 적고, 끝없이 도는 일을 막고 배터리와 기기 반응성을 지키려는 장치라고 설명한다. 저자는 8로 줄였다.
- `.build()` 로 에이전트를 만든다.

**지시문은 대부분 "언제 어떤 도구를 부를지"였다.**

```kotlin
val INSTRUCTIONS = """
    You help people find shared bikes and free docks using BikeShare's tools.
    Never invent networks, stations or numbers: look them up with the tools.
    To answer about a city, first find its network ID with listNetworks, then use
    listStations or findNearbyStations with that ID.
    Keep answers short: name the stations and say how many bikes and free docks each has.
    For the stations with the most free bikes or empty docks, call listStations with
    sortBy ("freeBikes" or "emptyDocks") and limit 5, and keep the order it returns.
    For stations near a named place, call findNearbyStations with that place's name as
    place. Never guess latitude and longitude.
""".trimIndent()
```

> 출처: BikeShare `androidApp/src/main/java/dev/johnoreilly/bikeshare/agent/BikeShareAgentViewModel.kt` ([joreilly/BikeShare](https://github.com/joreilly/BikeShare), Apache-2.0)

줄마다 하는 일을 우리말로 풀면 이렇다.

- 첫 줄은 에이전트의 역할이다. BikeShare의 도구로 빌릴 수 있는 자전거와 빈 거치대를 찾아 준다.
- 둘째 줄은 **네트워크, 정류장, 숫자를 지어내지 말고 도구로 찾아보라**는 금지다.
- 셋째와 넷째 줄은 도구 순서다. 도시를 물으면 먼저 `listNetworks` 로 네트워크 ID를 찾고, 그 ID로 `listStations` 나 `findNearbyStations` 를 부른다.
- 다섯째 줄은 답의 모양이다. 짧게, 정류장 이름과 자전거 수, 빈 거치대 수만 말한다.
- 여섯째와 일곱째 줄은 "자전거가 가장 많은 곳"이나 "빈 거치대가 가장 많은 곳"을 물을 때다. `listStations` 를 `sortBy` 와 `limit 5` 로 부르고, 돌려받은 순서를 바꾸지 않는다. 정렬을 모델에게 맡기지 않고 도구가 하게 한 것이다.
- 여덟째와 아홉째 줄은 "어떤 곳 근처"를 물을 때다. `findNearbyStations` 에 그 장소 이름을 `place` 로 넘기고, **위도와 경도를 짐작하지 말라**고 한다.

## 3. 모델이 좌표를 짐작하지 못하게 — 장소는 앱이 찾는다

**무엇이 문제였나: 장소 이름만 주면 Gemini Nano가 위도와 경도를 짐작했다.**

- 저자가 초기에 시험해 보니, "타워 브리지 근처"를 물으면 Gemini Nano가 좌표를 스스로 만들어 냈고, 그 좌표가 실제 타워 브리지에서 약 3.5km 떨어진 런던 중심가였다.

**무엇을 했나: `findNearbyStations` 가 `place` 매개변수도 받고, 앱이 Android `Geocoder` 로 직접 찾는다.**

```kotlin
val address = geocoder.find(
    place,
    network.latitude - NEARBY_DEGREES, network.longitude - NEARBY_DEGREES,
    network.latitude + NEARBY_DEGREES, network.longitude + NEARBY_DEGREES,
) ?: geocoder.find(place)
```

> 출처: BikeShare `androidApp/src/main/java/dev/johnoreilly/bikeshare/functions/BikeShareAppFunctionService.kt` (원문 글에 실린 조각, [joreilly/BikeShare](https://github.com/joreilly/BikeShare), Apache-2.0)

- `geocoder.find(place, 남서쪽 위도, 남서쪽 경도, 북동쪽 위도, 북동쪽 경도)` 는 장소 이름을 찾되, **그 자전거 네트워크 주변의 사각형 안에서 먼저** 찾는다. 사각형은 네트워크 중심 좌표에서 `NEARBY_DEGREES` 만큼 위아래, 양옆으로 넓힌 범위다.
- 왜: 세상에 "Tower Bridge"는 여러 곳일 수 있다. 런던의 자전거 공유 네트워크 Santander Cycles를 묻고 있다면, 런던의 타워 브리지를 골라야 한다.
- `?: geocoder.find(place)` 는 주변에서 못 찾았을 때 범위 없이 다시 찾는다. `find` 는 저장소 안에서 `Geocoder` 를 감싼 작은 함수다.

**못 찾으면: 엉뚱한 도시의 결과 대신, 에이전트가 그대로 전할 수 있는 오류를 돌려준다.**

- 장소를 아예 못 찾거나, 찾았는데 네트워크에서 멀리 떨어져 있으면, 함수가 오류를 돌려준다. 에이전트는 그 오류를 사용자에게 그대로 전한다.
- 저장소를 보면 이 오류는 AppFunctions가 정해 둔 예외다. 예를 들어 장소를 못 찾으면 `AppFunctionElementNotFoundException("Couldn't find a place called '…'.")` 를 던지고, 찾았지만 네트워크 근처가 아니면 "'…'는 찾았지만 그 네트워크가 있는 도시 근처가 아니다"라는 문장을 담아 던진다. 기기에 `Geocoder` 가 없으면 `AppFunctionNotSupportedException` 으로 "위도와 경도를 대신 달라"고 알린다.
- 결과: 모델이 틀린 곳의 정류장을 자신 있게 답하는 일이 사라지고, 모르면 모른다고 답한다.

## 4. ViewModel에서 에이전트 돌리기와 이벤트 흐름

**무엇을 했나: ViewModel에서 `AgentRunner` 와 `AgentSession` 으로 에이전트를 돌린다.**

```kotlin
val session = AgentRunner(getApplication(), agent).getOrCreateSession(SESSION_ID)
session.runAsync(Content.builder().text(text).build()).collect { event ->
    _messages.update { it.withAgentEvent(event) }
}
```

> 출처: BikeShare `androidApp/src/main/java/dev/johnoreilly/bikeshare/agent/BikeShareAgentViewModel.kt` (원문 글에 실린 조각, [joreilly/BikeShare](https://github.com/joreilly/BikeShare), Apache-2.0)

- `AgentRunner(getApplication(), agent)` 는 앞에서 만든 에이전트를 앱 Context와 함께 돌릴 준비를 한다.
- `.getOrCreateSession(SESSION_ID)` 는 세션을 가져오거나 새로 만든다. 세션이 대화 기록을 들고 있어서, 다음 질문에서 앞의 대화를 이어 본다. 저장소에서 `SESSION_ID` 는 `"ask-bikeshare"` 다.
- `session.runAsync(Content.builder().text(text).build())` 는 사용자가 쓴 글을 보내고, 사건의 Flow를 돌려준다.
- 사건은 세 종류다. 도구를 부를 때 `FunctionCall`, 도구 결과가 돌아올 때 `FunctionResponse`, 답이 스트리밍으로 들어올 때 `TextMessage` 다.
- `.collect { event -> _messages.update { it.withAgentEvent(event) } }` 는 사건이 올 때마다 채팅 메시지 목록에 반영한다. 저자는 `FunctionCall` 사건으로 **도구 호출 하나마다 칩 하나**를 답 아래에 보여 준다. 서론 그림의 칩 두 개가 이것이다.

**전체 구조는 아래 그림과 같다.**

<figure class="media"><img src="https://johnoreilly.dev/images/bikeshare_mlkit_agent_diagram.png" alt="원문 구조도. 위쪽 BIKESHARE APP 띠에 상자 세 개가 있다. 왼쪽 Ask BikeShare는 Compose 바텀 시트이고 도구 호출마다 칩, 답은 Markdown으로 그린다. 가운데 AgentSession은 ViewModel에서 돌리는 ML Kit GenAI agent API이고 AgentEvents를 스트리밍으로 돌려준다. 오른쪽 BikeShareAppFunctionService는 listNetworks, listStations, findNearbyStations를 가지고 기존 BikeShare 저장소를 부른다. 아래쪽 ANDROID 띠에는 상자 두 개가 있다. 왼쪽 Gemini Nano는 AICore를 거치는 기기 안 모델이고, 오른쪽 AppFunctions는 함수 목록을 주고 호출을 넘겨 주는 Android 시스템 서비스다. AgentSession과 Gemini Nano 사이 화살표에는 프롬프트와 도구 스키마, 함수 호출, 답이 오간다고 적혀 있고, AgentSession과 AppFunctions 사이에는 도구 호출과 결과, AppFunctions와 BikeShareAppFunctionService 사이에는 함수 호출이 적혀 있다" loading="lazy"><figcaption>원문 구조도. 앱 안의 채팅 화면(Ask BikeShare)과 AgentSession이 대화를 주고받고, AgentSession은 기기 안의 Gemini Nano와 프롬프트, 도구 설명, 함수 호출, 답을 주고받는다. 도구 호출은 Android 시스템의 AppFunctions 서비스를 거쳐 앱의 BikeShareAppFunctionService로 가고, 이 서비스가 기존 BikeShare 저장소를 부른다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://johnoreilly.dev/posts/bikeshare-mlkit-agent/">원문</a>)</figcaption></figure>

- 위쪽 띠는 BikeShare 앱이다. 채팅 화면은 Compose 바텀 시트이고, 도구 호출마다 칩을 달고, 답을 Markdown으로 그린다. 가운데 `AgentSession` 은 ViewModel에서 돈다. 오른쪽 `BikeShareAppFunctionService` 가 세 도구를 가지고 기존 BikeShare 저장소를 부른다.
- 아래쪽 띠는 Android 시스템이다. Gemini Nano는 AICore를 거쳐 기기 안에서 돌고, AppFunctions 시스템 서비스가 함수 목록을 알려 주고 호출을 앱으로 넘긴다.
- 도구 서비스는 **기존 저장소를 부르는 얇은 껍데기**다. 화면이 쓰는 데이터 계층을 에이전트도 같이 쓴다.

## 5. Gemini Nano가 있는지 먼저 확인하고, 없으면 버튼을 숨긴다

**무엇을 했나: 에이전트를 쓰기 전에 `Generation.getClient().checkStatus()` 로 Gemini Nano를 쓸 수 있는지 확인하고, 필요하면 모델을 내려받는다.**

- "Ask" 버튼은 이 확인이 성공한 뒤에만 나타난다.
- 왜: Gemini Nano를 지원하지 않는 기기도 많다.
- 결과: 지원하지 않는 기기에서는 앱이 **에이전트를 붙이기 전과 똑같이** 보인다. 고장 난 버튼이나 오류 화면이 생기지 않는다.

원문에는 없지만 저장소의 이 부분에 붙은 주석이 눈에 띈다.

- 확인 코드 전체를 `try` 안에 넣었다. 주석에 따르면 이 확인은 앱이 시작될 때 돌고, 여기서 실패하면 "Ask"를 숨겨야지 앱이 죽으면 안 된다. **1.0.17 버전에서는 R8이 ML Kit 초기화를 깨뜨려 앱이 죽었다**고 적혀 있다. 이 저장소의 Android 앱은 릴리스 빌드에서 `isMinifyEnabled = true`, 곧 R8을 켠다.
- 확인 결과는 세 갈래다. 바로 쓸 수 있으면 준비 완료, 내려받을 수 있거나 내려받는 중이면 진행률을 보여 주고, 그 밖이면 "이 기기에서는 쓸 수 없다"로 처리한다. 저장소의 안내 문구는 "에이전트 API는 지원 기기와 AICore Developer Preview의 Google 계정이 필요하다"고 적는다.

## 6. 답은 Markdown으로 그린다

- Gemini Nano는 답을 Markdown으로 쓴다. 그래서 저자는 Confetti에서 쓰던 `multiplatform-markdown-renderer` 라이브러리로 답을 그렸다. 서론 그림의 굵은 정류장 이름과 점 목록이 이 렌더러가 그린 것이다.

## 7. 도구는 AppFunctions라서 adb로 직접 불러 볼 수 있다

**무엇을 했나: 에이전트를 거치지 않고 adb로 도구를 직접 불러, 에이전트 답이 맞는지 맞춰 본다.**

```bash
adb shell "cmd app_function execute-app-function --package dev.johnoreilly.bikeshare \
--function 'dev.johnoreilly.bikeshare.functions.BaseBikeShareAppFunctionService#findNearbyStations' \
--parameters '{\"networkId\":\"santander-cycles\",\"place\":\"Tower Bridge\",\"limit\":5}' --brief-yaml"
```

> 출처: 원문 글의 명령 ([johnoreilly.dev](https://johnoreilly.dev/posts/bikeshare-mlkit-agent/), BikeShare 저장소 Apache-2.0)

- `cmd app_function execute-app-function` 은 기기의 AppFunctions 시스템 서비스에 함수 실행을 부탁하는 셸 명령이다.
- `--package dev.johnoreilly.bikeshare` 는 앱 패키지, `--function '…#findNearbyStations'` 는 부를 함수의 전체 이름이다.
- `--parameters '{…}'` 는 매개변수를 JSON으로 넘긴다. 네트워크 `santander-cycles`, 장소 `Tower Bridge`, 최대 5곳이다.
- `--brief-yaml` 은 결과를 짧은 YAML 형식으로 보여 달라는 뜻이다.

결과는 이렇게 나온다(첫 정류장만 보임).

```yaml
androidAppfunctionsReturnValue:
  - name: "200049 - St. Katharine's Way, Tower"
    freeBikes: 3
    emptyDocks: 20
    totalDocks: 23
    distanceMetres: 334
    latitude: 51.505697
    longitude: -0.070542
    id: ba9551ffdb93b1dabce99cafd7973461
  ...
```

> 출처: 원문 글의 실행 결과 ([johnoreilly.dev](https://johnoreilly.dev/posts/bikeshare-mlkit-agent/))

- 첫 정류장은 "200049 - St. Katharine's Way, Tower"다. 빌릴 수 있는 자전거 3대, 빈 거치대 20개, 전체 거치대 23개이고, 타워 브리지에서 334m 떨어져 있다.
- 서론 그림에서 에이전트가 답한 첫 줄 "St. Katharine's Way, Tower: 20 empty docks"와 숫자가 맞는다. 이렇게 도구를 직접 불러 보면, 에이전트가 도구 결과를 제대로 옮겼는지 확인할 수 있다.

원문은 이 코드가 BikeShare 저장소의 `androidApp` 모듈에 있다고 밝히며 끝난다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide는 1-b에서 AI가 함수를 불러 일정과 할 일을 다루게 할 계획이다. 2026-10-08 결정은 AI 함수를 두 종류로 나눴다. 사용자 지시로 바로 실행하는 `create_event`, 제안만 하는 `propose_event`, `propose_task`, `ask_completion` 이다. 같은 날 다른 결정은 **일정을 폰 캘린더 저장소에 쓰고, 어느 캘린더에 넣을지는 고른다**(기본 캘린더가 있으면 그것, 없으면 마지막에 쓴 캘린더)고 정했다. 원문의 "모델이 좌표를 짐작하지 못하게 앱이 찾는다"를 이 `create_event` 에 옮기면 아래와 같다. 모두 **직접 쓴 스케치**이고, Aide 코드는 고치지 않았다.

### 1. 모델에게 캘린더 ID를 받지 않고, 이름을 받아 앱이 찾는다

```kotlin
// 직접 쓴 스케치: 1-b의 AI 함수 create_event 몸통 (어떤 AI 라이브러리로 부르든 같은 모양)
suspend fun createEvent(
    title: String,
    start: LocalDateTime,
    end: LocalDateTime?,
    calendarName: String?,   // 모델은 "회사", "개인" 같은 이름만 넘긴다. 숫자 ID는 받지 않는다
): CreateEventResult {
    val calendars = eventRepository.observeWritableCalendars().first()
    val calendar = when {
        calendarName.isNullOrBlank() -> settingsRepository.defaultOrLastCalendar(calendars)
        else -> calendars.firstOrNull { it.displayName.contains(calendarName, ignoreCase = true) }
    } ?: return CreateEventResult.Error(
        "'$calendarName' 캘린더를 찾지 못했어요. 쓸 수 있는 캘린더: " +
            calendars.joinToString { it.displayName }
    )
    if (end != null && end <= start) {
        return CreateEventResult.Error("끝 시각이 시작 시각보다 빨라요. 끝 시각을 다시 물어봐 주세요.")
    }
    val eventId = eventRepository.createEvent(EventDraft(title, start, end ?: start.plusHours(1), calendar.id))
    return CreateEventResult.Created(eventId, calendar.displayName)
}
```

- 모델은 Aide의 캘린더 ID(폰 캘린더 저장소의 숫자)를 모른다. ID를 받게 하면 Gemini Nano가 좌표를 짐작했듯 숫자를 지어낼 수 있다. 그래서 이름만 받고, 앱이 쓰기 가능한 캘린더 목록에서 직접 찾는다.
- 이름이 없으면 2026-10-08 결정대로 기본 캘린더, 없으면 마지막에 쓴 캘린더를 쓴다. `defaultOrLastCalendar` 는 이 스케치에서 지어낸 이름이다. 1-a 계획의 Task 9가 `SettingsRepository` 를 만들고, Task 10 케이스 2번부터 4번이 같은 규칙(기본 캘린더가 목록에 없으면 미리 선택하지 않음)을 시험한다.
- 못 찾으면 엉뚱한 캘린더에 넣지 않고, **쓸 수 있는 캘린더 이름을 담은 오류**를 돌려준다. 에이전트는 이 문장을 그대로 사용자에게 전하거나 다시 물을 수 있다. 원문의 "찾았지만 그 네트워크 근처가 아니다" 오류와 같은 생각이다.
- 끝 시각이 시작보다 빠르면 고치지 않고 오류로 돌려준다. 일정 추가 화면(Task 10 케이스 5번)은 사람이 보고 있으니 끝 시각을 시작+1시간으로 맞춰 주지만, AI 경로는 사람이 보지 않으므로 조용히 고치지 않고 다시 묻게 한다. 이 차이를 둘지는 정해야 한다.

### 2. 지시문은 "언제 어떤 함수를 부를지"와 "지어내지 말라"로

```kotlin
// 직접 쓴 스케치: 1-b 에이전트 지시문의 일부
val INSTRUCTIONS = """
    너는 Aide의 비서다. 일정과 할 일은 반드시 도구로 찾고, 제목, 시각, 캘린더를 지어내지 않는다.
    오늘은 {today}, 지금은 {now}, 시간대는 {zoneId}다. "내일", "다음 주 화요일"은 이 날짜를 기준으로 바꾼다.
    사용자가 일정을 넣으라고 시켰으면 create_event를 부른다. 캘린더를 말하지 않았으면 calendarName을 비운다.
    사용자가 시키지 않은 일정이나 할 일은 propose_event나 propose_task로 제안만 한다.
    도구가 오류를 돌려주면 그 문장을 그대로 전하고, 필요한 것을 다시 묻는다.
""".trimIndent()
```

- 원문 지시문의 "숫자를 지어내지 말고 도구로 찾아라", "도구 순서"를 Aide의 말로 옮겼다.
- 날짜는 좌표와 비슷한 함정이다. 모델은 오늘이 며칠인지 모른다. 그래서 오늘 날짜, 지금 시각, 시간대를 지시문에 넣어 준다.
- "시킨 일은 `create_event`, 시키지 않은 일은 `propose_*`" 는 2026-10-08 결정 「시킨 일은 AI가 바로 하고 되돌릴 수 있게, 시키지 않은 일은 묻는다」를 지시문으로 적은 것이다.

### 3. AI를 쓸 수 없으면 입구를 숨긴다

```kotlin
// 직접 쓴 스케치: feature/home 의 HomeUiState 일부
data class HomeUiState(
    // ...Task 8의 오늘 날짜, 다음 일정, 할 일 목록
    val assistant: AssistantAvailability = AssistantAvailability.Asleep,
)

sealed interface AssistantAvailability {
    data object Asleep : AssistantAvailability          // 키 없음: 아바타는 잠든 모습, 말하기 기능 숨김
    data object Ready : AssistantAvailability           // 키 있음: 말하기 기능 보임
    data class Unavailable(val reason: String) : AssistantAvailability
}
```

- 원문은 Gemini Nano 확인이 성공해야만 "Ask" 버튼을 보여 준다. Aide에서는 2026-10-08 결정 「키가 없으면 AI 기능은 꺼지고 아바타는 잠든다. 대시보드는 쓸 수 있다」가 같은 자리다.
- 원문의 저장소 주석처럼, 상태를 확인하는 코드는 실패해도 앱을 죽이지 않고 `Unavailable` 로 끝나야 한다. 나중에 Gemini Nano를 보조 경로로 붙이면 `Ready` 를 고르는 조건에 "키가 있거나, Gemini Nano를 쓸 수 있거나"가 더해진다.

## 배운 점

- **에이전트를 만드는 코드는 짧고, 공은 지시문과 도구 설계에 든다.** `Agent.builder()` 몇 줄과 `enableAppFunctions(true)` 면 된다. 저자의 시간은 "언제 어떤 도구를 부를지"와 "지어내지 말라"에 들었다.
- **작은 모델은 모르는 값을 지어낸다.** 장소 이름을 주면 좌표를 짐작한다. 모델에게 숫자를 받지 말고 이름을 받아 앱이 확실한 방법(Geocoder, 저장소 조회)으로 찾는다.
- **찾을 때는 문맥 안에서 먼저 찾는다.** 런던의 자전거 네트워크를 묻고 있으면 런던 근처에서 먼저 찾는다.
- **틀린 답보다 오류가 낫다.** 못 찾으면 에이전트가 그대로 전할 수 있는 문장으로 오류를 돌려준다.
- **정렬과 자르기는 도구가 한다.** "가장 많은 곳 5곳"을 모델에게 맡기지 않고 `sortBy` 와 `limit` 으로 도구가 하고, 모델에게는 순서를 바꾸지 말라고 한다.
- **쓸 수 없는 기기에서는 기능이 없던 것처럼 보이게 한다.** 확인이 실패하면 버튼을 숨기고, 확인 코드가 앱을 죽이지 않게 한다.
- **도구를 사람이 직접 불러 볼 수 있으면 검증이 쉽다.** AppFunctions는 adb로 부를 수 있어서 에이전트의 답과 맞춰 볼 수 있다.
- **미리보기 라이브러리끼리는 버전이 서로 묶인다.** 저장소는 AppFunctions를 `alpha13` 에 묶어 두었다. 더 새 버전으로 올리면 실행 중에 도구 찾기가 깨진다.

## Aide에 적용하면

Aide의 AI 기능은 1-b다. 2026-10-08 결정 「LLM은 사용자가 고른 제공자를 사용자 키로 앱에서 직접 부른다(서버 없음)」에서 **기기 안 모델 Gemini Nano 단독은 "지원 기기 제한"으로 기각**했고, 같은 결정에 "Gemini Nano는 나중에 보조로 추가할 수 있다", "키 없이 쓸 수 있는 보조 경로(Android AppFunctions로 사용자의 AI가 Aide를 부르게 하기)는 나중에 검토한다"고 적었다. 이 글은 그 두 갈래가 합쳐진 모양이다. 앱 안의 기기 안 에이전트가 앱 자신의 AppFunctions를 도구로 쓴다. #750 AppFunctions 글의 적용안(AppFunctions 서버는 지금 안 한다, 1-b AI 함수를 원문 설계 원칙으로 짠다, 함수 몸통은 저장소 위 순수 함수로 둔다)과 맞춰 썼다.

1. **모델에게 ID나 숫자를 받지 않고 이름을 받아 앱이 찾게 하고, 못 찾으면 에이전트가 전할 수 있는 오류를 돌려준다 — 가져온다. 1-b에서 AI 함수를 만들 때.**
   - "코드로 보기" 1번처럼 `create_event` 가 캘린더 ID 대신 캘린더 이름을 받고, 못 찾으면 쓸 수 있는 캘린더 이름을 담은 오류를 돌려준다.
   - 이유: 원문에서 Gemini Nano가 좌표를 3.5km 틀리게 짐작했듯, 모델은 Aide의 캘린더 ID나 할 일 ID를 지어낼 수 있다. 잘못된 캘린더에 일정이 들어가면 구글 계정 동기화로 회사 캘린더에까지 퍼질 수 있다.
   - 이 원칙은 사용자 키로 부르는 큰 모델(1-b의 기본 경로)에도 그대로 맞는다. 작은 모델일수록 더 중요할 뿐이다.
2. **지시문에 오늘 날짜, 지금 시각, 시간대를 넣고, "지어내지 말고 도구로 찾아라"와 "시킨 일과 시키지 않은 일" 규칙을 적는다 — 가져온다. 1-b에서.**
   - "코드로 보기" 2번이다. 날짜는 Aide에서 좌표와 같은 함정이다.
   - "시킨 일은 `create_event`, 시키지 않은 일은 `propose_*`"는 2026-10-08 결정을 지시문으로 옮긴 것이라 새 결정이 아니다.
3. **AI를 쓸 수 없으면 입구를 숨기고, 상태 확인 코드는 실패해도 앱을 죽이지 않는다 — 가져온다. Task 8에서 자리만 만들고 1-b에서 채운다.**
   - 2026-10-08 결정 「키가 없으면 AI 기능은 꺼지고 아바타는 잠든다」와 원문의 "Gemini Nano 확인이 성공해야 Ask 버튼"이 같은 모양이다. Task 8의 `HomeUiState` 에 AI 상태 칸을 두면 1-b에서 화면을 다시 짜지 않아도 된다("코드로 보기" 3번).
   - Task 8에서 넣을지는 사용자가 정한다. 1-a에는 AI가 없으니 지금은 늘 `Asleep` 이다. 쓰지 않는 칸을 미리 두는 것이 2026-10-14 결정의 원칙("쓰지 않는 의존을 미리 넣지 않는다")과 부딪힌다고 볼 수도 있다.
4. **R8을 켤 때 AI 라이브러리 초기화가 깨지는지 따로 확인한다 — 가져온다. Task 17과 1-b가 만나는 때.**
   - 원문 저장소 주석에 따르면 BikeShare 1.0.17은 R8이 ML Kit 초기화를 깨뜨려 앱이 죽었다. #754 keep 규칙 글의 적용안(Task 17에서 R8을 켜고 Configuration Analyzer로 본다)에 "AI 라이브러리를 넣은 뒤 릴리스 빌드로 AI 입구까지 한 번 지나간다"를 더한다.
5. **기기 안 Gemini Nano 에이전트를 Aide에 넣는 것 — 지금은 안 한다.**
   - 이유: ML Kit GenAI agent API는 미리보기이고 `1.0.0-alpha1` 이며, 기기의 Google 계정이 AICore Developer Preview 프로그램에 들어 있어야 한다. 원문 저장소는 compileSdk 37, Kotlin `2.5.0-Beta2` 를 쓰고 AppFunctions를 `alpha13` 에 묶어 두었다. Aide는 compileSdk 36, Kotlin 2.2.10이고, 2026-10-20 결정대로 최신화(Kotlin과 compileSdk 올리기)는 별도 PR이다.
   - 2026-10-08 결정이 Gemini Nano 단독을 지원 기기 제한으로 기각한 사정도 그대로다.
   - 다시 볼 때: ML Kit GenAI agent API가 미리보기를 벗어나고, 1-b의 사용자 키 경로가 자리 잡은 뒤. 그때 "키가 없는 사용자에게 Gemini Nano로 일부 AI 기능을 켜 주는 보조 경로"로 검토하고, 결정하면 `decisions.md` 에 남긴다.
6. **도구 호출마다 칩을 보여 주는 화면 — 바꿔서 가져온다. 1-b에서.**
   - Aide는 바로 실행한 일에 결과 카드("구글 캘린더(…)에 내일 15:00 디자인 회의 넣었어요" + [캘린더 바꾸기] [되돌리기])를 보여 주기로 했다(2026-10-08 결정). 원문의 칩처럼 "AI가 무엇을 불렀는지"를 보여 주는 생각은 같고, Aide는 칩 대신 이 결과 카드로 보여 준다. 읽기만 하는 도구 호출(일정 찾기 등)까지 칩으로 보여 줄지는 1-b 화면을 짤 때 정한다.

## 출처

- 원문: John O'Reilly, [Creating an on-device AI agent using ML Kit GenAI agent API and AppFunctions](https://johnoreilly.dev/posts/bikeshare-mlkit-agent/), 2026-11-21. 그림 2장은 원문 서버 주소로 걸었다. 설명은 내 말로 다시 썼다.
- 원문 코드: [joreilly/BikeShare](https://github.com/joreilly/BikeShare) (Apache-2.0, 최신 커밋 `4d3dc57`에서 `gradle/libs.versions.toml`, `androidApp/build.gradle.kts`, `androidApp/.../agent/BikeShareAgentViewModel.kt`, `androidApp/.../functions/BikeShareAppFunctionService.kt` 를 읽음)
- 원문이 실린 곳: [Android Weekly #754](https://androidweekly.net/issues/issue-754)
- 공식 문서: [ML Kit GenAI agentic workflows (Android)](https://developers.google.com/ml-kit/genai/agent/android), [AppFunctions](https://developer.android.com/ai/appfunctions)
- Markdown 렌더러: [mikepenz/multiplatform-markdown-renderer](https://github.com/mikepenz/multiplatform-markdown-renderer)
- 이 블로그의 이전 글: [#750 AppFunctions 글](750-android-appfunctions.html), [#754 라이브러리 consumer keep 규칙 글](754-library-keep-rules-dex.html)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-08 결정 네 개(시킨 일과 시키지 않은 일, 폰 캘린더 저장소와 캘린더 고르기, 키가 없으면 아바타가 잠든다, 사용자 키로 직접 부른다), 2026-10-14 Task 2 결정, 2026-10-20 Task 4 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 8, 9, 10, 17
