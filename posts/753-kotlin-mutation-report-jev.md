---
issue: 753
date: 2026-11-15
title: Kotlin 뮤테이션 테스트 리포트의 잡음을 스크립트와 Jev로 걸러 낸다
original_title: "Clear your Kotlin's code mutation report using Jev"
url: https://le0nidas.gr/2026/11/08/clear-your-kotlins-code-mutation-report-using-jev/
author: le0nidas
tags: [테스트, 뮤테이션 테스트, Kotlin, AI 에이전트]
aide:
  status: candidate
  module: feature:calendar
  task: 1-a
  summary: PIT를 CI에 넣는 것은 지금은 안 한다. 대신 "비교 연산자를 하나 바꿔도 테스트가 통과하는가"를 손으로 따져 보는 습관을 가져와, isLongEvent()의 하루짜리 경계 테스트부터 메운다
---

## 한 줄 요약

**뮤테이션 테스트(mutation testing, 제품 코드를 일부러 조금 망가뜨린 뒤 테스트가 그 고장을 잡는지 보는 검사)** 는 "테스트가 정말 모든 경우를 지키고 있는가"를 알려 준다. JVM에서는 **PIT** 라는 도구가 이 일을 자동으로 하는데, PIT는 소스 코드가 아니라 컴파일된 바이트코드를 바꾼다. 그래서 Kotlin에서는 컴파일러가 몰래 끼워 넣은 코드(코루틴의 `invokeSuspend` 같은 것)까지 바꿔 보고, 리포트에 "내 코드에는 없는 고장"이 잔뜩 섞인다. 저자는 이 잡음을 **6단계 파이프라인**으로 걸렀다. 앞의 세 단계는 평범한 스크립트, 넷째 단계는 Claude 에이전트, 다섯째 단계는 **Jev**(TypeSafe AI가 만든, 예/아니오 질문에 "예일 확률"을 숫자로 답하는 모델), 마지막 단계는 다시 Claude 에이전트가 맡아 살아남은 고장을 잡는 테스트를 쓴다.

> 원문 그림 2장(표지에 쓰인 Jev 질문 JSON 그림, 6단계 흐름도)은 원문 서버 주소를 걸어 보여 준다. 원문 블로그와 원문 코드가 담긴 GitHub Gist에는 **라이선스 표시가 없다**(라이선스가 없으면 저작자 외에는 가져다 쓸 권리가 없다). 그래서 **원문 코드 4개는 옮기지 않고 무엇을 하는 코드인지 글로 설명했다.** "코드로 보기" 절의 코드는 모두 **직접 쓴 스케치**이고, Aide의 실제 코드(`CalendarEvent.isLongEvent()`)를 예로 썼다.

## 먼저 알아 둘 말

- **뮤테이션(mutation, 변이)**: 제품 코드를 컴파일이 깨지지 않는 선에서 조금 바꾼 것. 예를 들어 `age >= 18` 을 `age > 18` 로 바꾸거나, 함수 호출 한 줄을 지우거나, `true` 를 돌려주던 곳이 `false` 를 돌려주게 바꾼다.
- **뮤테이션 테스트(mutation testing)**: 뮤테이션을 하나 넣을 때마다 테스트 전체를 돌려 보는 검사. 테스트가 하나라도 실패하면 그 뮤테이션은 **잡혔다(killed)**, 모두 통과하면 **살아남았다(survived)** 고 한다. 살아남은 뮤테이션은 "누가 실수로 이렇게 고쳐도 테스트가 막아 주지 못한다"는 뜻이다.
- **코드 커버리지(code coverage)와의 차이**: 커버리지는 "테스트가 이 줄을 **실행했는가**"만 센다. 뮤테이션 테스트는 "이 줄이 **틀렸을 때 테스트가 알아채는가**"를 본다. 줄을 실행만 하고 결과를 검사하지 않는 테스트는 커버리지는 높여도 뮤테이션은 못 잡는다.
- **PIT(pitest)**: JVM용 뮤테이션 테스트 도구. 경계 조건 바꾸기(`>=` 를 `>` 로), 조건 뒤집기(`==` 를 `!=` 로), 반환값 바꾸기, 반환값이 없는 함수 호출 지우기 같은 여러 종류의 뮤테이션을 자동으로 넣는다. 결과는 XML이나 HTML 리포트로 나온다.
- **바이트코드(bytecode)**: Kotlin이나 Java 소스를 컴파일해서 나온, JVM이 실제로 실행하는 명령 묶음(`.class` 파일). PIT는 소스 파일을 고쳐 다시 컴파일하지 않고 이 바이트코드를 바로 바꾸기 때문에 빠르다.
- **Kotlin 컴파일러가 끼워 넣는 코드**: Kotlin은 JVM에서 돌기 위해 Java와 호환되는 바이트코드를 만들면서, 소스에는 없는 코드를 더한다. 최상위 함수를 감싸는 `파일이름Kt` 클래스, 널 검사 코드, 그리고 `suspend` 함수를 상태 기계로 바꾸면서 생기는 `invokeSuspend` 메서드와 그 안의 `throwOnFailure` 호출 같은 것이다.
- **파라미터화 테스트(parameterized test)**: 같은 테스트를 입력값만 바꿔 여러 번 돌리는 JUnit 5 기능. `@ParameterizedTest` 와 `@CsvSource("17, false", "19, true")` 처럼 쓰면 한 줄이 한 번의 실행이 된다. Aide도 JUnit 5.14.4를 쓰므로 그대로 쓸 수 있다.
- **에이전트(agent)**: 지시를 받아 파일을 읽고, 명령을 실행하고, 코드를 고치는 일을 스스로 이어 가는 AI 도구. 원문에서는 Claude 에이전트(Claude Code 같은 것)를 쓴다.
- **Jev와 TypeSafe AI**: TypeSafe AI라는 회사가 만든 모델. 글을 길게 써 주는 보통의 LLM(대규모 언어 모델)과 달리, **상태(state, 판단할 재료)** 와 **형식이 정해진 질문** 을 받아 **코드가 바로 쓸 수 있는 구조화된 답** 을 돌려준다. TypeSafe 문서는 이런 모델을 "System One" 모델이라 부른다.
- **Noul 질문**: Jev의 질문 종류 중 하나. 예/아니오로 답할 질문을 보내면 **"예"일 확률을 0과 1 사이 숫자 하나**로 돌려준다. 0이면 아니오, 1이면 예다. 여러 선택지 중 하나를 고르는 질문은 Choice, 등급을 매기는 질문은 Score라는 다른 종류가 맡는다.
- **문턱값(threshold)**: 확률을 결정으로 바꾸는 기준선. 원문은 "0.5보다 작으면 버린다"를 쓴다.

## 서론 — 에이전트가 테스트를 쓰는 시대라서 다시 뮤테이션 테스트

**뮤테이션 테스트가 다시 주목받고 있고, 저자는 그럴 만하다고 본다.**
- 요즘은 에이전트가 테스트를 대신 써 준다. 그러면 사람은 "에이전트가 **필요한 테스트를 다** 썼는가"를 확인할 방법이 있어야 한다.
- 뮤테이션 테스트가 그 확인 방법이다. 빠진 테스트를 찾아 채우면 테스트 묶음이 단단해지고, 프로젝트도 나아진다.

<figure class="media"><img src="https://le0nidas.gr/wp-content/uploads/2026/11/mutation.png" alt="회색 바탕 위 어두운 보라색 코드 창. 창 위쪽에 빨강, 노랑, 초록 점 세 개. 안에 JSON: is_mutation_valid 키 아래 type은 noul, instructions는 Given the kotlin code before any change, is it possible for the mentioned change to be applied in the code?" loading="lazy"><figcaption>원문 표지. 코드 편집기 창 모양 안에 Jev에게 보내는 질문 하나가 JSON으로 적혀 있다. 질문 이름은 <code>is_mutation_valid</code>, 종류(<code>type</code>)는 <code>noul</code>(예일 확률을 돌려주는 예/아니오 질문)이고, 지시문(<code>instructions</code>)은 "바뀌기 전의 Kotlin 코드를 보았을 때, 적힌 변경이 이 코드에 적용될 수 있는가?"다. 이 글의 5단계에서 실제로 쓰는 질문이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://le0nidas.gr/2026/11/08/clear-your-kotlins-code-mutation-report-using-jev/">원문</a>)</figcaption></figure>

## 1. 뮤테이션 테스트란

**뮤테이션 테스트는 내가 쓴 테스트가 모든 경우를 지키는지 확인하는 방법이고, 절차는 두 단계로 단순하다.**
- 첫째, 제품 코드를 바꾼다. 컴파일이 깨지지 않게 코드를 지우거나, 값을 바꾼다(예: if-else의 조건을 바꾼다).
- 둘째, 테스트를 돌린다. 아무것도 실패하지 않으면 테스트가 모든 경우를 지키지 못하고 있다는 뜻이다.

**원문의 예시는 "18세 이상만 입장할 수 있다"는 규칙이다.** (원문 코드는 라이선스가 없어 글로만 옮긴다.)
- 제품 코드: `AdmissionPolicy` 클래스의 `canEnter(age)` 함수가 `age >= 18` 을 돌려준다.
- 테스트: `@ParameterizedTest` 와 `@CsvSource` 로 두 경우를 확인한다. 17세는 `false`(입장 불가), 19세는 `true`(입장 가능)다.
- 이 테스트만 보면 규칙이 잘 지켜지는 것처럼 보인다. 18세 미만은 막히고, 18세 넘으면 들어간다.

**그런데 `age >= 18` 을 `age > 18` 로 바꿔도 테스트가 모두 통과한다. 뮤테이션이 살아남았다.**
- 17세는 두 조건 모두에서 `false`, 19세는 두 조건 모두에서 `true` 다. 두 조건이 다른 답을 내는 **유일한 나이, 18세**를 테스트가 묻지 않았기 때문이다.
- 개발자가 실수로 같은 변경을 해도 아무것도 막아 주지 않고, 그대로 사용자에게 나간다. 18세 사용자는 갑자기 입장을 거절당한다.

**고치는 법은 `@CsvSource` 에 `"18, true"` 한 줄을 더하는 것이다.**
- 테스트 입력이 17, 18, 19가 된다. 이제 `>` 로 바꾸면 18세 줄이 실패하므로 뮤테이션이 잡힌다.
- 뮤테이션 테스트는 이런 빈틈을 사용자에게 닿기 전에 드러내 준다.

## 2. PIT — JVM의 뮤테이션 테스트 도구, 그리고 Kotlin에서의 문제

**이 일을 손으로 하는 것은 지루하므로 자동으로 코드를 바꿔 주는 도구가 있고, JVM 세계에서는 [PIT](https://pitest.org/)를 주로 쓴다.**
- PIT는 [많은 종류의 뮤테이션](https://pitest.org/quickstart/mutators/)을 지원한다.
- PIT의 특별한 점은 **소스 코드를 직접 바꾸지 않고, 컴파일된 바이트코드를 바꾼다**는 것이다. 뮤테이션마다 다시 컴파일할 필요가 없어서 전체 과정이 빠르다.

**그런데 Kotlin에서는 이 장점이 그대로 단점이 된다.**
- Kotlin 컴파일러는 JVM에서 돌기 위해 Java와 호환되는 바이트코드를 만들고, 그 과정에서 원래 파일에 없던 코드를 더한다.
- 원문의 예시는 `greet(name)` 이라는 최상위 함수 하나다. Kotlin 소스는 `"Hello, $name"` 을 돌려주는 세 줄인데, Java로 옮겨 보면 `ExampleKt` 라는 `public final class` 가 생기고, 그 안에 `@NotNull` 이 붙은 `public static final` 메서드가 생기며, 문자열 템플릿은 `"Hello, " + name` 이라는 덧셈으로 바뀐다. 소스에 없던 클래스와 널 표시가 바이트코드에는 있다.
- 그래서 PIT는 **처음부터 내 소스에 없던 코드**까지 바꿔 보고, 그 결과가 리포트에 잡음으로 잔뜩 섞인다. 내가 고칠 수도 없고 고칠 필요도 없는 "살아남은 뮤테이션"이 쌓이는 것이다.

## 3. 리포트 걸러 내기

**지금 할 수 있는 일은 리포트를 걸러 내는 것뿐이고, 리포트의 항목마다 두 가지를 확인해야 한다.**
- 하나, 그 항목이 **살아남은** 뮤테이션인가.
- 둘, 그 변경이 **소스 파일에 실제로 있는 코드**에 일어났는가.
- 둘 다 맞으면 그 항목을 남기고 테스트로 고친다. 뮤테이션이 두어 개면 손으로 해도 되지만, 그보다 많으면 자동화해야 한다.

<figure class="media"><img src="https://le0nidas.gr/wp-content/uploads/2026/11/pitest-process.png?w=895" alt="세로 흐름도. 맨 위 검은 알약 모양 PIT mutations report. 1 Keep the survived mutations, Drop every mutation the tests already killed, No agent. 2 Compact the mutations, Keep only what matters, one mutation per line, No agent. 3 Keep mutations of the Kotlin source, Drop mutations that don't map to a method in the code, No agent. 화살표 옆 no mutations left, stop. 4 주황 상자 Create one file per mutation, The original method's code and the change the mutation makes, Claude agent. 5 보라 상자 Keep only the applicable mutations, JEV is asked, for every mutation: Given the kotlin code before any change, is it possible for the mentioned change to be applied in the code?, JEV. 화살표 옆 no applicable mutations, stop. 6 주황 상자 Kill the applicable mutations, Add or strengthen tests, then run the tests and PIT to verify the mutations are killed, Claude agent. 맨 아래 검은 알약 모양 Stronger test suite" loading="lazy"><figcaption>원문 흐름도. 맨 위 "PIT 뮤테이션 리포트"에서 출발해 여섯 단계를 거쳐 맨 아래 "더 단단한 테스트 묶음"에 이른다. 1단계 "살아남은 뮤테이션만 남긴다"(이미 테스트가 잡은 것은 버린다), 2단계 "뮤테이션을 압축한다"(중요한 것만 남겨 한 줄에 하나씩), 3단계 "Kotlin 소스의 뮤테이션만 남긴다"(코드의 메서드와 이어지지 않는 것은 버린다)는 회색 상자이고 "에이전트 없음" 표시가 붙어 있다. 3단계 뒤에 "남은 뮤테이션이 없으면 멈춘다"는 갈림길이 있다. 4단계 "뮤테이션마다 파일 하나를 만든다"(원래 메서드 코드와 뮤테이션이 하는 변경)와 6단계 "적용 가능한 뮤테이션을 잡는다"(테스트를 더하거나 강화한 뒤, 테스트와 PIT를 다시 돌려 잡혔는지 확인한다)는 주황 상자이고 "Claude 에이전트" 표시가 붙어 있다. 5단계 "적용 가능한 뮤테이션만 남긴다"는 보라 상자이고 "JEV" 표시와 함께 뮤테이션마다 묻는 질문 "바뀌기 전의 Kotlin 코드를 보았을 때, 적힌 변경이 이 코드에 적용될 수 있는가?"가 적혀 있다. 5단계 뒤에도 "적용 가능한 뮤테이션이 없으면 멈춘다"는 갈림길이 있다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://le0nidas.gr/2026/11/08/clear-your-kotlins-code-mutation-report-using-jev/">원문</a>)</figcaption></figure>

흐름도에서 눈여겨볼 점은 **값싼 단계가 앞에 있다**는 것이다. 스크립트로 거를 수 있는 것을 먼저 다 거르고, 남은 것이 없으면 에이전트와 Jev를 아예 부르지 않는다.

### 3-1. 1단계: 살아남은 뮤테이션만 남긴다

**PIT는 모든 결과를 한 리포트에 담으므로, 첫 단계는 살아남은 것만 골라 두 번째 리포트를 만드는 스크립트다.**
- 입력은 PIT의 원래 리포트, 출력은 살아남은 뮤테이션만 들어 있는 리포트다.
- 이미 테스트가 잡은 뮤테이션은 볼 필요가 없다. 여기까지는 AI가 필요 없다.

### 3-2. 2단계: 데이터를 줄인다

**저자도 이 단계는 선택이라고 말한다.**
- 리포트의 항목 하나하나에 데이터가 많아서 사람이 읽고 따지기 어렵다.
- 스크립트로 중요한 정보만 남겨 **한 줄에 뮤테이션 하나**가 되게 만든다. 읽기 쉽고 이해하기 쉬워진다.

### 3-3. 3단계: 컴파일러가 끼워 넣은 메서드의 뮤테이션을 버린다

**리포트 항목마다 `mutatedMethod`(바뀐 메서드 이름)와 `sourceFile`(소스 파일 이름) 한 쌍이 있다.**
- 스크립트가 이 두 값을 꺼내, 소스 파일 안에서 그 메서드 이름을 실제로 검색한다.
- 찾지 못하면 내 원래 코드에 없는 메서드이므로, 그 뮤테이션은 유효하지 않은 것으로 보고 무시한다.
- 대표적인 예가 `invokeSuspend` 다. Kotlin 코드에 코루틴(`suspend` 함수)이 있으면 컴파일러가 언제나 이 메서드를 더한다. 소스에서 `invokeSuspend` 를 검색하면 당연히 나오지 않는다.

### 3-4. 4단계: 남은 잡음을 걸러 낼 준비 — 에이전트가 뮤테이션마다 파일을 만든다

**컴파일러는 새 메서드를 더할 뿐 아니라, 이미 있는 메서드 안에도 코드를 끼워 넣는다.**
- 이 경우는 메서드 이름 검색으로는 거를 수 없다. 내 소스 코드와 PIT가 한 변경을 **함께 보고** 판단해야 해서 더 어렵다.
- 원문의 예는 PIT가 `removed call to kotlin/ResultKt::throwOnFailure`(Kotlin의 `ResultKt.throwOnFailure` 호출을 지웠다)라고 설명한 뮤테이션이다.
- 이 뮤테이션이 유효한지 보려면 원래 코드에 `throwOnFailure` 호출이 정말 있었는지 확인해야 한다. 없었다면 유효하지 않다.

**이 판단은 손으로 할 수 없을 만큼 많으므로 Jev에게 맡기고, 4단계는 Jev에게 보낼 상태(state)를 준비한다.**
- 원문의 예시 파일에는 두 부분이 있다. `Code:` 아래에는 문제의 메서드 전체가 들어간다. 원문 예시는 `transaction` 하나를 받는 `override suspend fun add` 로, 안에서 `mutex.withLock { }` 으로 잠금을 걸고 목록에 거래를 더한다. `Change:` 아래에는 PIT의 설명 한 줄(`removed call to kotlin/ResultKt::throwOnFailure`)이 들어간다.
- 메서드 소스에는 `throwOnFailure` 라는 글자가 어디에도 없다. 이 호출은 `suspend` 함수와 `withLock`(코루틴용 잠금, 인라인 함수라 호출한 쪽에 코드가 펼쳐진다)을 컴파일하면서 생긴 것이다.
- 이 단계는 Claude 에이전트가 한다. 에이전트에게 "리포트 항목의 메서드를 찾아 나머지 코드에서 떼어 내고, 뮤테이션 설명과 함께 파일 하나에 넣어라"라고 지시한다.

### 3-5. 5단계: Jev가 뮤테이션이 유효한지 확인한다

**스크립트가 4단계에서 만든 파일마다 [Jev](https://typesafe.ai/)를 부르고, 그 뮤테이션이 유효한지 묻는다.**
- 파일 내용을 상태(state)로 보내고, Noul 질문 하나를 묻는다. 질문은 "바뀌기 전의 Kotlin 코드를 보았을 때, 적힌 변경이 이 코드에 적용될 수 있는가?"다(표지 그림의 JSON과 같다).
- Jev는 0과 1 사이 값으로 답한다. **0.5보다 작으면 그 파일을 버리고**, 그렇지 않으면 다음 단계로 넘긴다.
- 왜 이 단계에 Jev를 쓰는가에 대해 원문은 따로 이유를 적지 않는다. TypeSafe 문서가 설명하는 Jev의 성격으로 보면, 이 질문은 "예/아니오 하나"만 필요하고 코드가 그 숫자를 문턱값과 비교해 바로 결정할 수 있다. 긴 설명을 써 주는 LLM의 답을 다시 해석할 필요가 없다는 점이 들어맞는다.

### 3-6. 6단계: 뮤테이션을 잡는다

**마지막으로 걸러 낸 결과를 에이전트에게 넘기고, 뮤테이션 테스트 결과를 고치라고 지시한다.**
- 원문이 보여 주는 지시문의 앞부분은 이런 뜻이다. "유효하면서 살아남은 PIT 뮤테이션을 잡도록, 회귀 테스트(regression test, 고친 버그가 다시 생기지 않게 막는 테스트)를 더하거나 강화하라. 뮤테이션을 제품 코드에 적용하거나 제품 코드의 의미를 바꾸지 마라."
- 두 번째 문장이 중요하다. 에이전트는 테스트를 통과시키려고 **제품 코드를 고치는** 쉬운 길을 택할 수 있다. 지시문이 그 길을 막는다.
- 흐름도에 따르면 에이전트는 테스트를 더한 뒤 **테스트와 PIT를 다시 돌려** 뮤테이션이 실제로 잡혔는지 확인한다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문 코드는 라이선스가 없어 옮기지 않았다. 대신 원문의 생각을 **Aide의 실제 코드**에 대 본다. Aide 코드는 고치지 않았고, 아래 테스트와 스크립트는 모두 **직접 쓴 스케치**다(Aide에서 돌려 보지 않았다).

### 1. Aide에도 원문과 똑같은 빈틈이 있다 — `isLongEvent()` 의 하루 경계

`feature:calendar` 의 `CalendarEvent` 에는 여러 날에 걸친 일정인지 판단하는 함수가 있다. 지금 Aide 코드 그대로다.

```kotlin
fun isLongEvent(): Boolean = durationInDays > 1
```

`EventMapperTest` 에는 이 함수에 대한 테스트가 하나 있다. 10월 12일부터 10월 14일까지 **2일짜리** 일정이 긴 일정(`true`)인지 확인한다. 하루 종일 일정 테스트는 `durationInDays` 가 1인지는 확인하지만, 그 일정이 **긴 일정이 아니라는 것**은 확인하지 않는다.

**PIT가 `> 1` 을 `>= 1` 로 바꾸면(경계 조건 뮤테이션) 이 뮤테이션은 살아남는다.**
- 2일짜리 일정은 `2 > 1` 도 `2 >= 1` 도 `true` 다. 테스트가 통과한다.
- 두 조건이 다른 답을 내는 **유일한 값, 1일**을 `isLongEvent()` 에 대해 묻는 테스트가 없다. 원문의 18세와 똑같은 구조다.
- 이렇게 바뀌면 하루짜리 일정이 모두 "긴 일정"이 되어 캘린더 화면에서 여러 날을 가로지르는 막대로 그려질 수 있다. 테스트는 이를 막지 못한다.

**메우는 테스트는 원문처럼 파라미터화 테스트로 경계의 양쪽을 함께 묻는 것이다.**

```kotlin
class LongEventBoundaryTest {

    @ParameterizedTest(name = "{0}일 일정: 긴 일정 = {1}")
    @CsvSource("0, false", "1, false", "2, true")
    fun `이틀 이상 걸친 일정만 긴 일정이다`(days: Long, expected: Boolean) {
        val start = LocalDate.of(2026, 10, 12).atTime(10, 0).atZone(ZoneId.systemDefault()).toInstant()
        val event = event(start = start, end = start.plus(days, ChronoUnit.DAYS))

        assertThat(event.toCalendarEvent(calendar = null).isLongEvent()).isEqualTo(expected)
    }
}
```

- **`@CsvSource("0, false", "1, false", "2, true")`**: 경계값 1을 가운데 두고 양옆을 함께 묻는다. `>= 1` 로 바뀌면 `"1, false"` 줄이, `> 2` 로 바뀌면 `"2, true"` 줄이 실패한다. 경계 조건 뮤테이션 두 방향을 모두 잡는다.
- **시작 시각을 `ZoneId.systemDefault()` 기준으로 만든 이유**: 시간 일정의 `durationInDays` 는 기기 시간대의 **날짜 차이**로 계산한다. UTC 시각을 그대로 쓰면 실행하는 기기의 시간대에 따라 날짜가 하루 밀릴 수 있다. 기존 테스트는 UTC 01:00(한국 10:00)을 써서 한국 시간대에서는 문제가 없다.
- **`event(...)`**: `EventMapperTest` 에 이미 있는 테스트용 생성 함수와 같은 모양이라고 가정했다. 실제로 넣는다면 `EventMapperTest` 안에 케이스를 더하는 편이 자연스럽다.

**같은 조건이 두 군데 더 복사돼 있다는 점도 보인다.**
- `ScheduleViewHolder` 와 `CalendarEvent` 의 날짜 문구를 만드는 부분이 `isLongEvent()` 를 부르지 않고 `durationInDays > 1` 을 직접 쓴다.
- PIT는 이 두 곳도 따로 바꿔 볼 것이고, 화면 코드라 단위 테스트가 없으니 둘 다 살아남을 것이다. 테스트를 더하기 전에 `isLongEvent()` 로 모으면, 위 테스트 하나가 세 곳을 함께 지킨다.

### 2. 3단계를 스크립트로 — 소스에 없는 메서드의 뮤테이션 버리기

원문 1단계와 3단계를 하나로 합친 모양이다. PIT의 XML 리포트(`mutations.xml`)는 뮤테이션마다 `status`, `sourceFile`, `mutatedMethod`, `description` 같은 칸을 가진다. Kotlin 스크립트(`.main.kts`)로 쓴 스케치다.

```kotlin
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element

data class Survivor(val sourceFile: String, val method: String, val line: String, val description: String)

fun Element.text(tag: String): String = getElementsByTagName(tag).item(0).textContent.trim()

val report = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File(args[0]))
val sourceRoot = File(args[1])
val sources = sourceRoot.walk().filter { it.extension == "kt" }.groupBy { it.name }

val nodes = report.getElementsByTagName("mutation")
val survivors = (0 until nodes.length)
    .map { nodes.item(it) as Element }
    .filter { it.getAttribute("status") == "SURVIVED" }
    .map { Survivor(it.text("sourceFile"), it.text("mutatedMethod"), it.text("lineNumber"), it.text("description")) }

val inSource = survivors.filter { survivor ->
    sources[survivor.sourceFile].orEmpty().any { file ->
        Regex("""fun\s+(\S+\.)?`?${Regex.escape(survivor.method)}`?\s*[(<]""").containsMatchIn(file.readText())
    }
}

inSource.forEach { println("${it.sourceFile}:${it.line} ${it.method} | ${it.description}") }
```

- **`status == "SURVIVED"`**: 원문 1단계. 이미 잡힌 뮤테이션은 여기서 빠진다.
- **`println` 한 줄 형식**: 원문 2단계. 파일, 줄 번호, 메서드, 설명만 남겨 한 줄에 하나씩 찍는다.
- **`Regex("fun ... 메서드이름 (")`**: 원문 3단계. 소스 파일에서 `fun 이름(` 이나 `fun 받는타입.이름(` 을 찾는다. `invokeSuspend` 는 어떤 `.kt` 파일에도 `fun invokeSuspend(` 로 적혀 있지 않으니 여기서 빠진다.
- **빠뜨린 경우**: 프로퍼티의 `get()` 은 바이트코드에서 `getDurationInDays` 같은 이름이 되고, 소스에는 `val durationInDays` 로 적혀 있다. 이 스케치는 그런 뮤테이션을 잘못 버린다. 실제로 쓴다면 `get` 접두사를 떼고 `val` 도 찾는 규칙을 더해야 한다. 원문은 검색 방법을 자세히 밝히지 않았다.

### 3. 5단계의 Jev 요청 모양

TypeSafe 문서가 설명하는 요청 본문은 `state`(판단할 재료), `model`, `questions` 세 칸이다. 질문 이름은 내가 정하고, 답은 같은 이름 아래로 돌아온다. 아래는 문서 설명을 따라 직접 쓴 요청이다.

```json
{
  "model": "jev-latest",
  "state": "Code:\nfun isLongEvent(): Boolean = durationInDays > 1\nChange:\nchanged conditional boundary",
  "questions": {
    "is_mutation_valid": {
      "type": "noul",
      "instructions": "Given the kotlin code before any change, is it possible for the mentioned change to be applied in the code?"
    }
  }
}
```

- **`state`**: 원문 4단계에서 에이전트가 만든 파일 내용 그대로다. 이 예에서는 소스에 `>` 가 실제로 있으니 "경계 조건을 바꿨다"는 변경은 적용될 수 있다. Jev가 1에 가까운 값을 돌려주길 기대한다.
- **`"type": "noul"`**: 예일 확률 하나를 돌려 달라는 뜻이다. 답이 0.5보다 작으면 스크립트가 그 파일을 지운다(원문의 문턱값).
- 앞의 `throwOnFailure` 예라면 소스에 그 호출이 없으니 0에 가까운 값이 나와야 한다.

## 배운 점

- **커버리지가 높아도 경계는 비어 있을 수 있다.** Aide의 `isLongEvent()` 는 테스트가 실행하는 줄이지만, 경계값 1을 아무도 묻지 않는다. 뮤테이션 테스트는 "실행했는가"가 아니라 "틀리면 알아채는가"를 묻는다.
- **뮤테이션 테스트의 가장 흔한 수확은 경계값이다.** `>=` 와 `>` 처럼 한 글자 차이로 답이 갈리는 곳이 있으면, 그 경계값과 양옆을 함께 묻는 파라미터화 테스트 하나로 메워진다. 도구 없이도 비교 연산자를 볼 때마다 떠올릴 수 있는 습관이다.
- **바이트코드를 바꾸는 도구는 언어가 바이트코드에 더한 것까지 본다.** PIT의 속도라는 장점이 Kotlin에서는 잡음이라는 단점이 된다. 코루틴을 많이 쓰는 코드일수록 `invokeSuspend` 와 `throwOnFailure` 같은 잡음이 많아진다.
- **값싼 거름망을 앞에, 비싼 판단을 뒤에 둔다.** 저자의 6단계 중 3단계는 평범한 스크립트다. 에이전트와 Jev는 스크립트로 거를 수 없는 것만 받고, 남은 것이 없으면 아예 불리지 않는다.
- **모델에게는 좁은 질문을, 결정은 코드가.** Jev에게는 "적용될 수 있는가"라는 예/아니오 질문 하나만 묻고, 0.5라는 문턱값으로 버릴지 정하는 것은 스크립트다. 판단의 범위가 좁을수록 결과를 믿고 쓰기 쉽다.
- **에이전트에게 테스트를 맡길 때는 "제품 코드는 건드리지 마라"를 꼭 적는다.** 테스트를 통과시키는 가장 쉬운 길은 제품 코드를 바꾸는 것이다.
- **원문은 결과 숫자를 밝히지 않는다.** 리포트의 잡음이 몇 개에서 몇 개로 줄었는지, Jev가 틀린 경우가 있었는지는 나오지 않는다. 방법의 소개로 읽어야 한다.

## Aide에 적용하면

Aide는 지금 1-a(사용자가 직접 코딩하는 기본 기능 단계)를 진행 중이고, 테스트는 JUnit 5.14.4로 쓰며 CI는 `./gradlew assembleDebug test lint` 를 돈다. decisions.md에는 뮤테이션 테스트나 커버리지 도구에 대한 결정이 아직 없다.

1. **경계값 빈틈을 손으로 찾아 메우는 습관 — 가져온다. 지금 1-a에서.**
   - 비교 연산자(`>`, `>=`, `<`, `<=`)가 있는 함수를 테스트할 때, "이 연산자를 한 글자 바꾸면 테스트가 실패하는가"를 스스로 묻는다. 실패하지 않으면 경계값과 양옆을 함께 묻는 `@ParameterizedTest` 를 더한다.
   - 첫 대상은 `CalendarEvent.isLongEvent()` 다. 지금 테스트는 2일짜리만 묻고, 1일짜리가 긴 일정이 **아니라는** 것은 묻지 않는다. "코드로 보기" 1번처럼 0일, 1일, 2일을 함께 묻는 케이스를 `EventMapperTest` 에 더하면 `>= 1` 과 `> 2` 두 방향의 실수를 모두 막는다.
   - 같은 김에 `ScheduleViewHolder` 와 날짜 문구 코드에 복사된 `durationInDays > 1` 을 `isLongEvent()` 로 모을지 사용자가 정한다. 모으면 테스트 하나가 세 곳을 지킨다.
2. **PIT를 Aide에 넣고 CI에서 돌리기 — 지금은 안 한다.**
   - 이유 하나: Android 모듈에는 PIT의 기본 Gradle 플러그인을 바로 쓸 수 없고, Android용 별도 플러그인([koral--/gradle-pitest-plugin](https://github.com/koral--/gradle-pitest-plugin))을 써야 한다. 1-a 범위 밖의 설정이 하나 늘어난다.
   - 이유 둘: Aide는 `suspend` 함수와 Flow를 많이 쓴다(`EventRepository`, `VisibleCalendarStore` 등). 원문이 말한 `invokeSuspend` 와 `throwOnFailure` 잡음이 많이 나올 것이 뻔하다. `core:database` 의 Robolectric 테스트는 느려서 뮤테이션마다 다시 돌리면 시간이 크게 든다.
   - 이유 셋: CI에 넣으면 PR마다 시간이 길어진다. main 보호 규칙상 CI가 초록이어야 머지되므로, 느린 검사는 개발 속도를 바로 깎는다.
   - 다시 볼 시점: 1-a가 끝나고 테스트가 늘었을 때, **순수 Kotlin 모듈(`core:model`)이나 가짜 객체로 테스트하는 `core:data` 부터 손으로 한 번** 돌려 보는 것은 검토할 만하다. CI가 아니라 가끔 돌리는 점검으로 둔다.
3. **Jev 같은 외부 판단 모델로 리포트를 거르기 — 지금은 안 한다.**
   - 이유: 2번을 하지 않으니 거를 리포트가 없다. 나중에 PIT를 돌리더라도 혼자 보는 작은 프로젝트라 원문 3단계(스크립트)까지만으로 충분할 가능성이 크다. 유료 외부 서비스를 하나 더 두는 것은 그다음 문제다.
4. **"값싼 거름망을 앞에, 좁은 예/아니오 판단은 모델에, 결정은 코드에" — 바꿔서 가져온다. 1-b에서.**
   - 1-b(AI 대화 단계)의 기존 결정은 "시킨 일은 AI가 바로 하고 되돌릴 수 있게, 시키지 않은 일은 묻는다"이고, AI 함수를 바로 실행하는 것(`create_event`)과 제안만 하는 것(`propose_event`, `propose_task`, `ask_completion`)으로 나눈다.
   - 원문의 생각을 여기에 대면, "이 요청이 바로 실행할 지시인가"를 AI가 긴 글로 설명하게 하지 않고, 함수 호출이라는 **형식이 정해진 답**으로만 받게 한다. 날짜 형식이 맞는지, 캘린더가 쓰기 가능한지 같은 것은 AI에게 묻지 않고 코드로 먼저 거른다.
   - 바꾸는 점: Aide는 사용자가 넣은 키로 일반 LLM 제공자 한 곳을 쓴다(제공자 1곳으로 시작한다는 결정). 일반 LLM은 Jev처럼 보정된 확률을 주지 않으므로, "0.5 문턱값" 대신 함수 종류(바로 실행인지 제안인지)로 갈라 처리한다. Jev를 1-b에 넣는 것은 제공자를 하나 더 두는 일이라 기존 결정과 맞지 않는다.
5. **에이전트에게 테스트를 맡길 때 "제품 코드의 의미를 바꾸지 마라"를 적는다 — 가져온다. 1-a가 끝난 뒤.**
   - 1-a는 사용자가 직접 코딩하므로 지금은 해당이 없다. 1-a 뒤에 AI 코딩 도구로 테스트를 보강하게 되면, 원문 6단계의 지시문처럼 "테스트만 더하거나 강화하고, 제품 코드는 바꾸지 마라"와 "더한 뒤 테스트를 다시 돌려 확인하라"를 함께 넣는다.

## 출처

- [Clear your Kotlin's code mutation report using Jev — le0nidas](https://le0nidas.gr/2026/11/08/clear-your-kotlins-code-mutation-report-using-jev/) (2026-11-08)
- [PIT 공식 사이트](https://pitest.org/)와 [PIT 뮤테이션 종류 목록](https://pitest.org/quickstart/mutators/)
- [TypeSafe 문서: Noul](https://docs.typesafe.ai/primitives/noul) (Jev의 예/아니오 질문 형식)
- [TypeSafe AI](https://typesafe.ai/)
- [koral--/gradle-pitest-plugin](https://github.com/koral--/gradle-pitest-plugin) (Android 프로젝트용 PIT Gradle 플러그인)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문 블로그와 원문 Gist에는 라이선스 표시가 없어, 원문 코드는 옮기지 않고 글로 설명했다.
