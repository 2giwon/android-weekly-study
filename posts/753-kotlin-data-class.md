---
issue: 753
date: 2026-11-15
title: Kotlin data class는 언제 쓰나 — 컴파일러가 대신 쓰는 다섯 가지와 copy()의 함정
original_title: When Should a Kotlin Class Be a Data Class?
url: https://imayankkumar.com/blog/kotlin-data-class/
author: Mayank Kumar
tags: [Kotlin, data class, StateFlow]
aide:
  status: candidate
  module: feature:home
  task: Task 8
  summary: Task 8의 HomeUiState는 val과 읽기 전용 List로 만들고 update { it.copy(...) }로만 바꾼다. 캘린더 이식 코드의 CalendarMonth는 equals를 직접 써서 첫날과 마지막 날만 비교하므로, 지금처럼 LiveData일 때는 괜찮지만 StateFlow로 옮기기 전에 반드시 고쳐야 한다
---

## 한 줄 요약

Kotlin의 **data class** 는 다른 종류의 클래스가 아니라, 컴파일러가 함수 다섯 가지를 대신 써 주는 보통 클래스다. 다섯 가지는 `equals()`, `hashCode()`, `toString()`, `copy()`, 그리고 `component1()`, `component2()` 같은 `componentN()` 함수다. 저자 Mayank Kumar는 이 다섯 함수가 **기본 생성자(primary constructor) 안의 속성만** 보고, `copy()`는 안에 든 객체를 새로 만들지 않고 **같은 객체를 가리키는 참조만 복사한다**는 두 가지를 꼭 기억하라고 말한다. 이 두 가지를 놓치면 "`copy()`로 상태를 바꿨는데 화면이 안 바뀌는" 버그가 생긴다. 앱이 죽지도 않고 Logcat에 아무것도 찍히지 않아서 찾기 어려운 버그다.

> 원문 블로그는 하단에 "All rights reserved"라고 적혀 있어서 원문 코드를 그대로 옮기지 않았다. 원문의 장마다 같은 내용을 **직접 쓴 스케치**(예: 장바구니 대신 할 일 목록)로 다시 썼다. 바이트코드와 컴파일러 경고, StateFlow 동작은 이 글을 쓰면서 Kotlin 2.2.10과 2.4.21 컴파일러로 직접 돌려 보고 결과를 적었다. 원문 그림은 1장이고, 원문 서버 주소를 걸어 보여 준다.

## 먼저 알아 둘 말

- **data class**: 클래스 앞에 `data` 를 붙인 클래스다. 값을 담는 것이 주된 일인 클래스에 쓴다. Java의 `record`, 또는 롬복(Lombok)의 `@Data` 와 비슷한 역할이다.
- **기본 생성자(primary constructor)**: 클래스 이름 바로 뒤 괄호 안에 적는 생성자다. `data class Todo(val title: String)` 에서 `(val title: String)` 부분이다.
- **본문 속성(body property)**: 클래스의 중괄호 `{ }` 안에 따로 선언한 속성이다. 기본 생성자 안에 있지 않다.
- **`equals()`**: 두 객체가 "같은가"를 답하는 함수다. Kotlin의 `==` 는 이 함수를 부른다.
- **`hashCode()`**: 객체를 숫자 하나로 줄인 값이다. `HashMap`과 `HashSet`이 객체를 빨리 찾으려고 쓴다. 같은 객체는 반드시 같은 숫자를 내야 한다.
- **`Any`**: Kotlin의 모든 클래스의 맨 위 부모다. Java의 `Object` 와 같다. `Any` 의 `equals()` 는 "메모리에서 완전히 같은 객체인가"만 본다.
- **구조 분해(destructuring)**: `val (title, done) = todo` 처럼 객체를 여러 변수로 한 번에 풀어 받는 문법이다. 뒤에서 `component1()`, `component2()` 를 부른다.
- **얕은 복사(shallow copy)**: 속성 값만 복사하는 것이다. 속성이 리스트 같은 객체면, 리스트를 새로 만들지 않고 "같은 리스트를 가리키는 주소"만 복사한다. 그래서 원본과 복사본이 같은 리스트를 함께 쓴다. 반대로 안의 객체까지 새로 만드는 것을 **깊은 복사(deep copy)** 라고 한다.
- **`StateFlow`**: Kotlin 코루틴의 "현재 값 하나를 들고 있는 흐름"이다. 화면은 이 흐름을 지켜보다가 값이 바뀌면 다시 그린다. **새 값이 지금 값과 `==` 로 같으면 무시한다.** Android의 `LiveData` 와 비슷하지만, `LiveData` 는 같은 값이 들어와도 매번 다시 알린다.
- **`MutableList` 와 `List`**: `MutableList` 는 `add()` 로 안을 바꿀 수 있는 리스트다. `List` 는 읽기만 되는 리스트다. `List` 를 "바꾸려면" 새 리스트를 만들어야 한다.
- **가시성(visibility)**: 누가 이 함수나 생성자를 부를 수 있는지다. `public`(누구나), `internal`(같은 모듈), `private`(같은 클래스 안)이 있다.
- **바이트코드(bytecode)**: Kotlin 코드를 컴파일하면 나오는, JVM과 Android가 실제로 실행하는 명령이다. `javap` 는 JDK에 들어 있는 바이트코드 살펴보기 도구다.
- **Konsist**: 코드 구조 규칙(이름, 패키지, 의존 방향 등)을 단위 테스트로 검사하는 Kotlin 라이브러리다. Aide는 `coding-convention` 모듈에서 Konsist 테스트를 돌린다.

## 서론 — copy()를 불렀는데 화면이 안 바뀐다

<figure class="media"><img src="https://imayankkumar.com/blog/kotlin-data-class/kotlin-data-class.png" alt="원문 그림. 맨 위에 한 줄짜리 코드 data class CartItem(name, price, quantity) 가 있고, 화살표가 다섯 갈래로 나뉘어 컴파일러가 만드는 함수 다섯 개 equals, hashCode, toString, component1부터 3까지, copy 로 이어진다. 아래에 경고 두 개가 있다. 하나는 기본 생성자 안의 속성만 센다는 것, 다른 하나는 copy()는 얕은 복사라는 것이다" loading="lazy"><figcaption>원문 그림. 한 줄로 쓴 data class에서 컴파일러가 함수 다섯 개(equals, hashCode, toString, component1부터 component3까지, copy)를 만들어 낸다는 것을 보여 준다. 아래에는 이 글의 두 경고가 적혀 있다. 첫째, 다섯 함수는 기본 생성자 안의 속성만 센다. 둘째, copy()는 얕은 복사다. 원문 이미지, 원문 서버에서 불러옴 (<a href="https://imayankkumar.com/blog/kotlin-data-class/">원문</a>)</figcaption></figure>

**무엇이 일어나는가**
- 사용자가 장바구니에 물건을 담는다. ViewModel은 상태를 `StateFlow` 로 들고 있고, 상태 클래스는 data class이고, 바꿀 때는 `copy()` 를 부른다.
- 그런데 화면이 바뀌지 않는다. 앱이 죽지도 않고 Logcat에도 아무것도 없다.

**왜**
- 원인은 `copy()` 와 `equals()` 가 함께 움직이는 방식에 있다. 저자는 이 글에서 `data` 가 무엇을 더해 주는지, 어떤 규칙이 따라오는지, 그리고 놀라운 버그 뒤에 숨은 두 가지를 차례로 설명한다.

## 1. data class란 무엇인가

**값을 담는 클래스를 한 줄로 쓴다**
- data class는 값을 담는 것이 주된 일인 클래스다. 속성을 생성자 괄호 안에 적으면 끝이다.
- 차이는 `data` 를 뺀 같은 클래스와 비교하면 바로 보인다.

```kotlin
// 직접 쓴 스케치 — 원문은 장바구니 물건(CartItem)으로 같은 비교를 한다
data class Todo(val title: String, val priority: Int, val done: Boolean)
class PlainTodo(val title: String, val priority: Int, val done: Boolean)

Todo("우유 사기", 1, false) == Todo("우유 사기", 1, false)            // true
PlainTodo("우유 사기", 1, false) == PlainTodo("우유 사기", 1, false)  // false
```

- 보통 클래스 `PlainTodo` 는 `equals()` 를 `Any` 에서 물려받는다. `Any` 의 `equals()` 는 "메모리에서 같은 객체인가"만 묻기 때문에, 내용이 똑같아도 따로 만든 두 객체는 다르다.
- data class `Todo` 는 속성 값을 하나씩 비교하므로 같다.

## 2. 컴파일러가 대신 쓰는 다섯 가지

Kotlin 공식 문서가 꼽는 다섯 가지다. 모두 기본 생성자 안의 속성으로 만든다.

- **`equals()`**: 기본 생성자 속성이 모두 같으면 두 객체가 같다고 답한다.
- **`hashCode()`**: 같은 속성으로 만들어서, 같은 객체는 같은 숫자를 낸다. 그래서 data class를 `HashMap` 의 키로 쓸 수 있다. 위의 `Todo` 두 개를 `setOf()` 에 넣으면 하나만 남고, `PlainTodo` 두 개를 넣으면 두 개가 남는다.
- **`toString()`**: `Todo(title=우유 사기, priority=1, done=false)` 처럼 속성 이름과 값을 찍는다. 보통 클래스는 `PlainTodo@7a81197d` 같은 이름과 주소만 찍는다. 로그를 볼 때 아주 쓸모 있다.
- **`componentN()`**: `component1()` 은 첫 속성 `title` 을, `component2()` 는 둘째 속성 `priority` 를 돌려준다. 선언한 순서를 따른다. 이 함수들 덕분에 `val (title, priority, done) = todo` 같은 구조 분해가 된다.
- **`copy()`**: 같은 값으로 새 객체를 만들되, 일부만 바꿀 수 있다. `todo.copy(done = true)` 처럼 쓴다.

## 3. data class의 규칙 네 가지

**컴파일러가 확인하는 규칙**
1. 기본 생성자에 파라미터가 적어도 하나 있어야 한다.
2. 기본 생성자의 파라미터는 모두 `val` 이나 `var` 이어야 한다.
3. data class는 `abstract`, `open`, `sealed`, `inner` 가 될 수 없다.
4. 컴파일러가 만들 `copy()` 나 `componentN()` 과 같은 모양의 함수를 직접 쓸 수 없다. 대신 `equals()`, `hashCode()`, `toString()` 은 직접 써도 되고, 그러면 컴파일러는 직접 쓴 것을 쓴다.

**3번 규칙의 뜻**
- 아무도 data class를 상속할 수 없다는 뜻이다.
- 그래도 인터페이스는 구현할 수 있다. 그래서 Android 코드에서 `data class Ready(...) : UiState` 같은 모양을 자주 본다. 저자는 이 `UiState` 를 만드는 법을 sealed class 글에서 따로 다룬다.
- 규칙을 어기면 "Modifier 'open' is incompatible with 'data'" 같은 컴파일 오류가 난다.

## 4. equals()는 어떤 속성을 보나

**기본 생성자 안의 속성만 본다**
- 클래스 본문에 선언한 속성은 다섯 함수가 모두 무시한다.

```kotlin
// 직접 쓴 스케치 — 원문은 주문(Order)과 "읽음" 표시로 같은 이야기를 한다
data class Note(val id: Long, val text: String) {
    var pinned: Boolean = false
}
```

- `id` 와 `text` 가 같은 두 `Note` 는, 한쪽만 `pinned = true` 여도 같다고 나온다.
- `toString()` 에도 `pinned` 는 나오지 않는다.
- `copy()` 도 `pinned` 를 옮겨 주지 않는다. 복사본은 다시 `false` 로 시작한다.
- 저자의 결론은 짧다. **값이 중요하면 생성자에 넣는다.**

## 5. copy()는 깊은 복사인가

**아니다, 얕은 복사다**
- `copy()` 는 속성마다 값을 복사한다. 속성이 객체면 그 값은 "객체를 가리키는 참조"다. 그래서 복사본과 원본은 같은 리스트를 가리킨다.
- 서론의 버그가 바로 이것이다.

```kotlin
// 직접 쓴 스케치 — 원문은 장바구니 상태(CartState)로 같은 버그를 보여 준다
// 틀린 쪽: 상태가 MutableList를 들고 있다
data class TodoState(val items: MutableList<Todo>)
val state = MutableStateFlow(TodoState(mutableListOf()))

val old = state.value
old.items.add(newTodo)      // old가 가리키는 리스트 자체를 바꾼다
state.value = old.copy()    // 새 객체지만 같은 리스트를 가리킨다 → 새 값 == 옛 값

// 맞는 쪽: 읽기 전용 List, 바꿀 때마다 새 리스트
data class TodoState(val items: List<Todo>)
val state = MutableStateFlow(TodoState(emptyList()))

state.update { it.copy(items = it.items + newTodo) }
```

**틀린 쪽에서 무슨 일이 일어나나**
- `add()` 가 옛 상태 안의 리스트를 직접 바꾼다.
- `copy()` 가 새 `TodoState` 를 만들지만, 그 새 객체도 같은 리스트를 가리킨다. 그래서 새 상태와 옛 상태가 `==` 로 같다.
- `StateFlow` 는 지금 값과 같은 값을 무시하므로, 화면은 바뀐 것을 영영 듣지 못한다.
- 저자는 직접 확인해 보라고 권한다. 상태를 지켜보며 값을 찍으면, 틀린 쪽은 처음 상태만 찍히고 맞는 쪽은 바뀐 상태도 찍힌다.

**맞는 쪽이 왜 되나**
- `it.items + newTodo` 는 새 리스트를 만든다. 그래서 새 상태가 정말로 옛 상태와 다르고, `StateFlow` 가 새 값을 내보낸다.

> 직접 확인: 위 틀린 쪽과 같은 모양(MutableList를 든 data class, `add()` 뒤에 `copy()`)을 Kotlin 2.4.21로 컴파일해 돌려 보니 `새 값 == 옛 값` 이 `true`, `새 값.items === 옛 값.items`(완전히 같은 리스트인가)도 `true` 가 나왔다.

## 6. 생성자를 private으로 막으면 copy()가 경고를 낸다

**생성자를 막는 흔한 이유**
- 값을 먼저 검사하고 싶을 때 생성자를 `private` 으로 막고, 검사하는 함수로만 만들게 한다.

```kotlin
// 직접 쓴 스케치 — 원문은 할인 쿠폰(1에서 50퍼센트만 허용)으로 같은 이야기를 한다
data class Percent private constructor(val value: Int) {
    companion object {
        fun of(value: Int): Percent? = if (value in 0..100) Percent(value) else null
    }
}

val ten = Percent.of(10)!!
val broken = ten.copy(value = 500)   // 0..100 검사를 건너뛴다
```

**무엇이 문제인가**
- 컴파일러가 만든 `copy()` 는 `public` 이다. 그래서 누구나 `copy()` 로 검사를 건너뛰고 `Percent(500)` 을 만들 수 있다.
- Kotlin 2.0.20부터 컴파일러가 이 경우에 경고를 낸다. 앞으로는 `copy()` 의 가시성을 생성자와 같게 맞출 계획이다.

**지금 고를 수 있는 것 두 가지**
- **`@ConsistentCopyVisibility`**: 지금 바로 `copy()` 를 생성자처럼 `private` 으로 만든다. 그러면 위 마지막 줄은 "Cannot access ... it is private" 오류가 난다.
- **`@ExposedCopyVisibility`**: 예전처럼 `public copy()` 를 두고, 클래스에 붙는 경고를 숨긴다. 그래도 `copy()` 를 부르는 쪽에는 경고가 계속 나온다.

**언제 오류가 되나**
- 원문은 2026년 11월의 Kotlin 2.4.21에서도 아직 경고이고, 언제 오류로 바뀔지는 [KT-11914](https://youtrack.jetbrains.com/issue/KT-11914)가 다룬다고 적었다. 그리고 생성자가 `private` 인 data class가 있다면 오늘 `@ConsistentCopyVisibility` 를 붙이라고 권한다.

> 직접 확인: 위 스케치를 두 버전으로 컴파일해 봤다. 클래스 선언과 `copy()` 를 부르는 줄에 둘 다 경고가 나왔다. **Kotlin 2.2.10**은 "언어 버전 2.3에서 오류가 된다"고 적고, **Kotlin 2.4.21**은 "언어 버전 2.5에서 오류가 된다"면서 KT-11914 주소를 붙인다. 오류로 바뀌는 시점이 한 번 미뤄진 것이다. 경고만 나오므로 실행하면 `Percent(value=500)` 이 그대로 만들어진다.

## 7. 바이트코드로 보면

**한 줄이 무엇으로 바뀌나**
- 저자는 장바구니 클래스를 Kotlin 2.4.21로 컴파일하고 `javap` 로 살펴본다. 같은 일을 1장의 `Todo` 로 해 보면 아래처럼 나온다.

```text
// 직접 돌린 결과 — Kotlin 2.4.21로 Todo와 같은 모양의 클래스(이름 TodoItem)를 컴파일하고 javap로 본 것
public final class TodoItem {
  public TodoItem(java.lang.String, int, boolean);
  public final java.lang.String getTitle();
  public final int getPriority();
  public final boolean getDone();
  public final java.lang.String component1();
  public final int component2();
  public final boolean component3();
  public final TodoItem copy(java.lang.String, int, boolean);
  public static TodoItem copy$default(TodoItem, java.lang.String, int, boolean, int, java.lang.Object);
  public java.lang.String toString();
  public int hashCode();
  public boolean equals(java.lang.Object);
}
```

**한 줄씩 읽기**
- `public final class`: 클래스가 `final` 이다. 3장의 3번 규칙("상속할 수 없다")이 바이트코드에서는 이렇게 보인다.
- `getTitle()` 같은 getter 세 개: `val` 속성마다 하나씩 생긴다.
- `component1()` 부터 `component3()`: 구조 분해용이다. 선언 순서대로 생긴다.
- `copy(...)`: 파라미터를 전부 받는 진짜 복사 함수다.
- `copy$default(...)`: 기본값 처리를 맡는다. 끝에서 두 번째 `int` 가 "어느 파라미터를 넘겼는지" 표시하는 비트 묶음(mask)이고, 넘기지 않은 값은 옛 객체에서 가져온다. `todo.copy(done = true)` 가 이 함수를 부른다.
- `hashCode()`: 바이트코드 본문을 열어 보면 첫 속성의 해시에서 시작해 "지금 값에 31을 곱하고 다음 속성의 해시를 더하기"를 세 번 한다. Java에서 손으로 쓰던 바로 그 코드다.
- Android Studio에서는 Tools > Kotlin > Show Kotlin Bytecode 를 누르고 Decompile 을 누르면 같은 것을 볼 수 있다.

## 8. 보통 클래스와 data class 비교

| 항목 | 보통 클래스 | data class |
|---|---|---|
| `==` 가 비교하는 것 | 메모리에서 같은 객체인지 비교한다. | 기본 생성자 속성의 값을 비교한다. |
| `toString()` 결과 | `PlainTodo@7a81197d` 처럼 이름과 주소만 나온다. | `Todo(title=..., priority=...)` 처럼 속성 값이 나온다. |
| `copy()` 와 구조 분해 | 둘 다 없다. | 둘 다 있다. |
| `open` 이나 `abstract` | 될 수 있다. | 될 수 없다. |
| 생성자 | 아무 모양이어도 되고, 없어도 된다. | `val` 이나 `var` 파라미터가 적어도 하나 있어야 한다. |
| 어울리는 곳 | 동작을 맡는 클래스다. ViewModel, Repository, 각종 매니저가 여기에 든다. | 값을 담는 클래스다. 화면 상태, API 응답 모델, 데이터를 실은 이벤트가 여기에 든다. |

## 9. 자주 묻는 질문

**생성자에 없는 속성을 가져도 되나?**
- 된다. 다만 컴파일러가 만든 다섯 함수가 모두 무시한다. 같은지 다른지에 영향을 주면 안 되는 값에만 쓴다.

**속성은 `val` 이 좋나, `var` 가 좋나?**
- `val` 이 좋다. `var` 면 객체를 `HashSet` 에 넣은 뒤에 값이 바뀔 수 있다. 값이 바뀌면 `hashCode()` 도 바뀌어서, `HashSet` 이 그 객체를 다시 찾지 못한다.

**`data object` 는 무엇인가?**
- `toString()` 을 읽기 좋게 만들어 주는 `object` 다. `Loading@1b6d3586` 대신 `Loading` 이 찍힌다. `data object Loading : UiState` 처럼 데이터가 없는 상태에 쓴다.

## 10. 기억할 것

- `data` 는 지름길이지, 다른 종류의 클래스가 아니다. 생성자 속성으로 함수 다섯 개를 써 줄 뿐이고, **그 이상은 하지 않는다.**
- data class 버그의 상당수는 이 "그 이상은 하지 않는다"를 잊어서 생긴다. 본문 속성은 무시되고, `copy()` 는 안의 객체를 함께 쓴다.
- 저자가 권하는 습관은 하나다. **상태 클래스는 `val` 과 `List` 같은 읽기 전용 타입으로 만들고, 바꿀 때는 `copy()` 로 새 객체를 만든다.**
- 이 글은 저자의 Android 로드맵 1단계(Kotlin과 자료구조, 알고리즘 기초)의 세 번째 주제다. 다음 주제는 sealed class다.

## 코드로 보기 — Aide 구조로 옮긴 스케치

Aide-Android(최신 커밋 `31ad4dc`)에서 data class를 모두 찾아 읽었다. `core/model` 의 `Event`, `Task`, `CalendarSource` 와 `core/database` 의 `TaskEntity` 는 모두 `val` 과 기본 타입만 써서 원문 기준으로 문제가 없다. 눈여겨볼 곳은 Task 6에서 Note-Android로부터 옮겨 온 캘린더 코드(`feature/calendar/.../scheduler`)다.

### 1) CalendarMonth는 equals()를 직접 써서 첫날과 마지막 날만 비교한다

```kotlin
// Aide 코드 — feature/calendar/.../scheduler/data/CalendarMonth.kt 일부 (Note-Android에서 이식)
data class CalendarMonth(
    val yearMonth: YearMonth,
    val weekDays: List<List<CalendarDay>>,
) : Serializable {

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as CalendarMonth

        if (yearMonth != other.yearMonth) return false
        if (weekDays.first().first() != other.weekDays.first().first()) return false
        if (weekDays.last().last() != other.weekDays.last().last()) return false

        return true
    }
    // hashCode()와 toString()도 같은 세 값(연월, 첫 칸, 마지막 칸)으로 직접 썼다
}
```

**무엇을 하나**
- 3장의 4번 규칙대로 `equals()` 를 직접 썼으므로, 컴파일러가 만든 `equals()` 대신 이 함수가 쓰인다.
- 이 `equals()` 는 연월, 달력 첫 칸의 날, 마지막 칸의 날 세 가지만 비교한다. 가운데 날들은 보지 않는다.

**Aide에서 이 코드가 만나는 곳**
- `CalendarViewModel.onSelectedDay()` 는 사용자가 날짜를 누르면 `currentMonth.copy(weekDays = ...)` 로 모든 날의 `selected` 를 다시 계산한 새 달을 만든다.
- 7월 17일을 누르면 바뀌는 것은 가운데 칸의 `selected` 뿐이다. 첫 칸과 마지막 칸은 그대로이므로, 새 달과 옛 달이 이 `equals()` 로는 **같다.**
- `CalendarViewModel.updateHalfMode()` 는 반쯤 접기 모드를 바꾼 뒤 `currentMonth.copy()` 를 아무것도 바꾸지 않고 불러서 다시 내보낸다. 아무것도 바꾸지 않은 복사본은 어떤 `equals()` 로도 원본과 같다.

**그래도 지금 화면이 잘 바뀌는 이유**
- `CalendarViewModel` 은 상태를 `StateFlow` 가 아니라 `LiveData` 로 내보낸다. `LiveData` 는 같은 값이 들어와도 매번 다시 알린다. 그래서 지금은 날짜를 누르면 선택 표시가 잘 움직인다.
- 결정 기록(`decisions.md`) 2026-10-28 Task 6의 3번 결정이 "이식 코드는 원본 구조(LiveData)를 그대로 둔다"이고, Konsist의 UiState 규칙도 이 패키지만 예외로 뺐다.

**StateFlow로 옮기면 무엇이 깨지나 — 직접 돌려 본 확인**

```kotlin
// 직접 쓴 스케치 — CalendarMonth와 같은 모양(첫날과 마지막 날만 비교)으로 줄인 것. Aide 코드가 아니다
data class Day(val date: Int, val selected: Boolean = false)

data class Month(val days: List<Day>) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Month) return false
        return days.first() == other.days.first() && days.last() == other.days.last()
    }
    override fun hashCode(): Int = 31 * days.first().hashCode() + days.last().hashCode()
}

val start = Month((1..30).map { Day(it) })
val state = MutableStateFlow(start)
val picked = start.copy(days = start.days.map { it.copy(selected = it.date == 17) })
state.value = picked
```

- Kotlin 2.2.10(Aide가 쓰는 버전)과 코루틴 1.8.0으로 돌려 봤다.
- `picked == start` 는 `true` 다. 17일이 선택됐는데도 같은 달로 본다.
- `state.value === picked` 는 `false` 다. `StateFlow` 가 새 값을 무시하고 옛 객체를 그대로 들고 있다.
- `state.value.days[16].selected` 는 `false` 다. 화면 쪽에서 보면 17일은 선택되지 않은 채로 남는다.
- `picked.copy() == picked` 는 `true` 다. `updateHalfMode()` 처럼 아무것도 바꾸지 않은 `copy()` 로 "다시 그려 줘"를 보내는 방법도 `StateFlow` 에서는 통하지 않는다.

### 2) Task 8의 HomeUiState — 원문 습관대로 쓰면

```kotlin
// 직접 쓴 스케치 — Task 8 계획의 HomeUiState 항목(오늘 날짜, 다음 일정, 정렬된 남은 할 일, 오늘 일정)을 원문 습관대로 옮긴 것
data class HomeUiState(
    val today: LocalDate,
    val nextEvent: NextEventInfo? = null,
    val openTasks: List<Task> = emptyList(),
    val todayEvents: List<Event> = emptyList(),
)

// HomeViewModel 안
private val _uiState = MutableStateFlow(HomeUiState(today = LocalDate.now()))
val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

private fun onTasksChanged(tasks: List<Task>) {
    _uiState.update { it.copy(openTasks = sortOpenTasks(it.today, tasks)) }
}
```

- 속성은 모두 `val` 이고, 목록은 `MutableList` 가 아니라 `List` 다.
- 바꿀 때는 `update { it.copy(...) }` 로 새 상태를 만든다. `sortOpenTasks()` 는 Task 8 계획대로 새 리스트를 돌려주는 순수 함수라서, 목록이 바뀌면 상태도 정말 달라진다.
- 계획의 나머지 두 항목(입력 글, 편집 중인 할 일)은 넣지 않았다. 입력 글을 `HomeUiState` 에 둘지, `TextFieldState` 로 `HomeRoute` 에 둘지는 아직 사용자가 정하지 않았기 때문이다.

### 3) Konsist로 "상태와 모델은 val과 읽기 전용 타입만" 검사하기

```kotlin
// 직접 쓴 스케치 — Aide의 ScreenConventionTest 모양을 따랐다. 컴파일해 보지 않았다
@Test
fun `모델과 UiState data class 는 val 과 읽기 전용 타입만 쓴다`() {
    Konsist.scopeFromProject()
        .classes()
        .filter { it.hasDataModifier }
        .filterNot { it.packagee?.name?.startsWith("com.giwon.aide.feature.calendar.scheduler") == true }
        .assertTrue { dataClass ->
            dataClass.primaryConstructor?.parameters.orEmpty().all { parameter ->
                parameter.hasValModifier &&
                    !parameter.type.name.startsWith("Mutable") &&
                    !parameter.type.name.endsWith("Array")
            }
        }
}
```

- `data` 가 붙은 클래스를 모두 찾아서, 기본 생성자 파라미터가 `val` 인지, `MutableList` 같은 바꿀 수 있는 타입이나 배열이 아닌지 본다.
- 캘린더 이식 패키지는 기존 UiState 규칙과 같은 이유로 뺐다.
- 지금 Aide의 data class를 손으로 대조해 보면 모두 통과한다. 이 테스트는 지금 있는 버그를 잡는 것이 아니라, Task 8 이후에 들어올 `HomeUiState` 같은 상태 클래스가 5장의 틀린 쪽으로 가지 않게 막는 울타리다.

## 배운 점

- **data class는 함수 다섯 개를 써 줄 뿐이다.** `equals()`, `hashCode()`, `toString()`, `copy()`, `componentN()` 이 전부이고, 모두 기본 생성자 속성만 본다.
- **본문 속성은 같은지 비교할 때 빠진다.** `copy()` 도 본문 속성을 옮기지 않는다. 같은지에 영향을 줘야 하는 값은 생성자에 넣는다. 반대로 `CalendarEvent.durationInDays` 처럼 생성자 속성으로 계산만 하는 getter는 본문에 있어도 문제가 없다.
- **`copy()` 는 얕은 복사다.** 안에 `MutableList` 가 있으면 원본과 복사본이 같은 리스트를 쓴다. 리스트를 직접 바꾼 뒤 `copy()` 하면 새 상태가 옛 상태와 같아지고, `StateFlow` 는 그 값을 무시한다.
- **`equals()` 를 직접 쓰면 `StateFlow` 가 무엇을 무시할지도 직접 정하는 셈이다.** 일부 속성만 비교하는 `equals()` 는, 비교하지 않는 속성이 바뀐 상태를 `StateFlow` 가 버리게 만든다. `LiveData` 는 같은 값도 다시 알려서 이 문제가 숨어 있다가, `StateFlow` 로 옮기는 순간 드러난다.
- **생성자를 막아도 `copy()` 는 열려 있다.** 지금은 경고이고, 오류로 바뀌는 시점은 Kotlin 2.2.10에서 "2.3"이라고 했다가 2.4.21에서 "2.5"로 미뤄졌다. 생성자를 막은 data class에는 `@ConsistentCopyVisibility` 를 붙인다.
- **바이트코드로 보면 손으로 쓰던 Java 코드와 같다.** 클래스는 `final` 이고, `hashCode()` 는 31을 곱해 더하는 고전적인 코드이고, `copy$default` 가 기본값을 처리한다.

## Aide에 적용하면

Aide-Android 코드(최신 커밋 `31ad4dc`)의 data class 11곳과 data object 3곳(탭 이동 키)을 모두 읽었다. 1-a 계획(`plans/2026-10-12-aide-1a-plan.md`)과 결정 기록(`decisions.md`)도 함께 보고 정리했다.

| # | 원문에서 가져올 것 | 판단 | Aide에서 어떻게 |
|---|---|---|---|
| 1 | 상태 클래스는 `val` 과 읽기 전용 `List` 로 만들고, `update { it.copy(...) }` 로만 바꾼다 | **가져온다 (Task 8)** | Task 8에서 만들 `HomeUiState` 를 위 스케치 2번처럼 쓴다. 남은 할 일과 오늘 일정은 `List<Task>`, `List<Event>` 로 두고, `HomeViewModel` 은 `MutableStateFlow` 를 `update { it.copy(...) }` 로만 바꾼다. 입력 글을 어디에 둘지는 별도로 남아 있는 사용자 결정(`TextFieldState` 를 `HomeRoute` 에 두는 안과 `HomeUiState` 에 두는 안)을 따른다. |
| 2 | 일부 속성만 비교하는 `CalendarMonth.equals()` 를 고친다 | **지금은 안 한다 (주의 사항으로 남긴다)** | Task 6 결정 3번이 "이식 코드는 원본 구조(LiveData)를 그대로 둔다"이고, `LiveData` 는 같은 값도 다시 알려서 지금은 화면이 잘 바뀐다. 다만 캘린더 화면을 나중에 `StateFlow` 로 옮기면, 위 스케치 1번에서 직접 확인한 것처럼 날짜 선택과 반쯤 접기 모드 전환이 화면에 닿지 않는다. 그래서 "`CalendarMonth` 를 `StateFlow` 로 옮기기 전에 직접 쓴 `equals()` 와 `hashCode()` 를 지우거나 모든 날을 비교하도록 고치고, `updateHalfMode()` 의 빈 `copy()` 도 다른 방법으로 바꾼다"를 결정 기록에 주의 사항으로 남기는 안이다. 결정 기록에 실제로 적을지는 사용자가 정한다. |
| 3 | Konsist로 data class가 `val` 과 읽기 전용 타입만 쓰는지 검사한다 | **바꿔서 가져온다 (Task 8 전후)** | 원문은 습관으로 권하지만, Aide는 이미 `coding-convention` 모듈에서 Konsist로 구조 규칙을 검사하므로 위 스케치 3번처럼 테스트로 만든다. 캘린더 이식 패키지는 기존 UiState 규칙과 같은 이유로 뺀다. 지금 있는 data class는 모두 통과하므로, 넣는 순간부터 새 상태 클래스를 지키는 울타리가 된다. 앞선 Compose 런타임 글의 `currentComposer` 금지 규칙과 함께, 넣을지는 사용자가 정한다. |
| 4 | 생성자를 막은 data class에 `@ConsistentCopyVisibility` 를 붙인다 | **지금은 안 한다** | 지금 Aide에는 생성자가 `private` 이나 `internal` 인 data class가 하나도 없다. Aide가 쓰는 Kotlin 2.2.10도 이미 경고를 내는 것을 직접 확인했으므로, 나중에 그런 클래스를 만들면 컴파일러가 먼저 알려 준다. 그때 붙인다. |
| 5 | 본문 속성은 같은지에 영향을 주지 않는 값에만 쓴다 | **가져온다 (Task 11 확인 기준)** | Task 11 계획의 `PlannedAlarm` 은 본문에 `key` 속성을 둔다. `key` 는 생성자 속성(`eventId`, `eventStart`, `offset`)으로 계산하는 값이라서, 같은지 비교에서 빠져도 결과가 달라지지 않는다. Task 11을 짤 때 `key` 를 저장하는 `var` 가 아니라 계산하는 getter로 두는지 이 기준으로 확인한다. `CalendarEvent.durationInDays` 도 같은 모양이라 그대로 둔다. |

## 출처

- 원문: Mayank Kumar, [When Should a Kotlin Class Be a Data Class?](https://imayankkumar.com/blog/kotlin-data-class/), 2026-11-14. 원문 블로그는 "All rights reserved"라서 코드는 옮기지 않고 직접 쓴 스케치로 대신했고, 설명은 내 말로 다시 썼다. 그림 1장은 원문 서버 주소로 걸었다.
- 원문이 실린 곳: [Android Weekly #753](https://androidweekly.net/issues/issue-753)
- Kotlin 문서: [Data classes](https://kotlinlang.org/docs/data-classes.html), 이슈 [KT-11914](https://youtrack.jetbrains.com/issue/KT-11914)
- 직접 확인: Gradle 캐시에 있는 Kotlin 컴파일러 2.2.10과 2.4.21, 코루틴 1.8.0으로 스케치를 컴파일해 돌리고 `javap` 로 바이트코드를 봤다(이 블로그 저장소 밖의 임시 폴더에서).
- Aide 코드: Aide-Android `feature/calendar/.../scheduler/data/CalendarMonth.kt`, `CalendarEvent.kt`, `CalendarDay.kt`, `feature/calendar/.../scheduler/viewmodel/CalendarViewModel.kt`, `core/model/` 의 `Event.kt`, `Task.kt`, `CalendarSource.kt`, `coding-convention/.../ScreenConventionTest.kt` (최신 커밋 `31ad4dc`에서 읽기만 함)
- Aide 계획: `~/Documents/personal-docs/Aide-Android/decisions.md` 의 2026-10-28 Task 6 결정, `plans/2026-10-12-aide-1a-plan.md` 의 Task 8과 Task 11
