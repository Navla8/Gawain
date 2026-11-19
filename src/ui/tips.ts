import type { Track } from '../engine/curriculum.ts';
import { TIPS, TIP_SOURCES, TIP_TOPICS, type Tip, type TipWhen } from '../data/tips.ts';
import { stopAll } from '../audio/synth.ts';
import { setCounting } from '../activity.ts';
import { setSettings, settings } from '../store.ts';
import { app, h, header } from './dom.ts';

// 요령(팁) 줄과 '요령' 창구 화면 (기획 §M9.3)

/** 유형·시점에 맞는 다음 요령을 돌려주고 기기 설정의 순번을 한 칸 넘긴다 */
export function nextTip(track: Track, when: TipWhen): Tip {
  const pool = TIPS.filter((t) => t.when === when && (t.track === track || t.track === 'all'));
  const list = pool.length ? pool : TIPS;
  const key = `${track}:${when}`;
  const cur = settings().tipIndex;
  const idx = cur[key] ?? 0;
  const tip = list[idx % list.length];
  setSettings({ tipIndex: { ...cur, [key]: (idx + 1) % list.length } });
  return tip;
}

/** 접힌 한 줄('요령 · 제목') → 누르면 본문·출처가 펼쳐진다 */
export function tipLine(tip: Tip): HTMLElement {
  return h('details', { class: 'tip' },
    h('summary', {}, h('span', {}, `요령 · ${tip.title}`), h('em', { class: 'chev' }, '›')),
    h('div', { class: 'tip-body' },
      h('p', {}, tip.body),
      h('cite', {}, tip.source),
    ),
  );
}

/** '요령' 창구 화면: 주제별 묶음 목록(모두 펼친 채)과 참고 교재 목록 */
export function tipsScreen() {
  stopAll();
  setCounting(false);
  app.replaceChildren(
    header('요령'),
    h('p', { class: 'info' }, '대학 시창청음 교재와 교수법 연구에서 추린 연습 방법입니다.'),
    ...TIP_TOPICS.flatMap((topic) => [
      h('h2', {}, topic),
      h('ul', { class: 'tip-list' }, ...TIPS.filter((t) => t.topic === topic).map((t) =>
        h('li', {},
          h('strong', {}, t.title),
          h('p', {}, t.body),
          h('cite', {}, t.source),
        ),
      )),
    ]),
    h('h2', {}, '참고 교재'),
    h('ul', { class: 'tip-sources' }, ...TIP_SOURCES.map(([author, title]) =>
      h('li', {}, h('b', {}, author), ` · ${title}`),
    )),
  );
}
