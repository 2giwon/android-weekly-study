---
issue: 754
date: 2026-11-22
title: 화면마다 갈 곳이 많아 콜백이 늘어날 때 — CompositionLocal로 숨기지 말고 그대로 둔다
original_title: Too many parameters in one composable?
url: https://rengwuxian.com/blog/nav-3-multi-out-en/
author: Kai Zhu (扔物线)
tags: [Compose, Navigation 3, CompositionLocal]
aide:
  status: candidate
  module: app
  task: Task 10
  summary: Task 10에서 첫 화면의 [일정으로]와 캘린더의 [+]를 일정 추가 화면으로 잇는다. feature 모듈끼리는 서로 모르므로 homeEntry와 calendarEntry가 이동 콜백을 매개변수로 받고, 뒤로 가기 목록은 app의 AideApp만 만진다. 이동 콜백을 CompositionLocal로 옮기지 않는다
---

## 한 줄 요약

Navigation 3 공식 문서대로 하면, 한 화면은 **갈 수 있는 화면마다 콜백 매개변수(`onChatClick: (Chat) -> Unit` 같은 함수 타입 매개변수)를 하나씩** 받는다. 갈 곳이 8곳이면 매개변수도 8개다. 그래서 "매개변수가 너무 많으니 `CompositionLocal` 로 옮기면 깔끔하지 않을까?"라는 질문이 나온다. 저자 Kai Zhu(중국 이름 扔物线)의 답은 **옮기지 말라**는 것이다. `CompositionLocal` 로 옮겨도 갈 곳 8곳은 그대로 남는다. 함수 선언부(시그니처)에서 보이지 않게 될 뿐이다. 오히려 콜백 8개마다 선언이 하나씩 더 생기고, 하나를 빠뜨리면 컴파일러가 잡아 주지 못해 **앱을 돌려 봐야 죽으면서** 알게 된다. 갈 곳이 많은 화면은 원래 복잡한 화면이고, 그 복잡함은 감추지 말고 받아들이라고 저자는 말한다.

> 원문 블로그는 하단에 "© Kai Zhu (扔物线)"라고만 적혀 있고 공개 라이선스가 없다. 그래서 원문 코드는 그대로 옮기지 않고, 원문의 장마다 같은 내용을 **직접 쓴 스케치**로 다시 썼다. 원문의 채팅 목록 예시는 이 글에서 할 일 목록 예시로 바꿨다. 원문에는 그림이 없다. 이 글의 스케치는 컴파일해 보지 않았다.

## 먼저 알아 둘 말

- **컴포저블(composable)**: `@Composable` 이 붙은 함수다. Compose에서 화면 조각 하나를 그린다. View 시스템의 커스텀 View 하나와 비슷한 역할이다.
- **콜백 매개변수**: 컴포저블이 "버튼이 눌렸다" 같은 일을 바깥에 알리려고 받는 함수 타입 매개변수다. `onTaskClick: (Task) -> Unit` 처럼 쓴다. View 시스템의 `setOnClickListener` 로 넘기는 리스너와 같은 역할이다.
- **함수 선언부(시그니처, signature)**: 함수 이름과 매개변수 목록을 적은 첫 줄이다. 함수 본문을 읽지 않고도 "이 함수가 무엇을 받고 무엇을 하는지" 알 수 있는 곳이다.
- **Navigation 3**: Jetpack의 새 화면 이동 라이브러리다. 화면 이동 상태를 **뒤로 가기 목록(back stack)** 이라는 보통 리스트로 들고 있고, 리스트에 키를 넣으면 그 화면으로 가고 빼면 뒤로 간다. 예전 Navigation Compose의 `NavController` 와 같은 일을 한다.
- **뒤로 가기 목록(back stack)**: 지금까지 들어간 화면들의 목록이다. Navigation 3에서는 `rememberNavBackStack()` 이 만드는 리스트다. Activity의 back stack과 같은 생각이다.
- **`NavKey`**: 뒤로 가기 목록에 넣는 "화면 이름표"다. `data object HomeKey : NavKey` 처럼 만든다. Navigation Compose의 route 문자열이나 `@Serializable` route 클래스와 같은 역할이다.
- **`entry<Key> { }`**: Navigation 3에서 "이 키가 맨 위에 오면 이 컴포저블을 그린다"를 정하는 곳이다. `NavDisplay` 의 `entryProvider` 안에 쓴다. Navigation Compose의 `composable("route") { }` 와 같은 역할이다.
- **`CompositionLocal`**: 매개변수로 하나하나 넘기지 않아도, 화면 트리 아래쪽 컴포저블이 위쪽에서 넣어 준 값을 꺼내 쓰게 해 주는 Compose 장치다. 위쪽에서 `CompositionLocalProvider(LocalXxx provides 값) { }` 로 넣고, 아래쪽에서 `LocalXxx.current` 로 꺼낸다. `LocalContext`, `MaterialTheme` 의 색이 이 방식으로 전달된다. Android에 딱 맞는 것은 없지만, "화면 트리를 따라 내려가는 전역 값"이라고 생각하면 된다. Hilt의 의존성 주입과 비슷해 보이지만, Hilt는 빠진 값을 컴파일할 때 잡아 주고 `CompositionLocal` 은 잡아 주지 못한다.
- **`staticCompositionLocalOf`**: `CompositionLocal` 을 만드는 함수 중 하나다. 값이 거의 바뀌지 않을 때 쓴다. 괄호 안에 "아무도 값을 넣어 주지 않았을 때 쓸 기본값"을 적는데, 기본값이 없다는 뜻으로 `error("...")` 를 적으면 값을 넣지 않은 곳에서 꺼내는 순간 앱이 죽는다.
- **최상위 선언(top-level declaration)**: 클래스 밖, 파일 맨 바깥에 적은 선언이다. 같은 모듈 어디서든 쓸 수 있다.
- **런타임 오류와 컴파일 오류**: 컴파일 오류는 빌드할 때 빨간 줄로 알려 주는 오류다. 런타임 오류는 빌드는 되고 앱을 실제로 돌려 그 코드에 닿았을 때 터지는 오류다. 런타임 오류는 그 화면을 열어 보기 전까지 모른다.
- **Effect**: Aide에서 ViewModel이 화면에 "한 번만 해 달라"고 보내는 일이다. 스낵바 띄우기, 다른 화면 열기 같은 것이다. 화면 상태(`UiState`)와 달리 한 번 처리하면 끝난다. Aide는 `XxxContract { Event, Effect }` 형식으로 쓴다.
- **Konsist**: 코드 구조 규칙(이름, 패키지, 의존 방향 등)을 단위 테스트로 검사하는 Kotlin 라이브러리다. Aide는 `coding-convention` 모듈에서 Konsist 테스트를 돌린다.

## 서론 — 갈 곳마다 매개변수가 하나씩 늘어난다

**저자의 구독자가 물었다. "공식 Navigation 3 안내대로 하면, 화면이 갈 수 있는 곳마다 함수 타입 매개변수가 하나씩 생긴다. 어떻게 피하나?"**

- 원문의 예는 채팅 목록 컴포저블 `ChatList()` 다. 채팅 목록은 `chats` 와 함께 `onChatClick: (Chat) -> Unit` 을 받는다.
- 목록 안의 줄을 누르면 `ChatList()` 는 뒤로 가기 목록을 직접 만지지 않고 `onChatClick(chat)` 만 부른다. "어디로 갈지"는 `ChatList()` 를 부른 바깥쪽이 정한다.
- 아래는 같은 모양을 할 일 목록으로 다시 쓴 **직접 쓴 스케치**다.

```kotlin
// 직접 쓴 스케치: 원문 ChatList() 와 같은 모양
@Composable
fun TaskList(
    tasks: List<Task>,
    onTaskClick: (Task) -> Unit,
) {
    LazyColumn(Modifier.fillMaxSize()) {
        items(tasks, key = { task -> task.id }) { task ->
            TaskRow(task, Modifier.clickable { onTaskClick(task) })
        }
    }
}
```

- `onTaskClick: (Task) -> Unit` 이 콜백 매개변수다. 할 일 목록은 "이 할 일이 눌렸다"만 알리고, 할 일 상세 화면으로 가는 일은 하지 않는다.
- `TaskRow(task, Modifier.clickable { onTaskClick(task) })` 에서 줄을 누르면 받은 콜백을 부른다.

**원문은 이 방식이 공식 Navigation 문서가 권하는 방식이라고 짚는다.**

- 컴포저블 안으로 뒤로 가기 목록을 넘기지 않고, 이동 콜백을 매개변수로 넘긴다.
- 문제는 화면이 갈 곳이 여러 곳일 때다. 갈 곳마다 이런 매개변수가 하나씩 필요하다. 원문은 8곳이라고 가정한다. 그러면 매개변수 8개가 컴포저블 하나에 들어간다. 질문한 사람은 "너무 많다"고 느꼈고, 이것을 어떻게 피하느냐고 물었다.

## 1. "해결책" — 콜백마다 CompositionLocal을 하나씩 만든다

저자는 먼저 많은 사람이 떠올릴 "해결책"을 그대로 보여 준다. 제목의 "해결책"에 따옴표가 붙어 있는 것은, 저자가 이 방법을 해결책으로 보지 않는다는 뜻이다.

**무엇을 하나: 콜백 하나마다 `CompositionLocal` 을 하나씩 최상위에 선언하고, 화면 이동을 설정하는 곳에서 값을 넣어 준다.**

```kotlin
// 직접 쓴 스케치: 원문의 "해결책" 모양
val LocalOnTaskClick = staticCompositionLocalOf<(Task) -> Unit> {
    error("LocalOnTaskClick 이 없다")
}
val LocalOnSearchClick = staticCompositionLocalOf<() -> Unit> {
    error("LocalOnSearchClick 이 없다")
}
// ...이런 선언이 6개 더

// NavDisplay 를 설정하는 곳
entry<TaskListKey> {
    CompositionLocalProvider(
        LocalOnTaskClick provides { task -> backStack.add(TaskDetailKey(task.id)) },
        LocalOnSearchClick provides { backStack.add(SearchKey) },
        // ...6개 더
    ) {
        TaskList(tasks)
    }
}
```

- `staticCompositionLocalOf<(Task) -> Unit> { error(...) }` 는 "할 일 눌림 콜백"을 담는 칸을 만든다. 기본값 자리에 `error(...)` 가 있으므로, 아무도 값을 넣지 않은 곳에서 꺼내면 그 자리에서 앱이 죽는다.
- `entry<TaskListKey> { }` 는 할 일 목록 키가 맨 위에 올 때 그릴 내용이다.
- `CompositionLocalProvider(LocalOnTaskClick provides { ... })` 는 할 일 목록 화면 트리 아래쪽 어디서든 "할 일 눌림 콜백"을 꺼낼 수 있게 값을 넣는다. 넣는 값은 `backStack.add(TaskDetailKey(task.id))`, 곧 뒤로 가기 목록에 할 일 상세 키를 넣는 함수다.
- 맨 끝 `TaskList(tasks)` 에는 이제 콜백 매개변수가 없다.

**꺼내 쓰는 쪽: 콜백이 필요한 자리에서 `.current` 로 꺼낸다.**

```kotlin
// 직접 쓴 스케치
@Composable
fun TaskList(tasks: List<Task>) {
    val onTaskClick = LocalOnTaskClick.current
    // ...
    TaskRow(task, Modifier.clickable { onTaskClick(task) })
    // ...
}
```

- `LocalOnTaskClick.current` 는 바깥에서 `CompositionLocalProvider` 로 넣어 준 콜백을 꺼낸다.

**왜 그럴듯해 보이나: 최상위에 선언했으니 어느 컴포저블에서도 꺼낼 수 있다.**

- 원문은 `CompositionLocal` 을 최상위에 선언하는 것 자체는 Compose가 원하는 방식이고 나쁜 습관(안티 패턴)이 아니라고 덧붙인다.
- 어디서든 `LocalXxx.current` 만 쓰면 되니, 콜백을 매개변수로 넘길 필요가 사라진다. 할 일 목록의 함수 선언부는 이렇게 짧아진다.

```kotlin
// 직접 쓴 스케치: 바꾸기 전
@Composable
fun TaskList(
    tasks: List<Task>,
    onTaskClick: (Task) -> Unit,
    onSearchClick: () -> Unit,
    // ...6개 더
) { /* ... */ }

// 바꾼 뒤
@Composable
fun TaskList(tasks: List<Task>) { /* ... */ }
```

**결과: 매개변수가 1개로 줄었다. 그런데 저자는 여기서 되묻는다. 처음 문제가 무엇이었나? "매개변수가 많다"가 정말 문제였나?**

## 2. 사실 — 출구가 8개인 지하철역

저자는 지하철역 비유로 답한다.

**출구가 8개라 헷갈리는 것은 역 탓이 아니다.**

- 지하철역에서 병원으로 나가는 출구를 찾는다고 하자. 큰 환승역이라 출구가 8개다. 벽의 안내도를 봐도 어느 출구가 어디로 나가는지 헷갈린다.
- 그래도 "출구가 너무 많다"고 역을 탓하지는 않는다. 역이 복잡한 이유는 역 설계가 아니라 역 주변에 있다. 주변에 갈 곳이 많고, 출구마다 사람들이 가야 하는 곳이 있다. 굳이 불평한다면 "이 동네는 왜 이렇게 붐비나" 정도다.

**마법으로 출구를 감추면 역은 깔끔해 보이지만 출구 8개는 그대로다.**

- 저자는 마법이 있는 세상을 상상해 보자고 한다. 역장이 출구 8개가 너무 많다며 문 8개를 모두 막고 안내판을 붙인다. "출구에 가려면 그 출구의 주문을 외우세요."
- 역은 깔끔해 보이고 헷갈리는 안내판도 사라졌다. 하지만 출구 8개는 없어지지 않았다. 눈에 안 보일 뿐이고, 쓰려면 주문 8개를 미리 다 알아야 한다.
- 마법을 걸어 두지 않은 곳에서 주문을 외우면 아무 일도 일어나지 않는다. 그 사실은 직접 외워 봐야 안다.
- 그리고 `CompositionLocal` 에는 "순간 이동"이 없다. 코드가 화면 8곳에 더 빨리, 더 쉽게 가게 되지 않는다. `CompositionLocal` 8개를 선언하고 8개 모두 값을 넣어 줘야 하는 것도 그대로다. 마법으로 얻은 것은 "깔끔해 보이는 역"뿐이다.

**Compose로 돌아오면: 콜백 8개를 받는 컴포저블은 복잡하다. 하지만 `CompositionLocal` 로 없애려 하면 안 된다.**

저자가 꼽은 이유를 하나씩 풀면 이렇다.

- **복잡함이 줄지 않는다.** 할 일 목록은 여전히 8곳으로 간다. 함수 선언부에서 보이지 않게 됐을 뿐이다.
- **어디로 가는지 보려면 본문을 다 읽어야 한다.** 매개변수로 받을 때는 함수 선언부 한 줄만 보면 갈 곳 8곳이 다 보였다. 이제는 본문 어디에서 `LocalXxx.current` 를 꺼내는지 찾아 읽어야 한다.
- **코드는 오히려 늘어난다.** 콜백 8개가 사라진 것이 아니라 값을 넣는 곳(`CompositionLocalProvider`)으로 옮겨 갔다. 거기에 콜백마다 `staticCompositionLocalOf` 선언이 하나씩 더 붙는다.
- **빠뜨리면 컴파일 오류가 아니라 앱이 죽는다.** 매개변수였다면 하나를 안 넘기면 빌드할 때 빨간 줄이 뜬다. `CompositionLocal` 은 값을 안 넣어도 빌드가 된다. 그 화면을 열고 그 콜백을 꺼내는 순간 `error(...)` 가 터진다.

## 3. 그러면 어떻게 하나 — 풀지 않는다

**저자의 답은 "풀지 않는다"이다.**

- 지하철역의 "출구가 너무 많은 문제"를 어떻게 푸느냐고 물으면, 풀지 않는다. 처음부터 문제가 아니었기 때문이다. 세상에는 원래 복잡한 곳이 있고, 복잡해야 맞는 곳이 있다.
- 콜백 매개변수도 같다. 앱의 메인 화면은 갈 곳이 많을 수밖에 없다. 저자는 그 사실을 받아들이고, 콜백 하나하나를 조심해서 다루면 된다고 말한다.

## 4. 그럼 CompositionLocal은 왜 있나

**`CompositionLocal` 이 쓸모없다는 말이 아니다. 이 자리에 맞지 않는 도구일 뿐이다.**

- "문제를 풀지 않고 감추기만 한다면 Compose는 `CompositionLocal` 을 왜 만들었나?"라는 질문이 남는다.
- 저자는 `CompositionLocal` 이 오히려 아주 쓸모 있다고 답한다. 다만 화면 이동 콜백을 넘기는 데는 맞지 않는다.
- 언제가 맞는 자리인지는 다음 글에서 다루겠다고 하고 글을 마친다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide의 지금 화면 이동 코드(Aide-Android 최신 커밋 `31ad4dc`)는 이렇다. `app` 모듈의 `AideApp` 이 뒤로 가기 목록을 만들고, `NavDisplay` 의 `entryProvider` 안에서 `homeEntry()`, `calendarEntry()`, `settingsEntry()` 를 부른다. 세 함수는 매개변수가 없고, 각각 `HomeRoute()`, `CalendarRoute()`, `SettingsRoute()` 를 그린다. 아직 화면끼리 이동하는 곳은 없고, 하단 탭만 뒤로 가기 목록을 [홈, 그 탭]으로 바꾼다.

1-a 계획에서 화면끼리 처음 이동하는 곳은 **Task 10 일정 추가 화면**이다. 계획서 Task 10은 두 곳에서 일정 추가 화면으로 간다고 적었다.

- 캘린더 화면의 [+] 버튼을 누르면 `AddEventKey` 로 간다.
- 첫 화면 입력 막대에 글을 쓰고 [일정으로]를 누르면 같은 `AddEventKey(title)` 로 가고, 쓴 글이 제목으로 채워진다. 계획서 Task 8에는 이 동작이 `HomeContract.Effect` 의 "일정 추가 화면 열기(title)"로 적혀 있다.

아래는 이 연결을 원문 방식(콜백 매개변수)으로 짠 **직접 쓴 스케치**다. Aide 코드는 고치지 않았고, 스케치는 컴파일해 보지 않았다.

### 1. 첫 화면의 이동 콜백은 `homeEntry` 매개변수로 받는다

```kotlin
// 직접 쓴 스케치: feature/home/.../navigation/HomeNavigation.kt
@Serializable
data object HomeKey : NavKey

fun EntryProviderScope<NavKey>.homeEntry(
    onOpenAddEvent: (title: String) -> Unit,
) {
    entry<HomeKey> {
        HomeRoute(onOpenAddEvent = onOpenAddEvent)
    }
}
```

- `homeEntry(onOpenAddEvent: (title: String) -> Unit)` 는 "첫 화면이 일정 추가 화면을 열고 싶다"를 바깥에 알릴 콜백을 받는다. 지금 `homeEntry()` 는 매개변수가 없는데, Task 10에서 하나가 생긴다.
- 첫 화면은 `AddEventKey` 를 모른다. `AddEventKey` 는 `feature:calendar` 에 있고, 2026-10-12 결정(공유 데이터는 core, 화면은 feature, feature끼리는 서로 의존하지 않는다)에 따라 `feature:home` 은 `feature:calendar` 를 볼 수 없다. 그래서 첫 화면이 일정 추가 화면으로 가려면 **콜백 말고는 길이 없다.** 원문이 권하는 방식이 Aide의 모듈 규칙과 저절로 맞는다.

### 2. 뒤로 가기 목록은 app의 `AideApp` 만 만진다

```kotlin
// 직접 쓴 스케치: app/.../navigation/AideNavDisplay.kt 의 entryProvider 부분
entryProvider = entryProvider {
    homeEntry(
        onOpenAddEvent = { title -> backStack.add(AddEventKey(title)) },
    )
    calendarEntry(
        onAddEventClick = { backStack.add(AddEventKey(title = "")) },
    )
    settingsEntry()
    addEventEntry(
        onClose = { backStack.removeLastOrNull() },
    )
},
```

- `app` 모듈은 `feature:home`, `feature:calendar`, `feature:settings` 를 모두 의존한다(`app/build.gradle.kts`). 그래서 `HomeKey` 와 `AddEventKey` 를 둘 다 아는 곳은 `app` 뿐이고, "첫 화면에서 일정 추가 화면으로" 같은 연결도 `app` 에서만 쓸 수 있다.
- `{ title -> backStack.add(AddEventKey(title)) }` 는 뒤로 가기 목록 끝에 일정 추가 키를 넣는다. 예를 들어 [홈]에서 [일정으로]를 누르면 목록이 [홈, 일정 추가]가 되고, 뒤로 가기 한 번이면 다시 [홈]이다.
- `addEventEntry(onClose = ...)` 는 계획서 Task 10 케이스 8번("저장 성공이면 Effect 닫기")을 받는 자리다. 일정 추가 화면도 뒤로 가기 목록을 직접 만지지 않고 "닫아 달라"만 알린다.
- feature 쪽 `entry` 함수들에 `backStack` 을 넘기지 않는다. 원문과 공식 문서가 말하는 "뒤로 가기 목록 대신 콜백"이 이것이다.

### 3. ViewModel의 Effect는 Route에서 콜백으로 바꾼다

```kotlin
// 직접 쓴 스케치: feature/home/.../HomeRoute.kt
@Composable
fun HomeRoute(
    onOpenAddEvent: (title: String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val currentOnOpenAddEvent by rememberUpdatedState(onOpenAddEvent)

    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            when (effect) {
                is HomeContract.Effect.OpenAddEvent -> currentOnOpenAddEvent(effect.title)
                // 되돌리기 스낵바, 기본 캘린더 앱에서 일정 열기는 여기서 바로 처리한다
                else -> Unit
            }
        }
    }

    HomeScreen(uiState = uiState, onEvent = viewModel::onEvent)
}
```

- `HomeRoute` 는 ViewModel과 이동 콜백을 함께 아는 곳이다. ViewModel이 Effect "일정 추가 화면 열기(title)"를 보내면, `HomeRoute` 가 받은 콜백 `onOpenAddEvent(title)` 를 부른다.
- `rememberUpdatedState(onOpenAddEvent)` 는 `LaunchedEffect` 가 다시 시작되지 않아도 늘 가장 최근에 받은 콜백을 부르게 한다. `LaunchedEffect(viewModel)` 는 ViewModel이 바뀔 때만 다시 시작하므로, 콜백을 바로 쓰면 처음 받은 콜백만 계속 부를 수 있다.
- `HomeScreen` 은 `UiState` 와 `onEvent` 만 받는다. 계획서 Task 8 Step 4("`HomeScreen` 은 UiState와 콜백만 받는 순수 UI")와 Konsist 규칙 "Screen 컴포저블은 ViewModel 을 파라미터로 받지 않는다"(`coding-convention/.../ScreenConventionTest.kt`)에 맞는다.
- "기본 캘린더 앱에서 일정 열기"는 앱 안의 다른 화면으로 가는 것이 아니라 다른 앱을 여는 Intent라, `app` 에 콜백으로 올리지 않고 `HomeRoute` 가 `LocalContext.current` 로 바로 열어도 된다. 그래서 첫 화면이 바깥으로 올리는 이동 콜백은 1-a에서 1개다.

### 4. 이동 콜백을 CompositionLocal로 만들지 않게 막는 Konsist 규칙

```kotlin
// 직접 쓴 스케치: coding-convention/.../NavigationConventionTest.kt (컴파일해 보지 않음)
class NavigationConventionTest {
    @Test
    fun `feature 모듈은 함수 타입 CompositionLocal 을 만들지 않는다`() {
        Konsist.scopeFromProject()
            .properties()
            .filter { property -> property.resideInPackage("com.giwon.aide.feature..") }
            .assertFalse { property ->
                property.text.contains("CompositionLocalOf<(") && property.text.contains("->")
            }
    }
}
```

- `scopeFromProject().properties()` 는 프로젝트의 모든 속성 선언을 모은다. `resideInPackage("com.giwon.aide.feature..")` 로 feature 모듈만 남긴다.
- `property.text.contains("CompositionLocalOf<(")` 와 `contains("->")` 는 `staticCompositionLocalOf<(Task) -> Unit>` 이나 `compositionLocalOf<() -> Unit>` 처럼 **함수 타입을 담는 `CompositionLocal`** 을 찾는다. 글자로 찾는 거친 검사라, 실제로 넣는다면 다른 모양도 잡히는지 시험해 봐야 한다.
- 색이나 글꼴처럼 함수가 아닌 값을 담는 `CompositionLocal` 은 이 규칙에 걸리지 않는다.

## 배운 점

- **매개변수가 많은 것은 증상이 아니라 사실일 수 있다.** 화면이 갈 곳이 많으면 매개변수가 많은 것이 맞다. 매개변수를 줄이는 것이 목표가 되면 복잡함을 감추는 쪽으로 가기 쉽다.
- **함수 선언부는 문서다.** 콜백을 매개변수로 받으면 "이 화면은 어디로 갈 수 있나"를 선언부 한 줄로 읽을 수 있다. 감추면 본문 전체를 읽어야 한다.
- **컴파일러가 잡아 주는 오류를 런타임 오류로 바꾸지 않는다.** 매개변수는 빠뜨리면 빌드가 실패한다. `CompositionLocal` 은 빠뜨려도 빌드가 되고, 그 화면을 열어야 죽는다.
- **`CompositionLocal` 에는 순간 이동이 없다.** 값을 넣는 곳과 꺼내는 곳이 따로 있을 뿐, 넣고 꺼내는 일은 그대로 다 해야 한다. 오히려 선언이 하나씩 더 붙는다.
- **`CompositionLocal` 이 나쁜 도구는 아니다.** 이 자리에 맞지 않을 뿐이다. 언제 맞는지는 저자가 다음 글에서 다룬다고 했다.

## Aide에 적용하면

Aide는 지금 화면끼리 이동하는 곳이 없다. `homeEntry()`, `calendarEntry()`, `settingsEntry()` 는 매개변수가 없고, 하단 탭만 `AideApp` 에서 뒤로 가기 목록을 [홈, 그 탭]으로 바꾼다(2026-10-20 결정). 화면끼리 처음 이동하는 곳은 1-a 계획의 Task 10 일정 추가 화면이다. Aide 코드에서 `CompositionLocalProvider` 를 쓰는 곳은 `MainActivity.kt` 의 Preview 전용 감싸기 하나다. 이 감싸기는 `NavDisplay` 가 찾는 뒤로 가기 신호 전달자(`LocalNavigationEventDispatcherOwner`)를 Preview에 넣어 주는 것이라(2026-10-30 결정), 이동 콜백이 아니다.

1. **Task 10에서 이동 콜백은 `entry` 함수의 매개변수로 받는다 — 가져온다.**
   - `homeEntry(onOpenAddEvent: (title: String) -> Unit)` 와 `calendarEntry(onAddEventClick: () -> Unit)` 처럼 받고, `AddEventKey` 를 뒤로 가기 목록에 넣는 일은 `app` 의 `AideApp` 에서만 한다("코드로 보기" 1번과 2번).
   - 이유: 2026-10-12 결정으로 feature 모듈끼리는 서로 의존하지 않는다. `feature:home` 은 `feature:calendar` 의 `AddEventKey` 를 볼 수 없으므로, 첫 화면에서 일정 추가 화면으로 가려면 콜백이 유일한 길이다. 원문 방식이 Aide 모듈 규칙과 저절로 맞는다.
   - 계획서 Task 10의 Files에 "`app/.../navigation/` — `AddEventKey(title)` 연결"이 이미 있다. 여기에 "`homeEntry` 와 `calendarEntry` 에 이동 콜백 매개변수 추가"를 함께 적으면 된다.
2. **feature의 `entry` 함수와 Route에 `backStack` 을 넘기지 않는다 — 가져온다.**
   - 이유: 뒤로 가기 목록을 feature에 넘기면 feature가 `AddEventKey` 같은 다른 feature의 키를 알아야 하고, 그러면 1번과 같은 이유로 모듈 규칙이 깨진다. 하단 탭 규칙 [홈, 그 탭]도 `AideApp` 한 곳에서만 지켜야 어긋나지 않는다.
3. **ViewModel의 이동 Effect는 Route가 받아 콜백으로 바꾸고, Screen은 `UiState` 와 `onEvent` 만 받는다 — 가져온다. Task 8에서.**
   - 계획서 Task 8의 `HomeContract.Effect` "일정 추가 화면 열기(title)"를 `HomeRoute` 가 받아 `onOpenAddEvent(title)` 를 부른다("코드로 보기" 3번). Task 10 전에 Task 8을 먼저 하면, 그때는 `onOpenAddEvent` 를 아무 일도 하지 않는 기본값 `{}` 으로 두고 Task 10에서 연결한다.
   - 이유: 계획서 Task 8 Step 4("`HomeScreen` 은 UiState와 콜백만 받는 순수 UI")와 Konsist 규칙 "Screen 컴포저블은 ViewModel 을 파라미터로 받지 않는다"를 그대로 지킨다. Preview도 콜백에 `{}` 만 넣으면 그려진다.
   - "기본 캘린더 앱에서 일정 열기"는 앱 밖으로 나가는 Intent라, `app` 에 콜백으로 올리지 않고 `HomeRoute` 안에서 연다.
4. **이동 콜백을 `CompositionLocal` 로 옮기지 않는다 — 가져온다. 이것을 Konsist 규칙으로 막을지는 바꿔서 가져온다(사용자가 정한다).**
   - 이유: 원문이 짚은 대로 갈 곳이 숨고, 빠뜨리면 컴파일 오류 대신 앱이 죽는다. Aide는 CI에서 `./gradlew assembleDebug test lint` 를 돌리지만(2026-10-15 결정), Compose UI 테스트는 없어서 화면을 열어 봐야 터지는 오류는 CI가 잡지 못한다.
   - 규칙으로 막는다면 "코드로 보기" 4번처럼 feature 패키지에서 함수 타입 `CompositionLocal` 을 찾는 Konsist 테스트를 `coding-convention` 에 둔다. 다만 글자로 찾는 거친 검사이고, 1-a의 이동 콜백은 첫 화면 1개, 캘린더 1개, 일정 추가 1개뿐이라 지금 넣을 만큼 급하지는 않다. 넣을지와 언제 넣을지는 사용자가 정한다.
5. **화면 하나의 이동 콜백이 많아져도 묶거나 숨기지 않는다 — 지금은 안 한다(필요 없다).**
   - 이유: 1-a에서 이동 콜백이 가장 많은 화면도 1개다. 1-b 이후 첫 화면에 갈 곳이 늘어나면 원문대로 매개변수를 늘리고, 함수 선언부에서 갈 곳이 다 보이게 둔다.

## 출처

- 원문: Kai Zhu (扔物线), [Too many parameters in one composable?](https://rengwuxian.com/blog/nav-3-multi-out-en/), 2026-11-18. 원문 블로그는 "© Kai Zhu (扔物线)"만 적혀 있고 공개 라이선스가 없어서, 코드는 옮기지 않고 직접 쓴 스케치로 대신했고 설명은 내 말로 다시 썼다. 원문에는 그림이 없다.
- 원문이 실린 곳: [Android Weekly #754](https://androidweekly.net/issues/issue-754)
- Compose 문서: [Locally scoped data with CompositionLocal](https://developer.android.com/develop/ui/compose/compositionlocal)
- Navigation 3 문서: [Navigation 3](https://developer.android.com/guide/navigation/navigation-3)
- Aide 코드: Aide-Android `app/.../navigation/AideNavDisplay.kt`, `app/.../ui/MainActivity.kt`, `feature/home/.../navigation/HomeNavigation.kt`, `feature/home/.../HomeRoute.kt`, `feature/calendar/.../navigation/CalendarNavigation.kt`, `app/build.gradle.kts`, `coding-convention/.../ScreenConventionTest.kt` (최신 커밋 `31ad4dc`에서 읽기만 함)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-12 모듈 구조 결정, 2026-10-15 CI 결정, 2026-10-20 하단 탭 결정, 2026-10-30 Preview 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 8과 Task 10
