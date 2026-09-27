// 매거진 지면 자동 배치. 사진 비율·개수·메모 유무만 보고 정함. 같은 입력이면 항상 같은 결과.
// 사진은 자르지 않음(원본 비율 유지), 순서도 바꾸지 않음.
const ar = p => (p.w && p.h) ? p.w / p.h : 1;
const isLand = p => ar(p) > 1.2;

function planDay(photos) {
  const blocks = [];
  let i = 0, soloSide = 0, storySide = 0;
  const last = () => blocks.length ? blocks[blocks.length - 1].type : null;
  const free = p => p && !p.note; // 메모 없는 사진만 묶음에 들어감
  while (i < photos.length) {
    const p = photos[i], n1 = photos[i + 1], n2 = photos[i + 2];
    if (p.note) {
      blocks.push({ type: 'story', items: [p], side: storySide++ % 2 ? 'right' : 'left', land: isLand(p) });
      i += 1; continue;
    }
    if (isLand(p)) {
      // 가로 사진은 크게. 단, 크게가 연달아 나오면 가로 두 장을 나란히
      if (last() === 'wide' && free(n1) && isLand(n1)) { blocks.push({ type: 'pair', items: [p, n1] }); i += 2; continue; }
      blocks.push({ type: 'wide', items: [p] }); i += 1; continue;
    }
    // 세로·정사각
    if (free(n1) && free(n2) && !isLand(n1) && !isLand(n2) && last() !== 'trio' && ar(p) < 1.05) {
      blocks.push({ type: 'trio', items: [p, n1, n2], side: blocks.filter(b => b.type === 'trio').length % 2 ? 'right' : 'left' });
      i += 3; continue;
    }
    if (free(n1) && !isLand(n1) && last() !== 'pair') { blocks.push({ type: 'pair', items: [p, n1] }); i += 2; continue; }
    if (free(n1) && !isLand(n1) && free(n2) && !isLand(n2)) { blocks.push({ type: 'row3', items: [p, n1, n2] }); i += 3; continue; }
    blocks.push({ type: 'solo', items: [p], side: soloSide++ % 2 ? 'right' : 'left' }); i += 1;
  }
  return blocks;
}

// 세 장 묶음: 큰 사진 1 + 오른쪽(또는 왼쪽)에 두 장 세로로. 높이가 맞도록 폭 비율 계산
function trioFractions(items) {
  const [a, b, c] = items.map(ar);
  const S = 1 / a + 1 / b + 1 / c;
  const fSide = (1 / a) / S;
  return { big: 1 - fSide, side: fSide };
}

window.Layout = { planDay, trioFractions, ar, isLand };
