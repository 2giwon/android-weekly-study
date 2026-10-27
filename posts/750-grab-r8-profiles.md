---
issue: 750
date: 2026-10-25
title: Grab은 R8과 프로필 최적화로 ANR을 32%, 시작 시간을 35% 줄였다
original_title: "Grab Reduces ANRs by 32% and improves startup time by 35% with R8 and Profile guided optimization"
url: https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time
author: Ajesh Pai · Nguyen Van Minh · Tracy Agyemang
tags: [R8, Baseline Profile, 성능, 앱 크기, 빌드]
aide:
  status: candidate
  module: app
  task: Task 17 · 최신화 PR
  summary: 지금 꺼 둔 릴리스 최적화(R8)를 출시 Task 17에서 켜고, Baseline·Startup Profile을 함께 넣는다. 설정 점수 분석기는 AGP 9.3이 필요하니 최신화 PR 뒤에 붙인다
---

## 한 줄 요약

동남아시아의 슈퍼앱 Grab이 10년 묵은 1,000만 줄짜리 Android 앱에서 **R8 최적화를 단계적으로 켜고**(호환 모드 → 전체 모드 → 유지 규칙 다듬기), **Baseline Profile과 Startup Profile을 함께 넣어** 사용자가 체감하는 ANR(앱 응답 없음)을 약 32%, 내려받기 크기를 약 30%, 콜드 스타트(앱이 완전히 꺼진 상태에서 켜는 시간)를 약 35% 줄인 사례다. 핵심은 한 번에 다 켜지 않았다는 것, 그리고 **R8이 얼마나 일할 수 있는지를 점수로 재서 CI에서 지킨다**는 것이다. Google Android 개발자 블로그의 사례 글이며 코드는 없다.

> 원문 그림 4장(표지·인용 카드·수치 카드·CI 대시보드)은 원문 서버 주소를 걸어 보여 준다. 원문에는 코드가 없으므로, 이 글의 코드는 모두 [Android 개발자 문서](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)의 설명을 따라 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **R8**: Android 빌드가 릴리스 앱을 만들 때 도는 코드 최적화 도구. 세 가지 일을 한다.
  - **축소(shrinking)**: 어디서도 부르지 않는 클래스·메서드·필드와 리소스를 지운다. "나무 흔들기(tree shaking)"라고도 한다.
  - **최적화(optimization)**: 짧은 함수를 부르는 자리에 그 몸체를 바로 끼워 넣거나(인라이닝), 비슷한 클래스를 하나로 합쳐(클래스 병합) 더 빨리, 메모리를 덜 쓰게 바꾼다.
  - **난독화(obfuscation)**: `com.example.MyActivity` 같은 이름을 `a.b.a` 처럼 짧게 바꿔 DEX 파일을 줄인다.
- **ProGuard**: R8 이전에 같은 일을 하던 도구. 지금은 R8이 대신하지만, 설정 파일 이름(`proguard-rules.pro`, `proguard-android-optimize.txt`)과 규칙 문법은 그대로 남아 있다.
- **`proguard-android-optimize.txt`**: Android Gradle Plugin(AGP)이 주는 기본 규칙 파일. 이름에 `optimize` 가 없는 옛 기본 파일(`proguard-android.txt`)은 최적화를 끈다. Grab의 1단계가 바로 이 파일을 바꾼 것이다.
- **호환 모드(compat mode)와 전체 모드(full mode)**: R8의 두 동작 방식. 호환 모드는 예전 ProGuard처럼 조심스럽게 지운다. 전체 모드는 더 과감하게 지우고 바꿔서 효과가 크지만, 리플렉션을 쓰는 코드가 깨지기 쉽다. **AGP 8.0부터 전체 모드가 기본값**이고, `gradle.properties` 의 `android.enableR8.fullMode=false` 로 끌 수 있다.
- **유지 규칙(keep rule)**: R8에게 "이건 지우지도, 이름을 바꾸지도 마"라고 알려 주는 규칙(`-keep class …`). 넓게 쓸수록 안전하지만 R8이 할 수 있는 일이 줄어든다.
- **리플렉션(reflection)**: 실행 중에 클래스 이름을 글자로 찾아 쓰는 기법. R8은 컴파일할 때 코드만 보고 판단하므로, 글자로만 불리는 클래스는 "아무도 안 쓴다"고 보고 지우거나 이름을 바꾼다. 그러면 실행 중에 앱이 죽는다.
- **동적 프록시(dynamic proxy)**: Java의 리플렉션 기능으로, 인터페이스의 구현체를 실행 중에 만들어 낸다. Retrofit이 API 인터페이스를 구현하는 방식이 대표적이다.
- **DEX 파일**: Android 기기가 실행하는 코드 묶음. 앱이 커지면 `classes.dex`, `classes2.dex` … 여러 개로 나뉜다. 시작할 때 여러 DEX를 읽을수록 느려진다.
- **ANR(Application Not Responding)**: 메인 스레드가 5초 넘게 막혀 "앱이 응답하지 않습니다" 창이 뜨는 것. Google Play는 **사용자가 체감한 ANR 비율**을 앱 품질 지표로 본다.
- **JIT·AOT 컴파일**: Android 런타임(ART)은 처음엔 코드를 한 줄씩 해석하거나 실행 중에 기계어로 바꾸고(JIT), 기기가 쉬는 동안 자주 쓰는 코드를 미리 기계어로 바꿔 둔다(AOT). 설치 직후에는 AOT가 아직 안 돼 있어 느리다.
- **Baseline Profile**: "이 코드 경로는 설치하자마자 미리 기계어로 바꿔 두라"는 목록 파일(`baseline-prof.txt`). 앱과 함께 배포된다. 공식 문서는 첫 실행부터 약 30% 빨라진다고 말한다.
- **Cloud Profile**: Google Play가 여러 사용자의 실제 사용 기록을 모아 만들어 새 설치자에게 나눠 주는 프로필. 모든 사람이 흔히 지나는 경로만 담기므로, 앱마다 중요한 경로가 빠질 수 있다.
- **Startup Profile**: Baseline Profile의 일부로, 빌드할 때 **시작에 필요한 코드를 첫 DEX 파일(`classes.dex`)에 모아 배치**하게 한다(DEX 레이아웃 최적화). R8이 켜져 있어야 동작한다. 공식 문서는 Baseline Profile만 쓸 때보다 시작이 15~30% 더 빨라진다고 말한다.
- **R8 Configuration Analyzer**: 내 유지 규칙 때문에 R8이 코드의 몇 %를 줄이고·최적화하고·난독화할 수 있는지 점수로 보여 주는 HTML 보고서. **AGP 9.3.0 이상**에서 `analyzeReleaseR8Config` 작업으로 만든다.
- **mapping.txt**: 난독화 전 이름과 후 이름의 대응표. 이게 있어야 `a.b.a` 로 찍힌 충돌 기록을 원래 이름으로 되돌려 읽을 수 있다.
- **Bazel**: Google이 만든 빌드 도구. Grab은 디버그 빌드는 Bazel로, R8을 쓰는 릴리스 빌드는 Gradle로 하는 혼합 구조다.

## 서론 — 10년 된 슈퍼앱의 세 가지 문제

<figure class="media"><img src="https://developer.android.com/static/blog/assets/ANDDM_Grab_Strapi_2000x1000_STATIC_1_dbb884ce74_22df0m.webp" alt="왼쪽에 연두색 강조로 Grab Reduces ANRs by 32% and improves startup time by 35% with R8 and Profile guided optimization 문구, 오른쪽에 Grab 앱 첫 화면이 떠 있는 휴대폰. 화면에는 검색창, 잔액 50.20, 포인트 95,544, Invest·Food·Loans·Mart·Express·Transport·Gift Cards·More 아이콘이 있다" loading="lazy"><figcaption>원문 표지. "ANR 32% 감소, 시작 시간 35% 개선"을 크게 쓰고, 옆에 투자·음식·대출·장보기·택배·교통 같은 서비스가 한 화면에 모인 Grab 앱 첫 화면을 보여 준다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time">원문</a>)</figcaption></figure>

- **Grab은 동남아시아 여덟 나라에서 배달·이동·금융을 앱 하나로 제공하는 슈퍼앱이다.**
  - 코드베이스는 10년 됐고, 1,000만 줄이 넘으며, 제3자 라이브러리가 수백 개다. 빌드는 Bazel과 Gradle을 섞어 쓴다.
- **세 가지 문제가 점점 커지고 있었다.**
  - ANR 비율이 높았다.
  - 서비스가 늘 때마다 앱 크기가 계속 커졌다.
  - 시작 시간이 해마다 조금씩 느려졌다.
- **해결책은 R8 최적화 켜기, 유지 규칙 다듬기, Baseline Profile과 Startup Profile 넣기였다.**
  - 결과: 사용자 체감 ANR 32% 감소, 내려받기 크기 약 30% 감소, 시작 시간 35% 개선.

## 1. 출시 직후 ANR이 치솟던 문제를 없애다

- **증상 — 새 버전을 낼 때마다 콜드 스타트가 느려지고 ANR이 치솟았다.**
  - 주 원인은 앱이 시작하면서 **DEX 파일 여러 개를 읽는 부담**이었다.

<figure class="media"><img src="https://developer.android.com/static/blog/assets/ANDDM_Grab_Inline_Quote_ALT_c3acc32799_Z1obrOp.webp" alt="연두색 배경의 인용 카드. 왼쪽 흰 상자에 We consistently experienced ANR rate spikes with every weekly app release, Nguyen Van Minh, Lead Software Engineer, Grab. 오른쪽에 산을 배경으로 선 노란 재킷 차림의 인물 사진" loading="lazy"><figcaption>인용 카드. Grab 승객 앱 코어 팀의 리드 엔지니어 Nguyen Van Minh은 "매주 앱을 낼 때마다 ANR 비율이 치솟았다"고 말한다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time">원문</a>)</figcaption></figure>

- **왜 Cloud Profile만으로는 부족했나 — Grab에 중요한 경로가 빠져 있었다.**
  - Google Play의 Cloud Profile은 전체 사용자에게 흔한 경로는 최적화해 주지만, Grab의 핵심 사용자 여정(critical user journey)에 필요한 초기화 경로를 다 담지는 못했다. 예를 들어 **앱 시작 때 Dagger 의존성 그래프(객체를 만들어 이어 주는 설계도)를 초기화하는 코드**가 그랬다.
  - 빠진 경로는 처음엔 JIT로 돌고, 며칠에 걸쳐 기기가 쉬는 동안 조금씩 AOT로 바뀌었다. 매주 새 버전이 나오니 **사용자는 늘 "덜 최적화된 상태"** 에 있었던 셈이다.
- **해결 — 직접 만든 Baseline Profile을 넣는다.**
  - 이 프로필이 Cloud Profile에 핵심 여정을 더해, 그 경로들이 **설치 즉시** 기계어로 컴파일되게 했다.
- **결과 — R8로 12%, Baseline Profile로 15%, 합쳐서 콜드 스타트 27% 개선.**
  - 출시 직후의 ANR 급증도 사실상 사라졌다.
- **전체 작업은 세 단계로 진행했다.**
  - ① R8 최적화를 호환 모드로 켠다 → ② R8 전체 모드로 옮긴다 → ③ Configuration Analyzer로 유지 규칙을 다듬고 CI 감시를 붙인다.

## 2. 1단계 — R8 최적화 켜기 (2025년 출시)

- **무엇을: 옛 기본 규칙 파일을 버리고 `proguard-android-optimize.txt` 로 바꿨다.**
  - 옛 파일은 최적화를 꺼 둔다. 이 파일 하나 바꾸는 것이 R8 최적화를 켜는 스위치다.
- **어려움: 10년 된 1,000만 줄 코드에는 오래된 설정과 리플렉션이 많았다.**
  - 최적화를 켜려면 그것들을 하나씩 정리해야 했다.
- **효과를 키우려고 Baseline Profile·Startup Profile을 같은 업데이트에 함께 실었다.**
  - 결과: 사용자 체감 ANR 25% 감소, 내려받기 크기 16% 감소, 콜드 스타트 27% 개선이 한 번에 나왔다.
  - Startup Profile의 DEX 배치 최적화는 R8이 켜져 있어야 동작하므로, 둘을 함께 낸 것이 자연스럽다.

## 3. 2단계 — R8 전체 모드로 옮기기 (2026년 출시)

- **첫 배포 9개월 뒤, 앱을 R8 전체 모드로 옮겼다.**
  - Retrofit·Firebase·Jetpack Compose 같은 표준 라이브러리는 **자기 안에 유지 규칙을 담아 오기 때문에** 손댈 것이 없었다.
  - 나머지 거대한 코드는 **리플렉션을 많이 쓰는 경로를 하나씩 찾아** 풀었다.
- **Gson — 최신 버전이 내놓는 소비자 유지 규칙(consumer keep rule)을 그대로 받아 썼다.**
  - 소비자 유지 규칙은 라이브러리가 "나를 쓰는 앱은 이 규칙을 지켜 달라"고 함께 배포하는 규칙이다. 최신 Gson 규칙 덕에 JSON 변환이 깨지지 않았다.
  - 참고로 공식 전체 모드 문서는, 전체 모드에서는 **유지된 클래스의 속성(attribute)만 남긴다**고 설명한다. Gson이 제네릭 타입을 알아내는 데 쓰는 `Signature` 속성이 그 예다. 호환 모드에서는 저절로 남던 것이 전체 모드에서는 명시해야 남는다.
- **동적 프록시 — 넓은 예외 대신 딱 필요한 클래스만 유지했다.**
  - 동적 프록시는 실행 중에 리플렉션으로 인터페이스 구현을 만든다. R8은 컴파일 때 이것을 볼 수 없으니 필요한 클래스를 지우거나 이름을 바꾸고, 앱은 죽는다.
  - 팀은 `-keep class com.grab.** { *; }` 같은 넓은 예외로 덮지 않았다. 그러면 앱이 다시 커진다. 대신 **리플렉션에 기대는 클래스만 골라 아주 좁은 유지 규칙**을 썼다. 안정성과 최적화 효과를 둘 다 지킨 것이다.
- **결과 — 효과가 겹겹이 쌓였다.**
  - 내려받기 크기 14% 추가 감소, 시작 시간 10% 추가 개선, 사용자 체감 ANR 10% 추가 감소.
  - 전체 모드로 옮긴 직후 R8 Configuration Analyzer 점수는 **최적화 72%, 축소 73%, 난독화 79.6%** 였다. 이 점수가 "유지 규칙을 더 다듬어야 한다"는 신호가 됐다.

## 4. 3단계 — 유지 규칙 다듬기

- **목표가 "한 번 줄이기"에서 "계속 건강하게 유지하기"로 바뀌었다.**
  - 장기적인 코드 건강, 꾸준한 성능 감시, 엄격한 빌드 관리가 목표다.
  - 릴리스가 거듭되는 동안 설정이 다시 나빠지지(회귀) 않도록, **R8 Configuration Analyzer를 평가 흐름에 넣고 있다.** 이 도구는 Grab의 유지 규칙이 R8의 축소·최적화·난독화를 얼마나 허락하는지 깊이 보여 준다.
- **오래된 유지 규칙을 차근차근 걷어 내자 세 점수가 모두 오르고 있다.**
  - 최적화 점수 72% → 78.2%
  - 축소 점수 73% → 79.1%
  - 난독화 점수 79.6% → 81.7%
- **점수만 오른 것이 아니다.**
  - 이 단계만으로 내려받기 크기가 약 3.6% 더 줄었다.
  - 더 중요한 것은, 점수를 추적하면서 **"병합 전 CI 검사"를 만들 객관적인 근거**가 생겼다는 점이다. 새 코드가 엄격한 유지 규칙 기준을 지키게 하고, 힘들게 얻은 성능이 시간이 지나도 지켜지게 하는 장치다.

## 5. 결과

R8 최적화를 단계별로 낸 뒤의 핵심 지표다.

| 최적화 단계 | ANR | 크기 | 콜드 스타트 |
|---|---|---|---|
| 1단계: R8 최적화 켜기 (2025년) | 약 25% 줄었다 | 16% 줄었다 | 약 27% 좋아졌다 |
| 2단계: R8 전체 모드 (2026년) | 10% 더 줄었다 | 14% 더 줄었다 | 10% 더 좋아졌다 |
| 유지 규칙 다듬기 | 이 단계의 수치는 원문에 없다 | 3.6% 더 줄었다 | 이 단계의 수치는 원문에 없다 |
| 전체 누적 | 약 32.5% 줄었다 | 약 30.4% 줄었다 | 약 35% 좋아졌다 |

- 표의 누적 크기 감소는 30.4%이고, 원문 결론 문단은 30.3%라고 적었다. 원문 안의 작은 차이이며, 어느 쪽이든 "약 30%"다.

## 6. 기술적인 어려움 세 가지

- **① 테스트 — 1,000만 줄을 다 시험할 수는 없었다.**
  - 10년 동안 쌓인 리플렉션이 전체 최적화에서 예외 상황을 만들었다.
  - 팀은 **좁히고 있는 유지 규칙이 덮던 코드에 집중해** 시험했다. 규칙을 조금 좁힐 때마다 그 영향이 닿는 곳만 확인하고, 리플렉션에 정말 필요한 클래스·메서드·필드만 남도록 다시 좁혔다. 한 번에 다 바꾸지 않은 이유가 여기 있다.
- **② 빌드 지연과 혼합 빌드 구조 — 실험 한 번에 최대 2시간.**
  - 디버그는 Bazel, R8을 쓰는 릴리스는 Gradle이라서, R8 설정을 바꿔 보는 실험이 원격 CI에서 최대 2시간 걸렸다.
  - 이 피드백 간격을 줄이려고 **매일 QA에 넘기는 빌드를 실제 출시처럼 R8을 켠 상태로** 맞췄다. 그래서 QA가 매일 R8이 만든 앱을 시험한다.
  - `mapping.txt`, `configuration.txt`(R8이 실제로 적용한 전체 규칙) 같은 빌드 산출물을 자동으로 모아, 문제를 조사할 때 바로 꺼내 보게 했다.
- **③ 느린 디버깅 — 최적화된 클래스 수백 개에서 원인을 찾아야 했다.**
  - 인원이 적은 팀에게 부담이 컸다.
  - Gradle로 **Firebase Crashlytics에 mapping 파일을 자동으로 올리고**, Play Console에도 난독화 해제용 mapping을 함께 묶어 올렸다. 그러자 실행 중 문제의 이름이 바로, 정확하게 원래대로 보였다.

## 7. R8이 남긴 장기 효과 — 코드 한 줄의 값이 싸졌다

<figure class="media"><img src="https://developer.android.com/static/blog/assets/ANDDM_Grab_Inline_Metric_62758be722_2nf419.webp" alt="왼쪽에 초록색 아래 화살표와 40%, reduction in the cost of each line of code. 오른쪽 연두색 칸에 Before R8 optimization every line of production Kotlin cost about 18.7 bytes of download size on average, After the R8 optimizer and full mode this was about 11.2 bytes per line. A 40% reduction in how much each line of code costs going forward to the download size" loading="lazy"><figcaption>수치 카드. R8 최적화 전에는 제품 코드 Kotlin 한 줄이 내려받기 크기를 평균 약 18.7바이트 차지했는데, R8 최적화와 전체 모드 뒤에는 약 11.2바이트가 됐다. 앞으로 쓰는 코드 한 줄의 크기 비용이 40% 줄었다는 뜻이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time">원문</a>)</figcaption></figure>

- **R8은 성능을 한 번 끌어올린 것에서 끝나지 않고, 구조적인 이점을 남겼다.**
  - Grab은 자기들이 공개한 도구 [app-sizer](https://github.com/grab/app-sizer)로 R8의 효과를 재 보았다. 그 결과 **앱의 코드 한 줄이 내려받기 크기에서 차지하는 비용이 영구적으로 낮아졌다.**
- **AI로 코드를 빠르게 늘리는 시대라 더 중요하다.**
  - R8이 없으면 코드가 늘어나는 만큼 내려받기 크기도 비례해서 커진다. R8이 있으면 같은 속도로 코드가 늘어도 크기 증가가 훨씬 작다.
- **측정 방법(원문 주석).**
  - app-sizer가 대표 기기 기준으로 잰 "Kotlin/Java 코드가 내려받기 크기에 기여한 양"을, 제품 Kotlin 코드 줄 수로 나눴다.
  - 줄 수는 `cloc` 로 셌고, main 소스 세트만 넣었다. 테스트·목(mock, 가짜 객체)·샘플 모듈은 뺐다.

## 8. 유지 규칙 관리와 안전장치

- **규칙이 다시 늘어나 최적화가 무너지지 않도록, 병합 전 CI 검사를 붙일 계획이다.**
  - 새 유지 규칙은 엄격하게 제한하고, 하나라도 더하려면 **분명한 이유와 리뷰**를 거쳐야 한다.
  - 팀은 이미 R8 최적화 점수를 CI에서 추적하고 있다. 앞으로 이 점수를 계속 되먹임(피드백)으로 써서, 점수가 떨어지는 변경은 병합 전에 잡을 계획이다.

<figure class="media"><img src="https://developer.android.com/static/blog/assets/R8_rules_score_1_e7079d63a0_Hm8c2.webp" alt="어두운 대시보드에 그래프 세 개가 위아래로 있다. 위부터 Shrinking score, Optimization score, Obfuscation score이고 모두 the higher, the better라고 적혀 있다. 가로축은 6월 초부터 9월 하순까지 날짜, 점은 앱 버전 5.416.0부터 5.430.0까지 색으로 구분된다. 축소와 최적화 점수는 72 근처에서 시작해 8월 초와 9월 초에 계단처럼 올라 79 근처에 이르고, 난독화 점수는 81 근처에서 8월에 79 아래로 내려갔다가 9월 초 82 근처로 오른다" loading="lazy"><figcaption>그림 1. Grab 빌드의 R8 축소·최적화·난독화 점수를 시간에 따라 보여 주는 CI 대시보드. 앱 버전 5.416.0부터 5.430.0까지 버전마다 점이 찍힌다. 축소·최적화 점수는 8월 초와 9월 초 두 번 크게 오르고, 난독화 점수는 8월에 잠시 떨어졌다가 9월 초에 다시 오른다. 이런 하락을 출시 전에 보려는 것이 이 대시보드의 목적이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time">원문</a>)</figcaption></figure>

## 9. 결론

- **Grab 승객 앱 코어(Pax App Core) 팀은 시작 시간이 늘고 출시 직후 성능이 튀던 문제에, 문제가 커지기 전에 먼저 손을 댔다.**
  - Baseline Profile을 넣고 R8 설정을 계속 다듬었다.
  - 결과: 사용자 체감 ANR 약 32.5% 감소, 내려받기 크기 약 30.3% 감소, 콜드 스타트 약 35% 개선. 그리고 코드가 늘어날 때 크기가 늘어나는 비율 자체가 낮아졌다.
- **동남아시아 수백만 사용자는 더 빠르고 안정적인 앱을 얻었고, 엔지니어는 크기 걱정 없이 기능을 더 빨리 만들 수 있게 됐다.**
- 원문은 시작점으로 [d.android.com/r8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)을 안내한다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

원문에는 코드가 없다. 아래는 공식 문서를 따라 **Aide에 맞춰 직접 쓴 스케치**이고, Aide 코드는 고치지 않았다.

**① 릴리스 최적화 켜기 — 지금 Aide는 꺼 두었다**

지금 Aide의 `app/build.gradle.kts` 에는 Android Studio 템플릿이 넣어 준 설정이 그대로 있다.

```kotlin
// 지금 Aide (app/build.gradle.kts)
buildTypes {
    release {
        optimization {
            enable = false      // 릴리스에서도 R8이 일하지 않는다
        }
    }
}
```

공식 문서의 AGP **9.3 이상** 방식으로 켜면 이렇다.

```kotlin
// app/build.gradle.kts — AGP 9.3 이상 (직접 쓴 스케치)
buildTypes {
    release {
        optimization {
            enable = true       // 코드 최적화 + 리소스 줄이기를 함께 켠다.
                                // proguard-android-optimize.txt 에 해당하는 기본 규칙이 함께 들어간다
        }
    }
}
```

- 9.3의 새 방식에서는 유지 규칙을 `proguardFiles(…)` 로 적지 않는다. **`src/main/keepRules/` 폴더에 확장자 `.keep` 파일**을 두면 읽는다.
- AGP 9.3보다 낮으면 옛 방식(`isMinifyEnabled = true`, `isShrinkResources = true`, `proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), …)`)을 쓴다. Aide는 지금 9.2.1이다. 아래 "Aide에 적용하면" 2번에서 어느 쪽으로 갈지 정리했다.

```text
# app/src/main/keepRules/aide.keep (직접 쓴 스케치)
# 지금은 비워 둔다. Hilt·Room·kotlinx-serialization·Compose 는 자기 규칙을 함께 배포한다.
# 하나를 더할 때마다 "왜 필요한가"를 이 파일에 한 줄로 적는다 (Grab의 '이유 없는 규칙 금지')
```

**② Baseline·Startup Profile 만들기**

Android Studio의 **Baseline Profile Generator** 모듈 템플릿이 아래 모양의 테스트를 만들어 준다. 처음 출시엔 "앱을 켜서 첫 화면까지"와 "알림을 눌러 일정 화면으로 들어오기" 두 길이면 충분하다.

```kotlin
// baselineprofile/src/main/kotlin/.../AideBaselineProfileGenerator.kt (직접 쓴 스케치)
@RunWith(AndroidJUnit4::class)
@LargeTest
class AideBaselineProfileGenerator {

    @get:Rule
    val rule = BaselineProfileRule()

    @Test
    fun startup() = rule.collect(
        packageName = "com.giwon.aide",
        includeInStartupProfile = true,      // 이 경로는 Startup Profile 에도 넣어 첫 DEX 에 모은다
    ) {
        pressHome()
        startActivityAndWait()               // 런처에서 켜서 첫 화면(AI 홈)이 그려질 때까지
    }
}
```

- `includeInStartupProfile = true` 가 붙은 경로는 Startup Profile에도 들어간다. 공식 문서 권장대로 **시작 경로는 첫 DEX(`classes.dex`)에 들어갈 만큼만** 넣는다.
- 결과 파일은 `app/src/release/generated/baselineProfiles/` 아래 `baseline-prof.txt`·`startup-prof.txt` 로 생기고, AGP가 알아서 쓴다.
- 프로필을 만들 때는 앱을 난독화하지 않은 상태로 돌려야 한다. Baseline Profile Gradle 플러그인을 쓰면 이 설정을 알아서 해 준다. 릴리스에서는 R8이 프로필 안의 이름을 난독화된 이름으로 바꿔 쓴다.

**③ 설정 점수 보기 — AGP 9.3 이상**

```bash
# 앱을 다 만들지 않고 보고서만 빠르게 만든다 (공식 문서의 작업 이름)
./gradlew :app:analyzeReleaseR8Config
# → app/build/reports/r8/r8-config-analyzer-release.html
```

## 배운 점

- **"한 번에 다 켜기"가 아니라 단계로 나눴기 때문에 10년 된 앱에서도 됐다.**
  - 호환 모드 → 9개월 뒤 전체 모드 → 규칙 다듬기. 단계마다 효과와 위험을 따로 볼 수 있었다. 반대로 새 앱은 처음부터 전체 모드로 시작하는 것이 가장 싸다. 고쳐야 할 리플렉션이 쌓이기 전이기 때문이다.
- **넓은 유지 규칙은 안전해 보이지만, 그만큼 R8을 놀게 만든다.**
  - 동적 프록시를 `-keep …**` 으로 덮지 않고 필요한 클래스만 남긴 것이 핵심이다. 유지 규칙 하나하나가 "R8이 손대지 못하는 땅"이라는 감각을 갖게 된다.
- **점수로 재면 지킬 수 있다.**
  - Configuration Analyzer의 세 점수는 "규칙이 나빠졌다"를 사람이 아닌 숫자로 알려 준다. Grab의 대시보드처럼 버전마다 점을 찍으면 어느 변경에서 떨어졌는지 바로 보인다. #749 디자인 시스템 글의 "규칙을 CI로 지킨다"와 같은 생각이다.
- **R8과 Startup Profile은 짝이다.**
  - Startup Profile의 DEX 배치 최적화는 R8이 켜져 있어야 동작한다. 그래서 Grab도 1단계에서 둘을 함께 냈다. R8을 끈 채로 프로필만 넣으면 효과의 절반만 받는다.
- **최적화를 켰다면 디버깅 길도 함께 깐다.**
  - mapping 파일을 Crashlytics와 Play Console에 자동으로 올리지 않으면, 출시 뒤 충돌 기록이 `a.b.a` 로만 보인다. QA 빌드를 출시와 같은 R8 상태로 맞춘 것도 "출시에서만 나는 버그"를 미리 잡는 장치다.

## Aide에 적용하면

Aide는 아직 출시 전이고, `app/build.gradle.kts` 의 릴리스 빌드는 **`optimization { enable = false }` 로 R8을 꺼 둔 상태**다. Task 1 가이드는 이 줄을 "app만의 출시 설정. 출시 Task 17에서 다시 본다"며 남겼다. 그런데 **1-a 계획의 Task 17(내부 테스트 트랙 배포)에는 서명·워크플로·Play Console만 있고 R8·프로필 이야기가 없다.** 이 글이 그 빈칸을 채운다.

1. **릴리스 R8 최적화를 켠다 — 가져온다. 시점은 Task 17, 처음부터 전체 모드로.**
   - Grab은 10년 쌓인 리플렉션 때문에 호환 모드부터 갔다. Aide는 새 앱이고 AGP 8.0부터 전체 모드가 기본값이라, **처음부터 전체 모드로 켜는 것이 가장 싸다.** `android.enableR8.fullMode=false` 는 넣지 않는다.
   - Aide의 주요 의존성(Hilt·Room·Compose·Navigation 3·kotlinx-serialization)은 모두 소비자 유지 규칙을 함께 배포한다. 그래서 처음엔 **직접 쓰는 유지 규칙이 0줄**일 수 있다. Grab에서 Retrofit·Firebase·Compose가 "손댈 것이 없었다"고 한 것과 같다.
   - 확인: 계획서의 실기기 확인 방식대로, 서명한 릴리스 AAB를 내부 테스트 트랙으로 설치해 **첫 화면 → 캘린더 → 알림 눌러 들어오기 → 설정**을 한 번씩 지나간다. 리플렉션 문제는 대개 "켜자마자 죽음"으로 드러난다.
2. **어느 DSL로 켤지 — AGP 버전과 부딪힌다. 결정이 필요하다.**
   - 공식 문서는 `optimization { enable = true }` + `src/main/keepRules/*.keep` 을 **AGP 9.3 이상**의 방식으로 설명한다. Aide는 **9.2.1**이고, 이미 `optimization {}` 블록을 쓰고 있다. 9.2에서 이 블록이 9.3과 똑같이 동작하는지는 문서에 없다(확인하지 않았다).
   - 2026-10-20 결정은 "최신화(Kotlin 2.4 · compileSdk 37)는 Task 4 뒤 별도 PR"이다. **그 최신화 PR에서 AGP도 9.3 이상으로 올리고**, Task 17에서는 9.3 방식으로 켜는 것을 추천한다. 그러면 옛 방식(`isMinifyEnabled`)을 썼다가 다시 바꾸는 일이 없다.
   - 최신화가 Task 17보다 늦어지면, 그때는 9.2에서 `enable = true` 로 빌드해 보고 동작을 확인한다.
3. **Baseline·Startup Profile — 가져온다. Task 17에서 R8과 같은 PR로.**
   - Aide는 Hilt를 쓴다. Grab이 Cloud Profile만으로는 못 덮었다고 한 **"시작 때 Dagger 그래프 초기화"** 가 Aide에도 그대로 있다. 게다가 개인 앱이라 설치 수가 적어 **Cloud Profile이 거의 만들어지지 않는다.** 직접 만든 Baseline Profile의 값이 큰 앱이다.
   - 처음 경로는 두 개면 된다: 런처에서 켜서 AI 홈까지, 그리고 **리마인더 알림을 눌러 들어오는 길**(Aide의 핵심 기능이 알림이다). 둘 다 `includeInStartupProfile = true`.
   - 새 모듈(`baselineprofile`)이 하나 생긴다. 이 모듈은 실기기나 에뮬레이터에서 돌아야 하므로 **지금 CI(`assembleDebug test lint`)에는 넣지 않는다.** 출시 전에 손으로 돌려 프로필 파일을 커밋한다. CI에서 돌리는 것은 나중 일이다.
   - 계측 테스트(androidTest)를 1-a에서 쓰지 않는다는 Task 1 가이드의 판단과는 **조금 부딪힌다.** 프로필 생성기는 기기에서 도는 테스트라서다. 다만 이 모듈은 "앱이 맞게 동작하는가"를 검사하는 테스트가 아니라 프로필을 만드는 도구라, 그 결정의 취지는 해치지 않는다고 본다. 사용자 판단이 필요하다.
4. **R8 Configuration Analyzer — 가져온다. 다만 AGP 9.3 이후.**
   - `./gradlew :app:analyzeReleaseR8Config` 는 AGP 9.3.0 이상이 필요하다. 2번의 최신화 PR 뒤에 첫 점수를 한 번 기록해 두는 것으로 시작한다.
   - **CI에 점수 검사를 붙이는 것은 지금은 안 한다.** Grab도 아직 "계획 중"이고, 혼자 쓰는 앱에서 유지 규칙이 늘어나는 속도는 느리다. 대신 1번의 `aide.keep` 파일에 규칙마다 이유를 한 줄 적는 습관으로 Grab의 "이유 없는 규칙 금지"를 대신한다.
5. **mapping 파일 보관 — 바꿔서 가져온다.**
   - Aide는 Crashlytics를 쓰지 않는다(수집 없음 정책). 그래서 **Play Console에 올리는 AAB에 mapping이 함께 들어가는 것만 확인**하고(AGP가 AAB에 넣어 준다), Task 17의 출시 워크플로가 `mapping.txt` 를 GitHub Actions 산출물(artifact)로 남기게 한다. 출시 뒤 충돌 기록을 원래 이름으로 읽을 수 있어야 한다.
6. **"QA 빌드를 출시와 같은 R8 상태로" — 이미 그렇게 된다.**
   - Aide는 Task 17 이후 내부 테스트 트랙의 릴리스 빌드를 직접 써 보며 확인한다(Task 18 1주 실사용). 그 빌드가 곧 R8을 켠 출시 빌드라 따로 할 일이 없다.
7. **app-sizer로 "줄당 비용" 재기 — 지금은 안 한다.**
   - 1,000만 줄짜리 앱에서 의미 있는 지표다. 아직 작은 Aide에서는 R8을 켜기 전과 후의 AAB 크기를 한 번 비교해 기록하는 것으로 충분하다.

## 출처

- [Grab Reduces ANRs by 32% and improves startup time by 35% with R8 and Profile guided optimization — Android Developers Blog](https://developer.android.com/blog/posts/grab-r8-profile-guided-optimization-anr-startup-time)
- [Android 개발자 문서: 앱 최적화 켜기 (R8)](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)
- [Android 개발자 문서: R8 전체 모드](https://developer.android.com/topic/performance/app-optimization/full-mode)
- [Android 개발자 문서: R8 Configuration Analyzer](https://developer.android.com/topic/performance/app-optimization/r8-configuration-analyzer)
- [Android 개발자 문서: Baseline Profile 개요](https://developer.android.com/topic/performance/baselineprofiles/overview)
- [Android 개발자 문서: DEX 레이아웃 최적화와 Startup Profile](https://developer.android.com/topic/performance/baselineprofiles/dex-layout-optimizations)
- [grab/app-sizer (GitHub)](https://github.com/grab/app-sizer)
- [Android Weekly #750](https://androidweekly.net/issues/issue-750)
