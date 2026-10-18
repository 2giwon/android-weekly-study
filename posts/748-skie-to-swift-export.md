---
issue: 748
date: 2026-10-11
title: SKIE에서 Swift export로 옮기며 알게 된 것 — 내보내는 API를 줄여라
original_title: Moving from SKIE to Swift export in a Kotlin Multiplatform project
url: https://johnoreilly.dev/posts/peopleinspace-swift-export/
author: John O'Reilly
tags: [Kotlin Multiplatform, Swift export, 모듈 설계, explicitApi]
aide:
  status: candidate
  module: core:data
  task: Task 5·7
  summary: Repository 구현체와 Hilt 모듈을 internal 로 숨기고, Konsist 규칙으로 지킨다
---

## 한 줄 요약

KMP(Kotlin Multiplatform, 한 Kotlin 코드를 Android·iOS 가 같이 쓰는 방식) 샘플 PeopleInSpace의 iOS 연결을 SKIE에서 Kotlin 공식 **Swift export**(아직 알파)로 옮긴 기록. Swift 코드 변경은 작았고, **진짜 일은 Swift에 내보내는 API를 꼭 필요한 만큼으로 줄이는 것**이었다.

## 핵심 내용

### 배경: 두 가지 iOS 연결 방식

- **SKIE**: Touchlab이 만든 도구. 기존 Objective-C 경유 연결 위에 sealed class → Swift enum, Flow → Swift 비동기 시퀀스 같은 편의를 얹어 준다.
- **Swift export**: Kotlin이 Objective-C를 거치지 않고 **바로 Swift 코드를 만들어** 내보내는 공식 기능. 글은 Kotlin 2.5.0-Beta2 개발 빌드를 썼고, 설정 문법도 `swiftExport { }` 에서 `export { swift { } }` 로 바뀌는 중이다.

### 준비: 내보내기 전용 "우산 모듈"

`common` 모듈에 바로 내보내기 설정을 넣었더니 `kotlinx-coroutines-core` 전체(약 1만 7천 줄)가 딸려 나왔다. 코루틴은 Swift가 `StateFlow` 를 써야 해서 숨길 수도 없다. 그래서 **코드 없이 `common` 에만 의존하고 내보내기 설정만 담는 `ios-export` 모듈**을 따로 만들었다.

### 본론: 18,000줄 → 2,600줄

처음 내보내니 Swift 코드가 약 1만 8천 줄 나왔고, 일부는 컴파일조차 안 됐다. 줄인 방법은 세 가지다.

| 방법 | 한 일 | 효과 |
|---|---|---|
| 의존성 숨기기 | Koin·kotlinx.serialization·ViewModel 을 `HIDDEN`(빈 껍데기만 내보냄)으로 | Koin 약 2,000줄 → 22줄 |
| `explicitApi()` 켜기 | 공개 범위를 꼭 적게 만드는 컴파일러 모드. 53곳이 걸렸고 Repository 구현·Ktor 설정·Koin 모듈 등을 `internal` 로 바꿈 | Swift가 볼 필요 없는 것이 사라짐 |
| DB 분리 | SQLDelight DB 클래스를 별도 `db` 모듈로 | DB 코드가 내보내기에서 빠짐 |

저자는 이 정리가 **Swift export가 아니어도 할 가치가 있다**고 말한다. 다른 클라이언트가 보는 API도 같이 작아지고, 내보내는 양이 줄면 빌드도 빨라진다.

### Swift 쪽 변화

- Kotlin 패키지가 Swift 네임스페이스(이름 묶음)가 된다 — 최상위 함수가 `KoinKt.xxx()` 대신 `di.xxx()` 처럼 불린다
- SKIE의 `onEnum(of:)` 대신 생성된 `sealedType()` 이 Swift enum을 돌려준다
- `StateFlow` 는 `value` 와 `asAsyncSequence()` 를 가진 타입으로 나온다

### 조심할 점: 숨긴 타입을 돌려주면 조용히 터진다

숨긴(`HIDDEN`) 의존성의 타입을 돌려주는 함수는 **빌드 경고 없이 `fatalError()` 로 채워진다.** 실제로 `initKoin()` 이 `KoinApplication` 을 돌려줘서 앱이 시작하자마자 죽었다. Swift에서 부르는 `initKoin()` 이 아무것도 돌려주지 않게(`Unit`) 바꿔서 고쳤다. 이 밖에 "의존성 중 쓰이는 부분만 내보내기"를 직접 고르는 설정은 아직 없고, 알파라 Kotlin 버전마다 많이 바뀐다.

## 코드로 보기

> 아래는 원문 코드가 아니라, 글의 `explicitApi` + `internal` 정리를 Android 다중 모듈 앱에 옮기면 어떤 모양일지 직접 쓴 스케치다.

```kotlin
// core:data — 밖에서는 인터페이스만 보인다
interface TaskRepository {
    fun observeTasks(): Flow<List<Task>>
    suspend fun complete(id: Long)
}

internal class DefaultTaskRepository @Inject constructor(
    private val dao: TaskDao,
) : TaskRepository { /* ... */ }

@Module
@InstallIn(SingletonComponent::class)
internal abstract class DataModule {
    @Binds
    abstract fun bindTaskRepository(impl: DefaultTaskRepository): TaskRepository
}
```

`feature:*` 는 `TaskRepository` 만 알고, 구현체를 직접 만들거나 부를 길이 없다. 같은 Gradle 모듈 안에서는 Hilt가 `internal` 클래스도 그대로 연결한다.

## 배운 점

- **"무엇을 내보낼까"는 플랫폼 기능이 아니라 모듈 설계 문제다.** Swift export는 그걸 숫자(줄 수)로 보여 줬을 뿐이다.
- `explicitApi()` 는 "실수로 public" 을 막는 가장 싼 장치다. 켜는 순간 53곳이 드러났다는 것은 평소에 그만큼 새고 있었다는 뜻이다.
- 숨긴 것을 돌려주는 함수가 경고 없이 런타임에 죽는 것처럼, 알파 기능은 **빌드가 통과해도 실행해 봐야** 한다.

## Aide에 적용하면

Aide는 iOS가 없는 Android 전용 앱이라 Swift export·SKIE 자체는 쓸 일이 없다. 하지만 이 글의 핵심인 **"모듈 밖으로 보이는 것을 줄인다"** 는 Aide의 다중 모듈 구조와 그대로 맞닿는다.

1. **Repository 구현체·Hilt 모듈을 `internal` 로 — 가져온다.** Task 5의 `DefaultEventRepository`, Task 7의 `DefaultTaskRepository` 를 만들 때부터 위 스케치처럼 `internal` 로 둔다. Aide는 "Repository 함수는 동작 단위로 두고 1-b의 AI 함수가 그대로 부른다"고 정했으니, 밖에 보이는 것이 인터페이스뿐이어야 AI가 부를 함수 목록도 깔끔하게 유지된다.
2. **Konsist 규칙으로 지키기 — 바꿔서 가져온다.** 글은 컴파일러의 `explicitApi()` 로 강제했지만, Aide에는 이미 Konsist 아키텍처 테스트(CI에서 실패 처리)가 있다. `ModuleDependencyTest` 옆에 "`core.data` 패키지의 `Default*Repository` 는 `internal` 이다" 같은 규칙 하나를 더하는 편이 기존 방식과 맞는다.
3. **`explicitApi()` 전면 적용 — 지금은 안 한다.** 컨벤션 플러그인에 켜면 `public` 을 일일이 써야 해서, 손으로 짜고 있는 1-a 속도를 늦춘다. Konsist 규칙으로 부족하다고 느껴질 때 `core:*` 라이브러리 모듈에만 켜는 것을 다시 본다.
4. **DB 분리 — 이미 되어 있다.** 글이 SQLDelight를 `db` 모듈로 뺀 것처럼, Aide는 처음부터 `core:database`(Room)를 `core:data` 와 나눠 두었다.

## 출처

- [Moving from SKIE to Swift export in a Kotlin Multiplatform project — John O'Reilly](https://johnoreilly.dev/posts/peopleinspace-swift-export/)
- [PeopleInSpace PR #524 (작업 중)](https://github.com/joreilly/PeopleInSpace/pull/524)
- [Kotlin 문서: Swift export](https://kotlinlang.org/docs/native-swift-export.html)
- [Android Weekly #748](https://androidweekly.net/issues/issue-748)
