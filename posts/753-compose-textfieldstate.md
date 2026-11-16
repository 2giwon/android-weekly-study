---
issue: 753
date: 2026-11-15
title: Compose 텍스트 입력은 onValueChange를 버리고 TextFieldState로 간다
original_title: "Building Reliable Text Editing in Compose: TextFieldState, TextFieldBuffer, and Compose 1.12 Styling"
url: https://ardakazanci.com/posts/building-reliable-text-editing-in-compose/
author: Arda Kazancı
tags: [Compose, TextField, 상태 관리, 아키텍처]
aide:
  status: candidate
  module: feature:home
  task: Task 8
  summary: Task 8 계획의 "입력 글을 UiState에, 글자마다 입력 변경 Event"는 원문이 피하라는 onValueChange 방식이다. 입력 막대의 TextFieldState는 HomeRoute에 두고, 버튼을 누를 때 글을 Event에 실어 보내는 방식으로 계획을 바꿀지 사용자가 정한다
---

## 한 줄 요약

Jetpack Compose의 텍스트 입력칸(`BasicTextField`, `TextField`, `OutlinedTextField`)에서 **`value` 와 `onValueChange` 를 받는 옛 방식이 Compose 1.13부터 소프트 지원 중단(soft-deprecated, 지우지는 않지만 새 기능과 버그 수정을 더 이상 넣지 않는 상태)** 된다. 대신 Compose 1.7부터 안정판인 **`TextFieldState`(입력 중인 글, 커서, 되돌리기 기록을 한데 들고 있는 상태 객체)** 를 쓴다. 원문은 왜 옛 방식이 키보드와 어긋나는지, `TextFieldBuffer` 로 글을 고치고 `InputTransformation` 과 `OutputTransformation` 으로 입력을 거르고 꾸미는 법, `TextFieldState` 를 **어디에 둘지 다섯 가지 경우**, 그리고 Compose 1.12에서 새로 생긴 **입력 중 글자 스타일 API**(`addStyle`, `ExpandPolicy`, `TrackedRange`)를 차례로 설명한다. Arda Kazancı(Staff Android Engineer)의 블로그 글이다.

> 원문에는 그림이 없고 코드 블록이 18개 있다. 원문 블로그에는 저작권 표시(© 2026 Arda Kazancı)만 있고 **라이선스 표시가 없다**(라이선스가 없으면 저작자 외에는 가져다 쓸 권리가 없다). 그래서 **원문 코드는 옮기지 않고, 무엇을 하는 코드인지 글로 설명했다.** API 이름과 함수 시그니처(함수 이름과 매개변수 모양)는 Compose 라이브러리의 공개 API라 그대로 적었다. "코드로 보기" 절의 코드는 모두 **직접 쓴 스케치**다.

## 먼저 알아 둘 말

- **`value` / `onValueChange` 방식**: 지금까지의 Compose 입력칸 사용법. 바깥이 글(`String` 이나 `TextFieldValue`)을 `value` 로 넣어 주고, 사용자가 글자를 칠 때마다 입력칸이 `onValueChange` 로 새 글을 알려 주면, 바깥이 그 글을 다시 `value` 로 넣는다. 글의 주인이 입력칸 **바깥**에 있다.
- **`TextFieldValue`**: 글과 함께 선택 범위(커서 위치)와 조합 중인 글자 정보를 담는 옛 값 객체. 불변(immutable, 한 번 만들면 바꿀 수 없는) 객체라 바뀔 때마다 새로 만든다.
- **`TextFieldState`**: 새 방식의 상태 객체. 글, 선택 범위, 조합 표시, 되돌리기(undo)와 다시하기(redo) 기록, 글자 스타일을 **한 객체가 계속 들고 있고**, 사용자가 칠 때 **메인 스레드에서 바로** 바뀐다. 글의 주인이 입력칸과 같은 객체다.
- **IME(Input Method Editor)**: 소프트웨어 키보드. 삼성 키보드나 Gboard 같은 것. 한글처럼 자모를 모아 글자를 만드는 입력에서는 키보드가 "지금 조합 중인 글자"를 따로 들고 있다.
- **조합 중인 글자(composition)**: 한글에서 "ㅎ"→"하"→"한"처럼 아직 확정되지 않은 글자. 키보드와 입력칸이 이 상태를 똑같이 알고 있어야 글자가 깨지지 않는다.
- **리컴포지션(recomposition)**: 상태가 바뀌어 Compose가 화면 함수를 다시 실행하는 것. 글자마다 화면 전체가 다시 실행되면 느려진다.
- **Snapshot 시스템**: Compose가 상태(`mutableStateOf` 등)의 변화를 추적하는 장치. 어떤 코드가 어떤 상태를 읽었는지 기록해 두었다가, 그 상태가 바뀌면 그 코드만 다시 실행한다.
- **`TextFieldBuffer`**: `TextFieldState` 의 글을 고칠 때 받는 작업 공간. `insert`(끼워 넣기), `delete`(지우기), `replace`(바꾸기), `selection`(커서와 선택 범위) 같은 것으로 고친다. `state.text` 는 읽기 전용이라 모든 수정은 이 버퍼를 거친다.
- **`InputTransformation`**: 사용자가 친 글이 `TextFieldState` 에 **저장되기 전에** 끼어들어 고치거나 되돌리는 규칙. 예: 숫자만 받기, 최대 6글자, 모두 대문자.
- **`OutputTransformation`**: 저장된 글은 그대로 두고 **화면에 보일 때만** 모양을 바꾸는 규칙. 예: 저장은 `01012345678` 인데 화면에는 `010-1234-5678` 로 보이기.
- **`VisualTransformation` 과 `OffsetMapping`**: 옛 방식에서 보이는 모양을 바꾸던 API. 글자를 끼워 넣으면 "저장된 글의 몇 번째 글자가 화면의 몇 번째 글자인지"를 양쪽으로 직접 계산(`OffsetMapping`)해야 했고, 계산이 틀리면 앱이 죽었다.
- **호이스팅(hoisting, 끌어올리기)**: 상태를 쓰는 컴포저블보다 **위쪽**에 상태를 두어, 여러 곳이 같은 상태를 보게 하는 것.
- **`@Stable`**: "이 클래스의 값이 바뀌면 Compose에 알린다"고 컴파일러에게 약속하는 표시. 이 표시가 있으면 Compose가 불필요한 다시 그리기를 건너뛸 수 있다.
- **`SavedStateHandle`**: ViewModel이 쓰는 저장소. 앱이 백그라운드에서 시스템에 의해 죽었다가(프로세스 종료, process death) 다시 살아나도 값이 돌아온다.
- **`snapshotFlow`**: Compose 상태를 읽는 블록을 Kotlin `Flow` 로 바꿔 주는 함수. 블록이 읽은 상태가 바뀔 때마다 새 값을 내보낸다.
- **`AnnotatedString` 과 `SpanStyle`**: 글의 일부에 굵게, 색, 배경 같은 스타일을 붙인 문자열과 그 스타일 하나. `AnnotatedString` 은 불변이라 고칠 때마다 새로 만든다.

## 서론 — 콜백 방식 입력칸이 물러난다

**Compose의 입력칸은 콜백 방식에서 벗어나고 있다.**
- Compose 1.13부터 `BasicTextField`, `TextField`, `OutlinedTextField` 의 `value` 와 `onValueChange` 오버로드(같은 이름에 매개변수만 다른 함수)는 소프트 지원 중단된다. 라이브러리는 `androidx.compose.foundation:foundation` 이다.
- 소프트 지원 중단이라 코드가 바로 깨지지는 않는다. 다만 **새 기능과 버그 수정을 더 받지 못하고**, 심각한 보안 문제나 접근성 문제만 고친다.
- 원문 첫 코드는 대상이 되는 두 오버로드의 모양이다. 하나는 `value: String` 과 `onValueChange: (String) -> Unit` 을 받고, 다른 하나는 `value: TextFieldValue` 와 `onValueChange: (TextFieldValue) -> Unit` 을 받는다.

**원문은 세 가지를 다룬다.**
- `TextFieldState`(Compose 1.7부터 안정판)가 왜 콜백 방식을 대신하는가.
- `TextFieldState` 를 중심으로 구조를 어떻게 짜는가.
- Compose 1.12에서 서식 있는 글 편집에 무엇이 새로 생겼는가.

## 1. onValueChange가 물러나야 했던 이유

**`value` 와 `onValueChange` 를 `StateFlow` 같은 비동기 흐름과 함께 쓰면, 키보드(IME)와 경쟁 상태(race condition, 두 쪽이 같은 값을 다른 순서로 고쳐 결과가 꼬이는 상태)가 생긴다.**
- 사용자가 빠르게 치면 "키보드 → ViewModel → 상태 흐름 → Compose 리컴포지션 → 입력칸" 왕복이 한 바퀴 도는 동안 키보드는 이미 다음 글자를 받는다.
- 그 사이 화면의 글과 키보드가 들고 있는 글이 어긋난다. 그 결과 **글자가 빠지고, 두 번 들어가고, 커서가 갑자기 튀고, 글자마다 리컴포지션이 돈다.**
- 한글처럼 조합 중인 글자가 있는 입력에서는 이 어긋남이 더 쉽게 보인다. 키보드가 조합 중인 "한"을 들고 있는데 바깥이 한 박자 늦은 "하"를 다시 넣어 주는 식이다.

**`TextFieldState` 는 사용자가 칠 때 메인 스레드에서 바로(동기적으로) 바뀌어 이 왕복을 없앤다.**
- 원문 코드는 `rememberTextFieldState()` 로 상태를 만들고 `BasicTextField(state = state)` 로 넘기는 두 줄이다. `onValueChange` 가 없다.
- `TextFieldState` 는 편집 중인 모든 것을 들고 있다. 글, 선택 범위, 조합 표시, 되돌리기와 다시하기 기록, 글자 스타일이다.
- 내부 값이 Snapshot 시스템 위에 있어서, `BasicTextField` 는 이 상태를 **레이아웃 단계와 그리기 단계에서만** 읽는다. 컴포지션 단계에서 읽지 않으니, 평범하게 글자를 칠 때는 리컴포지션이 일어나지 않는다.

## 2. 코드로 고치기, 거르기, 꾸미기

**`state.text` 는 읽기 전용이라, 모든 수정은 `TextFieldBuffer` 를 거친다.**

### 2-1. 여러 수정을 한 번에 묶기

**코드로 글을 고칠 때는 `state.edit { }` 을 부르고, 여러 수정은 한 블록 안에 묶는다.**
- 원문 코드는 피해야 할 모양과 권하는 모양을 나란히 보여 준다. 피할 모양은 `state.edit { insert(5, ",") }`, `state.edit { delete(12, 13) }`, `state.edit { replace(0, 5, "goodbye") }` 를 따로따로 세 번 부르는 것이다.
- 권하는 모양은 `state.edit { }` 하나 안에서 `insert`, `delete`, `replace` 를 차례로 부르고, 마지막에 `selection = TextRange(9, 16)` 으로 선택 범위까지 정하는 것이다.
- 한 블록으로 묶으면 `TextFieldBuffer` 를 **하나만** 만들어 그 자리에서 고치고, 키보드와 Snapshot 시스템에 **한 번만** 알린다. 따로 부르면 그만큼 여러 번 알리고, 중간 상태가 키보드에 보일 수도 있다.

**자주 쓰는 수정은 이미 확장 함수로 있다.**
- `state.clearText()` 는 글을 모두 지운다.
- `state.setTextAndPlaceCursorAtEnd("Updated text")` 는 글을 바꾸고 커서를 맨 끝에 둔다.

### 2-2. InputTransformation — 저장되기 전에 거르기

**`InputTransformation` 은 사용자 입력이 `TextFieldState` 에 확정되기 전에 끼어든다.**
- 원문 예시는 숫자만 받는 규칙이다. `InputTransformation { }` 블록 안에서 `asCharSequence()` 로 바뀐 글을 보고, 숫자가 아닌 글자가 하나라도 있으면 `revertAllChanges()` 로 이번 입력을 통째로 되돌린다. 그리고 `BasicTextField(state = state, inputTransformation = digitsOnly)` 로 붙인다.
- 옛 방식처럼 "바뀌기 전 글과 바뀐 뒤 글을 통째로 비교(diff)"할 필요가 없다. 버퍼의 변경 목록(`ChangeList`)을 보면 **정확히 어느 범위가 바뀌었는지** 알 수 있어, 그 부분만 고치거나 되돌린다.
- 키보드와 커서 위치는 자동으로 맞춰진다.

### 2-3. OutputTransformation — 저장된 글은 그대로, 보이는 모양만

**`OutputTransformation` 은 저장소에 들어가는 원래 글을 바꾸지 않고 보이는 모양만 꾸민다.**
- 원문 예시는 전화번호 꾸미기다. 글 길이가 6보다 길면 6번째 자리에 `-` 를, 3보다 길면 3번째 자리에 `-` 를 끼워 넣는다. 뒤쪽부터 끼우는 이유는 앞에 먼저 끼우면 뒤쪽 자리 번호가 한 칸씩 밀리기 때문이다.
- 옛 `VisualTransformation` 과 달리 `OffsetMapping` 을 손으로 쓰지 않는다. 버퍼에서 `insert` 를 부르기만 하면 Compose가 저장된 글과 보이는 글 사이의 커서 위치 대응을 **양쪽으로 자동 계산**한다. 위치 계산이 틀려 앱이 죽는 일이 없다.

## 3. TextFieldState를 어디에 둘까 — 다섯 가지 경우

**`TextFieldState` 를 어디에 둘지는 구조의 경계에 따라 다르다.**

### 3-1. 컴포저블 하나 안에 둔다

**입력칸이 혼자 완결되고, 부모 화면은 제출할 때만 글을 읽는 경우다. 원문 예는 쿠폰 코드 입력칸이다.**
- 원문 코드의 `PromoCodeInput` 은 안에서 `rememberTextFieldState()` 로 상태를 만들고, `OutlinedTextField` 에 `InputTransformation.maxLength(6).allCaps(Locale.current)`(최대 6글자, 모두 대문자)를 붙인다.
- 입력칸 끝의 [적용] 버튼을 누르면 그때 `state.text.toString()` 을 `onApply` 콜백으로 넘긴다. 부모는 **글자마다 알 필요가 없고, 누를 때 한 번** 받는다.
- `rememberTextFieldState()` 는 안에서 `rememberSaveable` 을 쓰므로, 프로세스가 죽었다 살아나도 입력한 글이 돌아온다.

### 3-2. 공통 조상 컴포저블에 둔다

**형제 컴포넌트(글자 수 표시, 제출 버튼 등)가 글을 들여다봐야 하는 경우, 그들의 공통 조상에 둔다.**
- 원문 코드의 `PostCommentBar` 는 `commentState` 를 만들어 `CommentTextField` 와 `SubmitButton` 에 함께 넘기고, 그 사이에 `"${commentState.text.length} / 280"` 글자 수를 보여 준다.
- `TextFieldState` 를 아래로 넘겨도, 글자를 칠 때 **부모 컴포저블은 다시 실행되지 않는다.** `commentState.text` 를 읽는 범위(여기서는 글자 수 `Text` 와 그것을 감싼 범위)만 무효화된다.

### 3-3. 직접 만든 @Stable 상태 보관 클래스에 둔다

**`TextFieldState` 와 `InputTransformation`, `OutputTransformation` 이 같은 상태를 나눠 써야 하는 경우, 셋을 `@Stable` 클래스 하나로 묶는다. 원문 예는 글 안에 해시태그를 넣는 편집기다.**
- 원문 코드의 `TagEditorState` 는 `TextFieldState` 를 하나 들고, 태그 범위 목록(`mutableStateListOf<TextRange>()`)을 비공개로 둔다. 그리고 같은 목록을 받는 `TagInputTransformation` 과 `TagOutputTransformation` 을 만들고, 태그를 더하는 `addTag(tag)` 함수를 둔다.
- `PostEditor` 컴포저블은 `remember { TagEditorState() }` 를 기본값으로 받아, `BasicTextField` 에 상태와 두 규칙을 넘긴다.
- 세 부품이 같은 태그 범위 목록을 봐야 하므로, 따로 흩어 두지 않고 한 클래스가 묶어 관리한다.

### 3-4. ViewModel의 속성으로 바로 둔다

**업무 로직이 글을 계속 봐야 하는 경우(검색어, 실시간 검사 등), ViewModel이 `SavedStateHandle` 을 써서 `TextFieldState` 를 직접 드러낸다.**
- 원문 코드의 `FormViewModel` 은 `savedStateHandle.saveable(key = "username", saver = TextFieldState.Saver, init = { TextFieldState() })` 로 `username` 을 만든다. 프로세스가 죽었다 살아나도 글이 돌아온다.
- `TextFieldState` 는 Android `Context` 나 `View` 를 들고 있지 않으므로, ViewModel에 두어도 구조의 경계(ViewModel은 화면 객체를 모른다)를 어기지 않는다.

**절대 하지 말아야 할 것: `StateFlow` 로 내보내는 불변 `data class` 안에 `TextFieldState` 를 넣지 않는다.**
- 원문의 나쁜 예는 `data class FormUiState(val username: TextFieldState)` 다.
- `TextFieldState` 는 오래 사는 **변하는 객체**다. 사용자가 쳐도 객체 자체(참조)는 그대로이므로, 참조가 같은지로 비교하는 `StateFlow` 는 아무것도 내보내지 않는다.
- 반대로 UI 상태를 `copy` 할 때 새 `TextFieldState` 를 만들어 넣으면 **선택 범위, 커서 위치, 되돌리기 기록이 모두 지워진다.**

### 3-5. 순수 Kotlin ViewModel이면 snapshotFlow로 한 방향 다리를 놓는다

**ViewModel이 Compose 의존이 없는 순수 Kotlin 모듈에 있다면, `TextFieldState` 는 컴포저블에 두고 `snapshotFlow` 로 변화만 ViewModel에 흘려보낸다.**
- 원문 코드의 `LoginScreen` 은 `uiState` 의 `initialUsername` 으로 `rememberTextFieldState(initialText = ...)` 를 만든다.
- 첫 번째 `LaunchedEffect` 에서 `snapshotFlow { usernameState.text.toString() }` 을 `.drop(1)` 한 뒤 `viewModel.onUsernameChanged(it)` 로 모은다.
- 두 번째 `LaunchedEffect` 에서는 ViewModel의 `clearUsernameEvent` 를 모아, 신호가 오면 컴포저블이 `usernameState.clearText()` 를 부른다.
- `.drop(1)` 은 첫 컴포지션과 설정 변경(화면 회전 등) 때 나오는 **첫 값**을 건너뛴다. 이것이 없으면 화면을 돌릴 때마다 검색 요청이 다시 나가거나 처음 값이 다시 들어간다.
- ViewModel이 글을 지워야 할 때는 `TextFieldState` 를 직접 만지지 않고, **한 번만 쓰는 이벤트**를 내보내 컴포저블이 지우게 한다. 글의 주인은 끝까지 컴포저블 하나다.

## 4. Compose 1.12의 새 기능 — 서식 있는 글 편집

**`AnnotatedString` 은 바뀌지 않는 글에는 잘 맞지만, 입력 중에 글자마다 불변 범위를 새로 만들면 메모리 낭비가 심하다. Compose 1.12는 `TextFieldBuffer` 에 스타일을 바로 다는 API를 더했다.**
- `addStyle(spanStyle, start, end)` 와, 여기에 `expandPolicy` 를 더 받아 `TrackedRange<SpanStyle>` 을 돌려주는 `addStyle(spanStyle, start, end, expandPolicy)` 두 가지다.
- 글을 고치면 스타일 범위가 **자동으로** 밀리고, 늘고, 줄고, 사라진다. 범위를 손으로 다시 계산하지 않는다.

### 4-1. ExpandPolicy — 경계에서 친 글자가 스타일을 이어받을까

**`ExpandPolicy` 는 스타일 범위의 경계 바로 앞이나 뒤에 친 글자가 그 스타일을 이어받을지 정한다.**
- `ExpandPolicy.InsideOnly`: 경계에서 친 글자는 스타일 없이 남는다. 범위 **안쪽**에서 칠 때만 스타일이 늘어난다.
- `ExpandPolicy.AtStart`: 시작 경계에서 친 글자가 스타일을 이어받는다.
- `ExpandPolicy.AtEnd`: 끝 경계에서 친 글자가 스타일을 이어받는다. 보통의 글 편집기가 이렇게 동작한다(굵게를 켜고 이어 치면 계속 굵다).
- `ExpandPolicy.AtBoth`: 양쪽 경계 모두에서 이어받는다.

### 4-2. TrackedRange와 실제 예시

**`addStyle` 과 `getSpanStyles` 는 `TrackedRange` 를 돌려준다. 이것은 스타일 범위를 그 자리에서 바꿀 수 있는 살아 있는 손잡이다.**

**예시 1: 보이는 그대로 편집하는(WYSIWYG) 굵게 켜고 끄기.**
- 원문 코드의 `TextFieldBuffer.toggleBoldSelection()` 은 선택이 비어 있으면(`selection.collapsed`) 아무것도 하지 않는다.
- 선택 범위의 스타일(`getSpanStyles(selection)`) 중 굵게가 하나도 없으면, 선택 범위에 굵게를 `ExpandPolicy.AtEnd` 로 단다.
- 이미 굵게가 있으면, 첫 굵게 범위의 `range` 를 `TextRange(span.start, selection.min)` 으로 줄여 선택이 시작된 곳에서 굵게를 끊는다. 스타일을 지우고 다시 만드는 것이 아니라 **손잡이로 범위를 줄이는** 것이다.

**예시 2: `InputTransformation` 으로 패턴을 찾아 스타일 달기.**
- 원문 코드의 `MarkdownBoldTransformation` 은 `**글자**` 를 찾는 정규식으로 버퍼를 훑는다.
- 찾을 때마다 `**` 를 뺀 안쪽 글로 `replace` 하고, 그 범위에 굵게를 `ExpandPolicy.AtEnd` 로 단다.
- `InputTransformation` 은 `TextFieldState` 에 바로 확정되므로, 단 굵게 스타일이 **상태에 남는다.**

**예시 3: `OutputTransformation` 으로 검색어 강조.**
- 원문 코드의 `SearchHighlightTransformation` 은 검색어를 `State<String>` 으로 받는다. 검색어가 비면 아무것도 하지 않는다.
- 글에서 `indexOf` 로 검색어를 찾을 때마다 노란 배경, 검은 글자 스타일을 달고, 찾은 자리 뒤부터 다시 찾는다.
- `OutputTransformation` 은 Snapshot을 인식하므로, 검색어 `State` 가 바뀌면 규칙이 **자동으로 다시 돈다.** 저장된 `TextFieldState` 는 건드리지 않고 화면에만 강조가 보인다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide에는 아직 글자 입력칸이 하나도 없다(Aide 코드에서 `TextField` 를 검색해도 나오지 않는다). 그런데 1-a 계획의 **Task 8(첫 화면 대시보드와 입력 막대)** 과 **Task 9(일정 추가 화면)** 에 입력칸이 처음 들어간다. 아래는 두 Task를 원문 방식으로 짜면 어떤 모양인지 보여 주는 **직접 쓴 스케치**다. Aide에 있는 코드가 아니고, 돌려 보지 않았다.

### 1. Task 8 계획 그대로 짜면 — 원문이 피하라는 모양

계획서의 Task 8은 `HomeUiState` 에 "입력 글"을 두고, `HomeContract.Event` 에 "입력 변경"을 둔다. 그대로 옮기면 이런 모양이 된다.

```kotlin
data class HomeUiState(
    val openTasks: List<Task> = emptyList(),
    val inputText: String = "",
)

sealed interface HomeContract {
    sealed interface Event {
        data class InputChanged(val text: String) : Event
        data object AddAsTask : Event
        data object AddAsEvent : Event
    }
}

@Composable
fun InputBar(text: String, onEvent: (HomeContract.Event) -> Unit) {
    TextField(
        value = text,
        onValueChange = { onEvent(HomeContract.Event.InputChanged(it)) },
    )
}
```

- 글자를 칠 때마다 `InputChanged` → ViewModel → `StateFlow` 갱신 → `collectAsStateWithLifecycle()` → 리컴포지션 → `TextField` 의 `value` 로 왕복한다. 원문 1장이 말한 **키보드와 어긋나는 왕복**이 그대로 생긴다.
- 한글 입력에서는 조합 중인 글자가 이 왕복 사이에 끼어 깨질 위험이 더 크다.
- 그리고 이 모양은 Compose 1.13부터 소프트 지원 중단되는 오버로드를 쓴다.

### 2. Task 8을 원문 3-2 방식으로 — 상태는 HomeRoute에, 글은 버튼을 누를 때 Event로

첫 화면의 ViewModel은 입력 글을 **글자마다 알 필요가 없다.** [할 일로]나 [일정으로]를 누를 때 한 번 받으면 된다. 그러니 원문 3-2처럼 입력칸과 두 버튼의 공통 조상인 `HomeRoute` 에 `TextFieldState` 를 둔다.

```kotlin
sealed interface HomeContract {
    sealed interface Event {
        data class AddAsTask(val text: String) : Event
        data class AddAsEvent(val text: String) : Event
    }
    sealed interface Effect {
        data object ClearInput : Effect
        data class OpenAddEvent(val title: String) : Effect
    }
}

@Composable
fun HomeRoute(viewModel: HomeViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val input = rememberTextFieldState()

    LaunchedEffect(viewModel) {
        viewModel.effect.collect { effect ->
            when (effect) {
                HomeContract.Effect.ClearInput -> input.clearText()
                is HomeContract.Effect.OpenAddEvent -> Unit
            }
        }
    }

    HomeScreen(uiState = uiState, input = input, onEvent = viewModel::onEvent)
}

@Composable
fun InputBar(input: TextFieldState, onEvent: (HomeContract.Event) -> Unit) {
    Row {
        TextField(state = input, lineLimits = TextFieldLineLimits.SingleLine)
        TextButton(onClick = { onEvent(HomeContract.Event.AddAsTask(input.text.toString())) }) { Text("할 일로") }
        TextButton(onClick = { onEvent(HomeContract.Event.AddAsEvent(input.text.toString())) }) { Text("일정으로") }
    }
}
```

- **`HomeUiState` 에서 "입력 글"이 빠진다.** 원문 3-4의 나쁜 예(불변 UI 상태에 `TextFieldState` 를 넣기)도 피하고, 글자마다 `StateFlow` 가 갱신되는 일도 없다.
- **"입력 변경" Event가 없어지고, 버튼 Event가 글을 싣는다.** ViewModel은 여전히 `String` 만 다루므로 Compose를 몰라도 되고, 계획의 Turbine 테스트도 그대로 쓸 수 있다.
- **글 지우기는 ViewModel이 `Effect.ClearInput` 으로 알린다.** 원문 3-5처럼 글의 주인(`HomeRoute`)이 지운다. 계획의 케이스 4("   " + [할 일로]는 아무것도 추가 안 됨)에서는 `ClearInput` 을 보내지 않으니 입력이 그대로 남는다.
- **`rememberTextFieldState()` 는 저장 가능한 상태**라, 입력 막대에 글을 치다가 앱이 백그라운드에서 죽어도 돌아오면 글이 남아 있다.
- **`HomeScreen` 은 `input: TextFieldState` 를 하나 더 받는다.** 계획의 "UiState와 콜백만 받는 순수 UI" 규칙과는 조금 다르다. Preview에서는 `TextFieldState("보고서")` 처럼 바로 만들어 넣으면 된다.
- `TextFieldLineLimits.SingleLine` 은 한 줄 입력칸으로 만드는 설정이다.

계획의 `HomeViewModelTest` 케이스는 이렇게 바뀐다.

| # | 동작 | 기대 |
|---|---|---|
| 3 | `AddAsTask("보고서")` 를 보낸다 | 할 일이 하나 추가되고, Effect `ClearInput` 이 한 번 나온다. |
| 4 | `AddAsTask("   ")` 를 보낸다 | 아무것도 추가되지 않고, `ClearInput` 도 나오지 않는다. |
| 5 | `AddAsEvent("디자인 회의")` 를 보낸다 | Effect `OpenAddEvent("디자인 회의")` 가 나오고, 할 일은 추가되지 않는다. |

### 3. Task 9 일정 추가 화면 — 제목은 snapshotFlow 한 방향 다리로

일정 추가 화면은 사정이 다르다. 계획의 케이스 7("제목이 공백이면 저장 버튼 비활성")은 ViewModel이 **제목을 계속** 알아야 한다. 원문 3-4(ViewModel에 `TextFieldState`)와 3-5(`snapshotFlow` 다리) 중, Aide의 "ViewModel은 `String` 만 다루고 `XxxContract.Event` 로 받는다" 규칙에 맞는 것은 3-5다.

```kotlin
@Composable
fun AddEventRoute(viewModel: AddEventViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val title = rememberTextFieldState(initialText = uiState.initialTitle)

    LaunchedEffect(title, viewModel) {
        snapshotFlow { title.text.toString() }
            .drop(1)
            .collect { viewModel.onEvent(AddEventContract.Event.TitleChanged(it)) }
    }

    AddEventScreen(uiState = uiState, title = title, onEvent = viewModel::onEvent)
}
```

- **`initialTitle`** 은 첫 화면에서 넘어온 `AddEventKey(title)` 의 값이다. ViewModel은 이미 이 값을 알고 있으므로 `.drop(1)` 로 첫 값을 건너뛰어도 된다.
- **ViewModel은 `TitleChanged` 로 제목을 받아 "저장 가능"만 계산한다.** 제목을 다시 입력칸에 써 넣지 않는다. 다리가 **한 방향**이라 1장의 왕복이 생기지 않는다.
- **계획의 케이스 9("저장 실패 시 입력 유지")는 저절로 지켜진다.** 글의 주인이 화면의 `TextFieldState` 이고, 저장에 실패해도 아무도 지우지 않기 때문이다.
- `snapshotFlow` 는 글자를 칠 때마다 값을 내보내지만, 이 값은 ViewModel 안에서 `isBlank()` 검사 하나에만 쓰이므로 가볍다.

## 배운 점

- **입력칸 상태의 주인은 하나여야 한다.** 옛 방식은 키보드와 ViewModel이 같은 글을 서로 고쳐 쓰는 구조라 빠르게 치면 어긋났다. `TextFieldState` 는 주인을 입력칸 쪽 하나로 정하고, 나머지는 읽거나 이벤트로 부탁하게 만든다.
- **"글자마다 알아야 하는가"가 상태 위치를 정한다.** 제출할 때만 필요하면 컴포저블 안이나 공통 조상에, 계속 필요하면 ViewModel(`SavedStateHandle`)이나 `snapshotFlow` 다리로 둔다. 무조건 ViewModel로 올리는 것이 정답이 아니다.
- **불변 UI 상태에 변하는 객체를 넣지 않는다.** `data class` 안의 `TextFieldState` 는 `StateFlow` 가 변화를 못 보고, `copy` 하면 커서와 되돌리기 기록이 사라진다. 변하는 객체는 UI 상태 옆에 따로 둔다.
- **거르기(`InputTransformation`)와 꾸미기(`OutputTransformation`)는 다른 일이다.** 저장될 글을 바꾸는 것과 보이는 모양만 바꾸는 것을 나눠 두면, 전화번호의 `-` 처럼 저장에 섞이면 안 되는 것이 섞이지 않는다.
- **여러 수정은 한 `edit` 블록에 묶는다.** 키보드에 알리는 횟수가 하나로 줄고, 중간 상태가 보이지 않는다.
- **소프트 지원 중단은 "지금 깨지지 않지만 더 고쳐지지 않는다"는 뜻이다.** 새로 짜는 코드는 처음부터 새 API로 쓰는 것이 가장 싸다.

## Aide에 적용하면

Aide는 지금 Compose BOM `2026.02.01` 을 쓰고, 이 BOM의 `foundation` 은 **1.10.4** 다. `TextFieldState` 는 1.7부터 안정판이라 바로 쓸 수 있고, 원문 4장의 1.12 스타일 API는 BOM을 올리기 전에는 쓸 수 없다. Aide 코드에는 아직 입력칸이 없고, 1-a 계획의 Task 8과 Task 9에서 처음 생긴다(마지막 커밋은 Task 7 `Task Room 추가`).

1. **Task 8 입력 막대를 `TextFieldState` 로 짠다 — 바꿔서 가져온다. 계획 변경이라 사용자 결정이 필요하다.**
   - 계획서 Task 8은 `HomeUiState` 에 "입력 글"을, `HomeContract.Event` 에 "입력 변경"을 둔다. 이것은 원문 1장이 피하라는 `value` 와 `onValueChange` 왕복이고, 계획과 원문이 **충돌한다.**
   - 제안: `TextFieldState` 를 `HomeRoute` 에 두고(원문 3-2), [할 일로]와 [일정으로] Event가 글을 싣는다. 입력 비우기는 `Effect.ClearInput` 으로 알린다("코드로 보기" 2번).
   - 바뀌는 것: `HomeUiState` 에서 "입력 글"이 빠지고, Event 목록에서 "입력 변경"이 빠지며, `HomeContract.Effect` 에 "입력 비우기"가 더해진다. `HomeViewModelTest` 케이스 3~5의 기대도 위 표처럼 바뀐다. `HomeScreen` 이 `TextFieldState` 를 하나 더 받으므로 "UiState와 콜백만 받는 순수 UI" 규칙에 예외가 하나 생긴다.
   - 정해야 할 것: **(가)** 위 제안대로 계획을 바꾼다. **(나)** 계획대로 `onValueChange` 방식으로 짜고, Compose 1.13으로 올릴 때 바꾼다. 추천은 (가)다. 입력칸을 처음 만드는 지금 바꾸는 것이 가장 싸고, 한글 조합 입력이 왕복 사이에서 깨질 위험을 처음부터 없앤다.
2. **Task 9 일정 추가 화면의 제목은 `snapshotFlow` 한 방향 다리로 — 바꿔서 가져온다. Task 9에서.**
   - 케이스 7(제목 공백이면 저장 비활성) 때문에 ViewModel이 제목을 계속 알아야 한다. ViewModel에 `TextFieldState` 를 두는 원문 3-4 대신, Aide의 "ViewModel은 `String` 과 Contract Event만 다룬다" 규칙에 맞는 원문 3-5를 쓴다("코드로 보기" 3번).
   - 원문 3-4(ViewModel에 `TextFieldState`)를 쓰지 않는 이유: ViewModel 테스트가 `TextFieldState` 를 만들어 다뤄야 하고, JVM 단위 테스트에서 Snapshot 상태를 다루는 방식이 Aide의 다른 ViewModel 테스트와 달라진다. 이 부분은 실제로 돌려 보지 않은 판단이다.
3. **1-b의 AI 대화 입력칸과 AI 키 입력칸 — 가져온다. 1-b에서.**
   - AI 대화 입력칸은 Task 8과 같다. 보낼 때 한 번 글을 싣고, 보낸 뒤 Effect로 비운다.
   - 사용자가 직접 넣는 AI 키 입력칸은 Compose의 비밀번호용 입력칸(`BasicSecureTextField` 계열)을 검토한다. 키가 화면에 그대로 보이지 않게 하고, 키 값이 UI 상태 `data class` 에 들어가 로그나 디버그 화면에 찍히는 일을 막는다.
4. **`InputTransformation` 으로 입력 거르기 — 지금은 안 한다.**
   - 이유: 1-a 계획에 글자 수 제한이나 글자 종류 제한이 없다. 공백만 있는 글은 막지 않고 입력은 받되 추가만 하지 않는 것이 계획의 규칙(Review Focus 5)이다. 필요해지면 `InputTransformation.maxLength` 부터 쓴다.
5. **Compose 1.12 스타일 API(`addStyle`, `ExpandPolicy`, `TrackedRange`) — 지금은 안 한다.**
   - 이유: Aide의 BOM은 `foundation` 1.10.4라 쓸 수 없고, 서식 있는 글을 편집하는 기능도 계획에 없다. 나중에 일정 메모에 굵게나 목록을 넣는 기능이 생기면 그때 BOM을 올리며 본다. AI 대화 화면에서 검색어 강조가 필요하면 원문 예시 3(`OutputTransformation` 강조)이 출발점이다.
6. **Compose BOM 올리기 — 지금은 안 한다.**
   - 이유: 1-a에 필요한 `TextFieldState` 는 지금 버전에 이미 있다. 버전 올리기는 1-a 기능과 섞지 않고 따로 PR로 한다(main 보호 규칙상 모든 변경은 PR과 CI를 거친다).

## 출처

- [Building Reliable Text Editing in Compose: TextFieldState, TextFieldBuffer, and Compose 1.12 Styling — Arda Kazancı](https://ardakazanci.com/posts/building-reliable-text-editing-in-compose/) (2026-11-11)
- [Android 개발자 문서: 텍스트 필드 구성](https://developer.android.com/develop/ui/compose/text/user-input)
- [Android 개발자 문서: TextFieldState 이전 가이드](https://developer.android.com/develop/ui/compose/text/migrate-state-based)
- [Android 개발자 문서: Compose에서 상태 끌어올리기](https://developer.android.com/develop/ui/compose/state-hoisting)
- [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- 원문 블로그에는 라이선스 표시가 없어, 원문 코드는 옮기지 않고 글로 설명했다.
