---
issue: 754
date: 2026-11-22
title: 자동완성으로 요청 한도를 태우지 않는 법 — 보내기 전, 보낼 때, 받은 뒤
original_title: How to avoid burning your rate limit — Autocomplete in Compose Multiplatform
url: https://medium.com/@RolandMostoha/how-to-avoid-burning-your-rate-limit-autocomplete-in-compose-multiplatform-4e57e28b7c32
author: Roland Mostoha
tags: [Compose Multiplatform, Flow, Ktor, 네트워크]
aide:
  status: candidate
  module: feature:home
  task: 1-b
  summary: 1-a는 인터넷 권한이 없어 지금 할 일은 없다. 1-b에서 첫 화면 입력 막대가 AI 대화 입력이 되면, 글자마다 부르지 않고 보내기 버튼으로만 부르고, 자동 재시도를 하지 않으며, 401과 403은 "키 문제"로 429는 "잠시 뒤 다시"로 나눠 보여 준다. 제공자는 인터페이스 뒤에 두어 바꿔 끼울 수 있게 한다
---

## 한 줄 요약

장소 검색 자동완성은 글자를 칠 때마다 서버를 부르기 쉬워서, 무료 요금제의 **요청 한도(rate limit, 정해진 시간 안에 보낼 수 있는 요청 수)** 를 금방 다 써 버린다. 저자 Roland Mostoha는 직접 만든 등산 지도 앱 HuKi를 무료로 유지하려고, 요청을 아끼는 방법을 **보내기 전, 요청 안에서, 응답을 받은 뒤** 세 단계로 정리한다. 보내기 전에는 앞뒤 공백 자르기, 3글자 미만 무시, 입력이 멈출 때까지 기다리기(debounce), 같은 검색 두 번 안 보내기, 새 검색이 오면 이전 요청 취소를 한다. 요청 안에서는 검색 지역과 장소 종류를 좁히고 결과를 한 번에 많이 받는다. 받은 뒤에는 자동 재시도를 하지 않고 결과를 캐시한다. 그다음 무료로 쓸 수 있는 OpenStreetMap(오픈스트리트맵, 누구나 고치는 공개 지도) 검색 서비스 세 곳(Nominatim, Photon, LocationIQ)을 비교해 LocationIQ를 고르고, Compose Multiplatform(Android와 iOS 화면을 Compose 하나로 만드는 기술)으로 자동완성 화면을 **커밋 하나에 한 단계씩** 만들어 보인다. 핵심 코드는 Kotlin Flow 연산자 몇 줄이다.

> 원문 데모 저장소 [RolandMostoha/LocationIQ-CMP-demo](https://github.com/RolandMostoha/LocationIQ-CMP-demo)에는 라이선스 파일이 없다(GitHub 라이선스 조회 결과 없음). 그래서 원문 코드는 그대로 옮기지 않고, 같은 내용을 **직접 쓴 스케치**로 다시 썼다. 원문 그림 3장은 파일을 복사하지 않고 원문 서버(Medium) 주소를 걸어 보여 준다. 이 글의 스케치는 컴파일해 보지 않았다.

<figure class="media"><img src="https://miro.medium.com/v2/resize:fit:1400/format:png/1*SAG-91gZDo3Oowgf55EQ0Q.png" alt="원문 대표 그림. 왼쪽에 큰 글씨로 How to avoid burning your rate limit, 그 아래 작은 글씨로 Autocomplete in Compose Multiplatform with LocationIQ 라고 적혀 있다. 오른쪽에 휴대폰 두 대가 비스듬히 놓여 있다. 왼쪽 Android 폰은 검색칸에 dobogoko를 쳤고 Dobogókő, Dobogókő jurtaszállások 같은 헝가리 장소가 Hamlet, Hostel 같은 분홍 종류 꼬리표와 함께 나온다. 오른쪽 iPhone은 Yosemite를 쳤고 Yosemite National Park, Yosemite Valley 같은 장소가 Protected Area, Valley 꼬리표와 함께 나온다" loading="lazy"><figcaption>원문 대표 그림. Android(왼쪽)와 iPhone(오른쪽)에서 같은 자동완성 화면이 돈다. 장소 이름 아래에 주소가 한 줄 더 있고, 이름 옆 분홍 꼬리표가 장소 종류다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://medium.com/@RolandMostoha/how-to-avoid-burning-your-rate-limit-autocomplete-in-compose-multiplatform-4e57e28b7c32">원문</a>)</figcaption></figure>

## 먼저 알아 둘 말

- **자동완성(autocomplete)**: 검색칸에 글자를 치는 동안 맞을 만한 결과를 아래에 바로 보여 주는 기능이다. 글자가 바뀔 때마다 결과도 바뀌어야 해서, 그냥 만들면 글자마다 서버를 부르게 된다.
- **요청 한도(rate limit)**: 서비스가 "하루 5,000번, 1분에 60번, 1초에 2번"처럼 정해 둔 요청 수의 상한이다. 넘으면 서버가 HTTP 429(요청이 너무 많음)로 거절한다. 원문 제목의 "태운다(burn)"는 이 한도를 쓸데없이 써 버린다는 뜻이다.
- **토큰(token)**: 원문에서는 "요청 한 번에 드는 비용 단위"라는 뜻으로 쓴다. LLM의 글자 토큰이 아니라, 한도에서 깎이는 요청 수라고 보면 된다. API 키를 뜻하는 "access token"과는 다른 말이다.
- **지오코딩(geocoding)**: 장소 이름이나 주소를 좌표로 바꾸는 일이다. 반대로 좌표를 주소로 바꾸면 역지오코딩(reverse geocoding)이다. Android의 `Geocoder` 클래스가 하는 일과 같다.
- **OpenStreetMap(OSM)**: 누구나 고칠 수 있는 공개 세계 지도 데이터다. 지도 위의 모든 것(도시, 길, 카페)이 "종류:값" 꼬리표(예: `place:city`, `amenity:cafe`)를 달고 있다.
- **Compose Multiplatform(CMP)**: JetBrains가 만든 기술로, Jetpack Compose와 같은 문법으로 Android와 iOS 화면을 함께 만든다. 공통 코드는 `commonMain` 폴더에 두고, 플랫폼마다 다른 부분만 따로 쓴다.
- **Ktor 클라이언트**: JetBrains의 HTTP 라이브러리다. Kotlin Multiplatform에서 Android와 iOS가 같은 네트워크 코드를 쓰게 해 준다. Android의 Retrofit과 OkHttp가 하는 일과 같다.
- **DTO(Data Transfer Object)**: 서버 응답 JSON 모양을 그대로 옮긴 데이터 클래스다. 화면에서 쓰기 좋게 바꾼 클래스(UI 모델)와 따로 둔다.
- **Flow 연산자**: Kotlin Flow에 줄줄이 붙여 값을 거르고 바꾸는 함수들이다. 이 글에 나오는 것은 아래와 같다.
  - `map`: 값을 바꾼다.
  - `filter`: 조건에 맞는 값만 통과시킨다.
  - `debounce(시간)`: 값이 그 시간 동안 더 오지 않을 때만 마지막 값을 내보낸다. 입력이 잠깐 멈출 때까지 기다리는 장치다.
  - `distinctUntilChanged()`: 바로 앞 값과 같으면 버린다.
  - `flatMapLatest { }`: 값마다 안쪽 Flow를 새로 시작하고, 새 값이 오면 **앞의 안쪽 Flow를 취소**한다.
  - `launchIn(scope)`: 이 Flow를 그 코루틴 범위에서 돌린다.
- **Autofill Framework(자동 채우기)**: 기기에 저장된 주소, 비밀번호 같은 것을 입력칸에 채워 주는 Android 장치다. 입력칸이 "주소를 받는 칸"이라고 알려 주면 저장된 주소를 제안한다.
- **IME 동작(`ImeAction`)**: 키보드 오른쪽 아래 버튼이 무엇을 할지 정하는 값이다. `ImeAction.Search` 면 그 버튼이 "검색"이 된다. View 시스템의 `android:imeOptions="actionSearch"` 와 같다.

## 서론 — 누구나 한 번은 만드는 장소 검색

- **무엇을 다루나**
  - 장소 검색 자동완성은 개발자라면 한 번쯤 만들어 보는 기능이다.
  - 이 글의 목적은 요청을 아끼는 좋은 습관을 LocationIQ 데모로 보여 주는 것이다. 데모는 Compose Multiplatform으로 Android와 iOS에서 함께 돈다.
- **글의 차례**
  - 저자의 사연과 동기, 요청을 아끼는 좋은 습관, 알맞은 OSM 검색 서비스 고르기, LocationIQ 자동완성을 Compose Multiplatform에 붙이는 단계별 안내 순서다.

## 1. 사연과 동기 — 무료 앱을 무료로 유지하려면

- **HuKi(헝가리 등산 지도)**
  - 저자가 개인적으로 만드는 앱이다. OpenStreetMap 기반 지도 엔진을 쓴다.
  - 등산 앱이라 장소 검색과 지오코딩이 거의 모든 기능에 들어간다.
- **제약**
  - HuKi는 저자가 자기 돈으로 운영하고, 누구나 무료로 쓰게 두는 것이 목표다.
  - 그래서 두 가지가 필요했다. 첫째, 무료이거나 아주 싼 요금제가 있는 검색 서비스를 찾는다. 둘째, 꼭 필요할 때만 요청 한도를 쓰도록 요청을 아낀다.

## 2. 요청을 아끼는 좋은 습관

저자는 검색 서비스를 직접 운영하든 돈을 내고 쓰든, 부르는 횟수를 줄이면 손해 볼 일이 없다고 말한다. 요청이 적으면 한도가 덜 깎이고, 서버도 덜 바쁘다. 습관은 요청 흐름의 세 지점으로 나뉜다.

### 2-1. 요청을 보내기 전

- **앞뒤 공백을 자른다**: `"Budapest"` 와 `"Budapest "` 는 같은 검색이다. 요청도 한 번이어야 한다.
- **같은 검색을 연달아 보내지 않는다**: 방금 보낸 검색어와 같으면 다시 보내지 않는다.
- **3글자 미만은 보내지 않는다**: 두 글자로는 지구 절반이 걸린다. 결과도 쓸모없고 한도만 깎인다.
- **입력이 멈출 때까지 기다린다(debounce)**: 약 1초 동안 더 치지 않을 때만 보낸다. 20글자 장소 이름을 빠르게 치면 요청 20번이 아니라 1번이 된다.
- **가장 최근 요청만 남긴다**: 새 검색어가 오면 아직 응답을 기다리던 이전 요청을 취소한다. 늦게 도착한 옛 응답이 새 결과를 덮어쓰는 일이 없어진다.
- **플랫폼의 주소 자동 채우기를 쓴다**: 사용자가 정확한 주소를 고르게 도우면, 첫 검색에서 맞는 결과가 나올 확률이 높다. 화면도 편해지고 요청도 준다.
- **"→" 채우기 버튼(tap ahead)**: 자동완성 결과 옆의 화살표를 누르면 그 주소 전체가 검색칸에 채워진다. 이유는 바로 위와 같다. 다시 칠 필요가 없어 요청이 준다.

### 2-2. 요청 안에서

- **검색 지역을 좁힌다**: 나라 코드(`countrycodes`), 지도 사각형(`viewbox`)과 그 안으로만 제한(`bounded`)을 넣어 엉뚱한 결과를 줄인다. 사용자가 검색어를 고쳐 다시 찾을 일이 줄어든다. 저자의 앱은 헝가리 전용이라, 헝가리로 묶는 것이 가장 크게 아끼는 방법이다.
- **장소 종류로 거른다**: `tag` 로 앱에 필요 없는 종류의 장소를 뺀다.
- **결과 수를 최대로 받는다**: `limit` 를 최댓값 20으로 두어 한 번의 요청으로 목록을 다 채운다.
- **서버에서 중복을 지운다**: 서비스가 지원하면 `dedupe=1` 로 같은 장소가 여러 줄로 오지 않게 한다. 서버의 중복 제거는 "되도록"이라서, 앱에서도 `distinctBy` 로 한 번 더 거른다.

### 2-3. 응답을 받은 뒤

- **자동으로 다시 시도하지 않는다**: 실패하면 사용자가 다시 시도하게 둔다. 그것도 다시 시도해서 의미가 있을 때만이다. 다시 시도 버튼에도 debounce를 건다.
- **응답을 캐시한다**: 최근의 "요청 → 응답" 짝을 메모리에 들고 있다가, 이미 찾았던 검색어로 돌아가면 요청 없이 보여 준다.
- **고른 장소를 저장한다**: 사용자가 고른 장소를 저장해 두면 "최근 장소"를 요청 없이 보여 줄 수 있다.
- **주의: 서비스의 캐시 정책을 꼭 확인한다**
  - 예를 들어 LocationIQ 무료 요금제는 응답 데이터(장소 정보)는 원하는 만큼 저장해도 되지만, "요청 → 응답" 짝은 48시간까지만 저장할 수 있다.

## 3. 알맞은 OSM 검색 서비스 찾기

| 서비스 | 어떤 것인가 | 저자가 고르지 않은(또는 고른) 이유 |
|---|---|---|
| Nominatim | OpenStreetMap 공식 지오코더다. 다른 서비스 대부분이 이것 위에 만들어졌다. 무료 공개 서버도 있다. | 자동완성 API가 없다. 게다가 이용 정책이 공개 서버로 자동완성을 흉내 내는 것을 금지한다. 직접 운영하려면 PostgreSQL과 PostGIS 데이터베이스, 지구 전체 OSM 데이터 가져오기, 데이터를 최신으로 유지하는 장치가 필요하고, 자동완성까지 직접 만들어야 해서 일이 크다. |
| Photon | komoot이 만든 오픈소스 지오코더다. OSM 데이터를 Elasticsearch로 검색한다. 무료 공개 서버(photon.komoot.io)가 있다. | 자동완성을 기본으로 지원해서 저자는 처음부터 실제 앱에서 무료 공개 서버를 썼다. 하지만 서버가 아예 멈추거나 응답이 10~20초 걸리는 일이 잦았다. 직접 운영할 수도 있지만, 덮는 지역이 넓을수록 운영비가 커진다. |
| LocationIQ | 여러 데이터를 쓰는 상용 지오코딩 서비스다. OSM이 주된 데이터 중 하나다. 직접 운영할 수는 없고 서비스로만 쓴다. 자동완성 말고도 지오코딩, 역지오코딩, 지도 타일, 길찾기 API가 있다. | 대안을 찾다가 골랐다. 무료 요금제로 먼저 써 볼 수 있고, API와 문서가 깔끔하다. 글을 쓴 시점의 무료 한도는 하루 5,000번, 1초에 2번, 1분에 60번이다. |

- 저자가 짚는 주의점: 하루 한도보다 **1분, 1초 한도**가 문제다. 사용량이 어느 수준을 넘으면 이 짧은 한도를 맞추는 것이 기술적으로 어렵다. 바로 앞 2장의 debounce와 이전 요청 취소가 이 한도를 지키는 장치이기도 하다.

## 4. Compose Multiplatform 앱 만들기 — 커밋 하나에 한 단계

- **데모 저장소는 커밋 순서대로 읽게 만들었다**
  - 저장소: [RolandMostoha/LocationIQ-CMP-demo](https://github.com/RolandMostoha/LocationIQ-CMP-demo). 커밋 하나가 한 단계이고, 단계마다 빌드되고 돈다.
  - `step-0`: Android Studio의 "New Kotlin Multiplatform project" 기본 틀이다.
  - `step-1`: 검색칸 화면과, 사용자 동작을 받는 `GeocodingViewModel` 이다.
  - `step-2`: debounce와 최소 글자 수다.
  - `step-3`: Ktor 클라이언트, LocationIQ DTO, 저장소(repository)다.
  - `step-4`: DTO를 화면 모델로 바꾸는 변환기(mapper)와 결과 목록이다.
  - `step-5`: 로딩, 오류, 빈 결과 상태와 `GeocodingRepository` 인터페이스 분리다.

<figure class="media"><img src="https://miro.medium.com/v2/resize:fit:1400/format:png/1*GHEJorXe9SOSOvlK1DclYQ.png" alt="완성된 데모 화면. 휴대폰 두 대가 나란히 있다. 둘 다 위에 LocationIQ 로고, 그 아래 Search for a place 라는 테두리 글이 붙은 둥근 검색칸이 있고, 검색칸 오른쪽에 지우기 X 버튼이 있다. 왼쪽 Android 폰은 dobogoko를 쳐서 Dobogókő(Hamlet), Dobogókő Szánkópálya(Winter Sports), Dobogókői Nagykilátó(Viewpoint), Dobogókő, hegytető(Bus Stop) 같은 결과가 나온다. 오른쪽 iPhone은 Yosemite를 쳐서 Yosemite National Park(Protected Area), Upper Yosemite Fall(Attraction), Yosemite Valley Lodge(Hotel), Yosemite Point(Peak) 같은 결과가 나온다. 줄마다 왼쪽에 분홍 위치 핀 아이콘, 굵은 장소 이름, 분홍 종류 꼬리표, 회색 주소 줄이 있다" loading="lazy"><figcaption>완성된 데모의 결과 목록(step-4 이후). 왼쪽은 Android에서 헝가리 산 이름 "dobogoko", 오른쪽은 iPhone에서 "Yosemite"를 찾은 모습이다. 한 줄은 장소 이름(굵게), 종류 꼬리표, 그 아래 나머지 주소로 되어 있다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://medium.com/@RolandMostoha/how-to-avoid-burning-your-rate-limit-autocomplete-in-compose-multiplatform-4e57e28b7c32">원문</a>)</figcaption></figure>

### 4-0. API 키 받기

- LocationIQ에 가입하고 토큰(API 키)을 받는다. 키는 요청마다 `key` 라는 쿼리 매개변수로 붙는다.
- 데모는 키를 한곳에 둔다.

```kotlin
// 직접 쓴 스케치: 원문 LocationIqConfig.kt 와 같은 모양
internal const val LOCATIONIQ_API_KEY = "YOUR_LOCATIONIQ_ACCESS_TOKEN"
```

- 저자의 경고: 데모를 그대로 쓴다면 **진짜 키를 git에 커밋하지 않는다.**

### 4-1. step-1 — 검색칸과 `GeocodingViewModel`

- **목표**: Android와 iOS의 관례에 맞는 검색칸을 만들고, 검색 상태를 들고 있는 `GeocodingViewModel` 을 둔다. 아직 네트워크는 부르지 않는다. 화면과 입력 처리만 만든다. ([step-0과의 차이](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-0...step-1))
- **검색칸 설정과 이유**
  - `keyboardType = KeyboardType.Text`: 기본 글자 키보드다.
  - `imeAction = ImeAction.Search`: 키보드 오른쪽 아래 버튼이 줄 바꿈 대신 "검색"이 된다.
  - `singleLine = true`: 여러 줄 입력칸은 그 버튼이 항상 줄 바꿈을 넣는다. 그래서 한 줄로 막는다.
  - `capitalization = KeyboardCapitalization.Words`: 단어마다 첫 글자를 대문자로 바꾼다. 장소 이름을 쓰는 방식과 같다.
  - `semantics { contentType = ContentType.PostalAddress }`: 이 칸이 주소 칸이라고 자동 채우기에 알린다. 이 설정은 Android에서만 듣는다. iOS는 네이티브 칸을 감싸서 `.textContentType(.fullStreetAddress)` 를 줘야 한다.

```kotlin
// 직접 쓴 스케치: 원문 step-1 검색칸 설정을 한곳에 모은 모양
OutlinedTextField(
    value = query,
    onValueChange = onQueryChange,
    label = { Text("Search for a place") },
    singleLine = true,
    keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Text,
        imeAction = ImeAction.Search,
        capitalization = KeyboardCapitalization.Words,
    ),
    modifier = Modifier.semantics { contentType = ContentType.PostalAddress },
)
```

### 4-2. step-2 — 요청을 아끼는 연산자를 Flow로 한 줄씩

- **목표**: 검색칸과 검색 사이에 요청을 아끼는 연산자를 끼워, 장소 이름을 칠 때 글자마다가 아니라 한 번만 부르게 한다. 이 단계에서는 네트워크 호출을 흉내만 낸다. 실제 서버를 부르지 않고 동작을 볼 수 있다. ([step-1과의 차이](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-1...step-2))
- 저자 말대로 **키 하나하나가 HTTP 요청 후보**다. 2장의 습관 대부분을 Kotlin Flow 연산자로 짧게 쓸 수 있다.

```kotlin
// 직접 쓴 스케치: 원문 step-2 GeocodingViewModel 의 init 블록과 같은 연산자 순서
init {
    uiState
        .map { state -> state.query.trim() }              // 1. 앞뒤 공백 자르기
        .filter { query -> query.length >= MIN_QUERY_LENGTH } // 2. 3글자 미만 버리기
        .debounce(DEBOUNCE_TIMEOUT)                         // 3. 입력이 멈출 때까지 기다리기
        .distinctUntilChanged()                             // 4. 바로 앞과 같은 검색어 버리기
        .flatMapLatest { query -> search(query) }           // 5. 새 검색어가 오면 이전 검색 취소
        .onEach { result -> uiState.update { it.copy(result = result) } }
        .launchIn(viewModelScope)
}
```

- **줄마다 무엇을 하나**
  - `map { trim() }`: `"Budapest"` 와 `"Budapest "` 를 같은 값으로 만든다.
  - `filter`: 두 글자 검색은 지구 절반이 걸리면서도 한도는 똑같이 깎는다. 보통 3글자를 하한으로 둔다.
  - `debounce(X)`: X 동안 입력이 멈출 때까지 기다린다. 빠르게 친 20글자는 요청 1번이 된다.
  - `distinctUntilChanged()`: 바로 앞과 같은 값을 버린다. **이 연산자가 `debounce` 뒤에 있는 것은 일부러다.** `debounce` 뒤에서는 "실제로 보낼 검색어"만 보기 때문이다. 내가 덧붙이는 예: "Buda"로 검색이 나간 뒤 "s"를 쳤다가 1초 안에 지우면, 값은 "Buda", "Budas", "Buda" 순서로 온다. `distinctUntilChanged()` 가 `debounce` 앞에 있으면 이 셋은 모두 바로 앞 값과 달라서 통과하고, `debounce` 는 마지막 "Buda"를 내보내 같은 검색이 한 번 더 나간다. 뒤에 있으면 "방금 보낸 Buda와 같다"고 보고 버린다.
  - `flatMapLatest`: 새 검색어가 오면 이전 안쪽 Flow(진행 중인 검색)를 취소한다. **취소 덕분에 항상 가장 최근 검색어가 이긴다.**

### 4-3. step-3 — Ktor, 저장소, DTO, 결과를 좁히는 매개변수

- **목표**: 흉내 낸 검색을 실제 LocationIQ 자동완성 호출로 바꾼다. Ktor 클라이언트, 저장소, DTO, 결과를 좁히는 쿼리 매개변수를 넣는다. 결과는 아직 글자로만 보인다. 꾸민 목록은 다음 단계에서 만든다. ([step-2와의 차이](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-2...step-3))
- **자동완성 호출의 중요한 매개변수**
  - `tag`: 결과를 OSM "종류:값" 짝으로 제한한다. 예: `place:city`, `amenity:cafe`.
  - `viewbox` 와 `bounded`: `viewbox` 는 결과를 그 사각형 쪽으로 기울이고, `bounded` 를 켜면 그 기울기가 "사각형 밖은 빼라"는 엄격한 조건이 된다.
  - `dedupe`: 같은 실제 장소를 여러 OSM 객체가 가리킬 때 한 줄만 돌려준다.
  - `importancesort`: 거리만이 아니라 장소의 중요도로 정렬한다.

```kotlin
// 직접 쓴 스케치: 원문 step-3 의 자동완성 호출을 Ktor 로 쓴 모양 (매개변수 이름은 LocationIQ 문서 기준)
suspend fun autocomplete(query: String): List<PlaceDto> =
    client.get("https://api.locationiq.com/v1/autocomplete") {
        parameter("key", LOCATIONIQ_API_KEY)
        parameter("q", query)
        parameter("countrycodes", "hu")   // 헝가리로만
        parameter("limit", 20)            // 한 번에 최대로
        parameter("dedupe", 1)            // 서버에서 중복 제거
    }.body<List<PlaceDto>>()
        .distinctBy { it.osmType to it.osmId } // 서버 중복 제거는 "되도록"이라 앱에서 한 번 더
```

- **`PlaceDTO` 에서 눈여겨볼 칸**
  - `boundingbox`: 장소를 감싸는 사각형이다. 지도 확대 정도를 정할 때 중요하다. 가게 하나와 도시 하나는 확대 정도가 달라야 한다.
  - `placeId`: LocationIQ 자체 번호다. 데이터를 다시 가져올 때마다 바뀔 수 있어 오래 저장하는 열쇠로 쓰면 안 된다.
  - `osmId`: `osmType` 과 짝지어야만 유일하다. 그 짝조차 장소 자체가 아닐 때가 있다. 우편번호 결과는 상위 도시나 동네를, 번지가 추정된 주소는 상위 도로를 가리킬 수 있다.
- **장소를 저장할 때의 열쇠**
  - LocationIQ 팀은 `osmType + osmId` 만으로 장소를 구분하지 말라고 한다. 캐시에는 "요청과 응답 짝의 해시"를, 장소 저장에는 `osmType + osmId + displayName` 으로 만든 값을 권한다.
  - 데모는 단순하게 `osmType + osmId` 를 쓴다. 데모 목적에는 이것으로 충분하다고 저자는 말한다.
- **장소 이름과 주소 칸**
  - `displayName`: OSM이 아는 모든 것을 이은 전체 주소 한 줄이다. 목록 한 줄에 넣기엔 보통 너무 길다.
  - `displayPlace`: 이름 부분만이다. 도시면 도시 이름, 도로면 도로 이름이다. 목록의 **제목 줄**로 쓴다.
  - `displayAddress`: `displayPlace` 에 이미 나온 것을 뺀 나머지 주소다. 목록의 **부제목 줄**로 쓴다.
  - `address`: 같은 주소를 도로, 도시, 우편번호, 나라 코드 같은 칸으로 나눈 것이다. 한 부분만 필요할 때 쓴다.

### 4-4. step-4 — DTO를 화면 모델로 바꾸고 결과 목록 그리기

- **목표**: DTO를 목록이 그리기 좋은 화면 모델로 바꾸고, 결과를 꾸민 목록으로 보여 준다. ([step-3과의 차이](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-3...step-4))
- 결과: 위 4장 첫 그림처럼 한 줄에 위치 핀, 굵은 `displayPlace`, 종류 꼬리표, 회색 `displayAddress` 가 보인다.

### 4-5. step-5 — 로딩, 오류, 빈 결과

- **목표**: 성공 결과가 아닌 모든 경우를 처리한다. 로딩, 결과 없음, 한도 초과, 키 오류다. 그리고 테스트하기 쉽고, 고치기 쉽고, 바꿔 끼우기 쉽게 저장소를 `GeocodingRepository` 인터페이스로 뺀다. ([step-4와의 차이](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-4...step-5))

<figure class="media"><img src="https://miro.medium.com/v2/resize:fit:1400/format:png/1*DVFT9K-vmrhxgoSxjCPJ4A.png" alt="세 가지 상태 화면. 휴대폰 세 대가 나란히 있고 모두 LocationIQ 검색칸에 Dobogoko 비슷한 글이 있다. 왼쪽 폰은 가운데 분홍 원형 진행 표시와 Loading... 글자가 있다. 가운데 폰은 분홍 원 안의 돋보기 아이콘, No places found 제목, We couldn't find a match for Dobogokoo. Try a different spelling or a nearby landmark 라는 안내가 있다. 오른쪽 폰은 분홍 원 안의 경고 삼각형, Search unavailable 제목, We couldn't reach LocationIQ. Check your connection and try again 이라는 안내가 있다" loading="lazy"><figcaption>step-5의 세 상태. 왼쪽은 로딩 중, 가운데는 결과 없음("다른 철자나 가까운 랜드마크로 찾아보라"), 오른쪽은 서비스에 닿지 못함("연결을 확인하고 다시 시도하라")이다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://medium.com/@RolandMostoha/how-to-avoid-burning-your-rate-limit-autocomplete-in-compose-multiplatform-4e57e28b7c32">원문</a>)</figcaption></figure>

- **꼭 처리할 오류**
  - **HTTP 404 Not Found**: 검색어에 맞는 장소가 없다는 뜻이다. **오류가 아니다.** LocationIQ는 결과가 없을 때 이렇게 답한다. 그래서 "결과 없음" 화면으로 보여 준다.
  - **HTTP 401 Unauthorized 또는 403 Forbidden**: 키가 틀렸거나 아직 켜지지 않았다.
  - **HTTP 429 Too Many Requests**: 초, 분, 하루 한도 중 하나에 걸렸다.

- **step-2의 Flow에서 바뀐 두 가지**
  - **`filter` 가 `else` 가지가 됐다.**
    - 이유: `filter` 는 짧은 검색어를 그냥 삼킨다. 그래서 "bud"를 지워 "bu"가 되면 아무 값도 안 내보내고, 화면에는 "bud"의 옛 결과가 그대로 남는다.
    - 결과: 짧은 검색어면 `PlacesResult.Idle`(아무것도 안 하는 상태)을 내보내 목록을 비운다.
  - **`debounce()` 가 `flatMapLatest` 안의 `delay()` 가 됐다.**
    - 이유: `debounce` 는 기다리는 동안 아무 값도 안 내보낸다. 그래서 그 사이에 로딩 표시를 띄울 틈이 없다.
    - 결과: 먼저 `Loading` 을 내보내고 그다음 기다린다. 다음 키가 들어오면 `flatMapLatest` 가 기다리던 `delay` 를 취소하므로, 요청을 아끼는 효과는 그대로다.

```kotlin
// 직접 쓴 스케치: 원문 step-5 의 flatMapLatest 와 같은 흐름
.flatMapLatest { query ->
    if (query.length < MIN_QUERY_LENGTH) {
        flowOf(PlacesResult.Idle)               // 짧으면 목록 비우기
    } else {
        flow {
            emit(PlacesResult.Loading)          // 먼저 로딩 표시
            delay(DEBOUNCE_TIMEOUT)             // 다음 키가 오면 여기서 취소된다
            emitAll(search(query))              // 다 기다렸으면 실제로 부른다
        }
    }
}
```

- **왜 `GeocodingRepository` 인터페이스로 빼나**
  - 실제 구현은 `LocationIqGeocodingRepository` 다.
  - **테스트하기 쉽다**: ViewModel이 인터페이스를 받으므로, 테스트에서 가짜(fake) 저장소를 넣을 수 있다.
  - **서비스에 묶이지 않는다**: 저자의 사연처럼 가격, 지역, 라이선스 때문에 서비스를 바꿀 수 있다. 인터페이스가 있으면 구현 하나만 새로 쓰고 앱의 나머지는 그대로 둔다.

## 5. 맺음말

- 저자는 빠뜨린 좋은 습관이 있으면 알려 달라고 하며 글을 맺는다.
- 원문 끝에는 데모 저장소, HuKi-KMP, LocationIQ 가입과 문서와 OpenAPI 명세와 가격과 이용 약관, Nominatim과 이용 정책, Photon과 공개 서버, OpenStreetMap 저작권 안내, Compose Multiplatform의 Ktor 설정 문서 링크가 있다. 아래 "출처"에 옮겨 두었다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide 1-a는 인터넷을 쓰지 않는다(1-a 설계 문서: "1-a는 인터넷 권한이 없다"). 그래서 아래는 **1-b에서 첫 화면 입력 막대가 AI 대화 입력이 될 때**를 가정한 스케치다. 직접 썼고 컴파일해 보지 않았다. Aide 코드는 고치지 않았다.

### 1. AI는 글자마다가 아니라 보내기 버튼으로만 부른다

- 원문은 자동완성이라 글자마다 부를 이유가 있었고, 그래서 debounce가 필요했다. Aide의 AI 대화는 사용자가 [보내기]를 누를 때 한 번 부르면 된다. 자동완성처럼 글자마다 부를 이유가 없으니 debounce도 필요 없다.
- 원문의 "같은 검색 두 번 안 보내기"와 "새 요청이 오면 이전 요청 취소"는 그대로 쓸모 있다. 버튼을 연달아 눌렀을 때 요청이 겹치지 않게 한다.

```kotlin
// 직접 쓴 스케치: feature/home/.../HomeViewModel.kt (1-b 가정)
private val sendRequests = MutableSharedFlow<String>(extraBufferCapacity = 1)

init {
    sendRequests
        .map { it.trim() }
        .filter { it.isNotEmpty() }                 // 계획서 Task 8: 공백만 있는 글은 추가 안 함
        .flatMapLatest { message ->                 // 연달아 누르면 앞 요청은 취소
            flow {
                emit(AiState.Thinking)
                emit(aiRepository.ask(message))     // 실패해도 자동 재시도하지 않는다
            }
        }
        .onEach { aiState -> _uiState.update { it.copy(ai = aiState) } }
        .launchIn(viewModelScope)
}

fun onSendClick(text: String) { sendRequests.tryEmit(text) }
```

### 2. 실패를 세 갈래로 나눠 보여 준다

- 원문이 404를 "오류가 아님"으로, 401과 403을 "키 문제"로, 429를 "한도 초과"로 나눈 것처럼, Aide도 LLM 제공자의 응답을 사용자가 할 일이 다른 갈래로 나눈다.

```kotlin
// 직접 쓴 스케치: core/data/.../ai/AiResult.kt (1-b 가정)
sealed interface AiResult {
    data class Answer(val text: String) : AiResult
    data object KeyProblem : AiResult    // 401, 403: 설정에서 키를 확인하라고 안내
    data object TooMany : AiResult       // 429: 잠시 뒤 다시 보내라고 안내, 자동 재시도 없음
    data object Unreachable : AiResult   // 연결 실패: 연결을 확인하고 다시 보내라고 안내
}
```

### 3. 제공자는 인터페이스 뒤에 둔다

```kotlin
// 직접 쓴 스케치: core/data/.../ai/AiRepository.kt (1-b 가정)
interface AiRepository {
    suspend fun ask(message: String): AiResult
}
// 구현은 제공자마다 하나씩: OpenAiRepository, AnthropicRepository, GeminiRepository ...
// 테스트는 FakeAiRepository 로 Answer, KeyProblem, TooMany 를 차례로 돌려 본다
```

## 배운 점

- **요청을 아끼는 일은 흐름의 세 지점에서 한다.** 보내기 전(자르기, 거르기, 기다리기, 같은 것 버리기, 앞 요청 취소), 요청 안(범위 좁히기, 한 번에 많이 받기), 받은 뒤(자동 재시도 안 하기, 캐시)다. 한 곳만 손봐서는 부족하다.
- **Flow 연산자의 순서가 뜻을 바꾼다.** `distinctUntilChanged()` 를 `debounce()` 뒤에 두어야 "실제로 보낼 검색어"끼리 비교한다. 순서를 바꾸면 같은 연산자로 다른 일을 하게 된다.
- **`filter` 는 값을 삼켜서 화면에 옛 결과를 남긴다.** 걸러진 경우도 화면 상태로 표현해야 한다(`Idle`). "보내지 않는다"와 "화면을 비운다"는 다른 일이다.
- **`debounce` 는 기다리는 동안 아무 말도 안 한다.** 로딩 표시가 필요하면 `flatMapLatest` 안에서 `Loading` 을 먼저 내보내고 `delay` 로 기다린다. 취소는 `flatMapLatest` 가 맡으니 아끼는 효과는 같다.
- **HTTP 상태 코드가 곧 화면 상태다.** 404를 오류로 보여 주면 사용자는 "고장 났다"고 느낀다. 서비스가 상태 코드를 어떤 뜻으로 쓰는지 문서로 확인하고 화면 갈래를 나눈다.
- **서비스의 캐시와 열쇠 규칙을 문서에서 확인한다.** LocationIQ 무료 요금제의 48시간 규칙, `placeId` 가 바뀔 수 있다는 점은 코드만 봐서는 알 수 없다.

## Aide에 적용하면

Aide 1-a는 네트워크를 쓰지 않는다. 1-a 설계 문서의 "1-a에 없는 것"에 "네트워크(1-a는 인터넷 권한이 없다)"가 있고, AI 일체는 1-b, GitHub와 맥 연결은 2차다. Aide에는 장소 검색도, 글자마다 서버를 부르는 자동완성도 없다. 그래서 1-a에서 할 일은 없고, 아래는 1-b와 2차를 위한 메모다.

1. **원문의 자동완성 연산자(debounce, 최소 글자 수)는 Aide에 넣지 않는다 — 지금은 안 한다.**
   - 이유: Aide에는 글자마다 결과를 보여 줘야 하는 검색칸이 없다. 1-a 계획서 Task 6에서도 Note-Android의 메모 검색(`search/`)은 이식하지 않기로 했다.
2. **1-b의 AI 대화는 [보내기] 버튼으로만 부르고, 실패해도 자동으로 다시 부르지 않는다 — 바꿔서 가져온다.**
   - 1-a 설계 문서 2.5절대로 첫 화면 입력 막대는 1-b에서 AI 대화 입력이 된다. 2026-10-08 결정대로 LLM은 **사용자 키로, 사용자 요금으로** 부른다. 그래서 요청 한 번이 곧 사용자의 돈이다. 원문의 "꼭 필요할 때만 부른다"가 Aide에서는 더 중요하다.
   - 바꾸는 점: 원문은 자동완성이라 debounce로 글자마다 부르는 것을 줄였다. Aide는 처음부터 버튼으로만 부르므로 debounce가 필요 없다. 대신 "공백 자르기", "빈 글 무시"(계획서 Task 8 테스트 4번과 같다), "연달아 누르면 앞 요청 취소(`flatMapLatest`)", "자동 재시도 안 하기"를 가져온다("코드로 보기" 1번).
3. **401과 403은 "키 문제", 429는 "잠시 뒤 다시", 연결 실패는 "연결 확인"으로 나눠 보여 준다 — 가져온다. 1-b에서.**
   - 2026-10-08 결정 "키가 없으면 AI 기능은 꺼지고 아바타는 잠든다"와 이어진다. 키가 **없는** 경우는 그 결정대로 AI를 끄고, 키가 **틀린** 경우(401, 403)는 설정 탭의 AI 키 항목(1-a 설계 문서의 설정 탭 "1-b: AI 키 항목")으로 안내한다. 429는 사용자 요금제의 한도 문제라 "잠시 뒤 다시 보내 주세요"로 안내하고 자동 재시도는 하지 않는다("코드로 보기" 2번).
   - 사용자 전역 규칙(서버 데이터를 그리는 자리는 로딩, 실패, 빈 상태를 항상 구현한다)과도 맞는다. 원문 step-5의 세 화면(로딩, 결과 없음, 닿지 못함)이 그 규칙의 좋은 예다.
4. **LLM 제공자는 `AiRepository` 같은 인터페이스 뒤에 둔다 — 가져온다. 1-b에서.**
   - 이유: 2026-10-08 결정으로 사용자가 OpenAI, Anthropic, Google 중 제공자를 고른다. Koog를 쓸 수 있는지는 착수 전에 확인하고, 안 되면 제공자별 API를 직접 부르기로 했다. 원문이 `GeocodingRepository` 를 뺀 이유(서비스를 바꿔도 나머지는 그대로, 테스트에 가짜를 넣기 쉬움)가 그대로 맞는다("코드로 보기" 3번).
5. **2차의 GitHub 할 일 동기화에도 "받은 뒤" 습관을 적용한다 — 바꿔서 가져온다(2차에서 사용자가 정한다).**
   - 2026-10-08 결정으로 할 일의 원본은 `personal-docs` 의 `aide` 브랜치이고, 폰은 Room을 오프라인 사본과 올릴 대기열로 쓴다. GitHub API에도 요청 한도가 있다.
   - Room 사본이 곧 원문의 "응답 캐시"다. 화면은 Room만 보고, GitHub는 필요할 때만 부르면 된다.
   - **충돌하는 점이 하나 있다.** 같은 결정에는 "같은 할 일을 동시에 고치면 GitHub API가 거절하므로 다시 받아 재시도한다"가 있다. 원문의 "자동 재시도를 하지 않는다"와 겉보기엔 부딪힌다. 다만 원문이 막는 것은 한도 초과(429)나 실패에 대한 기계적인 재시도이고, Aide의 재시도는 "그 사이 바뀌었다"는 충돌을 새 내용으로 다시 맞추는 한 번의 재시도라 성격이 다르다. 2차를 만들 때 "충돌이면 한 번 다시, 429면 다시 하지 않음"으로 나눌지 사용자가 정한다.

## 출처

- 원문: Roland Mostoha, [How to avoid burning your rate limit — Autocomplete in Compose Multiplatform](https://medium.com/@RolandMostoha/how-to-avoid-burning-your-rate-limit-autocomplete-in-compose-multiplatform-4e57e28b7c32), 2026년 11월. Medium은 자동 다운로드를 막아서 브라우저로 열어 읽었다. 데모 저장소에 라이선스가 없어서 코드는 옮기지 않고 직접 쓴 스케치로 대신했고, 설명은 내 말로 다시 썼다. 그림 3장은 원문 서버 주소를 걸어 보여 준다.
- 원문이 실린 곳: [Android Weekly #754](https://androidweekly.net/issues/issue-754)
- 데모 저장소: [RolandMostoha/LocationIQ-CMP-demo](https://github.com/RolandMostoha/LocationIQ-CMP-demo) (단계별 차이: [step-0→1](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-0...step-1), [step-1→2](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-1...step-2), [step-2→3](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-2...step-3), [step-3→4](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-3...step-4), [step-4→5](https://github.com/RolandMostoha/LocationIQ-CMP-demo/compare/step-4...step-5))
- 저자의 앱: [HuKi-KMP](https://github.com/RolandMostoha/HuKi-KMP)
- LocationIQ: [누리집](https://locationiq.com/), [가격](https://locationiq.com/pricing). 원문이 건 OpenAPI 명세 저장소(`location-iq/locationiq-openapi-spec`)는 2026-11-26에 열어 보니 없는 주소(404)라서 링크를 빼 두었다
- Nominatim: [이용 정책](https://operations.osmfoundation.org/policies/nominatim/)
- Photon: [komoot/photon](https://github.com/komoot/photon), [공개 서버](https://photon.komoot.io/)
- OpenStreetMap: [저작권과 표기](https://www.openstreetmap.org/copyright)
- Ktor: [멀티플랫폼 앱에서 Ktor 클라이언트 만들기](https://ktor.io/docs/client-create-multiplatform-application.html). 원문이 건 Compose Multiplatform 저장소의 `docs/Ktor.md` 는 2026-11-26에 열어 보니 없는 주소(404)라서, 같은 내용을 다루는 Ktor 공식 문서로 바꿔 걸었다
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-08 결정 세 개(키가 없으면 AI 기능을 끈다, LLM은 사용자 키로 직접 부른다, 할 일의 원본은 `aide` 브랜치), `specs/2026-10-12-aide-1a-design.md` 의 "1-a에 없는 것"과 2.5절, `plans/2026-10-12-aide-1a-plan.md` 의 Task 6과 Task 8
