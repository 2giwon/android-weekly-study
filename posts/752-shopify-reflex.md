---
issue: 752
date: 2026-11-08
title: Shopify의 Reflex — 에이전트가 에뮬레이터 없이 앱을 시험하는 구조
original_title: "Reflex: an architecture for building mobile apps with agents"
url: https://shopify.engineering/reflex
author: Thiago Magalhaes (Shopify)
tags: [AI 에이전트, 아키텍처, ViewModel, 테스트]
aide:
  status: candidate
  module: feature:home
  task: Task 8, 1-b
  summary: Task 8의 HomeContract를 "화면은 상태를 읽고 Event만 보낸다, 규칙은 ViewModel에만 둔다"로 짜는 것은 이미 계획과 같아 그대로 가져온다. HomeViewModel 시험을 사용자 여정 하나로 묶는 안은 사용자 결정으로 올린다. 화면 상태와 동작을 JSON으로 내보내 AI가 같은 길로 움직이게 하는 생각은 1-b에서 다시 본다
---

## 한 줄 요약

AI 에이전트가 화면 코드를 몇 분 만에 짜도, 그 화면이 맞게 움직이는지 확인하려면 에뮬레이터를 켜고, 빌드하고, 누르는 스크립트를 돌리고, 오래 기다려야 한다. Shopify는 이 느린 확인 과정을 없애려고 앱 구조 자체를 바꿨고, 그 구조를 **Reflex** 라고 부른다. 화면 없이 돌아가는 핵심 모듈, 모든 화면이 똑같은 모양을 따르는 ViewModel, 그 ViewModel의 상태와 동작을 JSON으로 보여 주는 계약, 그리고 그 계약으로 앱을 조작하는 명령줄 도구가 네 기둥이다. 덕분에 iOS와 Android 두 앱을 **시험 파일 하나로** 함께 확인하고, 1,700개가 넘는 동작 시험이 CI에서 약 4분 안에 끝난다.

<figure class="media"><img src="https://cdn.shopify.com/b/shopify-brochure2-assets/1d9a399cbbff4b5ab8df3124625b62d8.png" alt="원문 머리 그림. Reflex 글 제목이 적힌 표지" loading="lazy"><figcaption>원문 머리 그림. 글 제목이 적힌 표지 그림이다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

## 먼저 알아 둘 말

- **에이전트(agent)**
  - 질문에 답만 하는 챗봇이 아니라, 스스로 도구를 써서 일을 끝까지 하는 AI다. 코드를 짜고, 빌드를 돌리고, 결과를 보고 다시 고친다. 이 글에서는 앱 코드를 대부분 에이전트가 짠다는 것이 출발점이다.
- **피드백 루프(feedback loop)**
  - "고친다, 확인한다, 결과를 본다"를 한 바퀴 도는 과정이다. 한 바퀴가 짧을수록 에이전트는 더 많이 시도하고 더 빨리 맞는 답에 닿는다. 원문이 가장 큰 병목으로 꼽은 것이 이 한 바퀴의 길이다.
- **헤드리스(headless)**
  - 화면을 그리지 않고 로직만 돌리는 방식이다. 앱의 ViewModel과 서비스를 화면 없이 컴퓨터(macOS나 JVM, 곧 Java 가상 머신) 위에서 바로 실행한다. Android로 치면 에뮬레이터 없이 `./gradlew test` 로 도는 단위 시험과 같은 자리다.
- **MVVM**
  - 화면(View)과 화면 상태를 들고 있는 ViewModel, 그리고 데이터(Model)를 나누는 구조다. Android Jetpack의 `ViewModel` 을 쓰는 보통 앱이 이 구조다.
- **Elm 아키텍처(Elm architecture)**
  - Elm이라는 웹 언어에서 나온 화면 구조다. 화면은 "동작"을 보내기만 하고, 상태를 바꾸는 곳은 `update` 함수 **한 곳뿐**이다. 상태가 바뀌면 화면은 새 상태를 그린다. Android에서 말하는 MVI(사용자 의도 Intent를 받아 상태 State를 내보내는 구조)나 Redux와 같은 생각이다.
- **리듀서(reducer)**
  - "지금 상태"와 "들어온 메시지"를 받아 "다음 상태"를 만드는 함수다. Elm 아키텍처의 `update` 가 리듀서다.
- **CLI(Command Line Interface)**
  - 터미널에서 글자로 명령을 내리는 프로그램이다. 이 글의 CLI는 `ls` 와 `do` 두 명령만 있다.
- **인트로스펙션(introspection)**
  - "안을 들여다보기"라는 뜻이다. 실행 중인 ViewModel이 자기 이름, 상태, 받을 수 있는 동작을 바깥에 스스로 알려 주는 것을 말한다.
- **그레이 박스 시험(grey box test)**
  - 화면 픽셀을 보는 시험(블랙 박스)도 아니고, 내부 함수를 하나하나 부르는 시험(화이트 박스)도 아닌 중간이다. **화면이 보는 것만 본다.** 곧 ViewModel의 상태와 ViewModel이 받는 동작이다.
- **픽스처(fixture)**
  - 시험 때 진짜 서버나 기기 대신 넣는 미리 준비한 값이다. 서버 응답 JSON, 저장소에 들어 있는 값, 생체 인증을 쓸 수 있는지 같은 것들이다.
- **목(mock)과 목 프레임워크**
  - 진짜 객체 흉내를 내는 가짜 객체, 그리고 그런 가짜를 시험 중에 자동으로 만들어 주는 도구(Android의 MockK, Mockito)다. 원문은 이 도구를 **하나도 쓰지 않는다**고 강조한다. 가짜 값은 생성자로만 넣는다.
- **의존성 역전(dependency inversion)**
  - 핵심 모듈이 바깥 기능을 직접 부르지 않고 "이런 기능이 필요하다"는 인터페이스만 정해 두고, 실제 구현은 바깥에서 생성자로 넣어 주는 방식이다. Hilt 같은 DI 도구 없이 손으로 생성자에 넣는 것도 의존성 역전이다.
- **패리티(parity)**
  - iOS 앱과 Android 앱이 같은 기능을 같은 방식으로 갖추고 있는 상태다. 한쪽만 기능이 생기면 패리티가 깨진다.
- **Bun**
  - JavaScript와 TypeScript를 돌리는 실행기다. 안에 시험 도구 `bun:test` 가 들어 있다. 원문의 시험 파일은 이걸로 돈다.
- **XCUITest, Espresso, Appium**
  - 앱을 실제 기기나 에뮬레이터에 띄우고 버튼을 찾아 누르는 UI 시험 도구다. XCUITest는 iOS 전용, Espresso는 Android 전용, Appium은 두 플랫폼을 함께 다룬다.
- **Sidekick, Helix**
  - Sidekick은 Shopify 앱 안에 들어 있는 AI 비서다. Helix는 Shopify가 이전 글에서 소개한 작업 방식으로, 에이전트가 화면을 작은 단계(checkpoint)로 나눠 다시 만들고 단계마다 엄격한 검사(gate)를 통과해야 다음으로 넘어간다.

## 서론 — 에이전트가 코드를 짜는데, 확인이 너무 느리다

- **Shopify는 앱을 다시 네이티브로 만들고 있다**
  - 원문 앞의 두 글에서 Shopify는 모바일 앱을 Swift(iOS)와 Kotlin(Android)으로 다시 짜겠다고 했고, Helix라는 에이전트 작업 방식을 소개했다. 두 글 모두 "시뮬레이터 없이 앱 상태를 들여다보고 동작을 실행하는 CLI"를 언급했다. 이번 글은 그 CLI 뒤의 구조를 설명한다.
- **출발 질문: 에이전트가 코드 대부분을 짤 때, 앱은 어떻게 생겨야 하나**
  - 가장 큰 병목은 피드백 루프였다. 에이전트가 화면을 짜는 데는 몇 분이면 되지만, 그 화면이 맞게 움직인다고 **증명하려면** 에뮬레이터, 빌드, 누르는 스크립트, 그리고 많은 인내심이 필요했다.
  - Shopify는 시뮬레이터 도구에 투자해 이 시간을 줄여 봤지만, 줄일 수 있는 한계에 부딪혔다.
- **그래서 나온 것이 Reflex다**
  - 앱 로직은 화면 없이 돈다. 모든 화면은 상태와 동작을 작은 계약 하나로 내보낸다. CLI가 그 계약을 두 플랫폼에서 **같은 시험 파일로** 조작한다.
  - 결과로 피드백 루프가 아주 짧아졌고, 따로 만든 두 네이티브 앱을 똑같이 유지하는 방법도 생겼다. 원문은 이 구조를 조각별로 설명하고, 다른 팀이 같은 것을 만들려면 무엇이 필요한지도 적었다.

## Reflex 한눈에 보기 — 네 기둥

Reflex는 MVVM 위에 앱을 "에이전트가 화면을 그리지 않고도 빠르게 만들고, 시험하고, 조작할 수 있는 모양"으로 다듬은 구조다. 기둥은 넷이다.

1. **화면 없는 핵심(core) 모듈**
   - 화면을 뺀 모든 것이 UI 라이브러리를 하나도 import하지 않고 기기에 기대는 코드도 없는 모듈에 들어 있다. 그래서 앱 로직을 macOS나 JVM에서 화면 없이 돌릴 수 있다.
2. **엄격한 ViewModel 계약**
   - 모든 화면의 ViewModel이 Elm 아키텍처와 같은 모양을 따른다. 동작이 들어가고, 상태가 나오고, 상태가 바뀌는 곳은 한 곳뿐이다.
3. **ViewModel 인트로스펙션**
   - 각 ViewModel은 JSON 계약으로 바깥에 드러난다. 이름, 상태, 받을 수 있는 동작이다. 앱 바깥의 프로세스(CLI 같은 것)가 화면을 읽고 움직일 수 있는 이유가 이것이다.
4. **CLI**
   - 플랫폼과 상관없는 명령줄 도구다. 에이전트가 시뮬레이터나 에뮬레이터를 켜지 않고 위 계약으로 앱을 움직인다. 플랫폼과 상관이 없으니 **시험 하나가 두 플랫폼을 함께 덮는다.**

네 기둥이 모이면 에이전트는 기기 없이, 아주 빠른 피드백 루프로, 기능 하나씩 앱을 스스로 탐색할 수 있다. 같은 시험 파일이 iOS와 Android 둘 다에 대해 돌기 때문에, 한 플랫폼에만 기능이 생기고 다른 쪽이 따라오지 않은 채로 출시되는 일이 막힌다.

**에이전트 쪽에서 보이는 모습**

- `ls` 는 지금 화면의 이름, JSON으로 된 상태, 받을 수 있는 동작 목록을 찍는다.
- `do 동작이름 [json]` 은 그 동작 하나를 실행한다. 사용자가 버튼을 누른 것과 똑같은 일이다.
- 원문 예시([원문 코드](https://gist.github.com/CourtneySymons/90b2b68f51892a783a60ef476e7b4f8c))는 `dev cli ios --fixtures` 로 픽스처를 넣은 iOS 핵심을 띄운 뒤 `ls` 를 친다. 재고 상세 화면 `InventoryDetail` 의 상태가 `{"productId": "1", "stockCount": 12, "isSaved": false}` 로 나오고, 동작으로 `Increment`, `Decrement`, `Save`, `SetQuantity {quantity}`, `goBack` 이 나온다. `do Increment` 를 친 뒤 다시 `ls` 를 치면 `stockCount` 가 13이 되어 있다.
- CLI는 화면 없는 핵심 프로세스에도, 진짜 앱 빌드에도 붙을 수 있다. 어느 쪽이든 **ViewModel과만 말하고 그려진 화면과는 말하지 않는다.**

그게 CLI 화면의 전부다. 글자로 꾸민 화면(TUI)도, 색도, 돌아가는 로딩 표시도 없다. 에이전트는 그런 것을 신경 쓰지 않고, 터미널을 꾸미지 않아 아낀 시간은 피드백 루프 자체에 들어갔다.

## 코드가 아니라 시험을 나눠 쓴다

두 네이티브 앱이면 모든 화면이 두 번 만들어지고, 무언가가 두 구현을 똑같이 붙잡아 둬야 한다. Shopify의 답은 원문이 계속 되돌아온 원칙, **"코드가 아니라 시험을 나눠 쓴다(share the test, not the code)"** 였다. 코드는 두 번 쓰고, 시험은 한 번 쓴다. 이 원칙은 두 결정 위에 서 있다.

- **두 플랫폼 사이에 나눠 쓰는 코드가 없다**
  - iOS는 Swift, Android는 Kotlin이고, 각자 자기 UI 도구와 동시성(여러 일을 함께 처리하는 방식) 모델을 쓴다. 사이에 크로스 플랫폼 계층이 없다.
  - 왜: 에이전트가 코드 대부분을 짜면 두 번째 네이티브 구현의 값이 예전보다 훨씬 싸다. 반면 두 플랫폼을 잇는 추상 계층은 여전히 값을 다 치른다. 관리할 곳이 늘고, 나중에 성능 작업에 필요한 플랫폼 동작을 가리고, 플랫폼을 올릴 때마다 두 단계 이전 작업이 된다.
  - 결과: 같은 ViewModel을 두 번 쓰는 편이 두 플랫폼 사이 다리를 관리하는 것보다 싸다.
- **패리티는 코드가 아니라 시험이 지킨다**
  - 코드를 나눠 쓰지 않으면 다른 무언가가 두 플랫폼을 맞춰야 한다. Shopify에서는 시험 묶음이 그 일을 한다. 모든 동작 시험이 두 플랫폼에 대해 돌고, 한쪽에서만 통과한 PR은 합칠 수 없다. **나눠 쓰는 것은 시험이다.**

다음 질문은 "어떤 시험이냐"였다. 흔한 답에는 각각 문제가 있었다.

| 시험 종류 | 장점 | 문제 |
|---|---|---|
| 크로스 플랫폼 E2E 시험(앱을 켜고 처음부터 끝까지 누르는 시험) | 시험 하나가 두 앱을 덮는다. Shopify는 몇몇 흐름에서 지금도 쓰고, 자체 E2E 도구로 꽤 안정적으로 만들었다. | 에이전트 루프와 CI 검사에 쓰기에는 여전히 느리다. 시뮬레이터나 에뮬레이터가 필요하고, 실패를 고치려면 영상이나 스크린샷을 들여다봐야 한다. |
| XCUITest와 Espresso로 짠 네이티브 UI 시험 | E2E보다 빠르고 믿을 만하다. | 여전히 시뮬레이터나 에뮬레이터에 묶인다. 플랫폼마다 따로 짜서 모든 시험이 두 벌이 되고, 한쪽 통과가 다른 쪽에 대해 아무것도 말해 주지 않는다. |
| 단위 시험 | 빠르다. | 앱이 아니라 앱의 흉내를 시험한다. 플랫폼마다 두 번 짜야 하고, 두 시험 묶음은 두 코드베이스처럼 서로 어긋난다. 구현에 너무 붙어 있어서 Swift 시험과 Kotlin 시험을 비교해도 두 앱이 같은 사용 흐름을 덮는지 거의 알 수 없다. |

Shopify는 그 중간, 그레이 박스 시험에 가까운 곳에 내려앉았다.

- 시험은 픽셀을 보지 않고, 내부도 보지 않는다. **화면이 보는 것과 똑같은 것**, 곧 ViewModel의 상태와 ViewModel이 받는 동작을 본다.
- 그 아래는 모두 진짜다. 진짜 리듀서, 진짜 서비스, 진짜 GraphQL 클라이언트(Shopify가 서버와 주고받는 질의 방식), 진짜 화면 이동이다. 앱이 원래라면 네트워크나 기기로 나갈 가장자리에서만 픽스처로 바꿔 끼운다.
- 시험 묶음 어디에도 목 프레임워크가 없다.

## 처음부터 다시 생각한 계약

### 화면을 계산에서 빼기

원문은 작은 예로 구조를 설명한다. 사용자가 상품 목록에서 하나를 골라 상세 화면을 열고 재고 수를 고치는 **재고 관리 앱**이다. 일부러 많은 부분을 뺐다. 원문 코드는 Swift지만 Kotlin 쪽도 구조가 같고 거의 똑같이 읽힌다고 한다.

각 플랫폼 앱은 모듈 두 개에 CLI용 하나를 더해 셋으로 나뉜다.

- **Core**
  - 화면이 아닌 모든 것을 가진다. ViewModel, 서비스, 화면 이동 상태, GraphQL, 저장 로직, 딥 링크(앱 안 특정 화면을 여는 주소)다.
  - iOS에서는 평범한 Swift 패키지, Android에서는 평범한 JVM 모듈이다. UIKit도 `android.*` 도 없다.
- **Mobile**
  - 화면과 플랫폼 연동을 가진다. SwiftUI와 Compose 화면, Keychain(iOS의 비밀 값 저장소), 푸시 알림, 카메라, 공유 시트다.
  - Mobile은 Core에 기대고, Core는 Mobile을 전혀 모른다.
- **CLI**
  - Mobile과 똑같이 Core에 기대지만, 폰이 아니라 macOS나 JVM에서 돈다. 이것이 화면 없이 앱을 조작할 수 있는 이유다.

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/Inventory_detail_CLI_test.png" alt="iOS와 Android 양쪽에 Mobile 앱과 CLI 실행 파일이 각자의 Core에 기대고, 가운데 위의 시험 파일 하나가 두 CLI에 JSON으로 말하는 구조 그림" loading="lazy"><figcaption>원문 그림. 왼쪽 iOS에는 SwiftUI 앱 InventoryManagementMobile과 macOS 실행 파일 InventoryManagementCLI가 둘 다 InventoryManagementSwiftCore(ViewModel, 서비스, 화면 이동, UI import 없음)에 기댄다. 오른쪽 Android도 같은 모양으로, Compose 앱과 JVM 실행 파일이 InventoryManagementKotlinCore(순수 JVM)에 기댄다. 맨 위 가운데의 inventory-detail.cli-test.ts(두 플랫폼을 함께 도는 Bun 시험 하나)가 두 CLI에 표준 입출력 JSON으로 말한다. 점선은 컴파일 때 의존이 없는 인트로스펙션 규약이라는 뜻이다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

- **Core는 Mobile을 절대 import하지 않는다**
  - Core는 플랫폼에서 필요한 모든 것을 프로토콜(Kotlin의 인터페이스)로 정해 두고, 구현은 생성자로 받는다. DI 프레임워크 없는 평범한 의존성 역전이다.
  - 모바일 앱과 CLI는 그저 Core를 만들어 주는 "집(host)"이다. CLI는 진짜 플랫폼 서비스 대신 픽스처를 넣는다.
  - 원문 예시([원문 코드](https://gist.github.com/CourtneySymons/c9b5b2f77664c1d278b4f9147ce8fc28))는 같은 `InventoryManagementCore` 를 두 번 만든다. 앱에서는 저장소로 `KeychainStorage()` 를 넣고, CLI의 `main` 에서는 플랫폼도 화면도 없는 `InMemoryStorage()` 를 넣는다. 다른 것은 넣는 값 하나뿐이다.

이렇게 나누면 얻는 것이 있다.

- **화면 이동이 Core에 있다**
  - 화면을 하나 띄우는 일이 "내비게이터의 상태 변경"이다. 그래서 CLI는 화면 하나 만들지 않고 앱 전체를 걸어 다닐 수 있다. 딥 링크도 마찬가지다.
- **Core는 그 언어가 도는 곳이면 어디서나 돈다**
  - Swift Core는 macOS에서 빌드되고(원리상 Linux에서도), Kotlin Core는 순수 JVM 모듈이다. Android 동작 시험에 필요한 것은 에뮬레이터가 아니라 JVM이다.
- **그리는 것이 없으니 시험이 빠르다**
  - 배치 계산도, 애니메이션도, 화면이 뜨기를 기다리는 일도 없다. 동작 하나는 함수 호출 하나와 JSON 읽기 하나다.
  - 더 큰 이유는 헤드리스 실행이다. 1,700개가 넘는 동작 시험이 CI에서 두 플랫폼 모두 약 4분 안에 끝난다.
- **픽스처는 생성자 인자다**
  - 원래 프로세스 바깥에서 오는 상태(GraphQL 응답, Keychain 값, 생체 인증 가능 여부, 기능 플래그)는 모두 생성자로 넣는다.
  - 예외 상황을 흉내 내려면 시험 중간에 목을 고치는 것이 아니라 **다른 픽스처를 넣는다.**

Reflex 자체에는 외부 라이브러리가 하나도 없다. 기본 ViewModel 클래스 하나, 인트로스펙션용 작은 프로토콜 하나(다음 장), 그리고 Core에 플랫폼 import를 들이지 않는 규율이 전부다. 원문은 그 규율을 지키는 일이 **사람에게는 어렵지만 에이전트에게는 반복할 패턴일 뿐이고, 에이전트는 반복을 잘한다**고 적었다.

### 앱의 모양

- **Core 안의 앱은 평범한 객체의 나무다**
  - 뿌리에는 앱 객체가 있고, 네트워크 클라이언트, 현재 세션(로그인 상태), 저장을 가진다.
  - 그 아래에 내비게이터(Tab, Push, Modal)가 있고, 각자 지금 화면에 떠 있는 경로(route) 목록을 쥔다.
  - 잎에는 화면마다 ViewModel 하나가 있다. 이 나무의 누구도 화면을 모른다.
- **화면은 Core 바깥, Mobile 모듈에 산다**
  - 화면 하나는 ViewModel 하나에 묶이고, 그 상태를 읽고, `send(action:)` 을 부른다. 화면과 앱의 나머지 사이 관계는 그게 전부다.
- **Introspection Kit은 따로 떨어진 모듈이다**
  - ViewModel과 CLI 사이 계약을 정한다. 각 ViewModel에 작은 확장(extension)을 붙여 ViewModel을 "노드"로 설명한다. 노드는 이름, JSON 상태, 받는 동작이다.
  - CLI와 시험 SDK는 이 계층하고만 말한다. **앱 자신은 이 계층을 한 번도 부르지 않는다.**

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/Core_module.png" alt="Core 모듈 안에 앱 뿌리, StackNavigator, InventoryDetailViewModel, 인트로스펙션 확장, IntrospectionKit이 있고, 바깥에 화면과 CLI가 있는 그림" loading="lazy"><figcaption>원문 그림. 초록 점선 상자가 Core 모듈(UI import 없음, macOS와 JVM에서 돈다)이다. 안에는 위에서 아래로 앱 뿌리(서비스, 세션, 저장), 경로 [InventoryList, InventoryDetail]을 쥔 StackNavigator, State와 Action과 Message와 update(state, message)를 가진 InventoryDetailViewModel이 이어진다. ViewModel 아래 점선 상자는 이름과 상태와 동작을 내보내는 인트로스펙션 확장이고, 이것이 IntrospectionKit(노드 규약, JSON, 전송)을 import한다. Core 바깥 오른쪽에서 InventoryDetailView(SwiftUI나 Compose, Mobile 모듈)는 파란 화살표로 send(action:)을 넣고 상태를 받는다. 맨 오른쪽 아래 CLI와 시험 SDK는 IntrospectionKit하고만 말한다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

### ViewModel: 동작이 들어가고 상태가 나온다

모든 화면 뒤에는 Elm 아키텍처의 영향을 받은 모양의 ViewModel이 있다. 조각은 다섯이다.

- **State**: 화면이 보여 주는 모든 것이다. ViewModel이 가지고, 화면은 이것만 읽는다.
- **Action**: 바깥에 드러난 면이다. 화면(또는 CLI)이 ViewModel에 시킬 수 있는 모든 일이고, enum으로 적고 `send(action:)` 으로 보낸다.
- **Message**: 안쪽 면이다. Action은 `.viewAction` 으로 감싸져 Message가 되고, Message는 주로 서비스에서 돌아온 결과에 쓴다. ViewModel만 본다.
- **update(state, message)**: 리듀서다. 상태가 바뀌는 **유일한 곳**이고, 모든 길이 여기로 모인다.
- **Services**: 네트워크, 저장 같은 부수 효과가 있는 모든 것이다. 프로토콜로 생성자에서 받아, CLI가 픽스처로 바꿔 끼우기 쉽다.

화면의 계약은 **"상태를 읽고, `send(action:)` 을 부른다"** 가 전부다. 화면은 ViewModel의 메서드를 직접 부르지 않고 상태를 쓰지도 않는다.

원문은 상세 화면 ViewModel을 동시성 표시와 접근 제한자를 뺀 의사 Swift로 보여 준다([원문 코드](https://gist.github.com/CourtneySymons/3bab6053392b0f45182eb2ea3613f7da)).

- `State` 에는 `productId`, `stockCount`(기본 0), `isSaved`(기본 false)가 있다.
- `Action` 은 `increment`, `decrement`, `save`, 그리고 값을 들고 가는 `setQuantity(Int)` 다.
- `Message` 는 `viewAction(Action)` 과, 서비스 결과가 돌아올 때 쓰는 `saved` 다.
- `update` 는 `switch` 하나다. 늘리기는 1 더하고, 줄이기는 **재고가 0보다 클 때만** 1 뺀다. 수량 정하기는 그 값으로 바꾸고, 저장은 서비스에 저장을 맡긴 뒤 끝나면 `.saved` 메시지를 자기에게 보낸다. `.saved` 가 오면 `isSaved` 를 true로 바꾼다. 나머지(재고 0에서 줄이기 같은 것)는 아무것도 하지 않는다.
- `send(action:)` 은 Action을 `.viewAction` 으로 감싸 메시지로 보내는 한 줄이다.

Action은 바깥 면, Message는 안쪽 면, `update` 는 하나뿐인 쓰는 곳이다. 원문은 **모양이 이렇게 엄격하니 에이전트가 수백 번 반복해도 맞게 따라 한다**고 적었다.

### Introspection Kit: 바깥에서 본 ViewModel

CLI는 ViewModel을 읽고 동작을 보낼 방법이 필요하다. 그 계층이 Introspection Kit이고, ViewModel이 지켜야 할 계약은 프로토콜 하나다([원문 코드](https://gist.github.com/CourtneySymons/559a6d400900eb10e5183676ec15f713)). 프로토콜 `IntrospectionNode` 는 `name`(글자), `state`(글자 키와 JSON 값의 사전), `actions`(동작 목록), `child`(아래 노드, 없을 수 있음) 넷을 요구한다.

- **ViewModel은 `+Introspection` 확장에서 노드를 돌려주며 자신을 드러낸다**
  - 노드는 ViewModel을 다시 가리키는 참조를 들고 있다.
  - Android에서도 생각은 같지만 작은 차이가 있다. Kotlin 확장 함수는 타입이 인터페이스를 구현하게 만들 수 없어서, 노드를 ViewModel 옆의 별도 클래스 `InventoryDetailViewModelIntrospectionNode` 로 둔다.
  - 앱은 이 코드를 한 번도 부르지 않는다. 이 파일을 지워도 앱은 똑같이 빌드되고 똑같이 돈다. 잃는 것은 터미널에서 앱을 움직이는 능력뿐이다.
- 원문의 상세 화면 노드([원문 코드](https://gist.github.com/CourtneySymons/1dd7b58138118756b0089307a753dfdc))는 이렇게 생겼다.
  - 이름은 `"InventoryDetail"` 이다.
  - 상태는 ViewModel 상태의 세 칸을 각각 글자, 숫자, 참거짓 JSON 값으로 옮긴 사전이다.
  - 동작은 `Increment`, `Decrement`, `Save`, `SetQuantity` 네 개이고, 각각 제목과 `viewModel.send(action: …)` 을 부르는 클로저(나중에 실행할 코드 조각)를 짝지은 것이다. `SetQuantity` 만 입력 타입 `SetQuantityInput`(정수 `quantity` 하나)을 받는다.
  - `SetQuantityInput` 위에는 `@IntrospectionInput` 매크로(컴파일 때 코드를 만들어 주는 표시)가 붙는다. 이 매크로가 입력 타입의 칸으로 JSON 스키마(어떤 모양의 JSON이 와야 하는지 적은 설명)를 만든다. 원문 주석은 손으로 써도 된다고 덧붙였다.

노드는 네 부분이다.

- **name**: 화면을 가리키는 바뀌지 않는 이름이다. 시험은 이걸로 지금 어디에 있는지 안다.
- **state**: JSON으로 옮긴 ViewModel 상태다. 사용자가 볼 수 있는 모든 칸이다.
- **actions**: Action 경우마다 하나씩, 제목과 `send(action:)` 을 부르는 클로저다.
  - 동작은 인자를 받을 수 있다. `SetQuantity` 는 입력 타입을 밝히고, CLI가 보낸 JSON 객체는 클로저가 돌기 전에 그 타입으로 풀린다.
  - `@IntrospectionInput` 매크로가 스키마를 만들어 주니, CLI는 그 동작이 무엇을 기대하는지 보여 줄 수 있고, 모양이 틀린 입력은 ViewModel에 닿기 전에 거절한다. 누구도 그 스키마를 손으로 관리하지 않는다.
- **child**: 이 노드 아래 노드로 가는 링크(없을 수 있음)다. 뿌리에서 `child` 를 따라 내려가면 CLI가 지금 초점이 있는 노드를 찾는다. 부모의 동작을 자식에게 넘겨주는 것도 이 링크로 한다.

- **손으로 써도 되고, 만들어 내도 된다**
  - 이 노드를 "손으로"(곧 에이전트로) 쓰는 것도 좋은 방법이다. 에이전트는 이걸 잘 따라 한다.
  - 노드 모양이 이렇게 엄격하니 자동으로 만들 수도 있다. 원문 예시([원문 코드](https://gist.github.com/CourtneySymons/f03a3fb5e36e61b3ae8e1fe822968f80))는 ViewModel 클래스 위에 `@Introspectable` 매크로 하나만 붙여, 빌드할 때 State와 Action에서 위 노드를 만들어 낸다.

**규칙 셋**

1. **사용자가 볼 수 있으면 state에 있다. 사용자가 할 수 있으면 actions에 있다.** 노드는 ViewModel을 평범한 JSON으로 본 것이다.
2. **노드는 화면 로직을 되풀이하지 않는다.**
   - 노드는 매번 모든 동작을 조건 없이 나열한다. 재고 0에서 `Decrement` 가 무엇을 할지는 ViewModel이 `update` 에서, 버튼을 눌렀을 때와 **같은 자리에서** 정한다.
   - 노드에 `if` 를 쓰고 있다면, 그 규칙은 ViewModel로 가고 그 결과는 state로 가야 한다.
3. **동작은 `send(action:)` 으로만 간다.** 노드는 ViewModel 메서드를 부르지도 상태를 바꾸지도 않는다. CLI는 화면이 할 수 없는 일은 하나도 할 수 없다.

- **이 계약은 시험만을 위한 것이 아니다**
  - Shopify는 앱이 "에이전트가 먼저(agentic-first)"이기를 바랐다. CLI가 쓰는 바로 그 상태와 동작 면을, Shopify의 AI 비서 Sidekick이 앱 안에서 일을 할 때도 쓴다. Sidekick을 위한 별도 연동 계층이 없다.
  - 결과: 에이전트가 터미널에서 할 수 있는 모든 일을, 앱 안의 에이전트도 할 수 있다.

### 나무

- **노드는 이 장 처음의 객체 나무를 그대로 따라 한다**
  - 객체 하나에 노드 하나이고, `child` 로 이어진다. 앱 뿌리 노드의 자식은 내비게이터이고, 내비게이터 노드의 자식은 맨 위 경로의 ViewModel이다.
  - CLI는 언제나 이 사슬의 **가장 깊은 노드**에 초점을 둔다. 사용자가 맨 위에 있는 것하고만 상호작용하는 것과 같다.
- **컨테이너는 일부러 몇몇 동작을 초점이 있는 자식에게 빌려줄 수 있다**
  - 스택 내비게이터는 `goBack`(뒤로 가기)을, 탭 내비게이터는 `selectTab`(탭 고르기)을 빌려준다. 위 `ls` 예시에서 상세 화면 동작 목록 끝에 `goBack` 이 붙어 있던 이유다.
  - 평범한 ViewModel은 아무것도 빌려주지 않는다.
  - 초점 노드에도 없고 조상이 빌려준 것도 아닌 동작을 CLI에 시키면, CLI는 거절하고 쓸 수 있는 동작 목록을 보여 준다.

### 전송

- **화면 없는 CLI에서는** 핵심 프로세스가 표준 입력에서 줄 단위 JSON(한 줄에 JSON 하나)을 읽고 표준 출력에 써 돌려준다.
- **진짜 빌드에서는** 아주 작은 소켓 서버가 포트 하나로 같은 일을 한다. 그 소켓은 화면이 묶여 있는 바로 그 ViewModel들과 말한다.
  - 그래서 명령을 칠 때마다 시뮬레이터 화면이 바뀐다. 그려진 화면과는 아무 상호작용이 없고, 화면은 그저 상태를 지켜보고 있을 뿐이다.
- 이 서버는 출시 빌드에서 **컴파일 단계에서 빠진다.** 사용자에게 나가는 앱에는 없다.

## 시험 트로피

Shopify의 시험 분포는 피라미드(아래 단위 시험이 가장 많고 위로 갈수록 적은 모양)가 아니라 **가운데가 아주 넓은 트로피**가 됐다.

- **단위 시험**: 기본 부품과 공용 구성 요소에만 쓴다. 값 꾸미기(formatter), 글 해석기(parser), 기본 ViewModel, 페이지 나누기 도우미 같은 것이다. 작고 적다.
- **CLI 동작 시험**: 나머지 모두다. 업무 로직, 검증 규칙, 화면 이동, 오류 처리, 사용자 여정 전체다. 덮는 범위 대부분이 여기 있고, 파일 하나로 두 플랫폼에서 돈다.
  - Helix의 동작 검사(behavior gate)도 이 시험이다. 단계(checkpoint) 하나는 CLI 시험이 두 플랫폼에서 통과해야 다음으로 넘어간다.
- **위의 얇은 층**: 진짜 서비스에 붙는 통합 여정 몇 개와, 같은 규약으로 진짜 빌드를 움직이는 성능 시험 묶음이다.

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/Trophy.png" alt="아래 받침이 단위 시험, 넓은 컵이 CLI 동작 시험, 위 작은 뚜껑이 실서비스와 성능 시험인 트로피 그림" loading="lazy"><figcaption>원문 그림. 트로피 맨 위 작은 노란 조각은 실서비스와 성능 시험이고, 진짜 빌드와 진짜 서비스를 같은 규약으로 쓰는 몇 개의 여정을 가끔 돌린다. 가운데 넓은 초록 컵은 CLI 동작 시험(여정, 업무 로직, 화면 이동, 검증, 파일 하나로 두 플랫폼, 네트워크 0)으로, 헤드리스 Core와 픽스처로 빠르고 늘 같은 결과를 내며 네트워크를 쓰면 실패하고 대부분 에이전트가 쓴다. 아래 회색 받침은 기본 부품에만 쓰는 단위 시험이다. 그림 아래에 "피라미드가 아니다, 거의 모든 것이 가운데 산다"라고 적혀 있다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

가운데 층에 대해 몇 가지를 더 적었다.

### 네트워크는 0, 강제로

- **무엇을**: 동작 시험 세션은 시작할 때 감시 장치를 단다. 그 프로세스 안의 모든 HTTP 요청을 막고, 요청이 한 번이라도 시도되면 시험을 실패시킨다. 앱이 오류를 잡아 멀쩡히 넘어갔더라도 실패다.
- **왜**: 그래야 모든 네트워크 호출과 모든 외부 의존에 픽스처가 생긴다.
- **결과**: 시험 묶음에 입출력이 없고 들쭉날쭉한 실패(flaky)도 없다. 대가는 픽스처가 커진다는 것이다. 여정 하나가 GraphQL 응답을 열 개 넘게 들고 다니기도 한다. 사람이 관리하기에는 지루하지만 에이전트에게는 괜찮다.

### 실패가 읽힌다

그레이 박스 시험이 실패하면 메시지가 어느 확인이 실패했는지 분명히 알려 준다. 에이전트는 디버거를 열지 않고도 그 메시지만 보고 움직일 수 있다.

### 시험이 여정처럼 읽힌다

- **무엇을**: Shopify는 Bun의 시험 도구 위에 Introspection Kit용 작은 시험 SDK를 짰다. CLI와 같은 JSON 규약으로 말하고, 실행 때 의존하는 라이브러리가 없다. `bun:test` 위에 두 가지를 더했다.
  - `precondition`: 초점 노드가 기대한 화면이 될 때까지 기다린다.
  - `do`: 동작 하나를 실행하고, 새 상태에 대한 기대가 맞을 때까지 기다린다.
- 원문의 재고 상세 화면 시험([원문 코드](https://gist.github.com/CourtneySymons/b26fd50f816bb916dd59565a97ad1908))은 iOS와 Android에서 고치지 않고 그대로 돈다. 어느 플랫폼에서 돌지는 시험 틀이 고른다.
  - 도우미 `openInventoryDetail` 은 모든 여정의 시작이다. 초점이 `InventoryList` 가 될 때까지 기다린 뒤 `SelectProduct` 를 상품 id와 함께 보내고, 화면 이름이 `InventoryDetail` 이고 `productId` 가 그 id인지 확인한다.
  - 첫 시험 "저장이 성공하면 사용자는 수량을 고치고 저장할 수 있다"는 재고 2개짜리 픽스처로 화면 없는 Core 세션을 띄운다(`await using` 이라 시험이 끝나면 저절로 닫힌다). 상세 화면을 연 뒤 `Decrement` 두 번으로 1, 0을 확인하고, **0에서 한 번 더 `Decrement` 를 보내도 0인지** 확인한다(주석: `Decrement` 는 늘 목록에 있고, 0에서 아무것도 안 한다고 정하는 것은 ViewModel이다). 이어 `SetQuantity` 를 `{quantity: 40}` 으로 보내 40을, `Save` 를 보내 `isSaved` 가 true인지 확인한다.
  - 둘째 시험 "저장이 실패하면 수량은 저장되지 않은 채 남는다"는 저장 실패 픽스처로 세션을 띄우고, 상세 화면을 연 뒤 `Save` 를 보내 `isSaved` 가 false인지 확인한다.
- **기다림은 시험이 아니라 도우미가 한다**
  - 두 도우미는 몇 초 동안 상태를 거듭 읽어 보다가, 끝내 맞지 않으면 **마지막으로 본 상태와 함께** 실패한다. 그래서 `sleep` 도 "요소가 뜰 때까지 기다리기" 도우미도 없다.
  - 결과: 시험은 사용자가 무엇을 했고 무엇을 봤는지 적은 기록이 된다.
- **일부러 잘게 쪼개지 않는다**
  - 단위 시험이라면 경우마다 작은 시험 하나를 둬야 어디가 깨졌는지 정확히 안다. 이 시험에서는 실패 메시지가 이미 그 정보를 들고 있다. 여정의 몇 번째 단계, 어느 동작, 기대한 상태와 실제로 본 상태다.
  - 에이전트는 이걸 읽고 콕 집은 시험 없이도 원인을 잘 찾는다. 그래서 여정의 단계를 시험 하나로 접고, 아낀 것을 실행 시간과 관리에 쓴다.
  - 위의 저장 실패처럼 **자기 픽스처가 필요한 실패 상황만** 따로 둔다. 확인하는 내용이 달라서가 아니라 준비가 달라서다.

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/1._Send_the_action.png" alt="동작 보내기, 노드 읽기, 기대 확인의 세 단계와, 아직이면 약 100밀리초 뒤 다시 읽고 약 2초가 지나도 안 맞으면 마지막 상태로 실패하는 흐름 그림" loading="lazy"><figcaption>원문 그림. 1단계 "동작 보내기"는 do Decrement가 viewModel.send(action:)으로 가는 것이다. 2단계 "노드 읽기"는 ls로 새 이름, 상태, 동작을 받는 것이다. 3단계 "기대 확인"은 expect(state.stockCount).toBe(1)이다. 맞으면 다음 단계로 간다. 아직 안 맞으면 약 100밀리초 기다렸다가 2단계로 돌아가고, 약 2초가 지나도 계속 틀리면 마지막으로 본 상태와 함께 실패한다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

**얼마나 빠른가**

데우기 단계가 끝나면 위 시험은 기기 없이 두 플랫폼 모두 수백 밀리초 안에 돈다.

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/Bun_test_gif_2.gif" alt="터미널에서 bun test로 동작 시험을 iOS와 Android에 대해 화면 없이 돌려 4개가 모두 통과하는 움직이는 그림" loading="lazy"><figcaption>원문 움직이는 그림. 터미널에서 <code>bun test behavior/reflex-demo.cli-test.ts</code>(iOS와 Android, 헤드리스)를 친다. iOS 데우기 261.78ms, Android 데우기 1168.18ms 뒤에, "저장이 성공하면 사용자는 수량을 고치고 저장할 수 있다" 시험이 iOS 354.58ms, Android 273.11ms에 통과한다. 4개 통과, 0개 실패, expect 호출 35번, 전체 2.10초다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

같은 시험을 iOS 시뮬레이터에서 돌리면 약 2초가 걸린다.

<figure class="media"><img src="https://cdn.shopify.com/s/files/1/0779/4361/files/Bun_test_gif.gif" alt="왼쪽 iPhone 시뮬레이터에서 Shopify 앱 재고 화면이 움직이고 오른쪽 터미널에서 같은 시험이 실서비스 상점에 대해 통과하는 움직이는 그림" loading="lazy"><figcaption>원문 움직이는 그림. 왼쪽은 iPhone 17 시뮬레이터, 오른쪽은 터미널이다. <code>bun test reflex-live/reflex-demo-live.cli-test.ts</code>(iOS 시뮬레이터, 실제 상점)를 치면 시뮬레이터에서 Shopify 앱이 열리고 재고(Inventory) 목록 화면이 나타난다. iOS 데우기 4775.68ms 뒤 같은 시험이 2193.37ms에 통과하고, 2개 통과, 전체 7.01초다. 화면을 누르는 코드는 없고, 명령에 따라 바뀐 상태를 화면이 지켜보며 다시 그린다. 원문 서버에서 불러옴 (<a href="https://shopify.engineering/reflex">원문</a>)</figcaption></figure>

## 오픈 소스로 내놓지 않나

원문의 답은 **"이 글이 오픈 소스다"** 이다.

- **내놓을 라이브러리가 없다**
  - 쓸모 있는 부분은 Shopify 코드가 아니다. Introspection Kit은 Shopify의 세션 모델, 내비게이터, 픽스처 형식에 묶여 있고, 그중 무엇도 다른 앱으로 옮겨 가지 않는다.
  - 옮겨 가는 것은 Reflex라는 구조 자체다. 쓸 만한 코딩 에이전트라면 이 글만 보고 다른 앱에 그 앱의 언어로 구현할 수 있고, 그 결과가 Shopify가 묶어 줄 수 있는 어떤 것보다 그 코드베이스에 잘 맞는다고 원문은 적었다.

**자기 앱에 Reflex를 들이려면 필요한 것**

1. **플랫폼과 Core를 떼어 놓는다.** UI import가 하나도 없는 모듈 하나를 두고, 플랫폼 기능은 모두 생성자로 넣는다. Core를 macOS나 JVM에서 빌드할 수 없다면 아직 거기까지 가지 않은 것이다.
2. **모든 ViewModel을 똑같이 생기게 한다.** 동작이 들어가고 상태가 나오고, `update` 는 하나, 서비스는 생성자로 받는다.
3. **인트로스펙션 노드를 확장으로 붙인다.** 상태는 JSON으로, 모든 동작은 `send(action:)` 을 부르는 클로저로, 조건문은 없이. 에이전트가 ViewModel을 보고 만들어 낼 수 있다.
4. **나무를 만들고 잎에 초점을 둔다.** 앱 뿌리와 내비게이터도 노드다. 컨테이너가 몇몇 동작만 아래로 빌려주게 하고, 나머지는 사용자에게 화면 밖이 그렇듯 손댈 수 없게 둔다.
5. **네트워크가 나가면 실패시킨다.** 모든 것에 픽스처를 둔다. 시험 묶음이 커져도 늘 같은 결과를 내는 길은 이것뿐이다.
6. **문서가 아니라 스킬을 쓴다.** 에이전트에게 CLI를 돌리는 법, 픽스처를 더하는 법, 시험 이름을 짓는 법을 가르친다. CLI는 에이전트가 손을 뻗어 쓸 수 있는 만큼만 쓸모 있다.
7. **사람만을 위한 복잡함을 걷어 낸다.** TUI도, 예쁜 출력도, 묻고 답하는 마법사 화면도 없다. 에이전트용 도구이니 단순하고 빠르게 둔다.

원문은 이렇게 맺는다. Reflex는 에이전트의 속도에 맞는 피드백 루프와, 두 네이티브 앱을 맞춰 두는 시험 묶음 하나를 줬다. 지금 그 시험 묶음은 iOS 앱과 Android 앱 사이에서 함께 믿는 기준이고, 대부분 에이전트가 쓴다. 그리고 앱이 무엇을 하는지 알아내는 가장 빠른 길은 여전히 터미널을 열고 `ls` 를 치는 것이다.

## 자주 묻는 질문

- **화면을 시험하지 않는데 이 시험이 얼마나 쓸모 있나**
  - 아주 쓸모 있다. 화면에서 잘못되는 일 대부분은 로직에서 잘못되고, 이 시험이 덮는 것이 바로 로직이다. 버튼이 `send(action:)` 에 이어져 있는지는 버그가 잘 나는 곳이 아니다.
  - 화면 확인은 다른 곳에서 한다. Helix의 모든 단계는 들어가기 전에 기준 앱과 눈으로 비교하는 검토를 거치고, 픽셀이 중요한 몇몇 구성 요소에는 스크린샷 시험을 둔다. 게다가 Shopify 사람들이 매일 앱을 직접 써서 자연스러운 시험이 늘 위에 얹힌다.
  - ViewModel 상태에 대한 동작 시험에 이 두 층을 더한 것이, 화면을 출시해도 되는지 정하는 기준이다.
- **단위 시험과 XCUITest, Espresso UI 시험을 쓰면 안 되나**
  - 앞에서 말했듯 둘 다 플랫폼마다 한 번씩 짜고, 어느 쪽도 패리티에 대해 말해 주지 않는다.
  - 그 비교에서 빠진 것이 **탐색**이다. 둘 다 미리 짠 시험 밖에서 에이전트가 앱을 걸어 다닐 길을 주지 않는다. 이것이 시험만큼 중요했다. `ls` 로 앱을 돌아다닐 수 있는 에이전트는 더 빨리 고치고 더 빨리 기능을 만든다. 그리고 같은 면이 Sidekick을 위한 "에이전트가 먼저"를 만든다. 그게 없었다면 따로 덧대야 했다.
- **Appium이나 에이전트가 기기를 직접 조작하는 방식은 어떤가**
  - 맞는 자리에서는 쓴다. 다만 Shopify는 자기 코드베이스를 가지고 있어 그레이 박스 창구를 줄 수 있었다. 에이전트는 접근성 나무(화면 요소를 글로 적은 구조)나 스크린샷에서 상태를 짐작하는 대신 상태를 바로 읽는다. 화면을 읽느라 오가는 횟수가 줄어든다.
  - 더 큰 이유는 헤드리스 실행이다. 수천 개의 시험이 CI에서 몇 분이면 끝난다. 같은 규모를 E2E 시험으로 하면 모든 경우를 도는 데 몇 시간이 걸리고, 나란히 돌리려면 큰 설비가 필요하다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문 코드는 GitHub gist에 있고 라이선스가 적혀 있지 않아 옮겨 오지 않았다. 아래는 모두 **직접 쓴 스케치**이고, Aide 계획 Task 8에 적힌 이름(`HomeContract`, `HomeUiState`, `HomeViewModel`)을 따랐다. 빌드해 보지 않았다.

**1. 화면 계약: 상태를 읽고 Event만 보낸다**

Reflex의 `Action` 은 Aide의 `HomeContract.Event`, `State` 는 `HomeUiState` 자리다. 공백만 있는 글을 거르는 규칙(계획 Review Focus 5번)은 화면이 아니라 ViewModel에만 둔다. Reflex 규칙 2 "노드는 화면 로직을 되풀이하지 않는다"와 같은 생각이다.

```kotlin
// feature/home — 직접 쓴 스케치
object HomeContract {
    sealed interface Event {
        data class InputChanged(val text: String) : Event
        data object AddAsTask : Event
        data object AddAsEvent : Event
        data class Complete(val taskId: Long) : Event
        data class UndoComplete(val taskId: Long) : Event
    }

    sealed interface Effect {
        data class ShowUndo(val taskId: Long) : Effect
        data class OpenEventEditor(val title: String) : Effect
    }
}

data class HomeUiState(
    val input: String = "",
    val openTasks: List<Task> = emptyList(),
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val tasks: TaskRepository,
) : ViewModel() {
    private val input = MutableStateFlow("")

    val uiState: StateFlow<HomeUiState> =
        combine(input, tasks.observeOpenTasks()) { text, open ->
            HomeUiState(input = text, openTasks = open)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState())

    private val _effect = Channel<HomeContract.Effect>(Channel.BUFFERED)
    val effect: Flow<HomeContract.Effect> = _effect.receiveAsFlow()

    fun onEvent(event: HomeContract.Event) {
        when (event) {
            is HomeContract.Event.InputChanged -> input.value = event.text
            HomeContract.Event.AddAsTask -> {
                val title = input.value.trim()
                if (title.isEmpty()) return
                viewModelScope.launch { tasks.add(title) }
                input.value = ""
            }
            HomeContract.Event.AddAsEvent -> {
                val title = input.value.trim()
                if (title.isEmpty()) return
                _effect.trySend(HomeContract.Effect.OpenEventEditor(title))
            }
            is HomeContract.Event.Complete -> viewModelScope.launch {
                tasks.complete(event.taskId)
                _effect.send(HomeContract.Effect.ShowUndo(event.taskId))
            }
            is HomeContract.Event.UndoComplete -> viewModelScope.launch {
                tasks.uncomplete(event.taskId)
            }
        }
    }
}

@Composable
fun HomeScreen(state: HomeUiState, onEvent: (HomeContract.Event) -> Unit) {
    // state를 그리고, 누르면 onEvent만 부른다. 여기에는 if로 규칙을 두지 않는다
}
```

- `HomeContract.Event`
  - Reflex의 `Action` 과 같은 "바깥 면"이다. 화면이 할 수 있는 일은 여기 적힌 것뿐이다.
- `uiState` 를 `combine` 으로 만든 부분
  - **Reflex와 다른 점이다.** Reflex는 `update` 가 상태를 쓰는 유일한 곳이다. Aide는 할 일 목록이 Room에서 Flow로 흘러오므로, 목록은 저장소가 쓰고 ViewModel은 입력 글만 쓴다. 그래서 "상태를 쓰는 곳은 하나"가 아니라 **"화면이 바꾸는 상태는 `onEvent` 에서만 바뀌고, 데이터는 저장소에서만 온다"** 로 바꿔 읽었다.
- `AddAsTask` 의 `trim().isEmpty()` 검사
  - Reflex의 "재고 0에서 줄이기는 ViewModel이 정한다"와 같은 자리다. 버튼을 비활성화하는 일은 화면이 해도 되지만, 규칙의 결정은 ViewModel에 있다. 그래서 AI가 나중에 같은 `Event` 를 보내도 같은 규칙이 지켜진다.
- `HomeScreen(state, onEvent)`
  - Aide Konsist 규칙 4번(「이름이 `Screen` 으로 끝나는 Composable은 ViewModel을 파라미터로 받지 않는다」)이 이미 이 모양을 강제한다. Reflex의 "화면은 상태를 읽고 `send(action:)` 만 부른다"와 같다.

**2. ViewModel 시험을 여정 하나로 묶기**

Reflex의 동작 시험처럼, 사용자가 실제로 하는 순서대로 단계를 한 시험에 이어 붙인 모양이다. JUnit5와, Task 8에서 새로 만든다고 가정한 가짜 저장소 `FakeTaskRepository`(Task 7의 `FakeTaskDao` 와 같은 방식으로 메모리 목록만 들고 있는 가짜)를 썼다. Main 디스패처 바꾸기 같은 준비는 줄였다.

```kotlin
// feature/home/src/test — 직접 쓴 스케치
@Test
fun `입력 막대로 할 일을 넣고 완료한 뒤 되돌린다`() = runTest {
    val tasks = FakeTaskRepository()
    val viewModel = HomeViewModel(tasks)
    backgroundScope.launch { viewModel.uiState.collect {} }

    viewModel.onEvent(HomeContract.Event.InputChanged("   "))
    viewModel.onEvent(HomeContract.Event.AddAsTask)
    advanceUntilIdle()
    assertEquals(emptyList<String>(), viewModel.uiState.value.openTasks.map { it.title })

    viewModel.onEvent(HomeContract.Event.InputChanged("보고서"))
    viewModel.onEvent(HomeContract.Event.AddAsTask)
    advanceUntilIdle()
    assertEquals(listOf("보고서"), viewModel.uiState.value.openTasks.map { it.title })
    assertEquals("", viewModel.uiState.value.input)

    val id = viewModel.uiState.value.openTasks.single().id
    viewModel.onEvent(HomeContract.Event.Complete(id))
    advanceUntilIdle()
    assertEquals(emptyList<String>(), viewModel.uiState.value.openTasks.map { it.title })

    viewModel.onEvent(HomeContract.Event.UndoComplete(id))
    advanceUntilIdle()
    assertEquals(listOf("보고서"), viewModel.uiState.value.openTasks.map { it.title })
}
```

- `backgroundScope.launch { … collect {} }`
  - `WhileSubscribed` 로 만든 `uiState` 는 구독자가 있어야 값을 만든다. 시험이 끝나면 `backgroundScope` 가 저절로 정리한다.
- 단계마다 `uiState.value` 를 읽는 부분
  - Reflex의 `do` 가 "새 상태를 읽고 기대를 확인"하는 것과 같은 자리다. #751 [Turbine 글](751-flake-free-turbine-tests.html)에서 본 것처럼 `StateFlow` 는 중간 값을 건너뛸 수 있으므로, 중간 값을 하나하나 세지 않고 **각 단계 끝의 최신 상태**만 확인했다.
- 한 시험에 네 단계
  - 계획 Task 8의 `HomeViewModel` 케이스 표 1번(완료), 2번(되돌리기), 3번(할 일 추가), 4번(공백 거르기)을 하나로 이었다. 5번([일정으로]는 Effect만 낸다)은 Effect를 확인하는 준비가 달라 따로 둔다. Reflex가 "준비가 다를 때만 시험을 나눈다"고 한 것과 같다.

**3. 1-b를 위한 생각 실험: 화면을 JSON 노드로 내보내기**

Reflex의 인트로스펙션 노드를 Aide 첫 화면에 붙인다면 이런 모양이 된다. 앱은 이 함수를 부르지 않고, 1-b의 AI나 시험 도구만 부른다.

```kotlin
// 1-b 생각 실험 — 직접 쓴 스케치
data class ScreenNode(
    val name: String,
    val state: JsonObject,
    val actions: List<String>,
)

fun HomeUiState.toNode(): ScreenNode = ScreenNode(
    name = "Home",
    state = buildJsonObject {
        put("input", input)
        putJsonArray("openTasks") {
            openTasks.forEach { task ->
                addJsonObject {
                    put("id", task.id)
                    put("title", task.title)
                }
            }
        }
    },
    actions = listOf("InputChanged", "AddAsTask", "AddAsEvent", "Complete", "UndoComplete"),
)
```

- `actions` 를 조건 없이 늘 다 나열한다
  - Reflex 규칙 2와 같다. 할 일이 없을 때 `Complete` 를 보내면 어떻게 될지는 노드가 아니라 ViewModel이 정한다.
- 이 노드를 받은 AI가 할 수 있는 일은 `HomeContract.Event` 를 보내는 것뿐이다
  - 사용자가 누를 때와 같은 `onEvent` 를 지나므로, 사용자가 할 수 없는 일은 AI도 할 수 없다. #752 [에이전트 개발 글](752-agentic-development-android.html)의 스케치에서 AI 카드가 `HomeContract.Event` 로 이어졌던 것과 같은 방향이다.

## 배운 점

- **에이전트 시대에 줄여야 할 것은 코드 짜는 시간이 아니라 "맞는지 아는 시간"이다.** Shopify는 시뮬레이터 도구를 더 빠르게 하는 대신, 확인에 화면이 필요 없도록 앱 구조를 바꿨다.
- **"화면은 상태를 읽고 동작만 보낸다"는 오래된 규칙이, 에이전트가 앱을 조작하는 창구가 됐다.** 규칙을 엄격하게 지킨 앱은 상태와 동작을 JSON으로 내보내는 얇은 층 하나만 더하면 시험 도구에도, 앱 안 AI에도 같은 길을 열 수 있다.
- **규칙을 화면에 두지 않아야 바깥에서도 같은 규칙이 지켜진다.** 노드에 `if` 를 쓰고 싶어지면 그 규칙은 ViewModel로, 결과는 state로 가야 한다는 말이 기억에 남았다.
- **시험을 잘게 쪼개는 이유는 "어디가 깨졌는지 알기 위해서"였다.** 실패 메시지가 단계, 동작, 기대 값, 실제 값을 다 알려 주면 그 이유가 사라지고, 사용자 여정 하나를 시험 하나로 두는 편이 싸다.
- **목 프레임워크 대신 생성자 픽스처.** 바깥에서 오는 모든 것을 생성자로 받으면, 예외 상황은 "다른 값을 넣는 것"이 되고 시험 중간에 가짜를 고치는 일이 없어진다.
- **두 플랫폼을 맞추는 길로 "코드 공유" 대신 "시험 공유"를 고른 근거가, 에이전트가 두 번째 구현의 값을 싸게 만들었다는 것이었다.** 기술 선택의 값이 에이전트 때문에 바뀐 예다.

## Aide에 적용하면

Aide는 Android 하나만 있는 앱이라 "두 플랫폼을 시험 하나로 맞춘다"는 Reflex의 큰 이유가 없다. 그리고 1-a(AI 없이 캘린더, 리마인더, 할 일, 대시보드)는 대부분 사용자가 직접 짠다. 그래서 CLI나 인트로스펙션을 들이는 쪽보다, **곧 시작할 Task 8 첫 화면을 어떤 모양으로 짤지**와 **1-b AI가 앱을 어떻게 움직일지**에 쓸 생각을 골랐다. Aide 코드를 읽어 보니 `feature/home` 에는 아직 `HomeRoute` 만 있고 `HomeContract` 와 `HomeViewModel` 은 없다. 「모듈 구조: 공유 데이터는 core, 화면은 feature」(2026-10-12), 「Room DAO 테스트는 Robolectric, Repository 시험은 가짜 DAO」(2026-10-30), 「시킨 일은 AI가 바로 하고 되돌릴 수 있게, 시키지 않은 일은 묻는다」(2026-10-08), 「LLM은 사용자 키로 앱에서 직접 부른다」(2026-10-08)와 맞춰 썼다.

1. **Task 8의 화면 계약을 "화면은 `HomeUiState` 를 읽고 `HomeContract.Event` 만 보낸다, 규칙은 ViewModel에만 둔다"로 짠다 — 가져온다. 계획과 이미 같다.**
   - 무엇을: 계획 Task 8의 `HomeContract.Event`, `HomeContract.Effect`, `HomeUiState` 구성이 Reflex의 Action, Message, State와 같은 자리다. Konsist 규칙 4번(「`Screen` 으로 끝나는 Composable은 ViewModel을 파라미터로 받지 않는다」)과 5번(「ViewModel 패키지에는 UiState가 있다」)이 이 모양을 이미 강제한다.
   - 이 글에서 더 가져오는 것: Reflex 규칙 2(노드는 화면 로직을 되풀이하지 않는다)를 Aide 말로 옮겨 **"`HomeScreen` 안에 `if` 로 업무 규칙을 두지 않는다"** 로 지킨다. 계획 Review Focus 5번(공백만 있는 글은 추가되지 않는다)은 ViewModel의 `AddAsTask` 처리에서 정하고, 화면은 버튼을 흐리게 보이는 정도만 한다. 그래야 1-b에서 AI가 같은 Event를 보내도 같은 규칙이 지켜진다.
   - 바꾸는 점: Reflex는 `update` 가 상태를 쓰는 유일한 곳이지만, Aide의 할 일 목록은 Room에서 Flow로 흘러온다. 그래서 "화면이 바꾸는 상태는 `onEvent` 에서만 바뀌고, 데이터는 저장소에서만 온다"로 바꿔 지킨다.
2. **`HomeViewModel` 시험을 사용자 여정 하나로 묶는다 — 바꿔서 가져온다. 사용자 결정이 필요하다.**
   - 무엇을: 계획 Task 8의 `HomeViewModel` 케이스 표 1번부터 4번(완료, 되돌리기, 할 일 추가, 공백 거르기)을 위 스케치처럼 한 시험으로 잇고, 준비가 다른 5번([일정으로]는 Effect만 낸다)만 따로 둔다.
   - 왜: 사용자가 실제로 하는 순서가 시험에 그대로 남고, 같은 준비 코드를 네 번 쓰지 않아도 된다.
   - 걸리는 점: 케이스 표는 사용자가 승인한 TDD 순서(실패하는 시험을 먼저 쓰고 통과시키기)의 단위다. 한 시험으로 묶으면 red와 green을 케이스마다 따로 보기 어렵다. 그래서 **케이스별로 red와 green을 거친 뒤 마지막 정리 단계에서 묶을지**, 처음부터 묶을지, 묶지 않을지는 Task 8을 직접 짜는 사용자가 정한다. 하나가 깨졌을 때 assert 메시지만으로 몇 번째 단계인지 알 수 있게 메시지를 붙이는 것이 Reflex의 "실패가 읽힌다"를 지키는 조건이다.
3. **바깥에서 오는 값은 모두 생성자로 받고, 시험은 가짜 저장소로 돌린다 — 가져온다. 이미 같은 방향이다.**
   - Aide는 Task 5에서 `FakeCalendarDataSource`, Task 7에서 `FakeTaskDao` 를 만들었고, 시간도 `Clock` 을 `core:data` 의 `DataModule` 에서 생성자로 넣는다(2026-10-30). Reflex의 "픽스처는 생성자 인자다, 목 프레임워크는 없다"와 같은 생각이다.
   - 이 글로 굳힐 것: Task 8 `HomeViewModel` 시험도 MockK 대신 `FakeTaskDao` 와 같은 방식의 가짜 `TaskRepository` 를 만들어 쓴다. 다음 일정 계산(`nextEvent`)처럼 시간이 들어가는 곳은 `Clock` 을 넣어 시각을 고정한다.
4. **화면 없는 Core 모듈, CLI, 소켓 서버 — 지금은 안 한다.**
   - 이유 하나: Aide는 Android 하나라 패리티를 지킬 상대가 없다. Reflex가 CLI를 만든 가장 큰 이유가 없다.
   - 이유 둘: Aide의 ViewModel은 `feature:*` Android 모듈에 있다(2026-10-12 모듈 구조 결정). 이것을 JVM 모듈로 옮기면 그 결정을 다시 열어야 한다. 그리고 Aide ViewModel 시험은 이미 에뮬레이터 없이 CI의 `./gradlew test` 에서 돈다. Reflex가 노린 "기기 없이 빠르게"는 지금 구조로도 얻고 있다.
   - 다시 볼 때: 2차(맥과 연결)에서 맥 쪽 도구가 폰 앱 상태를 읽어야 하거나, 1-b AI를 기기 없이 대량으로 시험해야 할 때다.
5. **네트워크가 나가면 시험을 실패시키기 — 지금은 안 한다. 1-b에서 가져온다.**
   - 1-a에는 네트워크가 없다. 1-b는 LLM을 사용자 키로 앱에서 직접 부르므로(2026-10-08 결정) 처음으로 네트워크가 생긴다.
   - 1-b에서 할 것: LLM 호출을 인터페이스 하나 뒤에 두고, 시험에는 미리 준비한 응답(픽스처)을 넣는 가짜 구현을 쓴다. 시험 중에 진짜 요청이 나가면 실패시키는 장치를 두는 것은 1-b spec을 쓸 때 정한다. 사용자 키가 시험에서 쓰이지 않게 하는 데도 도움이 된다.
6. **화면 상태와 동작을 JSON 노드로 내보내, 1-b AI가 사용자와 같은 길로 앱을 움직이게 한다 — 바꿔서 가져온다. 시점은 1-b다.**
   - 무엇을: Shopify의 Sidekick이 CLI와 같은 면을 쓰듯, 1-b AI가 할 일을 완료하거나 넣을 때 따로 만든 함수가 아니라 **사용자가 누를 때와 같은 `HomeContract.Event`** 를 보내게 한다. 위 스케치 3처럼 AI에게는 지금 화면의 상태와 보낼 수 있는 Event 목록을 보여 준다.
   - 왜 맞나: 「시킨 일은 AI가 바로 하고 되돌릴 수 있게」(2026-10-08)를 지키려면 AI가 한 일에도 사용자가 한 일과 같은 되돌리기(`ShowUndo` Effect)가 붙어야 한다. 같은 Event를 지나면 저절로 붙는다. 규칙(공백 거르기 같은 것)도 같은 곳에서 지켜진다.
   - 바꾸는 점: Reflex처럼 노드 나무 전체와 전송 계층을 만들지 않는다. 1-b의 AI 함수는 결정 기록의 넷뿐이라, #752 [에이전트 개발 글](752-agentic-development-android.html) 적용안 4번의 "정해진 카드 목록"과 합쳐서, 카드가 고르는 동작이 곧 `HomeContract.Event` 가 되게 하는 정도로 시작한다.
7. **화면 이동 상태를 Core에 두기 — 지금은 안 한다.** Aide는 Navigation 3의 뒤로 가기 목록을 `app` 모듈이 쥐고 있고, 「하단 탭을 누르면 뒤로 가기 목록은 [홈, 그 탭]」(2026-10-20)도 그 자리에서 정했다. 화면 이동을 시험할 일이 생기면 그 목록을 다루는 순수 함수만 떼어 시험하는 편이 Reflex처럼 내비게이터 전체를 옮기는 것보다 싸다.

## 출처

- 원문: [Reflex: an architecture for building mobile apps with agents](https://shopify.engineering/reflex) — Thiago Magalhaes (Shopify), 2026-11-05, Android Weekly [#752](https://androidweekly.net/issues/issue-752)
- 원문 코드는 GitHub gist 7개에 있고 라이선스가 적혀 있지 않아 옮기지 않고 글로 풀어 썼다. 본문 각 자리의 "원문 코드" 링크로 볼 수 있다. 원문 그림과 움직이는 그림 7개는 원문 서버 주소를 걸었다
- 이어 읽기: [#752 Android의 에이전트 개발](752-agentic-development-android.html), [#751 Turbine 테스트가 깨지는 이유](751-flake-free-turbine-tests.html), [#749 AI 에이전트는 계획부터 보여줘야 한다](749-ai-plan-first.html)
