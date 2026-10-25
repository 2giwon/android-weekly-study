---
issue: 750
date: 2026-10-25
title: AI와 앱을 이어 주는 Android AppFunctions — 앱이 기기 안의 MCP 서버가 되는 방법
original_title: "AI, Meet App: Android AppFunctions"
url: https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787
author: Katie Barnett
tags: [AppFunctions, AI, Gemini, MCP, Android 16]
aide:
  status: candidate
  module: app · core:data
  task: 1-b 이후
  summary: 결정 기록이 "나중에 검토"로 남긴 'AppFunctions로 사용자의 AI가 Aide를 부르게 하기'의 실제 조건을 정리한다. 지금은 compileSdk 37이 필요해 못 넣고, 1-b의 AI 함수(function calling)를 원문의 설계 원칙으로 짜 두면 나중에 그대로 내보낼 수 있다
---

## 한 줄 요약

**Android AppFunctions**는 앱이 자기 기능을 **기기 안의 AI 에이전트(예: Gemini 앱)가 쓸 수 있는 도구**로 내놓게 하는 새 Android API다. 하는 일은 MCP 서버와 같다. 다만 인터넷 너머의 서버가 아니라 **Android OS가 중간에서** 앱의 함수 목록을 모아 두고, 허가받은 AI 앱이 그 목록을 보고 골라 부른다. 개발자는 함수에 `@AppFunctionDeclaration`을 붙이고 **KDoc 주석을 AI에게 주는 설명서(프롬프트)처럼** 쓰면 된다. 그러면 Jetpack 라이브러리가 서비스와 설명 파일(XML)을 자동으로 만든다. 저자는 보드게임 기록 앱 Game Night Guru로 "2시간짜리 전략 게임을 추천해 줘"에 앱 안의 데이터로 답하는 과정을 보여 준다. 2026년 10월 현재는 **신뢰 테스터 대상 비공개 미리보기**라 일반 Gemini 앱으로는 아직 시험할 수 없다. 그러니 지금 준비해 두라는 것이 저자의 권유다.

> 원문은 Medium(ProAndroidDev)에 실렸고 자동 접근이 막혀 있어(403), ProAndroidDev의 RSS 피드에 실린 전문을 읽고 정리했다. 원문 글에는 라이선스 표시가 없다. 그래서 원문의 그림 6장(표지 그림 2장, 구조 도식 2장, 테스트 앱 GIF 1개, Android 스킬 아이콘 1장)은 **복사하지 않고 원문 서버(Medium 이미지 서버) 주소를 걸어** 보여 주고, 그림마다 무엇이 보이는지 글로도 적었다. 원문의 코드 5개는 GitHub Gist로 붙어 있는데, 이것도 자동 접근이 막혀 있었다. 같은 코드가 담긴 저자의 샘플 앱 [GameNightGuru](https://github.com/KatieBarnett/GameNightGuru/tree/extension)에는 **라이선스가 없어** 코드를 옮기지 않았다. 대신 무엇을 하는 코드인지 글로 설명하고, 같은 역할을 하는 **Google 공식 샘플 [android/appfunctions](https://github.com/android/appfunctions)(Apache-2.0)** 의 코드를 인용했다(2026-10-26 기준 커밋 `a3a2a89`).

## 먼저 알아 둘 말

- **AppFunctions**
  - Android 16부터 들어온 **플랫폼 API**(`android.app.appfunctions`)와, 그것을 쓰기 쉽게 감싼 **Jetpack 라이브러리**(`androidx.appfunctions`)를 함께 부르는 이름이다.
  - 앱이 "나는 이런 함수를 할 수 있다"고 OS에 등록하면, AI 앱이 OS를 거쳐 그 함수를 실행한다.
- **AI 에이전트 (agent)**
  - 사용자의 말을 듣고, 필요한 도구를 **스스로 골라 부르며** 일을 끝내는 AI 프로그램이다. 이 글에서는 Gemini 앱처럼 기기에 설치된 AI 앱을 말한다.
- **MCP (Model Context Protocol)**
  - AI가 바깥의 도구와 데이터를 쓰는 방법을 정한 **공개 약속(규격)** 이다. 도구를 내놓는 쪽을 **서버**, 쓰는 AI 쪽을 **클라이언트**라 부른다. Claude Code가 GitHub·Figma 같은 도구를 쓰는 것도 MCP다.
  - AppFunctions는 MCP 규격 그 자체는 아니다. 다만 **"앱 = 서버, AI 앱 = 클라이언트"라는 같은 모양**을 기기 안에서, OS를 중개자로 두고 만든 것이다.
- **도구 호출 (function calling, tool use)**
  - LLM이 대답하는 대신 "이 함수를 이 값으로 불러 달라"고 요청하는 방식이다. 함수 이름·설명·파라미터를 미리 LLM에게 알려 줘야 하며, LLM은 그 **설명을 읽고** 어떤 함수를 쓸지 정한다.
- **KDoc**
  - Kotlin의 문서 주석(`/** … */`)이다. Java의 Javadoc과 같다. AppFunctions에서는 이 주석이 **그대로 AI가 읽는 함수 설명**이 된다.
- **Service (서비스)**
  - 화면 없이 뒤에서 일을 하는 Android 구성 요소다. 다른 앱이나 OS가 연결(bind)해서 부를 수 있다. AppFunctions는 앱마다 서비스 하나를 두고, OS가 그 서비스를 통해 함수를 부른다.
- **KSP (Kotlin Symbol Processing)**
  - 컴파일할 때 어노테이션을 읽어 **코드를 자동으로 만들어 주는** 도구다. Room·Hilt도 이것으로 DAO 구현과 주입 코드를 만든다. AppFunctions 라이브러리도 KSP로 서비스 클래스와 설명 XML을 만든다.
- **Hilt EntryPoint**
  - Hilt가 직접 만들지 않는 객체(예: 시스템이 만드는 서비스) 안에서 Hilt가 가진 의존성을 **꺼내 쓰는 창구**다. `@AndroidEntryPoint`를 못 붙이는 곳에서 쓴다.
- **PendingIntent**
  - "나중에 다른 주체가 내 앱 대신 실행할 수 있는 화면 열기·작업 요청"을 담은 표다. 알림을 누르면 앱이 열리는 것도 이것이다. 이 글에서는 AI가 사용자에게 "앱에서 보기" 버튼을 보여 줄 때 쓴다.
- **Gemini 앱 · Gemini Nano**
  - Gemini 앱은 Google의 AI 비서 앱이다. Gemini Nano는 기기 안에서 도는 작은 모델이다. AppFunctions를 부르는 쪽은 Gemini 앱 같은 **에이전트 앱**이고, 그 앱이 어떤 모델을 쓰는지는 따로다.

## 서론 — 앱과 AI는 한 기기에 있었지만 서로 몰랐다

- **부제: "앱이 기기 안의 MCP 서버처럼 동작하게 하는 새 API를 구현한다."**
- **앱과 AI는 오래전부터 같은 폰에 나란히 있었다. 이제 둘을 소개할 때다.**
  - AppFunctions는 새 **Android 플랫폼 API**이자 **Jetpack 라이브러리**다. 이것을 구현한 앱은 Gemini 앱 같은 **기기 안 AI 앱과 직접** 주고받을 수 있다.

<figure class="media"><img src="https://cdn-images-1.medium.com/max/1024/1*FVGZJIlnSHyxhnRahJKpDg.jpeg" alt="밤하늘 아래 유리처럼 빛나는 Android 로봇 머리 위로 코드 조각과 별자리가 떠오르는 그림" loading="lazy"><figcaption>원문 표지 그림. 무지갯빛 유리 재질의 Android 로봇 머리 위로 코드 조각과 별자리 같은 선이 빛줄기처럼 올라간다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

- **2026년 10월 현재 AppFunctions는 신뢰 테스터만 쓰는 비공개 미리보기다.**
  - 그래서 일반 사용자용 Gemini 앱이나 다른 AI 앱으로는 **기기에서도, 에뮬레이터에서도 바로 시험할 수 없다.** 미리보기 참여는 신청서로 받는다.
  - 그래도 지금 앱을 준비해 두면, 사용자에게 풀리는 날 바로 Gemini와 만날 수 있다.
  - 시험할 다른 방법은 있다. 저자는 이것을 [별도 글](https://medium.com/proandroiddev/ai-meet-app-testing-android-app-functions-5ba289736c59)로 다뤘고, 이 글 뒤쪽에서도 하나를 보여 준다.

## 1. AppFunction이란 무엇인가

- **앱이 기기 안 AI 에이전트(예: Gemini 앱)에게 "도구"를 내놓는 장치다.** 에이전트는 그 도구로 사용자의 질문에 답하거나 일을 끝낸다.
- **동작은 기기 안의 MCP 서버와 같다.**
  - 다른 점은 앱과 AI가 직접 붙지 않고 **Android OS가 중개한다**는 것이다. 그래서 Gemini만이 아니라 **허가받은 어떤 에이전트든** 접근을 요청하고 앱과 주고받을 수 있다.
- **Android 16 이상에서만 동작한다.**

## 2. 왜 AppFunctions를 구현하는가

### 앱 안에만 있는 데이터

- **지금까지 AI는 주로 인터넷과 클라우드의 데이터를 가져와 썼다.** 그런데 쓰고 싶은 데이터가 **앱 안에만** 있다면 어떻게 할까?
- **데이터를 앱 밖으로 내보내지 않고 싶은 이유는 여러 가지다.**
  - **개인정보**: 개인 정보, 금융 정보, 건강 정보는 사용자가 서버나 인터넷에 통째로 올리고 싶지 않을 수 있다.
  - **인증**: 사용자가 로그인해야 볼 수 있는 데이터인데, AI 앱이 볼 자격이 있는지 서버가 확인할 방법이 없을 수 있다.
  - **오프라인**: 오프라인 기능이 충실한 앱은 데이터를 이미 기기에 들고 있어서, 다른 곳에서 가져올 필요가 없다.
  - **기기에만 있는 데이터**: 기기에서 만들고 기기에서 쓰는 데이터라 다른 곳에 저장할 이유 자체가 없다.
- **결론: 데이터가 사용자와 앱의 것이라면 거기 두면 된다. 그래도 AI의 힘은 빌릴 수 있다.** AppFunctions는 데이터를 앱에 둔 채로 AI가 **필요한 만큼만 물어보게** 한다.

### 어떤 기능을 AppFunction으로 만들 것인가

- **모든 기능을 다 AppFunction으로 만들고 싶겠지만, 저자는 권하지 않는다.**
  - 선택지가 많으면 AI가 고를 함수가 **흐려진다.** 의도한 것보다 **많은 데이터가 드러날** 수도 있다.
- **고를 때 따질 것은 여섯 가지다.**
  - **자연어**: 대화의 맥락이 있어야 쓸모 있는 기능을 고른다. 사용자가 앱 첫 화면을 열어서는 바로 얻지 못하는데, AI에게는 물어볼 법한 것이 좋은 후보다.
  - **깊은 작업 흐름**: 메뉴와 화면 이동을 여러 번 거쳐야 닿는 데이터나 기능을 AI 앞으로 꺼낸다.
  - **민감하지 않은 것**: 공개되거나 위험이 낮은 데이터에 집중한다. 뒤에서 보겠지만 AI는 앱에서 받은 데이터를 **인터넷과 다른 앱의 데이터와 섞어** 쓴다. 곧 이 데이터가 다른 앱에 드러날 수 있다.
  - **좁은 접근**: 꼭 필요한 만큼만 내놓는다. 위와 같은 이유로, AI는 이 기능 밖으로 데이터를 가지고 나갈 수 있다.
  - **확인**: 지우는 것처럼 되돌릴 수 없는 동작은 **분명한 확인**을 받게 한다(저자가 다음 글에서 다룬다고 했다).
  - **필요할 때 끄기**: 사용자가 로그인하지 않았거나 구독하지 않았으면 AppFunction을 끈다(이것도 다음 글).

### 경쟁 앱보다 먼저

- **AppFunction을 만들기는 쉽다. 그래서 경쟁이 생긴다.**
  - 사용자가 AI에게 물을 때 **특정 앱을 지목하지 않는 경우가 많다.** 그러면 AppFunctions를 내놓은 앱 중 아무거나 골릴 수 있다.
  - AI가 고르는 기준은 **KDoc**(함수 설명)이다. 경쟁 앱의 KDoc이 질문에 더 잘 맞으면, 그 질문은 경쟁 앱이 답하게 된다.
  - 결과: 앞으로 붐빌 이 자리에서 **첫 번째로 골리도록**, AI와 잘 맞는 AppFunction을 만들어 두라는 것이다.

<figure class="media"><img src="https://cdn-images-1.medium.com/max/1024/1*jdUYRAYqlyqWcaIyeHfdAw.jpeg" alt="가운데 반투명한 Android 로봇을 여러 고리가 둘러싸고, 고리 위에 채팅, 일정, 금융 그래프, 쇼핑 카트, 여행, 학습, 명상 아이콘이 놓인 그림" loading="lazy"><figcaption>원문 그림. 가운데 선 Android 로봇을 고리가 둘러싸고, 그 위에 채팅·일정·주식 그래프·쇼핑 카트·지구본과 비행기·졸업 모자·명상하는 로봇 같은 여러 분야의 앱 아이콘이 돈다. 여러 앱이 같은 AI 주위에서 경쟁하는 모습으로 읽힌다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

## 3. 전체가 어떻게 돌아가는가

- **예제 앱은 저자가 만든 [Game Night Guru](https://github.com/KatieBarnett/GameNightGuru/tree/extension)다.**
  - 보드게임 수집가가 **가진 게임을 정리하고 게임한 기록을 남기는** 앱이다. 데이터는 기기 안 데이터베이스에 있다.
  - AppFunction은 두 개다.
    - **게임 찾기(Query game)**: 게임 시간, 플레이어 수, 나이대 조건에 맞는 게임 목록을 돌려준다.
    - **게임 기록 더하기(Add play)**: 어떤 게임을 몇 분 동안 몇 명이 했고, 그 판이 얼마나 재미있었는지 점수를 남긴다.
- **아래 도식은 앱과 AppFunction이 OS와 어떻게 주고받는지 보여 준다.** 설명을 위해 AppFunction을 내놓은 메모 앱도 하나 넣었다.

<figure class="media"><img src="https://cdn-images-1.medium.com/max/1024/1*-ZNvOoiOoKnLL4j985tgyQ.png" alt="세 층 구조 도식. 맨 위 Clients 층에 LLM을 가진 Agent app, 가운데 Tools 층에 Android Platform과 Query game, Add play, Create note, Edit note 도구, 맨 아래 Servers 층에 Game Night Guru와 Notes app이 있다" loading="lazy"><figcaption>AppFunctions의 구조. 맨 아래 <strong>Servers</strong> 층의 Game Night Guru와 메모 앱이 위쪽으로 "Register AppFunctions"(함수 등록) 화살표를 보내, 가운데 <strong>Tools</strong> 층에 Query game·Add play·Create note·Edit note 도구가 생긴다. 맨 위 <strong>Clients</strong> 층의 Agent app(LLM을 가짐)은 가운데 <strong>Android Platform</strong>에 "Look up Metadata"(설명 조회)를 하고, 고른 도구에 "Execute AppFunction"(실행)을 보낸다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

- **앱은 서버 역할을 한다.** 자기 함수를 **도구로** Android 플랫폼(OS)에 등록한다.
  - 실제로는 **XML 설명 파일(메타데이터)** 을 통해 등록한다. 이 파일은 AppFunctions Jetpack 라이브러리가 자동으로 만든다.
- **AI 에이전트 앱(LLM을 가진 클라이언트)은 앱 하나하나가 아니라 OS에 묻는다.**
  - OS에 함수 설명을 조회해서 필요에 맞는 함수를 고른다. OS가 설명을 건네면, AI는 알맞은 파라미터를 넣어 함수를 실행한다.
- **게임에 대해 묻는 예에서 질문은 아래처럼 흘러 내려간다.**

<figure class="media"><img src="https://cdn-images-1.medium.com/max/1024/1*8xCpbF6kiOmRpQihKOYUoQ.png" alt="같은 세 층 도식에서 Agent app에서 Android Platform, Query game, Game Night Guru로 이어지는 분홍색 화살표만 강조되고 나머지는 흐리게 처리된 그림" loading="lazy"><figcaption>게임 질문이 흘러가는 길. 앞의 도식에서 나머지는 흐리게 하고, 분홍 화살표로 <strong>Agent app → Android Platform → Query game → Game Night Guru</strong> 경로만 강조했다. 앱의 대답은 같은 길을 거꾸로 올라간다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

- **앱의 대답은 같은 길을 거꾸로 올라가 AI에게 돌아간다.**

## 4. AppFunctions 구현하기

예제에서 가장 쉬운 함수인 **게임 찾기**를 구현한다. 원문의 코드는 단계마다 Gist로 붙어 있다. 아래에서는 단계마다 **원문 코드가 무엇을 하는지** 글로 설명하고, 같은 역할을 하는 **Google 공식 샘플(ChatApp, 채팅 앱 예제)의 코드**를 인용한다.

### ① 의존성

- **원문: 새 API이므로 먼저 의존성을 더한다.**
  - 런타임 라이브러리 `androidx.appfunctions:appfunctions`와, KSP로 코드를 만드는 `androidx.appfunctions:appfunctions-compiler` 두 개다.
  - 원문은 "아주 새 API라 자주 바뀐다. 더 새 버전이 있는지 [변경 기록](https://developer.android.com/jetpack/androidx/releases/appfunctions)을 확인하라"고 덧붙인다.

공식 샘플의 버전 목록과 빌드 설정은 아래와 같다.

```toml
[versions]
agp = "9.3.1"
appfunctions = "1.0.0-beta01"
kotlin = "2.4.10"

[libraries]
androidx-appfunctions = { module = "androidx.appfunctions:appfunctions", version.ref = "appfunctions" }
androidx-appfunctions-compiler = { module = "androidx.appfunctions:appfunctions-compiler", version.ref = "appfunctions" }
```

> 출처: `ChatApp/gradle/libs.versions.toml` 일부 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/gradle/libs.versions.toml), Apache-2.0)

```kotlin
implementation(libs.androidx.appfunctions)
ksp(libs.androidx.appfunctions.compiler)

// AppFunctions ksp option
ksp { arg("appfunctions:aggregateAppFunctions", "true") }
```

> 출처: `ChatApp/app/build.gradle.kts` 일부 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/app/build.gradle.kts), Apache-2.0)

- `implementation(...)`: 어노테이션과 `AppFunctionService` 같은 런타임 클래스가 들어 있다.
- `ksp(...)`: 컴파일할 때 어노테이션을 읽고 **서비스 구현 클래스와 설명 XML**을 만든다.
- `aggregateAppFunctions`: 공식 샘플은 함수 정의가 `shared` 모듈에 있다. 그래서 **앱 모듈에서 여러 모듈의 함수를 한데 모으라**는 KSP 옵션을 켠다. 원문 예제처럼 앱 모듈 하나에만 함수가 있으면 필요 없다.
- 2026-10-26 기준 최신은 `1.0.0-beta01`이다. 이 라이브러리를 받는 앱은 **compileSdk 37 이상, AGP 9.1.0 이상**이어야 한다(AAR 안의 `aar-metadata.properties`에 `minCompileSdk=37`, `minAndroidGradlePluginVersion=9.1.0`으로 적혀 있다). 라이브러리 자체의 minSdk는 24다.

### ② 서비스

- **AppFunction을 OS에 내놓으려면 서비스가 하나 있어야 한다.**
- **원문 코드가 하는 일**: `AppFunctionService`를 상속한 **추상 클래스** `GameAppFunctions`를 만들고, 그 위에 `@AppFunctionServiceEntryPoint`를 붙인다.
  - 어노테이션에는 두 값을 준다. `serviceName = "GameAppFunctionsService"`(라이브러리가 **만들어 줄** 실제 서비스 이름)와 `appFunctionXmlFileName = "game_app_functions"`(만들어 줄 설명 XML 이름)다.
  - 클래스 이름과 `serviceName`이 다른 이유가 여기 있다. 내가 쓴 것은 추상 클래스이고, **완성된 서비스(`GameAppFunctionsService`)는 Jetpack 라이브러리가 생성한다.** 설명 XML도 생성되어 앱의 `assets` 폴더에 들어간다.
  - 저장소 접근은 Hilt **EntryPoint**로 `GameRepository`를 꺼내 쓴다(저자 샘플 저장소 기준).

공식 샘플의 같은 부분은 아래와 같다.

```kotlin
/**
 * Service entry point for chat-related AppFunctions such as searching contacts, sending messages, and making calls.
 */
@RequiresApi(36)
@AndroidEntryPoint
@AppFunctionServiceEntryPoint(
    serviceName = "ChatAppFunctionService",
    appFunctionXmlFileName = "chat_app_function_service",
)
abstract class BaseChatAppFunctionService : AppFunctionService() {
    @Inject lateinit var messageRepository: MessageRepository

    @Inject lateinit var recipientsRepository: RecipientsRepository
```

> 출처: `ChatApp/shared/.../appfunctions/BaseChatAppFunctionService.kt` 43–55행 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/shared/src/main/kotlin/com/example/chatapp/appfunctions/BaseChatAppFunctionService.kt#L43-L55), Apache-2.0)

- `@RequiresApi(36)`: Android 16(API 36) 이상에서만 쓰는 클래스라고 표시한다. 원문 샘플은 같은 뜻으로 `Build.VERSION_CODES.BAKLAVA`(Android 16의 코드명)를 쓴다.
- `@AndroidEntryPoint`: 공식 샘플은 Hilt가 이 서비스에 바로 주입하게 했다. 원문 샘플은 EntryPoint로 꺼내 썼다. **둘 다 가능하다**는 뜻이다.
- `@AppFunctionServiceEntryPoint(...)`: 원문과 같다. `ChatAppFunctionService`라는 실제 서비스와 `chat_app_function_service` 설명 XML이 만들어진다.
- `abstract class … : AppFunctionService()`: 이 추상 클래스 안에 AI가 부를 함수를 적는다.

### ③ AndroidManifest.xml

- **마무리로 생성된 서비스를 매니페스트에 등록한다.**
  - 이때 등록하는 것은 **위에서 `serviceName`으로 정한 생성된 서비스**다. 내가 쓴 추상 클래스가 아니다(원문이 강조한다).

```xml
<service
    android:name="com.example.chatapp.appfunctions.ChatAppFunctionService"
    android:permission="android.permission.BIND_APP_FUNCTION_SERVICE"
    android:exported="true"
    tools:targetApi="36">
    <property
        android:name="android.app.appfunctions.schema"
        android:value="app_functions_schema.xsd" />
    <property
        android:name="android.app.appfunctions.v2"
        android:value="chat_app_function_service.xml" />
    <intent-filter>
        <action android:name="android.app.appfunctions.AppFunctionService" />
    </intent-filter>
</service>
```

> 출처: `ChatApp/app/src/main/AndroidManifest.xml` 53–67행 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/app/src/main/AndroidManifest.xml#L53-L67), Apache-2.0)

- `android:name`: 라이브러리가 **만든** 서비스 클래스 이름이다.
- `android:permission="…BIND_APP_FUNCTION_SERVICE"`: 이 권한을 가진 주체(OS)만 이 서비스에 연결할 수 있다. 아무 앱이나 직접 부르지 못하게 막는 장치다.
- `android:exported="true"`: 앱 밖(OS)에서 이 서비스를 찾을 수 있게 한다.
- `property … appfunctions.v2`: 함수 설명 XML 파일 이름을 OS에 알려 준다. `@AppFunctionServiceEntryPoint`에 적은 이름과 같다. 원문 샘플도 이 속성을 쓴다.
- `property … appfunctions.schema`: 공식 샘플에만 있는 스키마 파일 지정이다. 원문 샘플에는 없다.
- `intent-filter`: "나는 AppFunction 서비스다"라는 표지다. OS가 이것으로 서비스를 찾는다.

### ④ AppFunction 쓰기

- **원문 코드가 하는 일**: 서비스 클래스 안에 `suspend fun queryGames(maxDurationMinutes: Int? = null, numPlayers: Int? = null, minAge: Int? = null): List<GameSummary>`를 만든다.
  - 저장소에서 모든 게임을 읽어, 주어진 조건(최대 시간, 인원, 나이)에 맞는 것만 걸러 `GameSummary` 목록으로 돌려준다.
- **첫째, `@AppFunctionDeclaration` 어노테이션이 붙은 함수가 곧 AppFunction이다.**
  - `isDescribedByKDoc = true`는 "**위의 KDoc 주석을 이 함수의 설명으로 쓰라**"는 뜻이다.
  - 이 KDoc은 **AI 앱에 넣는 프롬프트와 똑같이** 동작한다. 함수가 무엇을 하는지, AI가 쓸 때 알아야 할 중요한 정보, 입력과 출력이 무엇인지를 적는다.
  - 프롬프트가 늘 그렇듯 **분명하고 정보가 많을수록 결과가 좋다.** 다만 너무 길면 AI의 컨텍스트 토큰(한 번에 읽을 수 있는 글의 양)을 잡아먹으니 적당한 선을 찾는다.
  - 이 주석은 함수 설명(메타데이터)에 들어가고, AI는 이것을 읽고 **어떤 함수를 쓸지** 정한다.
- **둘째, 입력 파라미터는 모두 `null`을 허용한다.**
  - 그러면 AI가 **넣을지 말지 스스로 정할 수 있다.**
  - 반대로 꼭 필요한 파라미터라면, AI가 그 정보를 갖고 있지 않을 때 **이 함수를 아예 고르지 않을 수 있다.**
  - KDoc에 "필요한 정보가 없으면 사용자에게 물어보라"는 지시나 제약을 적을 수 있다. 다만 저자가 시험해 보니 **늘 통하지는 않았다.**
- **마지막, 출력 객체.** AI는 이 객체로 무엇을 할까? 이것도 KDoc으로 **각 값의 뜻을 AI에게 알려 줄** 수 있다.
  - 원문 코드는 `GameSummary`(id, 이름, 최소·최대 인원, 평균 플레이 시간) 데이터 클래스에 **`@AppFunctionSerializable(isDescribedByKDoc = true)`** 를 붙이고, 필드마다 `/** … */` 설명을 단다. 이 주석들도 함수 설명에 들어가 AI가 읽는다.

공식 샘플의 함수와 출력 객체는 아래와 같다. 원문보다 한 걸음 더 나가, **잘못된 입력일 때 AI에게 다음 행동을 알려 주는 예외**까지 쓴다.

```kotlin
/**
 * Search for message recipients or chat groups by name or email.
 * Required workflow: Call this before "send" or "makeCall" to obtain a valid endpointValue (unique ID).
 *
 * @param query Search string for contact name, email, or group name. Throws [AppFunctionInvalidArgumentException] if empty.
 * @param contactType Filter results by entity type. Accepts "INDIVIDUAL", "GROUP", or "ANY".
 * @return List of [ContactSearchResult] objects matching the query.
 * @throws AppFunctionInvalidArgumentException If query is empty or blank, an invalid contactType is provided, or if no matching contact or group is found. If thrown, suggest the user clarify the recipient or group name.
 */
@AppFunctionDeclaration(isDescribedByKDoc = true)
suspend fun searchContacts(
    query: String,
    @AppFunctionStringValueConstraint(enumValues = ["INDIVIDUAL", "GROUP", "ANY"])
    contactType: String,
): List<ContactSearchResult> {
    if (query.isBlank()) {
        throw AppFunctionInvalidArgumentException("Query cannot be empty")
    }
    val recipients =
        when (contactType) {
            "INDIVIDUAL" -> {
                recipientsRepository.searchRecipients(query, 3)
            }
            "GROUP" -> {
                recipientsRepository.searchGroups(query, 3).map {
                    ContactSearchResult(
                        contactDisplayName = it.name,
                        contactType = "GROUP",
                        endpointValue = it.id,
                        endpointDisplayName = it.name,
                    )
                }
            }
            "ANY" -> {
                recipientsRepository.searchAny(query, maxCount = 3)
            }
            else -> {
                throw AppFunctionInvalidArgumentException(
                    "Invalid contactType: $contactType. Must be INDIVIDUAL, GROUP, or ANY.",
                )
            }
        }

    if (recipients.isEmpty()) {
        throw AppFunctionInvalidArgumentException(
            "$contactType with name $query not found. Ask the user to clarify the name",
        )
    }
    return recipients
}
```

> 출처: `ChatApp/shared/.../appfunctions/BaseChatAppFunctionService.kt` 61–110행 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/shared/src/main/kotlin/com/example/chatapp/appfunctions/BaseChatAppFunctionService.kt#L61-L110), Apache-2.0)

- **KDoc 첫 줄**: 함수가 하는 일(이름이나 이메일로 받는 사람·그룹 찾기)이다.
- **`Required workflow:`**: "메시지 보내기나 전화 걸기 **전에 먼저 이것을 불러** ID를 얻어라"는 **함수 사이의 순서**를 AI에게 알려 준다. 원문 샘플 저장소의 `addPlay`도 같은 방식으로 "먼저 `queryGames`로 `gameId`를 찾아라"라고 적는다.
- **`@param` · `@return` · `@throws`**: 입력과 출력, 실패의 뜻을 적는다. 특히 `@throws` 줄 끝의 "If thrown, suggest the user clarify…"는 **실패했을 때 AI가 사용자에게 무엇을 물어야 하는지**를 알려 준다.
- **`@AppFunctionStringValueConstraint(enumValues = [...])`**: 문자열 파라미터에 **허용되는 값 목록**을 걸어 둔다. AI가 엉뚱한 값을 넣을 가능성을 줄인다.
- **본문**: 빈 검색어면 `AppFunctionInvalidArgumentException`을 던진다. 종류에 따라 저장소에서 최대 3개를 찾는다. 결과가 없어도 빈 목록 대신 예외를 던지며 "이름을 다시 물어보라"고 알려 준다. **3개만** 돌려주는 것은 원문의 "좁은 접근" 원칙과 같다.

```kotlin
/**
 * Represents a result from a contact or group search.
 */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class ContactSearchResult(
    /** The human-readable name of the contact or group. */
    val contactDisplayName: String,
    /** The type of the found entity, either "INDIVIDUAL" or "GROUP". */
    val contactType: String,
    /** The unique identifier of the endpoint. */
    val endpointValue: String,
    /** The human-readable label/display name of the endpoint. */
    val endpointDisplayName: String,
)
```

> 출처: `ChatApp/shared/.../appfunctions/Util.kt` 23–36행 ([android/appfunctions@a3a2a89](https://github.com/android/appfunctions/blob/a3a2a89528ea14262b88029ab80b29497439a651/ChatApp/shared/src/main/kotlin/com/example/chatapp/appfunctions/Util.kt#L23-L36), Apache-2.0)

- `@AppFunctionSerializable(isDescribedByKDoc = true)`: 이 데이터 클래스를 AI에게 돌려줄 수 있는 형태로 만들고, 클래스와 필드의 KDoc을 설명에 넣는다. 원문이 말한 "출력 객체의 뜻도 KDoc으로 알려 준다"가 이것이다.
- 필드마다 붙은 한 줄 주석이 AI가 읽는 **값의 뜻**이다. 예를 들어 `endpointValue`가 "고유 ID"라는 것을 알아야 AI가 다음 함수에 이 값을 넘긴다.

## 5. 시험해 보기

- **시험하는 방법은 세 가지다.** 저자는 [별도 글](https://medium.com/proandroiddev/ai-meet-app-testing-android-app-functions-5ba289736c59)에서 셋 다 다룬다.
- **여기서는 Google의 [AppFunctions Testing Agent](https://github.com/android/appfunctions/tree/main/agent)로 시험한다.** 공식 샘플 저장소에 들어 있는 시험용 에이전트 앱이다. 함수를 손으로 값을 넣어 실행해 볼 수도 있고, LLM 에이전트에게 말로 시켜 볼 수도 있다.

<figure class="media"><img src="https://cdn-images-1.medium.com/max/320/1*-l3jnyeqvCbjTd6d0uSyPQ.gif" alt="AppFunctions Testing Agent 앱 화면 녹화. Debug 탭에서 Game Night Guru의 addPlay와 queryGames 입력 칸이 보이고, Agent Demo 탭에서 질문을 넣으면 Game Night Guru에 연결한 뒤 전략 게임 다섯 개를 추천한다" loading="lazy"><figcaption>AppFunctions Testing Agent로 시험하는 모습(약 25초 GIF). 처음 <strong>Debug</strong> 탭에는 Game Night Guru의 <code>addPlay</code>(gameId·numPlayers·playTimeMinutes·rating 필수 입력)와 <code>queryGames</code>(maxDurationMinutes 등) 입력 칸과 Run 버튼이 보인다. 이어 <strong>Agent Demo</strong> 탭(모델 <code>gemini-3-flash-preview</code>)에 "친구 4명이 2시간 동안 놀러 오는데 전략 게임을 좋아한다. 뭘 하면 좋을까?"를 넣는다. 그러면 "Game Night Guru — Connecting…"이 뜬 뒤 Terraforming Mars, Dead of Winter, SHASN, Mosaic, Wingspan을 이유와 함께 추천한다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

- **테스트 에이전트에 질문을 넣으면, 답할 앱을 찾아 앱에서 데이터를 받아 와 보여 준다.**
- **에이전트는 한 걸음 더 나간다.**
  - 저자 샘플 앱의 [데이터](https://github.com/KatieBarnett/GameNightGuru/blob/extension/app/src/main/assets/collection.csv)(저자의 실제 보드게임 목록이다)에는 **게임 장르나 주제 정보가 없다.**
  - 그런데도 Gemini는 앱이 돌려준 게임 이름들로 **웹을 검색해** 각 게임 정보를 찾았다. 앱이 준 목록은 화면에 나온 것보다 길었는데, 그중 "전략" 게임에 맞는 것만 골라 짧은 목록을 만들었다.
  - 원문 2장의 "AI는 앱 데이터를 인터넷과 다른 앱 데이터와 섞어 쓴다"가 실제로 일어난 장면이다. 게임 이름이 웹 검색어로 나간 것이다.
- **데이터를 바꾸는 함수도 만들 수 있다.** 그 요령은 저자가 다음 글에서 다룬다고 했다.

## 6. Android 스킬 — 지름길

- **위 과정이 복잡하게 느껴지면 지름길이 있다.**
  - [Android skills 저장소](https://github.com/android/skills)(Apache-2.0)에 있는 [AppFunctions 에이전트 스킬](https://github.com/android/skills/tree/main/device-ai/appfunctions)을 쓰면, AI 코딩 에이전트가 필요한 Kotlin 코드와 설정을 **자동으로 만들어 준다.**

<figure class="media"><img src="https://cdn-images-1.medium.com/max/210/1*enk9HsBzDkFsAdZYwxGhQw.jpeg" alt="보라색에서 분홍색으로 물드는 배경 위에 망토를 두른 검은 Android 로봇 실루엣" loading="lazy"><figcaption>망토를 두른 Android 로봇 그림(작은 아이콘). "지름길"을 슈퍼히어로에 빗댄 것으로 보인다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787">원문</a>)</figcaption></figure>

## 7. 지금이 준비할 때다

- **API가 비공개 미리보기인 지금이 앱을 준비하기 가장 좋은 때다.**
  - 오늘 핵심 기능에 어노테이션을 붙인다.
  - 테스트 에이전트로 로컬에서 시험한다.
  - KDoc을 다듬는다.
  - 그러면 일반에 풀릴 때 바로 쓸 수 있다.
- **"AI, 앱과 인사해"로 글을 맺는다.**
- **더 볼 자료**
  - 저자 샘플: [GameNightGuru (extension 브랜치)](https://github.com/KatieBarnett/GameNightGuru/tree/extension)
  - Google 공식 샘플과 테스트 앱: [android/appfunctions](https://github.com/android/appfunctions)
  - 저자의 실습 워크숍: [AI, Meet App: Teaching Android Apps to Talk to Gemini via App Functions](https://katiebarnett.dev/codelabs/ai-meet-app/#0)

## 원문을 읽을 때 주의할 점

- **원문 코드와 지금의 샘플 저장소가 조금 다르다.** 저자 샘플 저장소의 `extension` 브랜치는 글이 나온 뒤에도 바뀌었다. 2026-10-10에 "지우기 확인"과 "앱 열기(PendingIntent)" 함수가 더해졌고(`deleteLatestPlay`, `getPlays`), 2026-10-23에 라이브러리를 `1.0.0-beta01`로 올렸다. 원문 본문은 `queryGames` 하나만 설명한다.
- **원문에 오타가 하나 있다.** 출력 객체 어노테이션을 본문에서 `@AppFunctionSeralizable`이라고 적었지만, 실제 이름은 `@AppFunctionSerializable`이다(샘플 코드와 공식 샘플 모두).
- **"Android 16 이상"은 기능이 동작하는 기기 조건이고, 앱의 minSdk 조건이 아니다.** 라이브러리 minSdk는 24라서 더 낮은 기기를 지원하는 앱에도 넣을 수 있다. 서비스 클래스에 `@RequiresApi(36)`을 붙여 Android 16 이상에서만 쓰이게 한다. 반면 **빌드 조건은 높다.** `1.0.0-beta01`은 compileSdk 37과 AGP 9.1.0 이상을 요구한다.
- **"MCP 서버처럼"은 비유다.** 앱이 MCP 규격(JSON-RPC 메시지)으로 직접 말하는 것이 아니다. OS가 설명 XML을 모아 두고 중개한다. 그래서 Claude Code 같은 PC의 MCP 클라이언트가 폰 앱에 바로 붙는 것은 아니다.
- **비공개 미리보기라 지금 사용자는 쓸 수 없다.** 원문 GIF의 대답은 Google의 테스트 에이전트(모델 `gemini-3-flash-preview`)가 만든 것이고, 일반 Gemini 앱의 동작은 아니다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide는 「업무 비서」 앱이라 AppFunctions와 잘 맞는다. 사용자가 이미 Gemini 앱을 쓰고 있다면, **Aide에 AI 키를 넣지 않아도** "오늘 남은 일정이 뭐야?"를 Gemini가 Aide에 물어 답할 수 있다. 결정 기록(2026-10-08)도 이것을 "키 없이 쓸 수 있는 보조 경로"로 적어 두고 **나중에 검토**하기로 했다.

아래는 그때 쓸 모습을 보여 주는 **직접 쓴 스케치**다. 지금 Aide에는 넣을 수 없다(compileSdk 36 — 아래 "Aide에 적용하면" 1번). 실제 코드는 사용자가 쓴다. `EventRepository`·`TaskRepository`는 1-a 계획의 Task 5·7 인터페이스를 가정했다.

```kotlin
// app/src/main/kotlin/com/giwon/aide/appfunctions/AideAppFunctions.kt — 직접 쓴 스케치
@RequiresApi(36)
@AndroidEntryPoint
@AppFunctionServiceEntryPoint(
    serviceName = "AideAppFunctionService",
    appFunctionXmlFileName = "aide_app_functions",
)
abstract class AideAppFunctions : AppFunctionService() {
    @Inject lateinit var eventRepository: EventRepository
    @Inject lateinit var taskRepository: TaskRepository
    @Inject lateinit var clock: Clock

    /**
     * Summarize the user's agenda for today: upcoming timed events and open tasks due today or overdue.
     * Use this when the user asks what is left today, what is next, or whether they are free.
     * Returns titles and times only. Event descriptions, attendees and locations are never returned.
     *
     * @param includeTasks Whether to include open tasks. Defaults to true when not given.
     * @return Today's remaining agenda. Times are local wall-clock times like "15:00".
     */
    @AppFunctionDeclaration(isDescribedByKDoc = true)
    suspend fun getTodayAgenda(includeTasks: Boolean? = null): TodayAgenda {
        val now = clock.now()
        val today = now.toLocalDate()                          // 기기 시간대 기준 오늘
        val events = eventRepository.observeEvents(from = now, to = today.endOfDay()).first()
            .filter { !it.allDay }
            .take(MAX_ITEMS)
            .map { AgendaEvent(title = it.title.ifBlank { "(제목 없음)" }, start = it.start.toLocalTimeText()) }
        val tasks = if (includeTasks == false) emptyList() else
            taskRepository.observeOpenTasks().first()
                .filter { task -> task.due?.let { it <= today } == true }
                .take(MAX_ITEMS)
                .map { AgendaTask(title = it.title, overdue = it.due!! < today) }
        return TodayAgenda(events, tasks)
    }

    private companion object { const val MAX_ITEMS = 10 }
}

/** The user's remaining agenda for today. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class TodayAgenda(
    /** Timed events that have not ended yet, earliest first. */
    val events: List<AgendaEvent>,
    /** Open tasks due today or already overdue. */
    val tasks: List<AgendaTask>,
)
// AgendaEvent(title, start) · AgendaTask(title, overdue) 도 같은 방식으로 정의한다
```

- **읽기 전용 함수 하나로 시작한다.** 원문의 "좁은 접근"이다. 일정은 **제목과 시간만** 내보내고, 설명·참석자·장소는 내보내지 않는다는 것을 KDoc에도 적어 AI가 그 이상을 기대하지 않게 한다. 회사 캘린더의 일정 설명에는 내부 정보가 있을 수 있기 때문이다.
- **파라미터는 `null`을 허용하는 것 하나뿐이다.** AI가 아무 정보 없이도 부를 수 있다(원문 4장 "둘째").
- **KDoc에 "언제 쓰는지"를 적는다.** "남은 일정이 뭐야", "다음 일정은", "지금 비어 있어?"처럼 사용자가 실제로 할 말을 적어, 다른 캘린더 앱보다 먼저 골리게 한다(원문 2장 "경쟁 앱보다 먼저").
- **종일 일정 제외, "(제목 없음)" 처리**는 Task 8 `nextEvent`·Review Focus 5와 같은 규칙이다. 같은 규칙을 화면과 AppFunction이 따로 짜지 않도록, 실제로는 Task 8의 순수 함수(`sortOpenTasks`, `nextEvent`)를 그대로 부르는 편이 낫다.
- **쓰기 함수(일정 넣기)는 처음에는 만들지 않는다.** 만든다면 결정 「시킨 일은 바로 하고 되돌릴 수 있게」를 따라, 결과에 되돌리기용 `PendingIntent`(Aide에서 그 일정 열기)를 함께 돌려준다. 원문 샘플 저장소의 `getPlays`가 같은 장치를 쓴다.

## 배운 점

- **AI를 위한 API의 문서는 곧 기능이다.** KDoc이 AI가 함수를 고르는 기준이 되므로, 주석을 잘 쓰는 것이 "검색 순위"를 정한다. "언제 쓰는지", "먼저 무엇을 불러야 하는지(Required workflow)", "실패하면 사용자에게 무엇을 물을지"까지 적는다.
- **앱 데이터는 앱에 둔 채로 AI에게 빌려줄 수 있다.** 개인정보·로그인·오프라인 데이터처럼 서버로 올리기 싫은 것도, 필요한 만큼만 함수로 꺼내 주면 된다.
- **그러나 일단 건넨 데이터는 AI가 웹 검색과 섞는다.** 원문 GIF에서 게임 이름이 웹 검색어로 쓰였다. 내보낼 값은 "다른 곳으로 나가도 괜찮은가"를 기준으로 고른다.
- **파라미터를 `null` 허용으로 두면 AI가 더 자주 쓴다.** 필수 파라미터는 AI가 그 정보를 모를 때 함수를 건너뛰게 만든다.
- **결과는 적게, 실패는 친절하게.** 공식 샘플은 결과를 3개로 자르고, 빈 결과 대신 "이름을 다시 물어보라"는 예외를 던진다. AI의 컨텍스트를 아끼고 다음 행동을 알려 준다.
- **새 API는 빌드 조건부터 확인한다.** 기기 조건(Android 16)보다 빌드 조건(compileSdk 37, AGP 9.1)이 먼저 걸릴 수 있다.

## Aide에 적용하면

Aide는 AI 비서 앱이다. AI 기능은 1-b에서 사용자가 고른 제공자를 **사용자 키로** 앱이 직접 부르는 방식으로 정했다(2026-10-08 결정). 같은 결정의 제약 항목에 **"Android AppFunctions로 사용자의 AI가 Aide를 부르게 하기"는 키 없이 쓸 수 있는 보조 경로로 나중에 검토한다**고 적혀 있다. 이 글은 그 "나중"에 필요한 조건을 미리 확인한 셈이다. 「서버 없음」(2026-10-08), 「시킨 일은 바로 하고 되돌릴 수 있게, 시키지 않은 일은 묻는다」(2026-10-08), 「최신화는 Task 4 뒤 별도 PR」(2026-10-20)과 맞춰 썼다.

1. **Aide를 AppFunctions 서버로 만드는 것 — 지금은 안 한다.**
   - **빌드가 막힌다.** `appfunctions 1.0.0-beta01`은 compileSdk 37을 요구하는데 Aide는 36이다. compileSdk 37은 2026-10-20 결정의 「최신화 PR」(Kotlin 2.4 · compileSdk 37)에 들어 있는 일이라, 그 PR이 먼저 끝나야 한다. AGP 조건(9.1.0 이상)은 Aide의 9.2.1이 이미 채운다. minSdk 26도 문제없다(라이브러리 minSdk 24).
   - **쓸 사람이 아직 없다.** 비공개 미리보기라 일반 Gemini 앱이 부르지 않고, Android 16 이상 기기에서만 동작한다.
   - **1-a 범위가 아니다.** 1-a는 AI 없이 캘린더·리마인더·할 일·대시보드다.
   - 다시 볼 때: 최신화 PR이 끝나고, AppFunctions가 일반에 풀렸을 때. 1-b의 AI 함수가 생긴 뒤면 더 좋다(아래 2번).
2. **1-b의 AI 함수(function calling)를 원문의 설계 원칙으로 짠다 — 가져온다. 시점은 1-b 착수 때다.**
   - 결정 기록은 이미 AI 함수를 두 종류로 나눴다. 바로 실행하는 것(`create_event`)과 제안만 하는 것(`propose_event`·`propose_task`·`ask_completion`)이다. 이것은 원문의 **"확인" 원칙**과 같은 생각이다.
   - 여기에 원문 4장의 요령을 더한다. 함수 설명에 **"언제 쓰는지", "먼저 부를 함수", "실패 시 사용자에게 물을 것"** 을 적는다. 파라미터는 되도록 **`null` 허용**으로 둔다. 결과는 **적게**(상위 N개) 돌려준다.
   - 이렇게 짜 두면, 나중에 같은 함수를 `@AppFunctionDeclaration`으로 바깥에 내놓을 때 **설명을 다시 쓸 필요가 없다.** Aide 안의 LLM이 읽는 설명과 Gemini가 읽는 KDoc이 같은 글이 된다.
3. **AI가 쓰는 함수의 몸통을 저장소 위의 순수 함수로 둔다 — 바꿔서 가져온다. 시점은 Task 8과 1-b다.**
   - 원문과 공식 샘플 모두 AppFunction 서비스는 **저장소를 부르는 얇은 껍데기**다. Aide도 같은 모양이 되려면, "오늘 남은 일정", "마감 지난 할 일" 같은 계산이 화면(ViewModel) 안이 아니라 **순수 함수**에 있어야 한다.
   - Task 8 계획이 이미 `sortOpenTasks`·`nextEvent`를 순수 함수로 두기로 했으니 방향이 맞다. 1-b에서 AI 함수를 만들 때도 같은 함수를 부르게 하면, 화면·내부 AI·AppFunctions가 **같은 규칙**(종일 일정 제외, "(제목 없음)")으로 대답한다.
4. **내보낼 데이터의 범위를 먼저 정한다 — 가져온다. AppFunctions를 실제로 넣을 때 정한다.**
   - Aide가 읽는 캘린더에는 **회사 일정**도 섞여 있을 수 있다. 원문 GIF처럼 AI는 받은 값을 웹 검색에 쓸 수 있다.
   - 그래서 위 스케치처럼 **제목과 시간만** 내보내는 것으로 시작하는 안을 둔다. 어디까지 내보낼지(제목도 숨길지, 할 일만 내보낼지)는 **사용자가 정한다.** 정하면 `decisions.md`에 남긴다.
5. **쓰기 함수(일정·할 일 만들기)를 AppFunction으로 내놓는 것 — 지금은 안 한다.**
   - 원문 저자도 쓰기 함수 요령은 "다음 글"로 미뤘다. 공식 샘플은 메시지를 보내기 전에 **확인 카드**를 돌려주는 방식(`fetchSendMessageDetails`)을 쓴다.
   - Aide의 「시킨 일은 바로 하고 되돌릴 수 있게」를 바깥 AI에도 그대로 적용할지는 따로 정할 문제다. 바깥 AI는 Aide의 되돌리기 카드를 보여 주지 않기 때문이다. 읽기 함수가 자리 잡은 뒤에 다시 본다.

## 출처

- [AI, Meet App: Android AppFunctions — Katie Barnett (ProAndroidDev)](https://proandroiddev.com/ai-meet-app-android-appfunctions-30bb845a4787) (2026-10-20, ProAndroidDev RSS 피드로 읽음)
- [AI, Meet App: Testing Android App Functions — Katie Barnett](https://medium.com/proandroiddev/ai-meet-app-testing-android-app-functions-5ba289736c59)
- [Google 공식 샘플 android/appfunctions (Apache-2.0)](https://github.com/android/appfunctions) · [AppFunctions Testing Agent](https://github.com/android/appfunctions/tree/main/agent)
- [저자 샘플 GameNightGuru (extension 브랜치, 라이선스 없음 — 코드는 인용하지 않음)](https://github.com/KatieBarnett/GameNightGuru/tree/extension)
- [Android 플랫폼 API: android.app.appfunctions](https://developer.android.com/reference/android/app/appfunctions/package-summary) · [Jetpack AppFunctions 변경 기록](https://developer.android.com/jetpack/androidx/releases/appfunctions)
- [Android skills: AppFunctions 스킬 (Apache-2.0)](https://github.com/android/skills/tree/main/device-ai/appfunctions)
- [Model Context Protocol 소개](https://modelcontextprotocol.io/docs/getting-started/intro)
- [Android Weekly #750](https://androidweekly.net/issues/issue-750)
