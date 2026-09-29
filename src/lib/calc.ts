// A small expression evaluator: + - * / ^ % ( ) numbers, constants and functions.
// Percent is postfix (50% -> 0.5). Trig works in degrees.

export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token =
  | { kind: "number"; value: number }
  | { kind: "operator"; value: "+" | "-" | "*" | "/" | "^" }
  | { kind: "unary" }
  | { kind: "percent" }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "function"; value: string }
  | { kind: "constant"; value: string };

const DEG = Math.PI / 180;

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
};

const FUNCTIONS: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  ln: Math.log,
  log: Math.log10,
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: (value) => Math.sin(value * DEG),
  cos: (value) => Math.cos(value * DEG),
  tan: (value) => Math.tan(value * DEG),
};

const PRECEDENCE: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
const UNARY_PRECEDENCE = 3;

function tokenize(input: string): Token[] {
  const source = input
    .replace(/[×✕·]/g, "*")
    .replace(/[÷∕]/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/[πΠ]/g, "pi")
    .replace(/[,\s]/g, "");

  const tokens: Token[] = [];
  let index = 0;

  const last = () => tokens[tokens.length - 1];
  const endsValue = () => {
    const token = last();
    return (
      token != null &&
      (token.kind === "number" ||
        token.kind === "constant" ||
        token.kind === "rparen" ||
        token.kind === "percent")
    );
  };

  while (index < source.length) {
    const char = source[index];

    if (/[0-9.]/.test(char)) {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      // scientific notation: 1e3 / 2.5e-2
      if (/[eE]/.test(source[end] ?? "") && /[0-9+-]/.test(source[end + 1] ?? "")) {
        end += 1;
        if (/[+-]/.test(source[end])) end += 1;
        while (end < source.length && /[0-9]/.test(source[end])) end += 1;
      }
      const raw = source.slice(index, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error("That number doesn't look right");
      if (endsValue()) tokens.push({ kind: "operator", value: "*" });
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      let end = index;
      while (end < source.length && /[a-zA-Z]/.test(source[end])) end += 1;
      const word = source.slice(index, end).toLowerCase();
      if (word in FUNCTIONS) {
        if (endsValue()) tokens.push({ kind: "operator", value: "*" });
        tokens.push({ kind: "function", value: word });
      } else if (word in CONSTANTS) {
        if (endsValue()) tokens.push({ kind: "operator", value: "*" });
        tokens.push({ kind: "constant", value: word });
      } else {
        throw new Error("Unknown name " + word);
      }
      index = end;
      continue;
    }

    if (char === "(") {
      if (endsValue()) tokens.push({ kind: "operator", value: "*" });
      tokens.push({ kind: "lparen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rparen" });
      index += 1;
      continue;
    }

    if (char === "%") {
      if (!endsValue()) throw new Error("Percent needs a number before it");
      tokens.push({ kind: "percent" });
      index += 1;
      continue;
    }

    if ("+-*/^".includes(char)) {
      const previous = last();
      const isUnary =
        char === "-" &&
        (previous == null ||
          previous.kind === "operator" ||
          previous.kind === "unary" ||
          previous.kind === "lparen" ||
          previous.kind === "function");
      tokens.push(isUnary ? { kind: "unary" } : { kind: "operator", value: char as "+" | "-" | "*" | "/" | "^" });
      index += 1;
      continue;
    }

    throw new Error("Unexpected character " + char);
  }

  return tokens;
}

function toRpn(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];

  for (const token of tokens) {
    if (token.kind === "number" || token.kind === "constant") {
      output.push(token);
      continue;
    }
    if (token.kind === "percent") {
      output.push(token);
      continue;
    }
    if (token.kind === "function" || token.kind === "unary") {
      stack.push(token);
      continue;
    }
    if (token.kind === "lparen") {
      stack.push(token);
      continue;
    }
    if (token.kind === "operator") {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.kind === "unary") {
          if (UNARY_PRECEDENCE > PRECEDENCE[token.value]) {
            output.push(stack.pop() as Token);
            continue;
          }
          break;
        }
        if (top.kind === "operator") {
          const topPrec = PRECEDENCE[top.value];
          const curPrec = PRECEDENCE[token.value];
          if (topPrec > curPrec || (topPrec === curPrec && token.value !== "^")) {
            output.push(stack.pop() as Token);
            continue;
          }
        }
        break;
      }
      stack.push(token);
      continue;
    }
    // right parenthesis
    let matched = false;
    while (stack.length > 0) {
      const top = stack.pop() as Token;
      if (top.kind === "lparen") {
        matched = true;
        break;
      }
      output.push(top);
    }
    if (!matched) throw new Error("Unbalanced parentheses");
    const top = stack[stack.length - 1];
    if (top != null && top.kind === "function") output.push(stack.pop() as Token);
  }

  while (stack.length > 0) {
    const top = stack.pop() as Token;
    if (top.kind === "lparen") throw new Error("Unbalanced parentheses");
    output.push(top);
  }

  return output;
}

function evalRpn(rpn: Token[]): number {
  const stack: number[] = [];
  const pop = () => {
    const value = stack.pop();
    if (value == null) throw new Error("Incomplete expression");
    return value;
  };

  for (const token of rpn) {
    switch (token.kind) {
      case "number":
        stack.push(token.value);
        break;
      case "constant":
        stack.push(CONSTANTS[token.value]);
        break;
      case "percent":
        stack.push(pop() / 100);
        break;
      case "unary":
        stack.push(-pop());
        break;
      case "function": {
        const fn = FUNCTIONS[token.value];
        const argument = pop();
        const value = fn(argument);
        if (!Number.isFinite(value)) throw new Error("That function is undefined here");
        stack.push(value);
        break;
      }
      case "operator": {
        const right = pop();
        const left = pop();
        if (token.value === "/" && right === 0) throw new Error("Can't divide by zero");
        if (token.value === "+") stack.push(left + right);
        else if (token.value === "-") stack.push(left - right);
        else if (token.value === "*") stack.push(left * right);
        else if (token.value === "/") stack.push(left / right);
        else stack.push(Math.pow(left, right));
        break;
      }
      default:
        throw new Error("Incomplete expression");
    }
  }

  if (stack.length !== 1) throw new Error("Incomplete expression");
  const value = stack[0];
  if (!Number.isFinite(value)) throw new Error("That result isn't a number");
  return value;
}

export function evaluateExpression(input: string): CalcResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Nothing to calculate" };
  try {
    const tokens = tokenize(trimmed);
    if (tokens.length === 0) return { ok: false, error: "Nothing to calculate" };
    return { ok: true, value: evalRpn(toRpn(tokens)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error" };
  }
}

const RESULT_FORMAT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 10 });

export function formatResult(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1e13 || magnitude < 1e-9)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  return RESULT_FORMAT.format(Number(value.toPrecision(12)));
}
