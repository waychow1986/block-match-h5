/** Game name, shown as the page's level-1 heading and in `<title>` (TD-015, A-22). */
export const GAME_NAME = '方块换换';

export function createTitle(doc: Document): HTMLHeadingElement {
  const h1 = doc.createElement('h1');
  h1.className = 'game-title';
  h1.textContent = GAME_NAME;
  return h1;
}

const RULES = [
  '交换相邻的两个方块（拖动、滑动，或先后点选），让 3 个及以上同色方块连成一线即可消除；不能连成一线的交换会弹回，不扣步数。',
  '一次连成 4 个会生成带条纹的消除方块，消除时清空整行或整列；连成 5 个会生成带星的彩色消除方块，与相邻方块交换可消除棋盘上所有该颜色的方块。',
  '在步数用完前让本关得分达到本关目标分数即可过关；连锁消除得分更高。',
  '顶部的“静音”按钮可随时关闭或恢复音效。手机处于静音模式等系统原因时听不到声音。',
];

/** Always-visible "怎么玩" section below the board (TD-015, AC-16, A-23). */
export function createIntro(doc: Document): HTMLElement {
  const section = doc.createElement('section');
  section.className = 'intro';
  section.setAttribute('aria-labelledby', 'intro-title');
  const h2 = doc.createElement('h2');
  h2.id = 'intro-title';
  h2.textContent = '怎么玩';
  const list = doc.createElement('ul');
  for (const text of RULES) {
    const li = doc.createElement('li');
    li.textContent = text;
    list.append(li);
  }
  section.append(h2, list);
  return section;
}
