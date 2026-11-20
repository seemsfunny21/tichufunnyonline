/* TichuFunny — pure local round engine, 4 seats (0 & 2 partners). */
(function(scope){
'use strict';
const NAMES=['Εσύ','Αριστερά','Συμπαίκτης','Δεξιά'];
const RANKS=Object.freeze({M:1,D:0,P:0,G:15});
function cardRank(c){return c.key==='M'?1:c.key==='G'?15:c.rank||0}
function label(c){if(c.key)return ({M:'Mahjong',D:'Dog',G:'Dragon',P:'Phoenix'})[c.key];return (c.rank===14?'A':c.rank===13?'K':c.rank===12?'Q':c.rank===11?'J':c.rank)+['♠','♥','♣','♦'][c.suit];}
function deck(){const a=[];for(let s=0;s<4;s++)for(let n=2;n<=14;n++)a.push({id:s+'-'+n,suit:s,rank:n});for(const key of ['M','D','G','P'])a.push({id:key,key});return a;}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeCandidate(type,n,value,bomb=0){return {type,len:n,value,bomb};}
function plainVariants(cards){
 const n=cards.length,phoenix=cards.some(c=>c.key==='P'),bad=cards.some(c=>c.key==='D'||c.key==='G');
 if(bad)return [];
 const rankVariants=phoenix?Array.from({length:13},(_,i)=>i+2):[0],out=[];
 for(const substitute of rankVariants){
  const ranks=cards.map(c=>c.key==='M'?1:c.key==='P'?substitute:c.rank);
  const cnt={};for(const r of ranks)cnt[r]=(cnt[r]||0)+1;
  const nums=Object.keys(cnt).map(Number).sort((a,b)=>a-b),freq=nums.map(r=>cnt[r]);
  if(n===2&&freq.length===1)out.push(makeCandidate('pair',n,nums[0]));
  if(n===3&&freq.length===1)out.push(makeCandidate('triple',n,nums[0]));
  if(n===4&&freq.length===1&&!phoenix)out.push(makeCandidate('bomb4',n,nums[0],1));
  if(n===5&&freq.includes(3)&&freq.includes(2))out.push(makeCandidate('full',n,nums[freq.indexOf(3)]));
  if(n>=5&&nums.length===n&&nums[n-1]-nums[0]===n-1){
   // A straight flush is a bomb, never an ordinary straight.
   // Official Tichu rules do not allow playing it as a normal sequence.
   const straightFlush=!phoenix&&cards.every(c=>!c.key&&c.suit===cards[0].suit);
   out.push(straightFlush
     ?makeCandidate('bombStraight',n,nums[n-1],2)
     :makeCandidate('straight',n,nums[n-1]));
  }
  if(n>=4&&n%2===0&&nums.length===n/2&&freq.every(x=>x===2)&&nums[nums.length-1]-nums[0]===nums.length-1)
   out.push(makeCandidate('pairs',n,nums[nums.length-1]));
 }
 return out;
}
function variants(cards,last){
 if(!cards.length)return [];
 if(cards.length===1){
  const c=cards[0];
  if(c.key==='D')return [makeCandidate('dog',1,0)];
  if(c.key==='P')return [makeCandidate('single',1,last?.type==='single'?Math.min(14.5,last.value+.5):1.5)];
  return [makeCandidate('single',1,cardRank(c))];
 }
 return plainVariants(cards);
}
function beats(c,last){
 if(!last)return true;
 if(c.type==='dog')return false;
 if(c.bomb!==last.bomb)return c.bomb>last.bomb;
 if(c.bomb)return c.bomb===last.bomb&&(c.bomb===1?c.value>last.value:(c.len>last.len||(c.len===last.len&&c.value>last.value)));
 return c.type===last.type&&c.len===last.len&&c.value>last.value;
}
function evaluate(cards,last){
 const opts=variants(cards,last).filter(c=>beats(c,last));
 opts.sort((a,b)=>a.bomb-b.bomb||a.value-b.value);
 if(last&&opts[0]?.type==='dog')return null;
 return opts[0]||null;
}
function variantsForHand(hand,last,wish){
 const res=[];const n=hand.length,limit=1<<n;
 for(let bits=1;bits<limit;bits++){
  const len=popcount(bits);
  if(last){
   if(last.bomb){if(len!==4&&len<5)continue;}
   else if(len!==last.len&&len!==4&&len<5)continue;
  }
  const cards=[],indexes=[];
  for(let i=0;i<n;i++)if(bits&(1<<i)){cards.push(hand[i]);indexes.push(i);}
  const c=evaluate(cards,last);
  if(c)res.push({cards,ids:cards.map(x=>x.id),indexes,combo:c,wishHit:!!wish&&cards.some(x=>x.rank===wish)});
 }
 const forced=!!wish&&res.some(x=>x.wishHit);
 return {moves:forced?res.filter(x=>x.wishHit):res,forced};
}
function popcount(v){let n=0;while(v){v&=v-1;n++;}return n;}
function scoreCard(c){return c.key==='G'?25:c.key==='P'?-25:c.rank===5?5:(c.rank===10||c.rank===13)?10:0;}
function pickNext(current,hand,excluded=new Set()){for(let a=1;a<=4;a++){const n=(current+a)%4;if(hand[n]?.length&&!excluded.has(n))return n;}return -1;}
function newRound(previous){
 const d=shuffle(deck());
 const hands=Array.from({length:4},()=>[]);
 for(let r=0;r<8;r++)for(let p=0;p<4;p++)hands[p].push(d.pop());
 return {stage:'grand',deck:d,hands,turn:0,trick:null,pot:[],passes:0,wish:null,finished:[],captured:[[],[],[],[]],announcements:[null,null,null,null],grandDecision:false,trade:{},scores:previous?.scores||[0,0],round:(previous?.round||0)+1,summary:null,difficulty:previous?.difficulty||'normal'};
}
function grand(g,declare){
 if(g.stage!=='grand')return false;
 if(declare)g.announcements[0]='grand';
 for(let r=0;r<6;r++)for(let p=0;p<4;p++)g.hands[p].push(g.deck.pop());
 g.stage='trade';g.deck=[];
 return true;
}
function exchange(g,trades){
 if(g.stage!=='trade')return false;
 if(!Array.isArray(trades)||trades.length!==3)return false;
 const targets=[1,2,3],ids=new Set(trades.map(t=>t.id));
 if(ids.size!==3||!targets.every(x=>trades.some(t=>t.target===x))||!trades.every(t=>g.hands[0].some(c=>c.id===t.id)))return false;
 const transfers=Array.from({length:4},()=>[]);transfers[0]=trades;
 for(let p=1;p<4;p++){
  const sorted=g.hands[p].slice().sort((a,b)=>cardRank(a)-cardRank(b));
  const candidates=[...sorted.filter(c=>c.key!=='G'&&c.key!=='P'),...sorted.filter(c=>c.key==='P'||c.key==='G')];
  const chosen=candidates.slice(0,3);transfers[p]=[1,2,3].map((step,i)=>({id:chosen[i].id,target:(p+step)%4}));
 }
 const addition=Array.from({length:4},()=>[]);
 for(let p=0;p<4;p++)for(const t of transfers[p]){const c=g.hands[p].find(v=>v.id===t.id);addition[t.target].push(c);}
 for(let p=0;p<4;p++){const sent=new Set(transfers[p].map(x=>x.id));g.hands[p]=g.hands[p].filter(c=>!sent.has(c.id)).concat(addition[p]);}
 g.stage='playing';g.turn=g.hands.findIndex(h=>h.some(c=>c.key==='M'));g.trade={};
 return true;
}
function options(g,p){return variantsForHand(g.hands[p],g.trick?.combo||null,g.wish);}
function endTrick(g){
 if(!g.trick)return;
 const owner=g.trick.player;
 // A Dragon-winning trick is awarded to an opponent (never the winning team).
 const recipient=g.pot.some(c=>c.key==='G')?(owner+1)%4:owner;
 g.captured[recipient].push(...g.pot);
 g.pot=[];g.trick=null;g.passes=0;
 g.turn=g.hands[owner].length?owner:pickNext(owner,g.hands);
}
function finalize(g,doubleWin){
 if(g.stage!=='playing')return;
 if(g.pot.length){
  const p=g.trick?.player??g.finished[0]??0;
  const owner=g.hands[p]?.length?p:g.finished[0]??p;
  const recipient=g.pot.some(c=>c.key==='G')?(owner+1)%4:owner;
  g.captured[recipient].push(...g.pot);g.pot=[];g.trick=null;
 }
 const first=g.finished[0],last=[0,1,2,3].find(p=>!g.finished.includes(p));
 const round=[0,0];
 if(doubleWin){round[first%2]+=200;}
 else{
  // Give the last player's captured tricks to the first finisher and their
  // remaining hand cards to an opponent before counting card points.
  if(last!==undefined){
   g.captured[first].push(...g.captured[last]);g.captured[last]=[];
   g.captured[(last+1)%4].push(...g.hands[last]);g.hands[last]=[];
  }
  for(let p=0;p<4;p++)round[p%2]+=g.captured[p].reduce((sum,c)=>sum+scoreCard(c),0);
 }
 for(let p=0;p<4;p++){const announced=g.announcements[p];if(announced){const val=announced==='grand'?200:100;round[p%2]+=(p===first?val:-val);}}
 g.scores[0]+=round[0];g.scores[1]+=round[1];
 g.stage='finished';g.summary={round,first,last,doubleWin,matchWinner:g.scores[0]>=1000||g.scores[1]>=1000?(g.scores[0]>g.scores[1]?0:1):null};
}
function recordFinish(g,p){
 if(g.hands[p].length===0&&!g.finished.includes(p)){g.finished.push(p);
  if(g.finished.length===2&&g.finished[0]%2===g.finished[1]%2){finalize(g,true);return true;}
  if(g.finished.length===3){finalize(g,false);return true;}}
 return false;
}
function play(g,p,ids,wishNum){
 if(g.stage!=='playing'||g.finished.includes(p)||!ids?.length)return {ok:false,reason:'Η παρτίδα δεν είναι ενεργή.'};
 const hand=g.hands[p],set=new Set(ids),cards=hand.filter(c=>set.has(c.id));
 if(cards.length!==ids.length)return {ok:false,reason:'Επίλεξε έγκυρα φύλλα.'};
 const combo=evaluate(cards,g.trick?.combo||null);
 if(!combo)return {ok:false,reason:'Αυτός ο συνδυασμός δεν επιτρέπεται.'};
 if(p!==g.turn&&!combo.bomb)return {ok:false,reason:'Περίμενε τη σειρά σου.'};
 const opts=options(g,p);
 if(opts.forced&&!cards.some(c=>c.rank===g.wish))return {ok:false,reason:'Πρέπει να παίξεις τον αριθμό που ζητήθηκε: '+g.wish};
 if(combo.type==='dog'&&g.trick)return {ok:false,reason:'Ο σκύλος παίζεται μόνο όταν ξεκινάς μπάζα.'};
 if(cards.some(c=>c.key==='M')&&(wishNum==null||wishNum<2||wishNum>14))return {ok:false,reason:'Διάλεξε ευχή από 2 έως 14 για το Mahjong.',needWish:true};
 g.hands[p]=hand.filter(c=>!set.has(c.id));
 if(combo.type==='dog'){
  g.captured[p].push(...cards);
  if(recordFinish(g,p))return {ok:true,finish:true};
  g.turn=g.hands[(p+2)%4].length?(p+2)%4:pickNext((p+2)%4,g.hands);
  return {ok:true,dog:true};
 }
 g.pot.push(...cards);g.trick={player:p,combo,cards:cards.map(c=>c.id)};g.passes=0;
 if(cards.some(c=>c.key==='M'))g.wish=wishNum;
 if(g.wish&&cards.some(c=>c.rank===g.wish))g.wish=null;
 if(recordFinish(g,p))return {ok:true,finish:true};
 g.turn=pickNext(p,g.hands);
 return {ok:true,combo};
}
function pass(g,p){
 if(g.stage!=='playing'||p!==g.turn||!g.trick)return {ok:false,reason:'Δεν μπορείς να πας πάσο τώρα.'};
 if(options(g,p).forced)return {ok:false,reason:'Έχεις νόμιμη κίνηση που εκπληρώνει την ευχή '+g.wish+'.'};
 g.passes++;
 const others=g.hands.filter(h=>h.length).length-(g.hands[g.trick.player].length?1:0);
 if(g.passes>=others){endTrick(g);return {ok:true,closed:true};}
 g.turn=pickNext(p,g.hands);return {ok:true};
}
function claimTichu(g,p){
 if(g.stage!=='playing'||g.announcements[p]||g.finished.includes(p))return false;
 if(p===0&&g.hands[0].length===14){g.announcements[p]='tichu';return true;}
 return false;
}
function aiMove(g,p){
 const result=options(g,p),moves=result.moves;
 if(!moves.length){if(g.trick)return {pass:true};return null;}
 if(g.trick&&g.trick.player%2===p%2&&!result.forced)return {pass:true};
 const lead=!g.trick;
 const rankValue=c=>c.key==='G'?30:c.key==='P'?28:c.key==='D'?-1:c.key==='M'?0:cardRank(c);
 const score=m=>{
  const c=m.combo,amount=m.cards.length,high=Math.max(...m.cards.map(rankValue));
  let points=(lead?-amount*20:amount*3)+c.value*.3+high*.2+(c.bomb?60:0);
  if(m.cards.some(x=>x.key==='G'))points+=15;
  if(m.cards.some(x=>x.key==='P'))points+=14;
  if(m.cards.some(x=>x.key==='M'))points+=lead?-4:10;
  if(g.difficulty==='easy')points+=Math.random()*30;
  else if(g.difficulty==='normal')points+=Math.random()*5;
  else points+=Math.random()*1.5;
  if(amount===g.hands[p].length)points-=300;
  return points;
 };
 const ranked=moves.slice().sort((a,b)=>score(a)-score(b));
 return {ids:ranked[0].ids,wish:ranked[0].ids.includes('M')?9:null,combo:ranked[0].combo};
}
function turnText(g){return g.stage==='finished'?'Ολοκληρώθηκε':g.turn===0?'Η σειρά σου':NAMES[g.turn]+' παίζει';}
scope.TichuEngine={newRound,grand,exchange,options,play,pass,claimTichu,aiMove,turnText,cardRank,label,scoreCard,evaluate,deck};
})(window);