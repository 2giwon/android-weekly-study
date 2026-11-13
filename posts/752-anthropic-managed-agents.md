---
issue: 752
date: 2026-11-08
title: Managed Agents — 에이전트의 뇌와 손을 떼어 놓기
original_title: "Scaling Managed Agents: Decoupling the brain from the hands"
url: https://www.anthropic.com/research/managed-agents
author: Lance Martin, Gabe Cemaj, Michael Cohen (Anthropic)
tags: [AI 에이전트, LLM, 아키텍처, 보안]
aide:
  status: candidate
  module: core:data
  task: 1-b
  summary: 1-b의 AI 활동을 "지우지 않고 뒤에 붙이기만 하는 기록"으로 Room에 남겨, 되돌리기와 "없는 동안 한 일"과 앱이 죽었다 살아난 뒤 이어 하기를 모두 이 기록 하나로 처리한다. AI 함수는 "이름과 입력을 넣으면 글이 나온다"는 창구 하나 뒤에 두고, 사용자 API 키는 LLM이 닿을 수 있는 어떤 도구 결과에도 나오지 않게 한다
---

## 한 줄 요약

에이전트를 돌리는 틀(harness, LLM을 부르고 LLM의 도구 호출을 알맞은 곳에 보내는 반복 코드)에는 "Claude가 혼자서는 이걸 못 한다"는 가정이 박혀 있는데, 모델이 좋아지면 그 가정은 금방 낡는다. Anthropic은 그래서 **특정 구현보다 오래 살아남을 작은 창구 몇 개**로 긴 시간 도는 에이전트를 대신 돌려 주는 서비스 Managed Agents를 만들었다. 핵심은 에이전트를 셋으로 나눈 것이다. **세션**(일어난 모든 일을 뒤에 붙이기만 하는 기록), **틀**(뇌), **샌드박스**(코드를 돌리고 파일을 고치는 손)다. 셋을 떼어 놓자 어느 하나가 죽어도 갈아 끼우면 되고, 비밀 토큰이 Claude가 만든 코드에서 닿지 않게 되고, 첫 응답까지 걸리는 시간이 중앙값 기준 약 60%, 느린 쪽 5% 기준 90% 넘게 줄었다.

## 먼저 알아 둘 말

- **틀(harness)**
  - Claude를 부르고, Claude가 "이 도구를 불러 달라"고 하면 알맞은 곳에 보내고, 결과를 다시 Claude에 넘기는 **반복 코드**다. Claude Code도 틀의 하나다. 원문은 이것을 "뇌"라고 부른다.
- **샌드박스(sandbox)**
  - Claude가 코드를 돌리고 파일을 고치는 **격리된 실행 환경**이다. 보통 컨테이너(프로그램과 필요한 파일을 묶어 다른 것과 떨어뜨려 돌리는 가벼운 가상 환경) 하나다. 원문은 이것과 도구를 "손"이라고 부른다.
- **세션(session)**
  - 에이전트에게 일어난 모든 일을 차례대로 적은 기록이다. **뒤에 붙이기만 하고(append-only) 고치거나 지우지 않는다.**
- **컨텍스트 창(context window)**
  - LLM이 한 번에 읽을 수 있는 글의 양이다. 긴 일은 이 양을 넘기 쉽다.
- **압축(compaction), 기억 도구(memory tool), 컨텍스트 다듬기(context trimming)**
  - 컨텍스트 창을 넘지 않게 하는 방법들이다. 압축은 지금까지의 대화를 요약해 그 요약만 남기는 것이다. 기억 도구는 Claude가 내용을 파일에 적어 두게 해 다음 세션에서도 꺼내 쓰게 하는 것이다. 다듬기는 오래된 도구 결과나 생각 블록 같은 것을 골라 빼는 것이다. 셋 다 **무엇을 남기고 버릴지 되돌릴 수 없게 정한다**는 공통점이 있다.
- **컨텍스트 엔지니어링(context engineering)**
  - LLM에 무엇을 어떤 순서로 보여 줄지 설계하는 일이다.
- **REPL**
  - 코드를 한 줄 넣으면 바로 실행해 결과를 보여 주는 대화형 실행 환경이다. 원문의 예에서는 LLM이 REPL 안에 둔 컨텍스트 객체를 코드로 잘라 읽는다.
- **애완동물과 가축(pets vs cattle)**
  - 서버 운영에서 쓰는 비유다. **애완동물**은 이름이 있고 손으로 돌보며 잃으면 안 되는 서버다. **가축**은 서로 바꿔 끼울 수 있어서 하나가 죽으면 새로 만들면 되는 서버다.
- **WebSocket**
  - 서버와 클라이언트가 연결을 열어 둔 채 계속 주고받는 통신 방식이다.
- **VPC(virtual private cloud)**
  - 회사가 클라우드 안에 따로 떼어 둔 자기만의 사설 네트워크다. 네트워크를 서로 잇는 것을 피어링(peering)이라고 한다.
- **프롬프트 주입(prompt injection)**
  - 웹 페이지나 파일 같은 바깥 내용에 숨겨 둔 지시로 LLM을 속여, 원래 시키지 않은 일을 하게 만드는 공격이다.
- **MCP와 OAuth 토큰, 볼트(vault)**
  - MCP는 LLM 앱이 바깥 도구에 붙는 공개 규약이다. OAuth 토큰은 다른 서비스에 "이 사용자 대신 접근해도 된다"는 허락을 담은 값이다. 볼트는 그런 비밀 값을 안전하게 따로 보관하는 저장소다. Android의 Keystore가 기기 안의 작은 볼트다.
- **프록시(proxy)**
  - 요청을 대신 받아 실제 서비스로 넘겨주는 중간 서버다.
- **TTFT(time-to-first-token)와 p50, p95**
  - TTFT는 일을 받은 뒤 첫 응답 글자가 나오기까지 걸리는 시간이다. 사용자가 가장 크게 느끼는 기다림이다.
  - p50은 모든 요청을 빠른 순으로 줄 세웠을 때 가운데 값(중앙값)이고, p95는 느린 쪽 5%가 시작되는 값이다.
- **멱등(idempotent)**
  - 같은 요청을 여러 번 보내도 한 번 보낸 것과 결과가 같은 성질이다. 네트워크가 끊겨 다시 보냈을 때 기록이 두 번 붙지 않게 하려면 필요하다.

## 서론 — 틀의 가정은 낡는다

- **Anthropic 엔지니어링 블로그가 계속 다뤄 온 주제는 효과적인 에이전트를 만들고, 긴 일을 위한 틀을 설계하는 일이다**
  - 그 글들을 꿰는 생각 하나는, **틀이 "Claude가 혼자서는 못 하는 것"에 대한 가정을 담고 있다**는 것이다. 모델이 좋아지면 그 가정은 낡을 수 있어서 자주 의심해 봐야 한다.
- **예: 컨텍스트 불안(context anxiety)**
  - 앞선 작업에서 Claude Sonnet 4.5는 컨텍스트 한도가 다가오는 것을 느끼면 일을 서둘러 끝내 버렸다. 이것을 "컨텍스트 불안"이라고 부르기도 한다.
  - Anthropic은 틀에 컨텍스트 초기화(context reset)를 넣어 이 문제를 풀었다.
  - 그런데 같은 틀을 Claude Opus 4.5에 쓰자 그 행동이 사라져 있었다. **초기화는 쓸모없는 짐이 됐다.**
- **그래서 Managed Agents를 만들었다**
  - 틀은 앞으로도 계속 바뀔 것이다. Managed Agents는 Claude Platform 안의 호스팅 서비스로, 긴 시간 도는 에이전트를 사용자 대신 돌려 준다. **어떤 특정 구현보다, 지금 Anthropic이 돌리는 구현보다도 오래 살아남을 작은 창구 몇 개**를 통해서다.
- **오래된 문제: "아직 아무도 생각하지 못한 프로그램"을 위한 시스템**
  - 수십 년 전 운영체제는 하드웨어를 프로세스와 파일 같은 추상으로 가상화해 이 문제를 풀었다. 그 추상은 아직 없던 프로그램까지 담을 만큼 일반적이었고, **하드웨어보다 오래 살아남았다.**
  - `read()` 명령은 1970년대의 디스크 팩을 읽는지 요즘 SSD를 읽는지 상관하지 않는다. 위의 추상은 그대로이고 아래의 구현만 자유롭게 바뀌었다.
- **Managed Agents도 같은 방식이다**
  - 에이전트의 부품을 가상화했다. 세션(일어난 모든 일을 뒤에 붙이기만 하는 기록), 틀(Claude를 부르고 도구 호출을 알맞은 설비로 보내는 반복), 샌드박스(Claude가 코드를 돌리고 파일을 고치는 실행 환경)다.
  - 그래서 하나의 구현을 바꿔도 다른 것이 흔들리지 않는다. 원문은 **창구의 모양에는 확실한 의견을 갖지만, 그 뒤에서 무엇이 도는지에는 의견을 갖지 않는다**고 적었다.

<figure class="media"><img src="https://assets.claude.com/903b624ada206b10753a24c6a1367e74a869165d.png" alt="가운데 틀(Harness)을 두고 위에 도구, 왼쪽에 세션, 오른쪽에 샌드박스, 아래에 조율(Orchestration)이 화살표로 이어진 그림" loading="lazy"><figcaption>원문 그림. 가운데 상자는 Harness(틀)이고 Claude 로고가 들어 있다. 위 상자는 Tools(도구, 자원과 MCP 포함), 왼쪽은 Session(체크 목록 아이콘), 오른쪽은 Sandbox(터미널 아이콘), 아래는 Orchestration(조율, 흐름도 아이콘)이다. 틀과 네 상자 사이는 실선 화살표 하나와 점선 화살표 하나로 양쪽으로 이어져 있다. 원문 서버에서 불러옴 (<a href="https://www.anthropic.com/research/managed-agents">원문</a>)</figcaption></figure>

## 애완동물을 들이지 마라

- **처음에는 모든 부품을 컨테이너 하나에 넣었다**
  - 세션, 틀, 샌드박스가 한 환경을 함께 썼다.
  - 좋은 점도 있었다. 파일 수정이 곧바로 시스템 호출이고, 설계할 서비스 경계가 없었다.
- **그러자 오래된 설비 문제에 부딪혔다: 애완동물을 들인 것이다**
  - 서버가 그 애완동물이 됐다. 컨테이너가 죽으면 세션도 사라졌다. 컨테이너가 응답하지 않으면 손으로 돌봐 살려야 했다.
- **컨테이너를 돌보는 일은 멈춘 세션을 고치는 일이었다**
  - 안을 들여다볼 창은 WebSocket 이벤트 흐름 하나뿐이었는데, 그것으로는 실패가 어디서 났는지 알 수 없었다. 틀의 버그, 이벤트 흐름의 패킷 손실, 컨테이너가 꺼진 것이 **모두 똑같이 보였다.**
  - 원인을 알려면 엔지니어가 컨테이너 안에 셸을 열어야 했다. 그런데 그 컨테이너에는 사용자 데이터도 들어 있는 경우가 많아서, 사실상 **고칠 방법이 없었다.**
- **두 번째 문제: 틀이 "Claude가 다루는 것은 모두 같은 컨테이너 안에 있다"고 가정했다**
  - 고객이 Claude를 자기 VPC에 붙여 달라고 하면, 고객은 자기 네트워크를 Anthropic 네트워크와 피어링하거나, Anthropic의 틀을 자기 환경에서 돌려야 했다.
  - 결과: 틀에 박힌 가정 하나가, 틀을 다른 설비에 붙이려 할 때 문제가 됐다.

## 뇌와 손을 떼어 놓는다

- **원문이 닿은 해법**: Claude와 틀을 "뇌"로, 행동을 하는 샌드박스와 도구를 "손"으로, 세션 이벤트 기록을 "세션"으로 보고 **셋을 서로 떼어 놓았다.** 각각은 다른 것에 대한 가정을 거의 하지 않는 창구가 됐고, 각각 따로 실패하거나 따로 갈아 끼울 수 있게 됐다.

- **틀이 컨테이너를 떠난다**
  - 무엇을: 틀이 더는 컨테이너 안에 살지 않는다. 틀은 컨테이너를 다른 도구와 똑같이 부른다. `execute(name, input) → string`(이름과 입력을 넣으면 글이 나온다)이다.
  - 결과: 컨테이너가 가축이 됐다. 컨테이너가 죽으면 틀은 그것을 **도구 호출 오류**로 받아 Claude에 넘긴다. Claude가 다시 해 보기로 하면 표준 조리법 `provision({resources})` 로 새 컨테이너를 만들면 된다. 죽은 컨테이너를 돌봐 살릴 일이 없어졌다.
- **틀이 죽어도 되살아난다**
  - 무엇을: 틀도 가축이 됐다. 세션 기록이 틀 바깥에 있으니, 틀 안에는 죽어도 살아남아야 할 것이 하나도 없다.
  - 결과: 틀 하나가 죽으면 새 틀을 `wake(sessionId)` 로 깨우고, `getSession(id)` 로 이벤트 기록을 돌려받아, **마지막 이벤트부터 이어 간다.**
  - 에이전트 고리가 도는 동안 틀은 `emitEvent(id, event)` 로 세션에 이벤트를 적어 오래 남는 기록을 만든다.

<figure class="media"><img src="https://assets.claude.com/7e932a72d45541a6a8a7585181f10efbf018d5c8.png" alt="부품마다 의사 코드 창구와 그 창구를 채울 수 있는 구현 예를 적은 표" loading="lazy"><figcaption>원문 그림. 부품, 창구(의사 코드), 채울 수 있는 것의 세 칸짜리 표다. Session은 getSession(session_id)이 세션과 이벤트 목록을, getEvents(session_id)가 아직 처리하지 않은 이벤트 목록을 돌려주고, emitEvent(id, event)로 적는다. 아무 데서나 차례대로 읽을 수 있고 같은 것을 여러 번 붙여도 한 번만 붙는 기록이면 되며, Postgres, SQLite, 메모리 배열 등으로 채울 수 있다. Orchestration은 wake(session_id)이고, id를 받아 함수를 부르고 실패하면 다시 시도하는 스케줄러면 된다(cron 작업, 대기열 소비자, while 반복 등). Harness는 Effect를 내고 그 결과를 받는 것이고, 효과를 내며 진행 상황을 세션에 붙이는 반복이면 된다. Sandbox는 provision({resources})와 execute(name, input)이 글을 돌려주는 것이고, 한 번 설정해 도구처럼 여러 번 부를 수 있는 실행기면 된다(로컬 프로세스, 원격 컨테이너 등). Resources는 원본 참조와 붙일 경로의 목록이고, 컨테이너가 참조로 가져올 수 있는 저장소면 된다(Filestore, GCS, git 원격 저장소, S3). Tools는 이름, 설명, 입력 스키마이고, 이름과 입력 모양으로 설명할 수 있는 능력이면 된다(MCP 서버, 직접 만든 도구 등). 원문 서버에서 불러옴 (<a href="https://www.anthropic.com/research/managed-agents">원문</a>)</figcaption></figure>

- **보안 경계**
  - 문제: 묶여 있던 설계에서는 Claude가 만든 믿을 수 없는 코드가 **비밀 값과 같은 컨테이너**에서 돌았다. 그래서 프롬프트 주입은 Claude를 속여 자기 환경을 읽게 하기만 하면 됐다. 공격자가 그 토큰을 손에 넣으면 제한 없는 새 세션을 띄우고 일을 맡길 수 있다.
  - 흔한 대책의 한계: 토큰 권한을 좁게 주는 것은 분명한 대책이지만, 이것도 "Claude가 제한된 토큰으로는 이런 일을 못 한다"는 가정을 담는다. 그리고 Claude는 점점 똑똑해지고 있다.
  - 구조적인 해법: **Claude가 만든 코드가 도는 샌드박스에서는 토큰에 절대 닿을 수 없게** 했다.
- **두 가지 방식으로 지켰다**
  - **자원에 묶기**: Git은 샌드박스를 처음 만들 때 저장소마다의 접근 토큰으로 저장소를 복제하고, 그 토큰을 로컬 git 원격 설정에 연결해 둔다. 샌드박스 안에서 git push와 pull은 되지만, 에이전트는 토큰을 한 번도 직접 다루지 않는다.
  - **볼트에 두기**: 직접 만든 도구는 MCP로 붙이고, OAuth 토큰은 안전한 볼트에 둔다. Claude는 전용 프록시를 거쳐 MCP 도구를 부른다. 프록시는 세션에 묶인 토큰을 받아 볼트에서 그 세션에 맞는 실제 비밀 값을 꺼내 바깥 서비스를 부른다. **틀은 어떤 비밀 값도 알지 못한다.**

## 세션은 Claude의 컨텍스트 창이 아니다

- **문제: 긴 일은 컨텍스트 창보다 길다**
  - 흔한 해결법은 모두 **무엇을 남길지 되돌릴 수 없게 정한다.** 압축은 지금까지의 대화를 요약해 남기고, 기억 도구는 Claude가 내용을 파일에 적어 다음 세션에서도 배운 것을 쓰게 하고, 다듬기는 오래된 도구 결과나 생각 블록을 골라 뺀다.
  - 되돌릴 수 없는 선택은 실패를 부를 수 있다. 앞으로의 차례에서 어떤 토큰이 필요할지 미리 알기 어렵다. 압축 단계가 메시지를 바꾸면 틀은 압축된 원래 메시지를 컨텍스트 창에서 빼고, **그 메시지는 어딘가에 저장해 두었을 때만 되찾을 수 있다.**
- **앞선 연구의 방향: 컨텍스트를 창 바깥의 객체로 두기**
  - 예를 들어 컨텍스트를 REPL 안의 객체로 두고, LLM이 코드를 써서 그 객체를 걸러 내거나 잘라 읽게 할 수 있다.

<figure class="media"><img src="https://assets.claude.com/62203b5b91fee236b0e2752e96ff564044bcbc2a.png" alt="왼쪽 세션에서 오른쪽 틀로 이벤트가 가고, 틀이 세션에서 getEvents로 이벤트를 골라 읽는 그림" loading="lazy"><figcaption>원문 그림. 왼쪽 Session(체크 목록 아이콘)에서 오른쪽 Harness로 Events(이벤트) 화살표가 가고, 반대 방향으로 getEvents 화살표가 돌아온다. 틀 상자 안에서는 점선 화살표가 Claude 로고로 이어진다. 세션에서 읽은 이벤트를 틀이 다듬어 Claude의 컨텍스트 창에 넣는다는 뜻이다. 원문 서버에서 불러옴 (<a href="https://www.anthropic.com/research/managed-agents">원문</a>)</figcaption></figure>

- **Managed Agents에서는 세션이 같은 이점을 준다**
  - 세션은 Claude 컨텍스트 창 바깥에 사는 컨텍스트 객체 역할을 한다. 다만 샌드박스나 REPL 안이 아니라 **세션 기록에 오래 남게** 저장된다.
  - 창구 `getEvents()` 로 뇌는 이벤트 흐름을 **자리 기준으로 잘라** 물어볼 수 있다.
  - 쓰는 법이 유연하다. 마지막으로 읽다 멈춘 곳부터 이어 읽을 수도 있고, 어떤 순간 바로 앞의 이벤트 몇 개로 되감아 경위를 볼 수도 있고, 특정 행동 전의 컨텍스트를 다시 읽을 수도 있다.
- **읽은 이벤트는 Claude에 넘기기 전에 틀이 바꿀 수 있다**
  - 그 변환은 틀이 담은 무엇이든 된다. 프롬프트 캐시 적중률(같은 앞부분을 다시 쓰면 싸고 빨라지는 비율)을 높이도록 컨텍스트를 정리하는 일이나, 컨텍스트 엔지니어링이 들어간다.
- **왜 둘을 나눴나**
  - **되찾을 수 있는 컨텍스트 보관은 세션에**, **마음대로 바꾸는 컨텍스트 관리는 틀에** 두었다. 앞으로의 모델에 어떤 컨텍스트 엔지니어링이 필요할지 예측할 수 없기 때문이다.
  - 창구는 컨텍스트 관리를 틀로 밀어 두고, 세션에 대해서는 **오래 남고 물어볼 수 있다는 것만** 보장한다.

## 여러 뇌, 여러 손

### 여러 뇌

- **가장 오래된 고객 불만 하나가 풀렸다**
  - 팀들이 자기 VPC 안의 자원으로 Claude를 일하게 하려면, 틀을 담은 컨테이너가 "모든 자원이 옆에 있다"고 가정했으므로 네트워크를 피어링하는 길밖에 없었다. 틀이 컨테이너를 떠나자 그 가정이 사라졌다.
- **같은 변화가 성능에도 효과를 냈다**
  - 처음에 뇌를 컨테이너에 넣었을 때는, 뇌가 많으면 컨테이너도 그만큼 많아야 했다. 뇌마다 컨테이너가 준비될 때까지 추론을 시작할 수 없었고, **모든 세션이 컨테이너 준비 비용을 처음에 다 냈다.** 샌드박스를 한 번도 안 쓸 세션도 저장소를 복제하고, 프로세스를 띄우고, 서버에서 밀린 이벤트를 가져와야 했다.
  - 그 죽은 시간이 TTFT로 드러난다. TTFT는 사용자가 가장 날카롭게 느끼는 지연이다.
- **뇌와 손을 떼어 놓으면**
  - 뇌가 도구 호출(`execute(name, input) → string`)로 **필요할 때만** 컨테이너를 준비한다. 컨테이너가 바로 필요 없는 세션은 기다리지 않는다.
  - 조율 계층이 세션 기록에서 밀린 이벤트를 꺼내자마자 추론이 시작될 수 있다.
  - 결과: **p50 TTFT가 약 60% 줄고, p95는 90% 넘게 줄었다.** 뇌를 늘리는 일은 상태 없는 틀을 많이 띄우고, 필요할 때만 손에 잇는 것이 됐다.

### 여러 손

- **뇌 하나를 손 여러 개에 잇고 싶었다**
  - 실제로는 Claude가 여러 실행 환경을 놓고 어디로 일을 보낼지 판단해야 한다는 뜻이다. 셸 하나에서 일하는 것보다 어려운 일이다.
  - 처음에 뇌를 컨테이너 하나에 넣은 것도 예전 모델이 이 일을 못 했기 때문이다. 지능이 커지자 오히려 컨테이너 하나가 한계가 됐다. 그 컨테이너가 죽으면 뇌가 손을 뻗고 있던 **모든 손의 상태를 잃었다.**
- **뇌와 손을 떼어 놓으면 손 하나하나가 도구가 된다**
  - `execute(name, input) → string`: 이름과 입력이 들어가고 글이 나온다.
  - 이 창구 하나로 직접 만든 도구, 어떤 MCP 서버, Anthropic 자체 도구를 모두 다룬다.
  - 틀은 샌드박스가 컨테이너인지, 폰인지, 포켓몬 에뮬레이터인지 모른다.
  - 어떤 손도 어떤 뇌에 묶이지 않으니, **뇌끼리 손을 넘겨줄 수도 있다.**

<figure class="media"><img src="https://assets.claude.com/1dff25b906f1c276cfb27c2a36638b1128dc4d2a.png" alt="겹쳐 쌓인 여러 틀 상자와 겹쳐 쌓인 여러 샌드박스 상자가 양방향 화살표로 이어진 그림" loading="lazy"><figcaption>원문 그림. 왼쪽에는 Harness(틀) 상자가 세 장 겹쳐 쌓여 있고, 오른쪽에는 Sandbox(샌드박스) 상자가 세 장 겹쳐 쌓여 있다. 둘 사이는 오른쪽으로 가는 점선 화살표와 왼쪽으로 오는 실선 화살표로 이어진다. 뇌도 손도 여러 개이고, 어느 뇌든 어느 손에든 이어질 수 있다는 뜻이다. 원문 서버에서 불러옴 (<a href="https://www.anthropic.com/research/managed-agents">원문</a>)</figcaption></figure>

## 맺음말

- **Anthropic이 마주한 문제는 오래된 것이다**: "아직 아무도 생각하지 못한 프로그램"을 위한 시스템을 어떻게 설계하는가. 운영체제는 하드웨어를 아직 없던 프로그램까지 담을 만큼 일반적인 추상으로 가상화해 수십 년을 버텼다. Managed Agents는 Claude 주변의 앞으로의 틀, 샌드박스, 다른 부품을 담을 수 있는 시스템을 목표로 했다.
- **Managed Agents는 같은 정신의 메타 틀(meta-harness)이다**
  - 앞으로 Claude에게 필요할 특정 틀에 의견을 갖지 않는다. 대신 여러 다른 틀을 담을 수 있는 일반 창구를 가진 시스템이다.
  - 예를 들어 Claude Code는 Anthropic이 여러 일에 널리 쓰는 훌륭한 틀이다. 좁은 분야에서는 그 일에 맞춘 틀이 뛰어나다는 것도 보여 왔다. Managed Agents는 이 모두를 담고, 시간이 지나며 Claude의 지능에 맞춰 간다.
- **메타 틀 설계는 Claude 주변의 창구에 대해서만 확실한 의견을 갖는 것이다**
  - Claude에게는 상태를 다루는 능력(세션)과 계산하는 능력(샌드박스)이 필요하다고 본다.
  - 많은 뇌와 많은 손으로 늘어날 수 있어야 한다고 본다.
  - 이것들이 긴 시간 동안 믿을 만하고 안전하게 돌도록 창구를 설계했다.
  - 그러나 Claude에게 필요할 뇌와 손의 **수나 위치에 대해서는 아무것도 가정하지 않는다.**

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문에는 코드가 없고, 표 그림에 의사 코드 창구 이름만 있다. 아래는 모두 **직접 쓴 스케치**이고, 1-b는 아직 시작 전이라 모듈과 클래스 이름은 가정이다. 빌드해 보지 않았다.

**1. 세션: 지우지 않고 뒤에 붙이기만 하는 AI 활동 기록**

```kotlin
// core:database (1-b, 가정) — 직접 쓴 스케치
@Entity(
    tableName = "ai_event",
    indices = [Index(value = ["conversationId", "requestKey"], unique = true)],
)
data class AiEventEntity(
    @PrimaryKey(autoGenerate = true) val seq: Long = 0,
    val conversationId: String,
    val requestKey: String,
    val type: String,
    val payloadJson: String,
    val createdAt: Instant,
)

@Dao
interface AiEventDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun append(event: AiEventEntity): Long

    @Query("SELECT * FROM ai_event WHERE conversationId = :id AND seq > :afterSeq ORDER BY seq")
    suspend fun eventsAfter(id: String, afterSeq: Long): List<AiEventEntity>
}
```

- `@Insert` 만 있고 `@Update` 와 `@Delete` 가 없다
  - 원문 세션의 "뒤에 붙이기만 한다"다. 되돌리기도 기록을 지우는 것이 아니라 `"undone"` 이벤트를 하나 더 붙이는 것으로 한다. 그래야 "무엇을 했고 무엇을 되돌렸는지"가 모두 남는다.
- `requestKey` 에 걸린 `unique` 인덱스와 `OnConflictStrategy.IGNORE`
  - 원문 표의 "같은 것을 여러 번 붙여도 한 번만 붙는(멱등) 기록"이다. 네트워크가 끊겨 같은 LLM 응답을 다시 처리해도 이벤트가 두 번 붙지 않는다.
- `eventsAfter(id, afterSeq)`
  - 원문의 `getEvents()` 처럼 자리(`seq`) 기준으로 잘라 읽는다. LLM에 보낼 컨텍스트는 이 기록에서 그때그때 골라 만든다. 기록 자체는 줄이지 않는다.

**2. 손: "이름과 입력을 넣으면 글이 나온다"는 창구 하나**

```kotlin
// core:ai (1-b, 가정) — 직접 쓴 스케치
interface AiTool {
    val spec: ToolSpec
    suspend fun execute(inputJson: String): String
}

class ToolRouter(tools: Set<@JvmSuppressWildcards AiTool>) {
    private val byName = tools.associateBy { it.spec.name }

    suspend fun execute(name: String, inputJson: String): String {
        val tool = byName[name] ?: return "오류: $name 이라는 도구는 없다. 쓸 수 있는 도구: ${byName.keys}"
        return runCatching { tool.execute(inputJson) }
            .getOrElse { e -> "오류: $name 실행 실패 (${e::class.simpleName})" }
    }
}
```

- `execute(name, inputJson): String`
  - 원문의 `execute(name, input) → string` 을 그대로 옮겼다. `create_event`, `propose_event`, `propose_task`, `ask_completion` 넷이 모두 이 창구 뒤에 있다. 틀(LLM을 부르는 반복)은 도구가 폰 캘린더를 쓰는지 Room을 쓰는지 모른다.
- 실패를 예외로 던지지 않고 글로 돌려준다
  - 원문에서 컨테이너가 죽으면 틀이 그것을 "도구 호출 오류"로 Claude에 넘겼듯, 캘린더 쓰기가 실패해도 앱이 죽지 않고 LLM이 실패를 읽고 사용자에게 알리거나 다시 시도한다.
- 오류 글에 예외 메시지 대신 예외 종류만 넣는다
  - 예외 메시지에 내부 경로나 비밀 값이 섞일 수 있다. 아래 3번과 같은 이유다.
- `Set<AiTool>` 을 Hilt로 받는다
  - Hilt의 `@IntoSet` 으로 도구를 하나씩 더하면, 도구를 늘려도 틀 코드는 바뀌지 않는다.

**3. 뇌는 가축: 앱이 죽었다 살아나도 기록에서 이어 간다**

```kotlin
// core:ai (1-b, 가정) — 직접 쓴 스케치
class AiConversationRunner(
    private val events: AiEventDao,
    private val llm: LlmClient,
    private val tools: ToolRouter,
    private val clock: Clock,
) {
    suspend fun wake(conversationId: String) {
        val history = events.eventsAfter(conversationId, afterSeq = 0)
        val last = history.lastOrNull() ?: return
        when (last.type) {
            "user_message", "tool_result" -> continueWith(conversationId, history)
            "tool_call" -> runPendingTool(conversationId, last)
            else -> Unit
        }
    }

    private suspend fun runPendingTool(conversationId: String, call: AiEventEntity) {
        val (name, input) = ToolCall.parse(call.payloadJson)
        val result = tools.execute(name, input)
        events.append(AiEventEntity(
            conversationId = conversationId,
            requestKey = "${call.requestKey}:result",
            type = "tool_result",
            payloadJson = ToolResultJson(name, result),
            createdAt = clock.instant(),
        ))
        continueWith(conversationId, events.eventsAfter(conversationId, 0))
    }

    private suspend fun continueWith(conversationId: String, history: List<AiEventEntity>) {
        // history로 LLM 요청을 만들고, 응답을 이벤트로 붙인다. 키는 llm 안에서만 쓴다
    }
}
```

- `wake(conversationId)`
  - 원문의 `wake(sessionId)` 다. Android는 앱이 뒤로 가 있을 때 프로세스를 언제든 죽일 수 있다. 그러면 ViewModel과 진행 중이던 코루틴이 함께 사라진다. 기록이 Room에 있으면 앱을 다시 열 때 마지막 이벤트를 보고 이어 갈 수 있다.
- 마지막 이벤트가 `"tool_call"` 이면 도구부터 실행한다
  - "LLM이 도구를 불러 달라고 했는데 실행 전에 앱이 죽은" 경우다. `requestKey` 를 `":result"` 로 이어 붙여, 같은 호출의 결과가 두 번 붙지 않게 한다.
  - 다만 `create_event` 처럼 바깥(폰 캘린더)에 쓰는 도구는, 실행은 됐는데 결과를 붙이기 전에 죽었을 수 있다. 그런 도구는 실행 전에 "이미 넣었는지"를 확인하는 장치가 따로 필요하다. 스케치는 그 부분을 비워 두었다.
- `LlmClient` 만 키를 안다
  - 원문의 "틀은 어떤 비밀 값도 알지 못한다"를 Aide 크기로 옮겼다. 사용자 API 키는 Keystore에서 `LlmClient` 가 요청을 만들 때만 꺼낸다. 도구 결과, 이벤트 기록, 오류 글 어디에도 키가 나오지 않으므로, 프롬프트 주입으로 LLM을 속여도 LLM이 키를 읽을 길이 없다.

## 배운 점

- **틀에 박힌 우회책은 모델이 바뀌면 짐이 된다.** Sonnet 4.5의 "컨텍스트 불안"을 막으려 넣은 초기화가 Opus 4.5에서는 쓸모없었다는 사례가, 우회책을 언제 걷어 낼지 정해 두라는 말로 읽혔다.
- **오래 가는 것은 구현이 아니라 창구다.** `read()` 가 디스크 팩과 SSD를 가리지 않듯, `execute(name, input) → string` 하나가 컨테이너, MCP 서버, 폰, 에뮬레이터를 가리지 않는다.
- **상태를 바깥 기록에 두면 나머지는 모두 가축이 된다.** 세션이 틀 바깥에 있으니 틀이 죽어도 `wake` 로 이어 가고, 컨테이너가 죽어도 도구 오류로 처리한다. 돌봐야 할 애완동물이 사라진다.
- **보관과 관리를 나눈다.** 기록은 줄이지 않고 오래 남기고, 무엇을 LLM에 보여 줄지는 틀이 그때그때 정한다. 요약은 언제든 다시 만들 수 있지만 버린 원문은 되찾을 수 없다.
- **비밀 값 보안은 "권한을 좁게"가 아니라 "닿지 않게"로 푼다.** 권한을 좁히는 것도 "이 정도면 Claude가 못 하겠지"라는 가정이고, 그 가정도 낡는다.
- **떼어 놓은 구조가 빠르기도 하다.** 필요할 때만 손을 준비하자 첫 응답까지의 시간이 중앙값 기준 약 60%, 느린 쪽 5% 기준 90% 넘게 줄었다.

## Aide에 적용하면

Aide는 서버가 없는 폰 앱이고(「LLM은 사용자가 고른 제공자를 사용자 키로 앱에서 직접 부른다, 서버 없음」 2026-10-08), 1-a에는 AI가 없다. 그래서 Managed Agents 서비스 자체가 아니라 **"세션, 틀, 손을 떼어 놓는다"는 설계를 1-b AI의 폰 안 구조로 옮기는 것**을 봤다. 「시킨 일은 AI가 바로 하고 되돌릴 수 있게, 시키지 않은 일은 묻는다」(2026-10-08)의 "바로 실행한 것은 활동 기록에 남기고 되돌릴 수 있어야 한다", 「일하는 모습은 진짜 활동일 때만」(2026-10-08)의 "AI가 한 일을 기록으로 남긴다", 「아침 브리핑은 미리 만들어 보고 안 되면 열 때 만든다」(2026-10-08)와 맞춰 썼다. 같은 이슈의 [Building effective agents 글](752-building-effective-agents.html) 적용안과 함께 읽는다.

1. **AI 활동을 "지우지 않고 뒤에 붙이기만 하는 기록" 하나로 Room에 남긴다 — 바꿔서 가져온다. 시점은 1-b다.**
   - 무엇을: 스케치 1처럼 사용자 말, LLM 답, 도구 호출, 도구 결과, 되돌리기를 모두 이벤트로 붙인다.
   - 왜: 결정 기록에는 같은 기록이 필요한 기능이 셋 흩어져 있다. 바로 실행한 일의 되돌리기(2026-10-08), "없는 동안 일정 3개 확인하고 내일 회의 알림 준비해 뒀어요" 같은 보고(2026-10-08), 하루 한 번 만든 브리핑을 저장해 다시 보여 주기(2026-10-08)다. 원문의 세션처럼 기록 하나를 두면 세 기능이 같은 기록을 읽는다.
   - 바꾸는 점: 원문의 세션은 서버의 Postgres 같은 곳에 있지만, Aide는 서버가 없으므로 폰의 Room이다. 원문 표도 "SQLite로 채울 수 있다"고 적었고, Room은 SQLite 위에 있다.
   - 걸리는 점: 기록이 계속 쌓인다. 오래된 대화를 언제 지울지(예: 30일)는 "뒤에 붙이기만"과 부딪히므로 1-b spec에서 사용자가 정한다.
2. **LLM에 보낼 컨텍스트는 기록에서 그때그때 골라 만들고, 기록 자체는 줄이지 않는다 — 가져온다. 시점은 1-b다.**
   - 무엇을: 대화가 길어지면 LLM에는 최근 이벤트와 요약만 보낸다. 요약은 기록 위에 따로 붙이고, 원래 이벤트는 그대로 둔다.
   - 왜: 원문의 "보관은 세션에, 관리는 틀에"다. 사용자가 제공자를 바꾸면(2026-10-08 결정: 사용자가 제공자를 고른다) 모델마다 컨텍스트 창 크기가 다르다. 기록을 줄이지 않았으면 새 모델에 맞게 요약을 다시 만들면 된다.
3. **앱이 죽었다 살아나도 마지막 이벤트부터 이어 간다 — 바꿔서 가져온다. 시점은 1-b다.**
   - 무엇을: 스케치 3의 `wake` 처럼, 앱을 열 때 끝나지 않은 대화를 찾아 마지막 이벤트를 보고 이어 가거나 "중간에 멈췄어요"를 보여 준다.
   - 왜: Android는 뒤로 간 앱의 프로세스를 언제든 죽인다. 원문의 "틀도 가축"이 Android에서는 "ViewModel은 언제든 사라진다"와 같은 말이다. 08:30 브리핑 결정의 "미리 만들어 보고, 실패하면 열 때 만든다"도 이미 같은 생각이다.
   - 걸리는 점: 바깥에 쓰는 도구(`create_event`)는 "실행은 됐는데 기록하기 전에 죽은" 경우가 있다. 다시 실행하면 일정이 두 번 들어간다. 1-b에서 일정을 넣을 때 고유 표시를 함께 적어 두고 다시 실행 전에 찾아보는 장치를 정해야 한다. 스케치는 이 부분을 비워 두었다.
4. **AI 함수 4개를 `execute(name, input) → 글` 창구 하나 뒤에 두고, 실패는 글로 돌려준다 — 가져온다. 시점은 1-b다.**
   - 무엇을: 스케치 2처럼 `create_event`, `propose_event`, `propose_task`, `ask_completion` 을 같은 인터페이스로 만들고 Hilt `@IntoSet` 으로 모은다. 캘린더 쓰기가 실패하면 예외 대신 "무엇이 왜 안 됐는지"를 글로 LLM에 돌려준다.
   - 왜: 원문의 "창구는 오래 가고 구현은 바뀐다"다. Aide는 제공자 1곳으로 시작해 나중에 늘리고(2026-10-12 보강 결정), Koog를 쓸지 아직 모른다(2026-10-08 결정). 도구 쪽 창구를 하나로 두면 LLM을 부르는 쪽을 바꿔도 도구 코드는 그대로다.
5. **사용자 API 키는 LLM이 닿을 수 있는 어떤 곳에도 나오지 않게 한다 — 가져온다. 시점은 1-b다.**
   - 무엇을: 키는 Keystore에서 LLM 요청을 만드는 코드만 꺼낸다. 도구 결과, 이벤트 기록, 오류 글, 로그에 키나 키의 일부가 나오지 않게 하고, 설정을 읽는 도구는 만들지 않는다.
   - 왜: 원문이 권한을 좁게 주는 대신 "닿지 않게" 한 것과 같다. 1-b AI는 사용자의 일정 제목과 할 일을 읽는다. 다른 앱에서 만든 일정 제목에 숨긴 지시가 있어도(프롬프트 주입), LLM이 읽을 수 있는 곳에 키가 없으면 키를 빼낼 수 없다.
   - 2차의 GitHub 토큰(personal-docs `aide` 브랜치를 읽고 쓰는 토큰, 2026-10-08 결정)도 같은 규칙을 따른다. 그 토큰은 repo 전체 권한이라 더 중요하다.
6. **틀에 넣는 우회책은 "어느 모델 때문에 넣었는지"를 함께 적는다 — 가져온다. 시점은 1-b다.**
   - 무엇을: 특정 모델이 날짜를 자꾸 틀려서 프롬프트에 규칙을 더하는 식의 우회책을 넣을 때, 코드 옆이 아니라 결정 기록에 어떤 제공자와 모델 때문인지 적는다.
   - 왜: 원문의 "컨텍스트 불안" 사례처럼 모델이 바뀌면 우회책이 짐이 된다. Aide는 사용자가 제공자를 고르므로 한 우회책이 어떤 모델에는 필요하고 어떤 모델에는 해가 될 수 있다. (Aide는 코드에 주석을 달지 않으므로(2026-10-28 결정), 적는 곳은 결정 기록이다.)
7. **Managed Agents 서비스를 쓰거나, 여러 뇌와 여러 손으로 늘리기 — 지금은 안 한다.**
   - 이유 하나: Managed Agents는 Anthropic 서버에서 도는 서비스라, 쓰려면 폰 일정과 할 일을 서버 쪽 에이전트에 넘겨야 한다. 「서버 없음」 결정(2026-10-08)과 "제공자는 사용자가 고른다"는 결정에 부딪힌다.
   - 이유 둘: Aide의 손은 폰 캘린더와 Room 둘뿐이고 같은 폰 안에 있다. 손을 여러 개로 늘리거나 컨테이너를 준비하는 시간을 줄일 일이 없다.
   - 다시 볼 때: 2차에서 맥 수집기(Claude Code 플러그인)가 생기면, 맥이 또 하나의 "손"이 된다. 그때 폰의 뇌가 맥의 손을 부르는 구조를 이 글의 창구 모양으로 다시 본다.

## 출처

- 원문: [Scaling Managed Agents: Decoupling the brain from the hands](https://www.anthropic.com/research/managed-agents) — Lance Martin, Gabe Cemaj, Michael Cohen (Anthropic), 2026-04-08. 이 글은 Android Weekly에 실린 글이 아니라 사용자가 따로 골라 #752 묶음에 함께 정리한 글이다
- 원문에는 코드가 없다. 창구 이름(`execute`, `provision`, `wake`, `getSession`, `getEvents`, `emitEvent`)은 원문 본문과 표에서 가져왔고, 위 Kotlin 코드는 모두 직접 쓴 스케치다
- 원문 페이지는 "© 2026 Anthropic PBC"라 그림 4장은 원문 서버 주소를 걸고, 그림마다 무엇이 보이는지 캡션에 적었다
- 이어 읽기: [#752 효과적인 AI 에이전트 만들기](752-building-effective-agents.html), [#752 Shopify의 Reflex](752-shopify-reflex.html), [#750 ADK 다중 에이전트와 사람 승인](750-adk-multi-agent-hitl.html)
