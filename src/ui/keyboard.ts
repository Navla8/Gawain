import { h } from './dom.ts';

// 피아노 건반과 드래그 띠: 받아쓰기 입력과 피아노 룸이 함께 쓴다

export const KEY_LOW = 53, KEY_HIGH = 84; // 건반 F3~C6
const WHITE_NAMES = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

/**
 * 건반 위를 쓸어도 스크롤되지 않고, 위쪽 띠를 끌어야 스크롤된다(누르려다 밀리는 것 방지).
 * 화면에 붙인 뒤 aim(midi)로 그 음이 왼쪽 끝에 오도록 옮긴다.
 */
export function pianoKeys(onKey: (midi: number) => void) {
  const keyboard = h('div', { class: 'keyboard' });
  const whites = h('div', { class: 'whites' });
  const strip = h('div', { class: 'strip', 'aria-label': '건반 이동' });
  const thumb = h('div', { class: 'thumb' });
  for (let m = KEY_LOW; m <= KEY_HIGH; m++) {
    const black = [1, 3, 6, 8, 10].includes(m % 12);
    const key = h('button', {
      class: black ? 'key black' : m % 12 === 0 ? 'key white c' : 'key white',
      'data-midi': m,
      onpointerdown: (e: PointerEvent) => { e.preventDefault(); onKey(m); },
    }, m % 12 === 0 ? `C${m / 12 - 1}` : WHITE_NAMES[m % 12]);
    if (black) whites.lastElementChild!.append(key);
    else {
      whites.append(h('div', { class: 'wkey' }, key));
      strip.append(h('span', {}, m % 12 === 0 ? `C${m / 12 - 1}` : ''));
    }
  }
  keyboard.append(whites);
  strip.append(thumb);
  const syncThumb = () => {
    const ratio = strip.clientWidth / keyboard.scrollWidth;
    thumb.style.left = `${keyboard.scrollLeft * ratio}px`;
    thumb.style.width = `${keyboard.clientWidth * ratio}px`;
  };
  keyboard.addEventListener('scroll', syncThumb);
  strip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { strip.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    const ratio = keyboard.scrollWidth / strip.clientWidth;
    const rect = strip.getBoundingClientRect();
    // 띠를 누른 곳이 보이는 영역 가운데가 되도록 옮긴 뒤, 끄는 만큼 따라간다
    const center = (x: number) => (keyboard.scrollLeft = (x - rect.left) * ratio - keyboard.clientWidth / 2);
    center(e.clientX);
    const move = (ev: PointerEvent) => center(ev.clientX);
    const up = () => { strip.removeEventListener('pointermove', move); strip.removeEventListener('pointerup', up); };
    strip.addEventListener('pointermove', move);
    strip.addEventListener('pointerup', up);
  });
  const aim = (midi: number) => {
    const target = keyboard.querySelector(`[data-midi="${Math.max(KEY_LOW, midi)}"]`) as HTMLElement | null;
    if (target) keyboard.scrollLeft = target.closest('.wkey')!.getBoundingClientRect().left - keyboard.getBoundingClientRect().left;
    syncThumb();
  };
  return { strip, keyboard, aim };
}
