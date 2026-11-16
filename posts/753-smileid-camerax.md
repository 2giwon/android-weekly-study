---
issue: 753
date: 2026-11-15
title: SmileID는 CameraX로 18,000종이 넘는 Android 기기에서 신원 확인을 돌렸다
original_title: "How SmileID Scaled Identity Verification to 18,000+ Android Device Types with CameraX"
url: https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification
author: Donovan McMurray (Google)
tags: [CameraX, 카메라, 기기 호환성, 사례]
aide:
  status: candidate
  module: core:calendar
  task: 1-b
  summary: Aide에는 카메라가 없어 CameraX는 가져오지 않는다. 대신 "기기마다 다른 문제는 한곳에 모아 라이브러리처럼 숨긴다"와 "원하는 값과 안 될 때의 규칙을 함께 적는다"를 기기 캘린더 쓰기(1-b)에 가져온다
---

## 한 줄 요약

아프리카의 신원 확인 SDK 회사 **SmileID**가 Android 카메라 코드를 옛 Camera1, Camera2 API에서 **CameraX**로 다시 짠 사례다. 저가폰, 지역 전용 모델, 결제 단말기(POS)까지 섞인 기기 환경에서 미리보기가 늘어나거나 돌아가고, 메모리가 1GB 이하인 기기에서 앱이 죽던 문제를 CameraX의 `Preview`와 `ImageAnalysis`, 그리고 **`ResolutionSelector`(원하는 해상도와 그 해상도가 없을 때의 규칙을 함께 적는 API)** 로 풀었다. 그 결과 **18,000종이 넘는 기기**를 지원하고, 셀피 해상도는 **4배**, 인증 통과율은 **20%** 올랐으며, SDK 도입은 2년째에 **20배**로 늘어 지금까지 **1억 6천만 건이 넘는** 신원 확인을 처리했다. Google Android 개발자 블로그의 사례 글이다.

> 원문 그림 4장(표지, 인용 카드 2장, ResolutionSelector 도표)은 원문 서버 주소를 걸어 보여 준다. 원문의 코드 한 블록은 Android 개발자 사이트의 코드 라이선스(Apache 2.0)를 따라 그대로 인용하고 출처를 적었다. "코드로 보기" 절의 Aide 코드는 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **신원 확인(identity verification)**: 은행 계좌 개설이나 유심(SIM) 등록 때 "이 사람이 정말 그 사람인가"를 확인하는 절차. SmileID는 신분증 사진과 셀피(본인이 찍은 얼굴 사진)를 비교한다.
- **라이브니스 검사(liveness check)**: 카메라 앞에 있는 것이 **살아 있는 진짜 사람**인지 확인하는 검사. 사진을 화면에 띄워 카메라에 들이대는 속임수를 막는다.
- **스푸핑(spoofing)과 딥페이크(deepfake)**: 스푸핑은 남의 얼굴 사진이나 가면으로 속이는 것, 딥페이크는 AI로 만든 가짜 얼굴 영상으로 속이는 것. 둘 다 잡으려면 **선명하고 해상도가 높은 얼굴 사진**이 필요하다. 흐린 사진에서는 가짜의 흔적이 보이지 않는다.
- **SDK(Software Development Kit)**: 다른 회사 앱에 끼워 넣어 쓰는 기능 묶음. SmileID는 앱을 직접 파는 것이 아니라, 은행 앱이나 모바일 머니 앱이 가져다 쓰는 신원 확인 SDK를 판다. 그래서 **SmileID의 카메라 코드는 고객 앱이 깔린 모든 기기에서 돌아야 한다.**
- **Camera1과 Camera2**: Android의 옛 카메라 API. Camera1(`android.hardware.Camera`)은 Android 5.0부터 지원 중단(deprecated)됐다. Camera2는 세밀하게 제어할 수 있지만 코드가 길고, 기기 제조사마다 다르게 동작하는 부분을 개발자가 직접 처리해야 한다.
- **CameraX**: Jetpack(구글이 만든 Android 보조 라이브러리 모음)의 카메라 라이브러리. 내부에서는 Camera2를 쓰지만, 기기마다 다른 동작을 라이브러리가 대신 맞춰 준다. "미리보기", "이미지 분석", "사진 찍기", "영상 찍기"를 **유스케이스(use case, 쓰임새 단위의 부품)** 로 나눠 필요한 것만 묶어 쓴다.
- **`Preview`**: 카메라가 보는 화면을 앱에 실시간으로 보여 주는 CameraX 유스케이스.
- **`ImageAnalysis`**: 카메라 프레임(영상의 한 장 한 장)을 코드로 받아 분석하는 CameraX 유스케이스. 얼굴이 화면 안에 있는지, 살아 있는 사람인지 같은 판단을 여기서 한다.
- **생명주기 인식(lifecycle-aware)**: 화면(Activity, Fragment)이 켜지고 꺼지는 시점을 라이브러리가 알아서 따라가는 것. CameraX는 `bindToLifecycle` 로 카메라를 화면 생명주기에 묶어, 화면이 꺼지면 카메라를 닫고 다시 켜지면 연다. 개발자가 `onPause` 에서 카메라를 직접 닫는 코드를 쓰지 않아도 된다.
- **OOM(Out of Memory)**: 메모리가 모자라 앱이 강제로 죽는 오류. 고해상도 사진 한 장은 메모리를 많이 차지하므로, 메모리가 1GB 이하인 기기에서 여러 장을 한꺼번에 들고 있으면 쉽게 난다.
- **OEM(Original Equipment Manufacturer)**: 기기 제조사. 삼성, 샤오미, 테크노 같은 회사다. OEM마다 Android를 조금씩 고쳐서 내놓기 때문에 같은 API가 기기마다 다르게 동작하기도 한다.
- **기기 별난 점(quirk)**: 특정 제조사나 모델에서만 나타나는 이상 동작. 예: 어떤 기기는 카메라 센서 방향을 실제와 다르게 알려 준다. CameraX는 이런 것을 `DeviceQuirks`, `CameraQuirks` 라는 내부 클래스 목록으로 관리한다.
- **화면비(aspect ratio)**: 가로와 세로의 비율. 4:3, 16:9 같은 것. 카메라가 주는 프레임의 화면비와 미리보기 칸의 화면비가 다르면 얼굴이 옆이나 위아래로 늘어나 보인다.
- **백프레셔(backpressure)**: 데이터가 들어오는 속도를 처리하는 쪽이 따라가지 못할 때 어떻게 할지 정하는 것. CameraX `ImageAnalysis` 의 `STRATEGY_KEEP_ONLY_LATEST` 는 **분석이 끝나지 않았으면 그 사이 들어온 옛 프레임은 버리고 가장 최근 프레임 하나만 남긴다.** Kotlin Flow의 `conflate()` 와 같은 생각이다.
- **POS(Point of Sale) 단말기**: 가게에서 카드 결제를 받는 기계. 아프리카에서는 Android로 도는 튼튼한(ruggedized) POS 단말기가 많고, 여기에도 카메라가 달려 있다.
- **REST API**: 서버에 HTTP로 요청을 보내 결과를 받는 방식. 원문에서는 "기기에서 바로 검사하지 못해 사진을 서버에 올려 검사하던 옛 방식"을 가리킨다.
- **에이전트 스킬(agent skill)**: AI 코딩 도구(Gemini, Claude Code 같은 것)에게 "이 분야는 이렇게 짜라"는 지침을 묶어 주는 문서 꾸러미. 원문 끝에서 Android 팀이 낸 **CameraX Skill** 을 소개한다.

## 서론 — 신원 확인에는 선명한 얼굴이 필요하다

**은행과 유심 등록 앱은 스푸핑과 딥페이크를 잡기 위해 선명한 고해상도 얼굴 사진이 필요하다.**
- 라이브니스 검사와 위조 방지 검사를 통과할 만큼 선명한 프레임을 찍으면서도, 메모리가 적은 기기에서 앱이 죽지 않게 하는 것은 Android 카메라 개발자라면 흔히 겪는 어려움이다.

**SmileID에게는 이 어려움이 두 배였다. 기기 종류가 너무 다양해서다.**
- SmileID는 아프리카의 대표적인 신원 확인 SDK 회사다.
- SmileID가 대상으로 삼는 지역에서 **Android가 기기 시장 점유율의 85%** 를 차지한다.
- 그 안에는 처리 능력이 아주 낮은 입문용 스마트폰, 잘 알려지지 않은 지역 전용 모델, 그리고 튼튼하게 만든 맞춤형 POS 단말기까지 섞여 있다.

<figure class="media"><img src="https://developer.android.com/static/blog/assets/1007_ABL_134_How_Smile_ID_Scaled_Identity_Verification_with_Camera_X_Strapi_788bf73f23_1N5Hb5.webp" alt="짙은 회색 바탕에 초록색 큰 원들. 가운데 비스듬한 검은 휴대폰 위로 얼굴 아이콘이 그려진 흰 카드와, 사람 아이콘과 글줄이 있는 하늘색 신분증 카드가 겹쳐 있다. 신분증 카드 오른쪽에 연두색 톱니 모양 체크 배지. 왼쪽 위에는 영수증이 나오는 결제 단말기, 오른쪽 아래에는 뒷면 카메라가 보이는 파란 휴대폰" loading="lazy"><figcaption>원문 표지. 휴대폰 위에 얼굴 인식 카드와 신분증 카드, 확인 완료 체크 배지가 떠 있고, 구석에 결제(POS) 단말기와 다른 휴대폰이 보인다. 휴대폰과 결제 단말기 양쪽에서 얼굴로 신원을 확인한다는 이 글의 주제를 그린 것이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification">원문</a>)</figcaption></figure>

<figure class="media"><img src="https://developer.android.com/static/blog/assets/harun_quote_card_green_57e4940f8b_1aEyED.webp" alt="짙은 초록 바탕의 인용 카드. 왼쪽에 Our CameraX integration successfully supports over 18,000 unique Android device models, ranging from entry-level smartphones to specialized Point of Sale (POS) terminals. This expansive hardware compatibility is vital to our operations, as Android accounts for 85% of the market share across our target territories. Harun Wangereka, Mobile team, SmileID. 오른쪽 둥근 칸에 웃는 인물 사진과 Android Experts 로고" loading="lazy"><figcaption>인용 카드. SmileID 모바일 팀의 Harun Wangereka(Google Developer Expert, Android 분야)는 "CameraX 통합 덕분에 입문용 스마트폰부터 특수한 POS 단말기까지 18,000종이 넘는 Android 기기 모델을 지원한다. 우리가 대상으로 하는 지역에서 Android가 시장의 85%를 차지하므로, 이렇게 넓은 기기 호환성은 사업에 꼭 필요하다"고 말한다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification">원문</a>)</figcaption></figure>

**CameraX 이전의 SmileID는 카메라 개발의 흔하지만 어려운 문제를 모두 겪고 있었다.**
- 미리보기가 늘어나 보이는 문제, 센서 방향 때문에 화면이 돌아가 보이는 문제, OOM으로 앱이 죽는 문제, 그리고 제조사마다 다른 버그가 있었다.
- SmileID는 핵심 Android SDK를 CameraX로 옮겼고, 이 문제들을 사업상의 큰 강점으로 바꿨다.

**SmileID가 밝힌 CameraX 전환의 결과는 아래 표와 같다.**

| 지표 | CameraX 전환 뒤의 변화 |
|---|---|
| SDK 도입 증가 | CameraX 이전에는 해마다 2~3배 늘었는데, 전환 뒤에는 2년째에 20배가 됐다. |
| 인증 통과율 | SmileID SDK를 쓰는 앱의 인증 통과율이 20% 올랐다. |
| 촬영 해상도 | 셀피와 라이브니스 검사에 쓰는 사진의 화소 수가 4배가 됐고, 네트워크로 보내는 양은 늘지 않았다. |
| 기기 모델 호환성 | 18,000종이 넘는 Android 기기를 지원한다. |
| 처리한 인증 건수 | 1억 6천만 건이 넘는 신원 확인을 처리했다. |

## 1. 문제 — 조각난 하드웨어와 옛 API의 고통

**SmileID SDK는 고해상도 셀피 프레임을 찍어 두 곳에 쓴다.**
- 하나는 **기기 안에서 하는 라이브니스 검사**, 다른 하나는 **클라우드(서버)에서 하는 딥페이크 탐지**다.
- 둘 다 사용자가 정말 그 사람인지 확인하는 데 쓰인다.

**옛 Camera1과 저수준(세부까지 직접 다루는) Camera2 API로는 이 일을 모든 기기에서 똑같이 해내기가 어려웠다. 이유는 세 가지다.**

1. **제조사의 개조와 별난 점**
   - 무엇이 문제였나: 제조사마다 카메라 센서의 물리적 방향을 다르게 알려 줬다.
   - 결과: 미리보기가 돌아가 보이거나, 찍힌 얼굴 사진이 잘못된 방향으로 저장됐다.
2. **화면비 왜곡**
   - 무엇이 문제였나: 저가 기기에서 특정 프레임 크기를 요청하면 미리보기가 위아래나 옆으로 늘어났다.
   - 결과: 사용자의 얼굴이 일그러져 보여 생체 인증(얼굴로 하는 본인 확인)을 쓸 수 없게 됐다.
3. **메모리 부족(OOM)으로 앱이 죽음**
   - 무엇이 문제였나: 메모리가 1GB 이하인 기기가 많았는데, 고해상도 원본 이미지를 처리하다가 메모리를 할당하지 못했다.
   - 결과: 앱이 치명적인 오류로 강제 종료됐다.

**이런 걸림돌 때문에 SmileID의 성장과 검사 방식이 모두 묶여 있었다.**
- SDK 도입은 해마다 2~3배 늘어나는 데 그쳤다.
- 많은 인증이 기기 안에서 실시간 라이브니스 검사를 하지 못하고, **멈춘 사진 한 장을 응답이 느린 REST API로 서버에 올리는 방식**으로 물러나야 했다.

## 2. 해결 — CameraX로 일관된 파이프라인 만들기

**SmileID는 모바일 SDK를 CameraX로 처음부터 다시 짰다.**
- CameraX는 아래에 깔린 기기 생태계의 복잡함을 가려 주고, 생명주기를 스스로 따라가는 일관된 개발자 인터페이스를 주도록 만든 라이브러리다.

**CameraX의 핵심 유스케이스 두 개, `Preview`와 `ImageAnalysis`로 두 가지 일을 하는 카메라 파이프라인을 만들었다.**
- **`Preview`**: 카메라 화면을 비율이 정확하게 맞는 실시간 미리보기로 보여 준다. 사용자는 이 화면을 보며 얼굴을 원 안에 맞춘다.
- **`ImageAnalysis`**: 프레임을 기기 안에서 실시간으로 계속 처리한다. 자동 라이브니스 검사와 "얼굴이 화면 안에 있는가" 검사를 돌리고, 검사를 통과한 셀피 프레임을 뽑아낸다.

**OOM 없이 딥페이크 탐지에 쓸 만큼 선명한 사진을 얻으려고 `ImageAnalysis` 설정에 `ResolutionSelector`를 붙였다.**
- `ResolutionSelector` 는 **목표 해상도**를 요청하고, 기기가 그 크기를 정확히 지원하지 않을 때 **어느 쪽 크기로 물러날지 규칙(fallback rule)** 을 고르게 해 주는 CameraX API다.
- 아래 도표는 목표를 1200x900으로 잡았을 때 `ResolutionSelector` 가 후보 크기들을 어떤 순서로 고르는지 보여 준다.

<figure class="media"><img src="https://developer.android.com/static/blog/assets/resolution_selector_diagram_vertical_374522856f_Z2n3DVI.webp" alt="How CameraX ResolutionSelector Ranks Device Sizes 제목의 세로 도표. 1번 Bound size evaluation: 640x480, 1200x900, 1600x1200, 4032x3024 직사각형이 겹쳐 있고 1600x1200이 초록색으로 #1 Selected (closest ≥ bound), 4032x3024가 #2, 640x480이 #3, 1200x900이 점선으로 Target bound size. 2번 Full candidate priority list: 4:3 Preferred Group은 #1 1600x1200 Selected winner, #2 4032x3024, #3 640x480이고 16:9 Fallback Group은 #4 1920x1080, #5 3840x2160, #6 1280x720. 3번 Fallback rule comparison 표: CLOSEST_HIGHER_THEN_LOWER는 1600x1200 #1, 4032x3024 #2, 640x480 #3. CLOSEST_HIGHER는 1600x1200 #1, 4032x3024 #2, 640x480 Excluded. CLOSEST_LOWER_THEN_HIGHER는 640x480 #1, 1600x1200 #2, 4032x3024 #3. CLOSEST_LOWER는 640x480 #1, 나머지 Excluded" loading="lazy"><figcaption>원문 도표 "CameraX ResolutionSelector가 기기 크기의 순위를 매기는 방법". 설정은 "4:3을 원하고 목표 크기는 1200x900"이다. ① 이 기기가 지원하는 4:3 크기는 640x480, 1600x1200, 4032x3024이고 1200x900 자체는 없다. 규칙이 <code>CLOSEST_HIGHER_THEN_LOWER</code>(목표 이상 중 가장 가까운 것 먼저, 없으면 작은 쪽)이므로 1600x1200이 1순위, 4032x3024가 2순위, 목표보다 작은 640x480이 3순위다. ② <code>RATIO_4_3_FALLBACK_AUTO_STRATEGY</code> 때문에 4:3 묶음 세 개를 먼저 따지고, 그다음에야 16:9 묶음(1920x1080, 3840x2160, 1280x720)을 같은 규칙으로 4~6순위에 둔다. ③ 규칙 네 가지의 비교. <code>CLOSEST_HIGHER</code> 는 목표보다 작은 640x480을 아예 뺀다. <code>CLOSEST_LOWER_THEN_HIGHER</code> 는 목표 이하 중 가장 큰 640x480을 1순위로, 1600x1200을 2순위로, 4032x3024를 3순위로 둔다. <code>CLOSEST_LOWER</code> 는 640x480만 남기고 더 큰 둘을 뺀다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification">원문</a>)</figcaption></figure>

**원문은 `ResolutionSelector` 와 `STRATEGY_KEEP_ONLY_LATEST` 를 함께 쓰는 예시 코드를 준다.**
- 선명함을 우선하려면 `FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER` 를, 메모리 사용량에 상한을 두려면 `FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER` 를 쓰라고 한다.

```kotlin
import android.util.Size
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.lifecycle.LifecycleOwner

fun configureCameraX(cameraProvider: ProcessCameraProvider, lifecycleOwner: LifecycleOwner, 
                     surfaceProvider: Preview.SurfaceProvider, 
                     executor: java.util.concurrent.Executor, analyzer: ImageAnalysis.Analyzer) {
    // 1. Define a resolution strategy requesting high quality (for example, 1200x900px) 
    // and selecting the closest higher (or, if unavailable, lower) resolution.
    val resolutionSelector = ResolutionSelector.Builder()
        .setResolutionStrategy(
            ResolutionStrategy(
                Size(1200, 900),
                ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
            )
        )
        .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
        .build()

    // 2. Configure the ImageAnalysis use case with the resolution selector
    // and a backpressure strategy that keeps the UI responsive on slow processors.
    val imageAnalysis = ImageAnalysis.Builder()
        .setResolutionSelector(resolutionSelector)        
        // Drops older frames if the device's CPU is still busy analyzing the previous one
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .build()

    // 3. Set up the preview stream and attach the Analyzer and SurfaceProvider
    imageAnalysis.setAnalyzer(executor, analyzer)
    val preview = Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }

    // 4. Bind both use cases concurrently to the lifecycle provider
    try {
        cameraProvider.unbindAll()
        cameraProvider.bindToLifecycle(
            lifecycleOwner,
            CameraSelector.DEFAULT_FRONT_CAMERA,
            preview,
            imageAnalysis
        )
    } catch (exc: Exception) {
        // Handle binding failure safely
    }
}
```

> 출처: 원문 예시 코드 ([How SmileID Scaled Identity Verification to 18,000+ Android Device Types with CameraX](https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification), Android 개발자 사이트 코드 라이선스 [Apache 2.0](https://developer.android.com/license))

코드를 번호 주석 순서대로 풀면 다음과 같다.

- **함수 인자**: `configureCameraX` 는 카메라를 여는 데 필요한 다섯 가지를 밖에서 받는다.
  - `cameraProvider`: 기기의 카메라를 열고 닫는 CameraX의 관리자.
  - `lifecycleOwner`: 카메라를 묶을 화면(Activity나 Fragment).
  - `surfaceProvider`: 미리보기를 그릴 화면 칸. 보통 `PreviewView` 가 준다.
  - `executor`: 프레임 분석을 돌릴 스레드.
  - `analyzer`: 프레임을 받아 실제로 얼굴과 라이브니스를 검사하는 코드.
- **1번, 해상도 전략 정하기**
  - `ResolutionStrategy(Size(1200, 900), FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)`: "1200x900을 원한다. 정확히 없으면 그보다 큰 것 중 가장 가까운 것을, 그것도 없으면 작은 것 중 가장 가까운 것을 달라"는 뜻이다. 위 도표의 1600x1200이 이렇게 뽑힌다.
  - `setAspectRatioStrategy(RATIO_4_3_FALLBACK_AUTO_STRATEGY)`: 4:3 크기를 먼저 찾고, 4:3이 없으면 CameraX가 다른 비율(16:9 등)로 알아서 물러나게 한다. 4:3을 고른 이유는 얼굴 사진에 세로 공간이 넉넉해서다.
- **2번, `ImageAnalysis` 만들기**
  - `setResolutionSelector(resolutionSelector)`: 1번에서 만든 전략을 분석용 프레임에 적용한다.
  - `setBackpressureStrategy(STRATEGY_KEEP_ONLY_LATEST)`: 앞 프레임 분석이 끝나지 않았으면 그 사이 들어온 옛 프레임은 버린다. 처리 능력이 낮은 기기에서도 분석이 밀려 쌓이지 않고, 메모리에 프레임이 여러 장 쌓이지 않으니 OOM도 줄어든다. 사용자는 늘 "지금" 화면에 대한 판단을 받는다.
- **3번, 분석기와 미리보기 연결**
  - `imageAnalysis.setAnalyzer(executor, analyzer)`: 프레임이 올 때마다 `executor` 스레드에서 `analyzer` 를 부른다.
  - `Preview.Builder().build().also { it.surfaceProvider = surfaceProvider }`: 미리보기를 만들고 그릴 칸을 붙인다.
- **4번, 생명주기에 묶기**
  - `unbindAll()`: 이전에 묶여 있던 유스케이스를 모두 풀어 깨끗한 상태에서 시작한다.
  - `bindToLifecycle(lifecycleOwner, DEFAULT_FRONT_CAMERA, preview, imageAnalysis)`: 앞쪽 카메라에 미리보기와 분석을 **동시에** 묶는다. 화면이 꺼지면 카메라가 닫히고 켜지면 다시 열린다.
  - `try { } catch`: 이 기기가 두 유스케이스 조합을 지원하지 않는 등 묶기에 실패하면 앱이 죽지 않게 잡는다. 원문 예시는 처리 부분을 비워 두었다. 실제 SDK라면 여기서 "카메라를 열 수 없음" 화면을 보여 줘야 한다.

**이 설정으로 SmileID는 화질과 데이터 요금을 함께 잡았다.**
- 고밀도 프레임을 요청해 기기 안에서 처리한 덕분에 **찍히는 셀피의 해상도가 4배**가 됐다.
- 동시에 **얼굴 부분만 잘라 기기에서 압축**한 뒤 올렸기 때문에, 서버로 보내는 크기는 예전 시스템과 똑같았다.
- 결과: 머신러닝 모델은 더 선명한 데이터를 받고, 사용자는 휴대폰 데이터 요금을 더 내지 않는다.

## 3. CameraX는 기기마다 다른 점을 어떻게 메우나

**CameraX로 표준을 정한 덕분에 SmileID는 두 겹의 호환성 작업에 기댈 수 있었다.**

### 3-1. Google의 카메라와 미디어 테스트 랩

- **무엇을 하나**: Google의 전용 "Camera and Media Test Lab" 에서 자동 테스트 묶음이 **매일**, **190종이 넘는 실제 Android 기기**를 돌아가며 돈다. 칩셋, OS 버전, 하드웨어 능력이 서로 다른 기기들이다.
- **왜**: 많이 쓰는 기기에서 CameraX가 같은 동작을 하도록 하기 위해서다.
- **결과**: CameraX 라이브러리에 새로 생긴 문제(회귀, 잘 되던 것이 다시 고장 나는 것)를 **개발자의 출시 코드에 닿기 전에** 자동으로 잡는다.

### 3-2. 기기 별난 점에 대한 자동 우회책

- **무엇이 문제인가**: 기기마다 물리적인 한계가 다르다. 어떤 기기는 노출(밝기) 설정을 직접 바꾸지 못하고, 어떤 기기는 특정 화면비에서 뒤집힌 이미지 데이터를 준다.
- **CameraX가 하는 일**: 개발자가 "제조사가 X이고 모델이 Y면 이렇게"라는 조건문으로 코드를 더럽히지 않도록, CameraX가 `camera-camera2` 모듈 안에 `DeviceQuirks`, `CameraQuirks` 같은 **별난 점 클래스 목록**을 직접 관리한다([`DeviceQuirksLoader.kt`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:camera/camera-camera2/src/main/java/androidx/camera/camera2/compat/quirk/DeviceQuirksLoader.kt)).
- **어떻게 동작하나**: 앱이 실행된 기기가 알려진 문제가 있는 기기라는 것을 CameraX가 알아채면, 그 기기에 맞춘 우회책을 **자동으로 끼워 넣는다.**
- **SmileID에게의 결과**: SDK 코드에 기기별 땜질 없이도 **18,000종이 넘는 기기**에서 안정적으로 동작했다.

## 4. 1억 6천만 건이 넘는 인증으로 커지다

**CameraX로 옮기면서 SmileID SDK를 가져다 쓰는 바깥 앱 개발자의 통합 작업도 쉬워졌다.**

**화면비 왜곡, 버벅이는 미리보기, 갑작스러운 OOM이 사라지자 SDK를 쓰는 서비스의 인증 통과율이 20% 올랐다.**
- 아프리카의 금융 기관과 모바일 머니 앱에게 통과율 20% 상승은, **수십만 명의 정상 사용자가 가입 도중 포기하지 않고 끝까지 가입했다**는 뜻이다.

<figure class="media"><img src="https://developer.android.com/static/blog/assets/juma_quote_card_blue_2f96951498_1vt0dY.webp" alt="파란 바탕의 인용 카드. 왼쪽에 By re-engineering our Mobile SDKs to incorporate CameraX, we dramatically simplified the integration process for developers. As a result, adoption of our Android SDKs grew 15x in the first year and reached 20x by the second year. Juma Allan, Mobile team, SmileID. 오른쪽 둥근 칸에 빨간 헬멧과 선글라스를 쓴 채 웃는 인물 사진" loading="lazy"><figcaption>인용 카드. SmileID 모바일 팀의 Juma Allan은 "모바일 SDK를 CameraX로 다시 짜면서 개발자의 통합 과정이 크게 단순해졌다. 그 결과 Android SDK 도입이 첫해에 15배, 2년째에 20배로 늘었다"고 말한다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification">원문</a>)</figcaption></figure>

**개발자들이 알아봤다.**
- CameraX 기반 SDK가 통합하기 쉬워지자 도입이 **첫해에 15배**로 뛰었고, **2년째에는 20배**가 됐다.
- 지금까지 SmileID는 CameraX로 **1억 6천만 건이 넘는** 신원 확인을 처리했다.

## 5. CameraX Skill로 내 앱의 호환성 이야기 만들기

**Android 팀은 SmileID가 쓴 CameraX 패턴을 다른 팀도 쓰도록 AI 코딩 에이전트용 [CameraX Skill](https://github.com/android/skills/tree/main/camera/camerax)을 냈다.**
- 개발 환경에서 이 스킬을 켜면 Gemini 같은 AI 코딩 에이전트가 최신 CameraX 패턴을 따라 코드를 짠다. 원문이 꼽은 분야는 다음과 같다.
  - Camera1에서 CameraX로 [옮기기](https://developer.android.com/media/camera/camerax/camera1-to-camerax)
  - 생명주기에 묶기(lifecycle binding)
  - [`ConcurrentCamera`](https://developer.android.com/reference/androidx/camera/core/ConcurrentCamera): 앞뒤 카메라를 동시에 쓰기
  - [`MlKitAnalyzer`](https://developer.android.com/media/camera/camerax/mlkitanalyzer): ML Kit(구글의 기기 안 머신러닝 라이브러리) 분석기를 `ImageAnalysis` 에 바로 붙이기
- 두 카메라 동시 화면, [`PreviewView`](https://developer.android.com/reference/androidx/camera/view/PreviewView)(View 방식 미리보기)나 [`CameraXViewfinder`](https://developer.android.com/reference/kotlin/androidx/camera/compose/CameraXViewfinder.composable)(Compose 방식 미리보기)로 미리보기 만들기, 실시간 머신러닝 분석 관리까지, 에이전트가 정확하고 출시할 수 있는 코드를 만들도록 이끈다고 한다.

**시작하는 방법은 두 가지다.**
- [Android 개발자 스킬 목록](https://developer.android.com/tools/agents/android-skills/browse)을 보거나, Android CLI로 `android skills add camerax` 를 실행해 AI 코딩 도구에 스킬을 추가한다.
- [CameraX 공식 문서](https://developer.android.com/training/camerax)부터 읽는다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide에는 카메라 기능이 없다. 그래서 CameraX 코드를 옮기지 않고, 이 글에서 가져올 만한 **두 가지 생각**을 Aide의 실제 모듈 구조(`core:calendar`)에 대 본다. 아래는 모두 **직접 쓴 스케치**이고, 아직 Aide에 있는 코드가 아니다.

### 1. 기기마다 다른 문제를 한곳에 모으기 — CameraX `DeviceQuirks` 의 축소판

Aide는 1-b에서 AI가 기기 캘린더에 일정을 쓰게 된다(`create_event`). 그런데 decisions.md에 **"삼성 계정 캘린더에 다른 앱이 쓸 수 있는지 갤럭시 실기기에서 착수 전 확인"** 이라는 미검증 항목이 있다. 만약 특정 제조사의 계정 캘린더가 쓰기를 막는다면, 그 사실을 화면 코드나 AI 도구 코드 곳곳의 `if (Build.MANUFACTURER == "samsung")` 으로 흩뿌리지 않고, CameraX처럼 **`core:calendar` 안 한 파일에 목록으로 모으는** 모양이다.

```kotlin
internal data class DeviceInfo(val manufacturer: String, val model: String, val sdkInt: Int)

internal sealed interface CalendarQuirk {
    data class ReadOnlyAccountType(val accountType: String) : CalendarQuirk
}

internal object CalendarQuirksLoader {
    fun load(device: DeviceInfo): Set<CalendarQuirk> = buildSet {
        if (device.manufacturer.equals("samsung", ignoreCase = true)) {
            add(CalendarQuirk.ReadOnlyAccountType("com.osp.app.signin"))
        }
    }
}

internal class CalendarQuirks @Inject constructor(device: DeviceInfo) {
    private val quirks = CalendarQuirksLoader.load(device)

    fun canWrite(source: CalendarSource): Boolean =
        source.writable && quirks.none { it is CalendarQuirk.ReadOnlyAccountType && it.accountType == source.accountType }
}
```

- **`DeviceInfo`**: `Build.MANUFACTURER`, `Build.MODEL`, `Build.VERSION.SDK_INT` 를 직접 읽지 않고 값 하나로 받는다. Hilt 모듈에서 실제 `Build` 값으로 만들어 넣고, 테스트에서는 `DeviceInfo("samsung", "SM-S921N", 35)` 처럼 아무 기기나 흉내 낼 수 있다. Task 7에서 `FakeTaskDao` 를 생성자로 넣은 것과 같은 방향이다.
- **`CalendarQuirk`**: 별난 점의 **종류**를 타입으로 둔다. 지금은 "이 계정 종류의 캘린더는 다른 앱이 쓸 수 없다" 하나뿐이다. 기기에서 새 문제가 확인되면 종류를 하나씩 더한다.
- **`CalendarQuirksLoader.load`**: "어느 기기에 어떤 별난 점이 있는가"를 판단하는 **유일한 곳**이다. 예시의 계정 종류 문자열(`com.osp.app.signin`)은 삼성 계정의 계정 종류로 흔히 알려진 값이지만, **이 문자열과 "쓰기가 막힌다"는 사실 모두 확인하지 않은 가정**이다. 실기기 확인 결과가 "문제없다"면 이 목록은 빈 채로 남는다.
- **`CalendarQuirks.canWrite`**: 바깥(1-b의 `create_event` 도구, 캘린더 선택 화면)은 이 함수 하나만 부른다. 바깥 코드는 제조사 이름을 모른다. 이것이 CameraX가 SmileID에게 준 것, 곧 "앱 코드에 기기별 조건문이 없다"의 Aide판이다.

### 2. 원하는 값과 "안 될 때의 규칙"을 함께 적기 — `ResolutionStrategy` 의 생각

`ResolutionStrategy(Size(1200, 900), FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER)` 는 "무엇을 원하는가"와 "그게 없으면 어디로 물러나는가"를 **한 줄에 같이** 적는다. Aide에서 AI가 일정을 만들 때 "어느 캘린더에 쓸지"도 같은 모양으로 적을 수 있다.

```kotlin
enum class WriteFallback { DEFAULT_THEN_ANY_WRITABLE, DEFAULT_ONLY }

data class WriteTarget(val preferredCalendarId: Long?, val fallback: WriteFallback)

internal fun List<CalendarSource>.pickWritable(target: WriteTarget, quirks: CalendarQuirks): CalendarSource? {
    val writable = filter(quirks::canWrite)
    val preferred = writable.firstOrNull { it.id == target.preferredCalendarId }
    return when (target.fallback) {
        WriteFallback.DEFAULT_ONLY -> preferred
        WriteFallback.DEFAULT_THEN_ANY_WRITABLE -> preferred ?: writable.firstOrNull()
    }
}
```

- **`WriteTarget`**: 설정에서 사용자가 고른 기본 캘린더(`preferredCalendarId`)와, 그 캘린더가 쓰기 불가일 때의 규칙(`fallback`)을 한 값으로 묶는다.
- **`DEFAULT_ONLY`**: CameraX의 `CLOSEST_HIGHER` 처럼 "원하는 것이 아니면 아예 고르지 않는다". 결과가 `null` 이면 AI는 일정을 만들지 않고 사용자에게 "기본 캘린더에 쓸 수 없다"고 알려야 한다.
- **`DEFAULT_THEN_ANY_WRITABLE`**: `CLOSEST_HIGHER_THEN_LOWER` 처럼 "원하는 것 먼저, 없으면 쓸 수 있는 다른 것". 이 경우 **다른 캘린더에 썼다는 사실을 활동 기록에 남겨야** 사용자가 나중에 찾을 수 있다.
- 어느 쪽을 기본으로 할지는 아래 "Aide에 적용하면" 2번의 사용자 결정이다.

## 배운 점

- **카메라 문제의 대부분은 "기기마다 다르다"는 문제다.** SmileID가 겪은 회전, 늘어남, 메모리 부족은 코드 버그라기보다 기기 생태계의 다양함에서 왔다. 그래서 해결도 앱 코드를 더 영리하게 짜는 것이 아니라, **기기 차이를 대신 떠안는 라이브러리**로 옮기는 것이었다.
- **기기별 땜질을 앱 코드에서 몰아내는 것 자체가 기능이다.** CameraX의 `DeviceQuirks` 목록과 매일 190종 실기기 테스트는 SmileID가 혼자서는 할 수 없는 일이다. SDK를 파는 회사에게 "18,000종 지원"은 그 결과로 따라온 판매 문구가 됐다.
- **"원하는 값"과 "안 될 때의 규칙"은 따로 두면 안 된다.** `ResolutionStrategy` 는 목표 해상도와 물러날 규칙을 한 객체에 넣는다. 규칙이 빠져 있으면 기기가 목표를 지원하지 않을 때 무슨 일이 일어날지 아무도 모른다.
- **화질을 올리면서 비용은 그대로 둘 수 있다.** 크게 찍고, 기기에서 필요한 부분(얼굴)만 잘라 압축해 보냈다. 화소는 4배인데 업로드 크기는 같다. "많이 모으고 적게 보낸다"는 원칙이다.
- **처리하지 못한 옛 데이터는 버려도 된다.** `STRATEGY_KEEP_ONLY_LATEST` 는 실시간 판단에서 밀린 프레임을 버리는 것이 정답임을 보여 준다. 쌓아 두면 늦고, 메모리도 터진다.
- **사례 글의 숫자는 회사가 밝힌 숫자다.** 원문 표는 "SmileID에 따르면"이라고 시작한다. 통과율 20% 상승에는 CameraX 말고 다른 요인(모델 개선 등)도 섞였을 수 있다. 원문은 그 분리를 보여 주지 않는다.

## Aide에 적용하면

Aide는 일정과 할 일을 돕는 앱이고, **카메라를 쓰는 기능이 없다.** 그래서 CameraX 자체는 가져오지 않는다. 대신 이 글의 생각 중 두 가지가 1-b(AI가 기기 캘린더에 일정을 쓰는 단계)에 바로 닿는다. decisions.md에는 이미 **"삼성 계정 캘린더에 다른 앱이 쓸 수 있는지 갤럭시 실기기에서 착수 전 확인"** 이라는 미검증 항목이 있다. 이 글은 그 확인 결과를 코드에 어떻게 담을지에 대한 답이다.

1. **CameraX를 쓰는 기능 — 지금은 안 한다.**
   - 이유: Aide의 기능(일정, 할 일, 리마인더, 아침 브리핑, AI 비서)에는 카메라가 들어갈 자리가 없다. 사진으로 일정을 읽는 기능(예: 포스터를 찍어 일정 만들기)을 나중에 넣게 되면, 그때 CameraX의 `ImageAnalysis` 와 `MlKitAnalyzer` 를 출발점으로 삼는다.
2. **기기마다 다른 캘린더 동작을 한곳에 모은다 — 바꿔서 가져온다. 시점은 1-b 착수 때.**
   - CameraX가 `DeviceQuirks` 목록으로 기기 차이를 앱 코드에서 몰아냈듯이, Aide는 기기 캘린더의 차이를 **`core:calendar` 모듈 안에만** 둔다. 지금도 `CalendarDataSource` 인터페이스가 `ContentResolver` 를 감추고 있어, 그 안쪽에 `CalendarQuirks` 를 하나 더 두면 된다("코드로 보기" 1번 스케치).
   - 바깥(1-b의 `create_event` 도구, 캘린더 선택 화면, 설정)은 `canWrite()` 만 묻고 **제조사 이름을 모르게** 한다. Konsist(모듈 규칙을 테스트로 지키는 도구) 규칙에 "`Build.MANUFACTURER` 는 `core:calendar` 밖에서 쓰지 않는다"를 더하는 것도 검토할 만하다.
   - 다만 **실기기 확인이 먼저다.** 갤럭시에서 삼성 계정 캘린더 쓰기가 아무 문제 없으면 별난 점 목록은 비어 있게 되고, 그때는 클래스를 만들지 않는다. 쓸 일이 없는 구조를 미리 만들지 않는다.
3. **"기본 캘린더에 쓸 수 없을 때"의 규칙을 미리 정한다 — 가져온다. 사용자 결정이 필요하다.**
   - `ResolutionStrategy` 처럼 원하는 값(설정의 기본 캘린더)과 물러날 규칙을 한 값(`WriteTarget`)으로 묶는다("코드로 보기" 2번 스케치).
   - 정해야 할 것: 기본 캘린더가 읽기 전용이거나 사라졌을 때 **(가) AI가 일정을 만들지 않고 사용자에게 알린다** 인지, **(나) 쓸 수 있는 다른 캘린더에 만들고 활동 기록에 "다른 캘린더에 만듦"을 남긴다** 인지. "시킨 일은 바로 하고 되돌릴 수 있게"라는 기존 결정과는 (나)가 더 잘 맞지만, 사용자가 모르는 캘린더에 일정이 생기는 것은 놀라운 일이라 (가)가 더 안전하다. 추천은 (가)다.
4. **처리하지 못한 옛 신호는 버린다 — 이미 같은 방향이다.**
   - `STRATEGY_KEEP_ONLY_LATEST` 와 같은 일을 Aide는 이미 하고 있다. `ContentResolverCalendarDataSource.observeChanges()` 가 캘린더 변경 신호를 `conflate()` 로 받아, 앞 처리가 끝나기 전에 온 신호들을 하나로 합친다. 따로 할 일은 없다.
   - 1-b에서 AI 응답을 화면에 흘려보낼 때도 같은 원칙을 쓴다. 사용자가 질문을 바꾸면 이전 요청은 `collectLatest`(새 값이 오면 앞 작업을 취소하는 수집)로 버린다.
5. **기기에서 줄여서 보낸다 — 바꿔서 가져온다. 1-b에서.**
   - SmileID는 크게 찍고 얼굴만 잘라 압축해 보냈다. Aide의 AI 호출도 같은 원칙을 쓴다. 사용자 자신의 API 키로 제공자를 직접 부르는 구조라 **보내는 글자 수가 곧 사용자 요금**이다.
   - AI에게 일정 전체를 보내지 않고, 질문에 필요한 기간의 일정만 제목, 시간, 캘린더 이름 정도로 줄여 보낸다. 메모나 참석자 같은 개인 정보는 질문이 필요로 할 때만 넣는다.
6. **CameraX Skill 같은 Android 공식 에이전트 스킬 — 지금은 안 한다.**
   - CameraX Skill 자체는 카메라가 없어 쓸 곳이 없다. 같은 [Android 스킬 목록](https://developer.android.com/tools/agents/android-skills/browse)에 Aide가 쓰는 분야(Compose, Room 등)의 스킬이 있는지는 아직 보지 않았다. 1-a는 사용자가 직접 코딩하는 단계라, AI 코딩 도구에 스킬을 넣을지는 1-a가 끝난 뒤 사용자가 정한다.
7. **매일 여러 실기기로 테스트하기 — 지금은 안 한다.**
   - Google 테스트 랩의 190종 매일 테스트는 라이브러리를 만드는 쪽의 일이다. 혼자 쓰는 Aide는 갤럭시 실기기 한 대에서 1-b 착수 전 한 번 확인하는 것으로 충분하다. 확인 결과는 decisions.md의 미검증 항목에 적어 닫는다.

## 출처

- [How SmileID Scaled Identity Verification to 18,000+ Android Device Types with CameraX — Android Developers Blog](https://developer.android.com/blog/posts/smileid-camerax-android-identity-verification) (Donovan McMurray, 2026-11-11)
- [Android 개발자 문서: CameraX 개요](https://developer.android.com/training/camerax)
- [Android 개발자 문서: ResolutionSelector](https://developer.android.com/reference/androidx/camera/core/resolutionselector/ResolutionSelector)
- [Android 개발자 문서: 이미지 분석(ImageAnalysis)](https://developer.android.com/media/camera/camerax/analyze)
- [Android 개발자 문서: Camera1에서 CameraX로 옮기기](https://developer.android.com/media/camera/camerax/camera1-to-camerax)
- [CameraX `DeviceQuirksLoader.kt` (AndroidX 소스)](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:camera/camera-camera2/src/main/java/androidx/camera/camera2/compat/quirk/DeviceQuirksLoader.kt)
- [android/skills: CameraX Skill (GitHub)](https://github.com/android/skills/tree/main/camera/camerax)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문 코드는 [Android 개발자 사이트 콘텐츠 라이선스](https://developer.android.com/license)에 따라 Apache 2.0으로 인용했다.
