export const HUNDRED_MODES = [
  { id: 'add100NoCarry', name: '100以内加法（不进位）', shortName: '不进位加法', description: '两位数＋整十数 / 一位数', example: '25＋30　25＋3', operation: 'add', method: 'place-add', mixed: true },
  { id: 'add100Carry', name: '100以内加法（进位）', shortName: '进位加法', description: '两位数＋一位数，继续用凑十', example: '28＋5', operation: 'add', method: 'carry' },
  { id: 'subtract100NoBorrow', name: '100以内减法（不退位）', shortName: '不退位减法', description: '两位数－整十数 / 一位数', example: '47－20　47－2', operation: 'subtract', method: 'place-subtract', mixed: true },
  { id: 'subtract100Borrow', name: '100以内减法（退位）', shortName: '退位减法', description: '两位数－一位数，拓展版破十', example: '34－7', operation: 'subtract', method: 'borrow' },
];

const pools = new Map();
export function getHundredPairs(modeId) {
  if (pools.has(modeId)) return pools.get(modeId);
  const mode = HUNDRED_MODES.find(item => item.id === modeId);
  if (!mode) return [];
  const pairs = [];
  for (let a = 10; a <= 99; a++) {
    for (let b = 1; b <= 90; b++) {
      const single = b <= 9;
      const roundTen = b % 10 === 0;
      let valid = false;
      if (mode.method === 'place-add') {
        // 不进位也不从十位进到百位，因此该类结果严格小于100。
        valid = (single || roundTen) && a + b < 100 && a % 10 + b % 10 < 10;
      } else if (mode.method === 'carry') {
        valid = single && a % 10 + b >= 10 && a + b <= 100;
      } else if (mode.method === 'place-subtract') {
        valid = (single || roundTen) && a >= b && a % 10 >= b % 10;
      } else if (mode.method === 'borrow') {
        valid = single && a % 10 < b && a >= b;
      }
      if (valid) pairs.push(Object.freeze({ a, b }));
    }
  }
  const result = Object.freeze(pairs);
  pools.set(modeId, result);
  return result;
}

export function getHundredHint(question) {
  const mode = HUNDRED_MODES.find(item => item.id === question.lesson);
  if (!mode) return null;
  const { a, b } = question;
  const tens = Math.floor(a / 10) * 10;
  const ones = a % 10;
  let title, steps, description;
  if (mode.method === 'carry') {
    const target = tens + 10;
    const first = target - a;
    const rest = b - first;
    title = '先凑成整十';
    steps = [`${b} = ${first} + ${rest}`, `${a} + ${first} = ${target}`, `${target} + ${rest} = ?`];
    description = `把${b}拆成${first}和${rest}，${a}加${first}凑成${target}，再加${rest}。`;
  } else if (mode.method === 'borrow') {
    const remainingTens = tens - 10;
    const borrowedOnes = ones + 10;
    const leftOnes = borrowedOnes - b;
    title = '借1个十当10';
    steps = [`${tens} + ${ones} → ${remainingTens} + ${borrowedOnes}`, `${borrowedOnes} − ${b} = ${leftOnes}`, `${remainingTens} + ${leftOnes} = ?`];
    description = `把${a}的十位借1当10，变成${remainingTens}和${borrowedOnes}；先算${borrowedOnes}减${b}得${leftOnes}，再加${remainingTens}。`;
  } else {
    const add = mode.operation === 'add';
    const wholeTen = b % 10 === 0;
    const part = wholeTen ? tens : ones;
    const other = wholeTen ? ones : tens;
    const partial = add ? part + b : part - b;
    const symbol = add ? '+' : '−';
    title = add ? '相同数位相加' : '相同数位相减';
    steps = [`${a} = ${tens} + ${ones}`, `${part} ${symbol} ${b} = ${partial}`, `${wholeTen ? partial : other} + ${wholeTen ? other : partial} = ?`];
    description = `把${a}拆成${tens}和${ones}，${wholeTen ? '先算十位' : '先算个位'}：${part}${add ? '加' : '减'}${b}得${partial}，再加${other}。`;
  }
  return { method: mode.method, title, steps, description };
}
