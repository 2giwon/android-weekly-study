// 글 머리의 --- 블록을 읽는다. 쓰는 모양이 정해져 있어 YAML 전체가 아니라
// 스칼라 · 인라인 리스트([a, b]) · 한 단계 맵만 지원한다.

/** 따옴표 밖에서 값 맨 앞이나 공백 뒤에 오는 # 부터 줄 끝까지를 지운다. 주소 속 #(앞에 공백 없음)은 남는다. */
function stripComment(raw) {
  let quote = null;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function parseValue(raw) {
  const v = stripComment(raw).trim();
  if (/^".*"$|^'.*'$/.test(v)) return v.slice(1, -1);
  if (/^\[.*\]$/.test(v)) {
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => parseValue(s))
      .filter((s) => s !== '');
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseLines(lines) {
  const out = {};
  let map = null;

  for (const raw of lines) {
    // 줄 종류를 가리기 전에 주석을 지워야 `aide:  # 설명` 도 묶음 제목으로 읽힌다
    const line = stripComment(raw).trimEnd();
    if (!line.trim()) continue;

    const nested = line.match(/^\s+([A-Za-z_][\w-]*):\s*(.+)$/);
    if (nested && map) {
      map[nested[1]] = parseValue(nested[2]);
      continue;
    }

    const section = line.match(/^([A-Za-z_][\w-]*):\s*$/);
    if (section) {
      map = out[section[1]] = {};
      continue;
    }

    const scalar = line.match(/^([A-Za-z_][\w-]*):\s*(.+)$/);
    if (scalar) {
      out[scalar[1]] = parseValue(scalar[2]);
      map = null;
    }
  }
  return out;
}

/** frontmatter 를 떼어낸다. 없으면 data 는 빈 객체, body 는 원문 그대로. */
export function splitFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0]?.trim() !== '---') return { data: {}, body: raw };

  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end === -1) return { data: {}, body: raw };

  return {
    data: parseLines(lines.slice(1, end)),
    body: lines
      .slice(end + 1)
      .join('\n')
      .replace(/^\n+/, ''),
  };
}
