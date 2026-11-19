---
issue: 753
date: 2026-11-15
title: Play 데이터 보안 양식을 손으로 채우지 말고 CSV로 — 코드에서 증거를 찾는 에이전트 스킬
original_title: stop filling the google play data safety form manually
url: https://www.wajahatkarim.com/2026/11/stop-filling-play-data-safety-manually
author: Wajahat Karim
tags: [Google Play, Data safety, AI 에이전트, 출시]
aide:
  status: candidate
  module: app
  task: Task 17
  summary: 1-a는 인터넷이 없어 "수집 없음" 한 줄로 끝나므로 스킬 없이 손으로 신고한다. 대신 "권한이 있다고 수집은 아니다, 기기 밖으로 나가야 수집이다"라는 판단 기준과 신고와 개인정보처리방침을 같이 고치는 습관을 가져오고, AI가 들어오는 1-b에서 스킬을 돌려 신고서를 만든다
---

## 한 줄 요약

Google Play에 앱을 올리려면 Play Console의 **데이터 보안(Data safety)** 양식을 채워야 한다. 앱이 어떤 데이터를 모으는지, 남과 나누는지, 왜 모으는지, 암호화하는지, 지울 수 있는지를 데이터 종류마다 따로 답하는 양식이고, 화면이 10장이 넘는다. 저자 Wajahat Karim은 이 양식을 손으로 클릭하지 않아도 된다고 말한다. 같은 화면에 **CSV 가져오기(Import from CSV)** 버튼이 있어서 파일 하나로 한 번에 채울 수 있다. 문제는 그 CSV가 약 780줄짜리이고 형식 검사가 아주 까다롭다는 것이다. 그래서 저자는 앱의 Gradle 의존성, 권한, 코드를 읽고, SDK 36개가 무엇을 모으는지 적은 표와 맞춰 보고, 코드로 알 수 없는 것만 묻고, Play가 받아 주는 CSV를 써 주는 AI 에이전트 스킬 **play-data-safety** 를 만들어 MIT 라이선스로 공개했다. 핵심 설계는 "SDK가 무엇을 모으는지는 AI가 기억으로 답하지 않고, 공급사 문서에서 옮긴 표가 답한다"이다.

> 원문은 짧은 블로그 글이고, 원문의 코드는 설치 명령 한 줄이다. 원문이 소개하는 스킬 저장소 [play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill)은 MIT 라이선스라서, 스킬이 실제로 어떻게 움직이는지 보여 주려고 저장소의 파일 몇 곳을 인용하고 블록마다 출처를 적었다. 원문 그림은 표지 1장이고, 같은 저장소에 있는 파일이라 원문 서버 주소를 걸어 보여 준다. "코드로 보기" 절의 Aide 신고서는 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **데이터 보안(Data safety) 양식**: Play Console에서 앱마다 채우는 개인정보 신고서다. 여기 적은 내용이 Play 스토어 앱 페이지의 "데이터 보안" 칸에 그대로 보인다. iOS App Store의 개인정보 라벨(Privacy Nutrition Label)과 같은 역할이다.
- **수집(collected)**: Play의 뜻으로는 데이터가 **기기 밖으로 나가는 것**이다. 기기 안에서만 쓰고 끝나면 권한이 있어도 수집이 아니다.
- **공유(shared)**: 데이터를 제3자가 **자기 목적으로** 쓰게 넘기는 것이다. 광고 회사나 설치 경로 추적(attribution) 회사로 보내는 것이 공유다. 개발자 대신 일을 처리해 주는 업체로 보내는 것은 공유가 아니다.
- **서비스 제공자(service provider)**: 개발자를 대신해 데이터를 처리해 주는 업체다. Firebase, Sentry, RevenueCat, Supabase 같은 곳이다. 이 업체로 보내는 것은 Play 기준으로 "수집"이지만 "공유"는 아니다.
- **일시적 처리(processed ephemerally)**: 데이터를 메모리에서만 쓰고 어디에도 저장하거나 기록하지 않는 것이다. 거의 모든 경우 답은 "아니요"다.
- **CSV**: 쉼표로 칸을 나눈 글자 파일이다. 엑셀 표를 글자로 적은 것이라고 보면 된다. Play의 데이터 보안 CSV는 한 줄이 질문 하나에 대한 답 하나다.
- **기계용 ID(machine id)**: CSV 각 줄의 질문 이름이다. `PSL_DATA_USAGE_RESPONSES` 처럼 사람이 아니라 프로그램이 읽으라고 붙인 이름이다.
- **SDK**: 앱에 넣어 쓰는 남이 만든 라이브러리다. 여기서는 특히 분석, 광고, 오류 보고, 결제, 로그인처럼 데이터를 바깥으로 보내는 라이브러리를 말한다.
- **전이 의존성(transitive dependency)**: 내가 직접 넣지 않았는데, 내가 넣은 라이브러리가 끌고 들어온 라이브러리다. `build.gradle.kts`만 봐서는 보이지 않고 Gradle에 물어봐야 나온다.
- **에이전트 스킬(agent skill)**: Claude Code, Gemini, Codex, Cursor 같은 AI 코딩 에이전트에게 특정 일의 순서와 규칙을 알려 주는 설명 파일 묶음이다. 보통 `SKILL.md` 파일 하나와 도우미 스크립트로 이루어진다.
- **JDK 17**: Java 개발 도구 17판이다. Android 앱을 빌드하는 PC에는 이미 깔려 있다. 이 스킬의 스크립트는 Java 파일이라 이것만 있으면 돈다.
- **CI(지속적 통합)**: 코드를 올릴 때마다 빌드와 검사를 자동으로 돌리는 장치다. GitHub Actions가 대표적이다.

## 서론 — 10장이 넘는 양식과 숨은 CSV 버튼

**무엇이 귀찮은가**
- Google Play에 앱을 한 번이라도 올려 봤다면 데이터 보안 양식을 안다. 10장이 넘는 화면에서 앱이 모으는 데이터 종류를 하나하나 신고한다.
- 데이터 종류마다 같은 질문을 또 받는다. 공유하는가, 왜 모으는가, 암호화하는가, 사용자가 지울 수 있는가. 저자는 이 흐름을 "끔찍하고 짜증 나는 화면 흐름"이라고 부른다.

**잘 모르는 버튼**
- 데이터 보안 페이지에는 **CSV에서 가져오기** 버튼이 있다. 파일 하나를 올리면 모든 양식이 한 번에 채워진다.

**그런데 CSV가 까다롭다**
- 그 CSV는 약 780줄이고, 각 줄이 `PSL_DATA_USAGE_RESPONSES` 같은 기계용 ID다. 이 글을 쓰며 받아 본 저장소의 빈 서식 파일도 머리줄을 포함해 782줄이었다.
- Play는 형식에 아주 엄격하다. 저자는 Play가 파일을 받지 않는 형식 문제를 자주 겪었다.
  - 숨겨져야 할 질문에 답하면 실패한다. 예를 들어 "you cannot answer PSL_ACCOUNT_DELETION_URL"(계정 삭제 주소 질문에는 답할 수 없다)라는 오류가 난다.
  - 답해야 할 칸을 하나 비워 두면 또 실패한다.

## 1. 먼저 NowKit용으로 만들었다

**어디서 시작했나**
- 저자는 자기 Android 앱 시작 도구 [NowKit](https://kit.shipkaro.dev)을 만들면서, Play가 요구하는 정확한 형식으로 이 CSV를 만들어 주는 명령을 넣었다. 만든 파일을 올리기만 하면 됐다.

**얼마나 써 봤나**
- 저자는 그 뒤로 자기 앱 전부에 이 명령을 썼다.
- 저자가 운영하는 [shipkaro weekend](https://1dayapp.shipkaro.dev) 과정의 수강생들도 30개가 넘는 앱 전부에 썼고, 그 앱들은 지금 Google Play에 올라가 있다.

**왜 따로 공개했나**
- 이 양식은 모든 Android 개발자가 채워야 한다. 그래서 NowKit 안에만 두지 않고 따로 떼어 오픈 소스로 공개했다.

## 2. play data safety — 무엇을 하는 스킬인가

**어떤 도구인가**
- 이름은 play data safety이고, Android 개발자를 위한 무료 에이전트 스킬이다.
- Antigravity의 Gemini, Claude Code, Codex, Cursor를 비롯해 스킬을 지원하는 AI 코딩 에이전트라면 거의 다 쓸 수 있다.
- 저장소: [github.com/wajahatkarim3/play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill)

<figure class="media"><img src="https://raw.githubusercontent.com/wajahatkarim3/play-data-safety-skill/main/docs/cover.png" alt="초록색 바탕의 표지. 왼쪽 위에 방패 아이콘과 play-data-safety, 큰 글씨로 Fill Play's Data Safety form from your code, not memory, 그 아래 작은 글씨로 A free AI agent skill for Android. It scans your code and SDKs, asks only what code can't tell, and writes the CSV Play Console imports. 맨 아래에 GitHub 주소 github.com/wajahatkarim3/play-data-safety-skill. 오른쪽에 휴대폰 화면 그림이 있고, Data safety 제목 아래에 No data shared with third parties (Firebase, RevenueCat are service providers), Collects 6 types of data (App activity, Device IDs, Crash logs and 3 more), Data is encrypted in transit, You can request data deletion 네 줄이 있다. 그 아래 검은 상자에 382 libraries scanned, 6 SDKs matched, sources cited, play_data_safety.csv written 세 줄이 체크 표시와 함께 있다" loading="lazy"><figcaption>원문 표지. 큰 제목은 "Play 데이터 보안 양식을 기억이 아니라 코드로 채운다"는 뜻이다. 오른쪽 휴대폰 그림은 스킬이 만든 결과가 Play 스토어에서 어떻게 보이는지 예로 든 것이다. 제3자와 공유하는 데이터는 없고(Firebase와 RevenueCat은 서비스 제공자), 데이터 6종류를 수집하고, 전송 중 암호화되고, 지우기를 요청할 수 있다고 나온다. 아래 검은 상자는 스킬 실행 결과 예로, 라이브러리 382개를 살폈고, SDK 6개가 표와 맞았고(출처 표시), CSV를 썼다는 뜻이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://www.wajahatkarim.com/2026/11/stop-filling-play-data-safety-manually">원문</a>, 이미지는 MIT 라이선스 저장소의 <code>docs/cover.png</code>)</figcaption></figure>

**설치는 명령 한 줄**
- Android 프로젝트 폴더에서 아래 명령 하나로 설치한다.

```bash
npx skills add wajahatkarim3/play-data-safety-skill
```

> 출처: 원문 글의 설치 명령 ([원문](https://www.wajahatkarim.com/2026/11/stop-filling-play-data-safety-manually)). 같은 명령이 [저장소 README](https://github.com/wajahatkarim3/play-data-safety-skill)(MIT)에도 있다.

- `npx skills add`: 에이전트 스킬을 설치해 주는 npm 도구로 GitHub 저장소의 스킬을 받아 온다.
- `wajahatkarim3/play-data-safety-skill`: 받아 올 GitHub 저장소 이름이다.

**에이전트에게 말하면 일어나는 일**
- 설치한 뒤 에이전트에게 "fill my play data safety form"(내 Play 데이터 보안 양식을 채워 줘)라고 말하면 다섯 단계가 돈다.
  - **라이브러리를 전부 찾는다.** 프로젝트의 Gradle을 직접 돌려서, 개발자가 직접 넣지 않은 전이 의존성까지 모든 라이브러리를 찾는다.
  - **권한과 코드를 읽는다.** 매니페스트의 권한을 읽고, 위치, 카메라, 오디오, 네트워크 호출 같은 것이 코드에 있는지 훑는다.
  - **SDK 표와 맞춰 본다.** 찾은 라이브러리를 SDK 36개짜리 표와 맞춰 본다. 표의 SDK마다 그 공급사의 공식 문서에서 무엇을 모으는지 옮겨 적어 두었다.
  - **코드로 알 수 없는 것만 묻는다.** 예를 들어 사용자의 이메일을 결제 SDK에 넘기는지는 코드만으로 확정할 수 없으니 개발자에게 묻는다.
  - **CSV를 쓴다.** 개발자는 그 파일을 Play Console에 올리기만 하면 된다.

**필요 없는 것**
- 앱 코드는 바꾸지 않는다. 계정도, API 키도, 돈도 필요 없다.
- JDK 17만 있으면 된다. Android 앱을 빌드하는 PC라면 이미 있다.

## 3. 저자 자기 앱에서도 실수를 찾았다

**놓친 데이터 종류**
- 저자는 이미 양식을 제출해 둔 자기 앱 하나에 이 스킬을 돌려 봤다. 스킬은 저자가 빠뜨린 데이터 종류를 하나 찾아냈다.
- 그 앱은 분석 SDK PostHog의 `PostHog.identify()`에 사용자 ID를 넘기고 있었다. 이 말은 사용자 ID를 수집한다는 뜻인데, 제출한 양식에는 그 내용이 없었다.

**쓸데없는 질문은 건너뛰었다**
- 매니페스트에는 카메라, 연락처, 마이크처럼 무서워 보이는 권한이 9개 있었다. 그런데 전부 주석 처리(`<!-- -->`로 막아서 실제로는 꺼진 상태)되어 있었다.
- 스킬은 이 9개를 건너뛰었다. 그래서 의미 없는 질문을 하지 않았다.

PostHog 사용자 ID를 찾아낸 근거는 저장소의 SDK 표에 있다. PostHog 항목은 PostHog가 늘 모으는 것과, 개발자에게 물어야 하는 것을 나눠 적는다.

```json
{
  "id": "posthog",
  "name": "PostHog Android SDK",
  "match": ["com.posthog:posthog-android"],
  "role": "service-provider",
  "ask": [
    "Do you call PostHog.identify() with your own user ID? If yes, also declare Personal info / User IDs."
  ],
  "sources": [
    {
      "url": "https://posthog.com/docs/libraries/android",
      "title": "Android - Docs - PostHog",
      "checked": "2026-11-13"
    }
  ],
  "confidence": "medium"
}
```

> 출처: `skills/play-data-safety/sdks/posthog.json` 일부 ([play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill/blob/main/skills/play-data-safety/sdks/posthog.json), MIT). `dataTypes` 목록과 나머지 `ask` 4개, `notes`는 줄였다.

- `match`: 의존성 목록에 `com.posthog:posthog-android`가 있으면 이 항목이 맞는 것으로 본다. 버전은 적지 않는다.
- `role: "service-provider"`: PostHog는 개발자 대신 데이터를 처리하는 서비스 제공자로 본다. 그래서 PostHog로 보내는 데이터는 "수집"이지만 "공유"는 아니다.
- `ask`: 코드만 봐서는 확정할 수 없어 에이전트가 개발자에게 꼭 물어야 하는 질문이다. 첫 질문이 바로 "`PostHog.identify()`에 사용자 ID를 넘기는가, 그렇다면 Personal info / User IDs도 신고하라"이다. 저자 앱에서 찾은 실수가 이 질문에서 나왔다.
- `sources`: 이 내용을 옮겨 온 공급사 문서 주소와, 그 문서를 읽은 날짜(`checked`, 2026-11-13)다.
- `confidence: "medium"`: PostHog는 Play 데이터 보안용 안내서를 따로 내지 않아서, SDK 문서에서 옮겼다는 뜻이다. 공급사가 Play용 안내서를 내면 `high`, 짐작이 섞이면 `low`다.
- 실제 파일의 `dataTypes`에는 PostHog가 기본으로 늘 모으는 두 가지가 있다. 하나는 앱 실행, 화면 이동 같은 App activity / App interactions이고, 다른 하나는 `identify()` 전까지 쓰는 무작위 익명 ID인 Device or other IDs다.

## 4. 그냥 AI에게 채워 달라고 하면 안 되나

**AI는 짐작한다**
- 아무 모델에게나 Crashlytics가 무엇을 모으느냐고 물으면 아주 자신 있게 답한다. 하지만 그 답은 1년쯤 지났을 수도 있는 학습 데이터에서 나온다.

**그래서 역할을 나눴다**
- 이 스킬은 SDK가 무엇을 모으는지를 에이전트가 정하게 두지 않는다. 그 답은 표에서 나오고, 표에는 공급사 문서 링크와 확인한 날짜가 붙어 있다.
- 저자 말로 "에이전트는 대화를 맡고, 표는 사실을 맡는다".

저장소의 `SKILL.md`는 이 역할 나누기를 에이전트가 지켜야 할 규칙으로 적어 두었다. 다섯 규칙 가운데 앞의 세 개다.

```markdown
1. **Never declare what an SDK collects from your own knowledge.** Use only `SKILL_DIR/sdks/*.json`
   (each entry cites the vendor's page). If a library isn't in the table, tell the developer and
   look up the vendor's own Data safety page with them. Do not guess.
2. **A permission or API call is a question, not a declaration.** Play only counts data that
   **leaves the device**. Camera used for an on-device filter is not collected; a photo uploaded to
   a server is.
3. **"Shared" has a narrow meaning.** Sending data to a *service provider* that processes it on the
   developer's behalf (Firebase, Sentry, RevenueCat, Supabase…) is **not** sharing. Sending it to a
   party that uses it for its own purposes (ad and attribution networks) **is**. Follow each SDK
   entry's `shared` and `role`; when unsure, ask.
```

> 출처: `skills/play-data-safety/SKILL.md` 의 "Rules that matter more than speed" 1~3번 ([play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill/blob/main/skills/play-data-safety/SKILL.md), MIT)

- **1번 규칙**: SDK가 무엇을 모으는지 에이전트가 자기 지식으로 신고하지 않는다. `sdks/*.json` 표만 쓴다. 표에 없는 라이브러리면 개발자에게 알리고, 공급사의 데이터 보안 안내 페이지를 함께 찾아본다. 짐작하지 않는다.
- **2번 규칙**: 권한이나 API 호출은 신고 내용이 아니라 질문거리다. Play는 기기 밖으로 나가는 데이터만 센다. 기기 안에서 필터를 입히려고 카메라를 쓰면 수집이 아니다. 찍은 사진을 서버에 올리면 수집이다.
- **3번 규칙**: "공유"는 좁은 뜻이다. 개발자 대신 처리하는 서비스 제공자(Firebase, Sentry, RevenueCat, Supabase 등)로 보내는 것은 공유가 아니다. 광고 회사와 설치 경로 추적 회사처럼 자기 목적으로 쓰는 곳으로 보내는 것은 공유다. 헷갈리면 묻는다.
- 나머지 두 규칙은 "한 번에 한 주제씩 묻고 답을 기다린다"와 "이것은 개발자가 확인할 초안이지 법률 조언이 아니라고 처음에 한 번 말한다"이다.

**그래도 초안이다**
- 저자도 제출 전에 직접 읽어 봐야 하는 초안이고 법률 조언이 아니라고 적는다. 다만 모든 답 뒤에 근거가 있는 초안이다.

## 5. 별을 눌러 달라

- 이 스킬 덕분에 양식을 한 번이라도 덜 채웠다면 GitHub에서 별을 눌러 달라고 한다. 다른 Android 개발자가 찾기 쉬워진다.
- 앱이 쓰는 SDK가 아직 표에 없으면 PR(풀 리퀘스트, 고친 내용을 저장소에 넣어 달라는 요청)을 환영한다고 한다.
- 다음에 Play Console이 데이터 보안 흐름을 열면, 양식을 건너뛰고 CSV를 올리라는 말로 글을 맺는다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문 스킬은 에이전트가 먼저 사람이 읽는 신고서 `play-data-safety/play_data_safety.md`를 쓰고, 그 파일을 Java 스크립트 `DataSafetyCsv.java`가 읽어 CSV로 바꾸는 순서로 움직인다. 아래는 그 신고서 형식에 맞춰 Aide의 두 시점을 직접 써 본 것이다. 둘 다 **직접 쓴 스케치**이고, 스킬을 실제로 돌려 만든 결과가 아니다.

### 1) 지금 Aide가 기기 밖으로 내보내는 것

Aide 저장소(최신 커밋 `31ad4dc`)에서 확인한 사실은 이렇다.
- 매니페스트 권한은 `core:calendar`의 `READ_CALENDAR` 하나다. `INTERNET` 권한이 없다. 1-a 계획도 "인터넷 권한을 넣지 않는다"고 정해 두었다.
- 라이브러리 목록(`gradle/libs.versions.toml`)에는 분석, 광고, 오류 보고, 로그인 SDK가 없다. 있는 것은 AndroidX, Room, DataStore, Hilt, Timber, 테스트 도구이고, LeakCanary는 디버그 빌드 전용이다.

원문 2번 규칙(권한은 질문거리이고, 기기 밖으로 나가야 수집이다)에 비춰 보면 이렇게 판단된다.
- **캘린더 일정**: `READ_CALENDAR`로 읽지만 기기 안에서 화면과 알림에만 쓰고 밖으로 보내지 않는다. 수집이 아니다.
- **할 일**: Room 데이터베이스(기기 안 저장소)에만 둔다. 수집이 아니다.
- **인터넷 권한이 없다**: 앱이 아예 바깥으로 데이터를 보낼 수 없다.
- 그래서 1-a의 답은 맨 첫 질문 "앱이 사용자 데이터를 수집하거나 공유하는가?"에 "아니요" 하나다.

### 2) 1-b에서 AI가 들어오면 — 신고서 스케치

1-b에는 사용자가 넣은 자기 API 키로 AI 제공자 1곳과 대화하는 기능이 들어온다(결정 기록 "1-b AI"). 그러면 사용자가 쓴 글과 일정이 기기 밖으로 나간다. 원문 스킬의 신고서 형식으로 쓰면 아래와 비슷할 것이다.

```markdown
# Play Data Safety — Aide

## Data collection and security

- **Does your app collect or share any of the required user data types?** Yes
- **Is all of the user data collected by your app encrypted in transit?** Yes
- **Do you provide a way for users to request that their data is deleted?** Yes
- **Data deletion URL:** https://<개인정보처리방침 페이지>/delete
- **Account creation method:** None
- **Accounts created outside the app:** No

## Data types collected

| Data type | Collected | Processed ephemerally | Required, or users choose | Shared | Purpose | Source |
|---|---|---|---|---|---|---|
| App activity / Other user-generated content | Yes | No | Users can choose whether this data is collected | No | App functionality | AI 대화 입력 글 (사용자 키로 AI 제공자에게 보냄) |
| Calendar / Calendar events | Yes | No | Users can choose whether this data is collected | No | App functionality | 아침 브리핑 (오늘 일정을 AI 제공자에게 보냄) |

## Not collected

- Contacts / Contacts — 연락처 권한과 코드가 없다
```

- `Does your app collect or share …? Yes`: 1-b부터는 AI 제공자에게 글이 나가므로 "예"로 바뀐다.
- `Account creation method: None`: Aide에는 회원 가입이 없다. 사용자는 앱 안에 자기 AI 키만 넣는다.
- `Data deletion URL`: 원문 스킬의 CSV 생성기는 이 주소가 비어 있으면 실패하게 짜여 있다(아래 3번에서 설명). 주소는 Task 17에서 만들 개인정보처리방침 페이지를 쓰는 모양으로 비워 두었다.
- `App activity / Other user-generated content`: 사용자가 입력 막대에 친 글이다. 원문 스킬 규칙대로 AI 제공자는 개발자 대신 처리하는 서비스 제공자로 보고 `Shared`는 `No`로 두었다. 다만 AI 제공자가 받은 글을 자기 목적(모델 학습 등)에 쓰는지는 그 제공자의 약관을 보고 확인해야 한다. 이 칸이 가장 짐작이 섞인 칸이다.
- `Required, or users choose`: 결정 기록에 "AI 기능은 키가 있어야 켜진다"고 되어 있다. 키를 넣지 않으면 아무것도 나가지 않으니 "사용자가 고를 수 있다"로 적었다.
- 사용자가 말로 일정을 만들게 되면 `Audio files / Voice or sound recordings` 줄이 더 필요할 수 있다. 녹음을 기기 안에서 글자로 바꾸고 글자만 보내면 녹음은 수집이 아니다. 녹음 자체를 AI 제공자에게 보내면 수집이다. 원문 2번 규칙이 바로 이 경우다.

### 3) 원문 생성기가 "수집 없음" 앱에서 막히는 곳

1-a처럼 아무것도 수집하지 않는 앱에 원문 스킬을 그대로 쓸 수 있는지 보려고 `DataSafetyCsv.java`를 읽었다. 마지막 검사에 이런 줄이 있다.

```java
if (datUrl == null || datUrl.isBlank()) fail("PSL_DATA_DELETION_URL is empty (Play rejects the import)");
if (md.acm.isEmpty()) fail("no account-creation method resolved from the .md");
```

> 출처: `skills/play-data-safety/scripts/DataSafetyCsv.java` 의 "Mandatory self-check" 부분 ([play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill/blob/main/skills/play-data-safety/scripts/DataSafetyCsv.java), MIT)

- 첫 줄: 데이터 지우기 주소(`PSL_DATA_DELETION_URL`)가 비어 있으면 CSV를 쓰지 않고 실패한다. 주석에는 "Play가 가져오기를 거부한다"고 적혀 있다.
- 둘째 줄: 계정 만드는 방법(`Account creation method`)이 하나도 정해지지 않으면 실패한다.
- 이 검사는 "수집하는가"의 답과 상관없이 늘 돈다. 그래서 1-a처럼 수집이 없는 앱도 지우기 주소를 하나 적어야 이 생성기를 통과한다.
- 이 판단은 코드를 읽고 한 것이다. 스킬을 실제로 돌려 보지는 않았다. "수집 없음" 앱에서 Play가 정말 이 주소를 요구하는지도 확인하지 않았다.

## 배운 점

- **양식 화면 뒤에 CSV 가져오기가 있다.** 10장이 넘는 화면을 클릭하지 않고 파일 하나로 채울 수 있다. 다만 780줄쯤 되는 CSV는 손으로 맞추기 어렵고, 숨은 질문에 답하거나 필요한 칸을 비우면 Play가 거부한다.
- **권한이 있다고 수집이 아니다.** Play는 기기 밖으로 나가는 데이터만 센다. 카메라 권한이 있어도 사진을 기기 안에서만 쓰면 수집이 아니다. 거꾸로 권한이 하나도 없어도, SDK가 기기 ID를 서버로 보내면 수집이다.
- **"공유"는 좁은 말이다.** Firebase나 Sentry 같은 서비스 제공자로 보내는 것은 수집이지만 공유가 아니다. 광고 회사와 설치 경로 추적 회사로 보내면 공유다.
- **사실은 표가, 대화는 AI가 맡는다.** AI에게 "이 SDK가 뭘 모으냐"고 물으면 오래된 기억으로 자신 있게 틀릴 수 있다. 공급사 문서 주소와 확인 날짜를 붙인 표를 따로 두고, AI는 그 표를 읽고 사람에게 물어보는 일만 하게 나누면 근거 있는 답이 된다.
- **이미 낸 신고서도 틀릴 수 있다.** 저자도 `PostHog.identify()`에 사용자 ID를 넘기는 것을 놓쳤다. SDK를 넣거나 빼거나, 그 SDK에 새 값을 넘길 때마다 신고서를 다시 봐야 한다. 원문 스킬은 이 일을 CI 검사로 돌리는 방법도 준다.
- **신고서와 개인정보처리방침은 같은 말을 해야 한다.** 원문 스킬의 마지막 단계도 "개인정보처리방침이 같은 데이터를 설명해야 한다"고 알려 준다.

## Aide에 적용하면

Aide 1-a 계획의 Task 17(내부 테스트 트랙 배포)과 결정 기록(`decisions.md`)을 함께 읽고 정리했다. Task 17 Step 2에는 이미 "데이터 보안 신고(수집 없음)"가 들어 있고, 같은 Task에서 "수집하는 정보 없음, 캘린더와 할 일은 기기 안에만, 인터넷을 쓰지 않음"이라는 개인정보처리방침 페이지를 만든다.

| # | 원문에서 가져올 것 | 판단 | Aide에서 어떻게 |
|---|---|---|---|
| 1 | 스킬로 CSV를 만들어 올린다 | **지금은 안 한다** | 1-a의 Aide는 `INTERNET` 권한이 없고 데이터를 보내는 SDK도 없어서, 데이터 보안 양식이 첫 질문 "수집하거나 공유하는가"에 "아니요"를 고르는 것으로 끝난다. 780줄 CSV가 필요한 상황이 아니다. 게다가 원문 생성기는 수집이 없어도 데이터 지우기 주소가 비면 실패하게 짜여 있어서(위 스케치 3번), 1-a에 쓰려면 필요 없을 수 있는 주소를 일부러 만들어야 한다. Task 17은 계획대로 손으로 신고한다. |
| 2 | 권한은 질문거리이고, 기기 밖으로 나가야 수집이다 | **가져온다 (Task 17)** | Task 17 Step 2에서 "수집 없음"을 고를 때 이 기준으로 확인한다. `READ_CALENDAR`로 읽은 일정과 Room에 둔 할 일은 기기 밖으로 나가지 않으므로 수집이 아니다. 같은 Step의 캘린더 권한 사유와 정확한 알람 권한 사유에도 "기기 안에서만 쓴다"는 같은 말을 쓰면 신고서와 권한 사유가 서로 어긋나지 않는다. |
| 3 | 신고서와 개인정보처리방침을 같이 고친다 | **가져온다 (1-b 계획에 넣기)** | Task 17의 개인정보처리방침은 "인터넷을 쓰지 않음"이라고 적는다. 1-b에서 AI 대화와 아침 브리핑이 들어오면 사용자가 쓴 글과 오늘 일정이 사용자 키로 AI 제공자에게 나가므로, 이 문장과 데이터 보안 신고가 둘 다 틀린 말이 된다. 그래서 1-b 계획의 "스토어 출시 준비" 항목에 "개인정보처리방침과 데이터 보안 신고를 함께 고친다"를 넣는다. 1-b 계획 문서에 실제로 적는 일은 사용자가 정한다. |
| 4 | 1-b에서 스킬을 돌려 신고서 초안을 만든다 | **바꿔서 가져온다 (1-b)** | 원문 스킬의 SDK 표는 분석, 광고, 결제 SDK 위주라서, 사용자가 고른 AI 제공자에게 직접 HTTP로 보내는 Aide의 방식은 표로 알아낼 수 없다. 그 부분은 스킬의 "호스트(hosts)와 네트워크 호출" 질문 단계에서 사람이 답해야 한다. 그래서 스킬은 "놓친 SDK가 없는지 확인하고 CSV 형식을 맞추는 도구"로 쓰고, AI 제공자 줄은 위 스케치 2번처럼 직접 판단한다. AI 제공자가 받은 글을 자기 목적에 쓰는지(공유 여부)는 그 제공자 약관으로 확인한다. 남의 스킬을 설치해 돌리는 것이므로 돌릴지는 사용자가 정한다. |
| 5 | SDK를 넣으면 CI에서 신고서를 검사한다 | **지금은 안 한다** | 원문 스킬은 `Scan.java … --check` 로, 아는 SDK가 신고서에 없는 데이터를 모으면 빌드를 실패시키는 CI 검사를 준다. 지금 Aide에는 데이터를 보내는 SDK가 하나도 없어서 검사할 것이 없다. 나중에 오류 보고 SDK(예: Crashlytics)처럼 표에 있는 SDK를 넣게 되면, 그때 CI에 붙인다. |

## 출처

- 원문: Wajahat Karim, [stop filling the google play data safety form manually](https://www.wajahatkarim.com/2026/11/stop-filling-play-data-safety-manually), 2026-11-13. 원문 글에는 라이선스 표시가 없어 설명은 내 말로 다시 썼다.
- 원문이 실린 곳: [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 스킬 저장소: [wajahatkarim3/play-data-safety-skill](https://github.com/wajahatkarim3/play-data-safety-skill) (MIT). 인용한 파일은 `skills/play-data-safety/SKILL.md`, `skills/play-data-safety/sdks/posthog.json`, `skills/play-data-safety/scripts/DataSafetyCsv.java`이고, 표지 그림은 `docs/cover.png`를 원문 서버 주소로 걸었다.
- 원문이 언급한 곳: [NowKit](https://kit.shipkaro.dev), [shipkaro weekend](https://1dayapp.shipkaro.dev)
- Aide 코드: Aide-Android `core/calendar/src/main/AndroidManifest.xml`, `gradle/libs.versions.toml` (최신 커밋 `31ad4dc`에서 읽기만 함)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 1-a와 1-b 범위, AI 키 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 17
