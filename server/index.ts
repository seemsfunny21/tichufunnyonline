import { TichuEngine as E } from "./engine.ts";

type AnyObject = Record<string, unknown>;
type Seat = {kind: "human"|"ai"; name: string; hash?: string} | null;
type Room = {phase:"lobby"|"active"; host:string; seats:Seat[]; game:any; grand:Record<string,boolean>; trades:Record<string,any[]>; events:string[]};
type Row = {code:string; version:number; state:Room; updated_at:string};
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECRET = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  (()=>{try{const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}");return keys.default||"";}catch{return "";}})();
const TABLE = PROJECT_URL + "/rest/v1/tichu_online_rooms";
const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_AGE=1000*60*60*24*7;
class ApiError extends Error { status:number; constructor(message:string,status=400){super(message);this.status=status;} }
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"https://seemsfunny21.github.io",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"content-type",
  "Vary":"Origin"
}});
function nonce(bytes=24){
 const a=crypto.getRandomValues(new Uint8Array(bytes));
 return [...a].map(v=>v.toString(16).padStart(2,"0")).join("");
}
function code(){
 const a=crypto.getRandomValues(new Uint8Array(6));
 return [...a].map(v=>CHARSET[v % CHARSET.length]).join("");
}
function name(x:unknown){
 if(typeof x!=="string")throw new ApiError("Χρειάζεται όνομα παίκτη.");
 const clean=x.trim().replace(/[<>]/g,"").replace(/\s+/g," ").slice(0,22);
 if(!clean)throw new ApiError("Γράψε ένα όνομα ή ψευδώνυμο.");
 return clean;
}
function roomCode(x:unknown){
 const c=String(x||"").toUpperCase();
 if(!/^[A-HJ-NP-Z2-9]{6}$/.test(c))throw new ApiError("Λανθασμένος κωδικός δωματίου.");
 return c;
}
function tokenValue(x:unknown){return typeof x==="string"&&/^[a-f0-9]{48}$/.test(x)?x:"";}
async function tokenHash(token:string){
 const raw=new TextEncoder().encode(token);
 const hash=await crypto.subtle.digest("SHA-256",raw);
 return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
async function data(method:string,query:string,payload?:unknown){
 if(!SECRET||!PROJECT_URL)throw new ApiError("Δεν έχει ρυθμιστεί ο διακομιστής.",503);
 const resp=await fetch(TABLE+query,{
  method,
  headers:{
   "apikey":SECRET,"Authorization":"Bearer "+SECRET,
   "Content-Type":"application/json",
   "Accept":"application/json",
   "Prefer":"return=representation"
  },
  body:payload===undefined?undefined:JSON.stringify(payload)
 });
 if(!resp.ok){
  if(resp.status===409)return {conflict:true};
  throw new ApiError("Αποτυχία πρόσβασης στο δωμάτιο.",503);
 }
 return await resp.json();
}
async function getRoom(c:string):Promise<Row>{
 const rows=await data("GET","?select=code,version,state,updated_at&code=eq."+encodeURIComponent(c));
 if(!Array.isArray(rows)||!rows.length)throw new ApiError("Το δωμάτιο δεν υπάρχει.",404);
 const row=rows[0] as Row;
 if(Date.now()-Date.parse(row.updated_at)>MAX_AGE)throw new ApiError("Το δωμάτιο έχει λήξει.",410);
 return row;
}
async function commit(row:Row,room:Room){
 const updated=await data("PATCH","?code=eq."+row.code+"&version=eq."+row.version,{
  state:room,version:row.version+1,updated_at:new Date().toISOString()
 });
 if(!Array.isArray(updated)||updated.length!==1)throw new ApiError("Άλλαξε το δωμάτιο. Δοκίμασε ξανά.",409);
 return updated[0] as Row;
}
function event(room:Room,message:string){
 room.events=[...room.events.slice(-7),message.slice(0,150)];
}
function seatOf(room:Room,digest:string){
 return digest?room.seats.findIndex(s=>s?.kind==="human"&&s.hash===digest):-1;
}
function requiresSeat(idx:number){if(idx<0)throw new ApiError("Πρέπει να καθίσεις σε καρέκλα.",403);}
function requiresHost(idx:number){if(idx!==0)throw new ApiError("Μόνο ο οικοδεσπότης ξεκινά παρτίδα.",403);}
function roomView(row:Row,idx:number){
 const r=row.state;
 const g=r.game;
 const seats=r.seats.map((s,i)=>s?{seat:i,kind:s.kind,name:s.name}:null);
 return {
  code:row.code,version:row.version,phase:r.phase,
  selfSeat:idx,hostSeat:0,seats,events:r.events.slice(-6),
  waiting:idx>=0?{grand:r.grand[String(idx)]!==undefined,trade:!!r.trades[String(idx)]}:null,
  game:g?{
   stage:g.stage,turn:g.turn,round:g.round,scores:g.scores,
   trick:g.trick?{player:g.trick.player,combo:g.trick.combo,cards:g.trick.cards}:null,
   wish:g.wish,announcements:g.announcements,
   counts:g.hands.map((h:any[])=>h.length),
   hand:idx>=0?g.hands[idx]:[],
   finished:g.finished,
   summary:g.summary
  }:null
 };
}
async function createRoom(who:string){
 for(let attempt=0;attempt<6;attempt++){
  const c=code(),token=nonce(),digest=await tokenHash(token);
  const room:Room={phase:"lobby",host:digest,seats:[{kind:"human",name:who,hash:digest},null,null,null],
   game:null,grand:{},trades:{},events:[who+" δημιούργησε το δωμάτιο."]};
  const created=await data("POST","",{code:c,version:1,state:room});
  if(Array.isArray(created)&&created.length===1)return {...roomView(created[0],0),token};
 }
 throw new ApiError("Δεν δημιουργήθηκε δωμάτιο. Δοκίμασε ξανά.",503);
}
function bots(room:Room){
 const g=room.game;
 for(let iter=0;iter<64 && g?.stage==="playing";iter++){
  const p=g.turn;
  if(p<0||p>3||room.seats[p]?.kind!=="ai")break;
  const best=E.aiMove(g,p);
  let result:any;
  if(!best){if(g.trick)result=E.pass(g,p);else break;}
  else if(best.pass)result=E.pass(g,p);
  else result=E.play(g,p,best.ids,best.wish);
  if(!result?.ok)break;
  if(result?.closed)event(room,room.seats[p]!.name+" έκλεισε τη μπάζα.");
  else if(!best?.pass)event(room,room.seats[p]!.name+" έπαιξε.");
  if(g.stage==="finished"){event(room,"Ο γύρος ολοκληρώθηκε.");break;}
 }
}
function allHumanDone(room:Room,decisions:Record<string,unknown>){
 return room.seats.every((s,p)=>s?.kind!=="human"||decisions[String(p)]!==undefined);
}
function completeTrades(room:Room){
 const g=room.game;
 const transfers:Array<Array<{target:number,id:string}>>=Array.from({length:4},()=>[]);
 for(let p=0;p<4;p++){
  if(room.seats[p]?.kind==="human")transfers[p]=room.trades[String(p)] as any[];
  else {
   const sorted=g.hands[p].slice().sort((a:any,b:any)=>E.cardRank(a)-E.cardRank(b));
   const candidates=[...sorted.filter((c:any)=>c.key!=="G"&&c.key!=="P"),
    ...sorted.filter((c:any)=>c.key==="G"||c.key==="P")];
   const targets=[0,1,2,3].filter(i=>i!==p);
   transfers[p]=targets.map((target,i)=>({target,id:candidates[i].id}));
  }
 }
 const addition:Array<any[]>=Array.from({length:4},()=>[]);
 for(let p=0;p<4;p++)for(const {target,id} of transfers[p]){
  const c=g.hands[p].find((v:any)=>v.id===id);
  if(!c)throw new ApiError("Μη έγκυρη ανταλλαγή.");
  addition[target].push(c);
 }
 for(let p=0;p<4;p++){
  const sent=new Set(transfers[p].map(x=>x.id));
  g.hands[p]=g.hands[p].filter((c:any)=>!sent.has(c.id)).concat(addition[p]);
 }
 room.trades={};
 g.stage="playing";g.turn=g.hands.findIndex((h:any[])=>h.some((c:any)=>c.key==="M"));g.trade={};
 event(room,"Ολοκληρώθηκε η ανταλλαγή. Ξεκινά το Mahjong.");
 bots(room);
}
function prepareGrand(room:Room){
 if(!allHumanDone(room,room.grand))return;
 const g=room.game;
 E.grand(g,false);
 for(let p=0;p<4;p++)if(room.grand[String(p)])g.announcements[p]="grand";
 room.trades={};
 event(room,"Μοιράστηκαν τα 14 φύλλα. Ώρα για ανταλλαγές.");
}
async function handle(body:AnyObject){
 const action=String(body.action||"");
 if(action==="create")return await createRoom(name(body.name));
 const c=roomCode(body.code);
 const row=await getRoom(c),r=row.state;
 const token=tokenValue(body.token);
 const hash=token?await tokenHash(token):"";
 let idx=seatOf(r,hash);
 if(action==="state")return roomView(row,idx);
 if(action==="join"){
  if(r.phase!=="lobby")throw new ApiError("Η παρτίδα έχει ήδη ξεκινήσει.",409);
  const seat=Number(body.seat);
  if(!Number.isInteger(seat)||seat<1||seat>3)throw new ApiError("Διάλεξε ελεύθερη καρέκλα.");
  if(r.seats[seat])throw new ApiError("Η καρέκλα είναι πιασμένη.",409);
  if(idx>=0)throw new ApiError("Έχεις ήδη καθίσει.",409);
  const who=name(body.name),secret=nonce(),digest=await tokenHash(secret);
  r.seats[seat]={kind:"human",name:who,hash:digest};
  event(r,who+" κάθισε στη θέση "+seat+".");
  const updated=await commit(row,r);
  return {...roomView(updated,seat),token:secret};
 }
 requiresSeat(idx);
 if(action==="leave"){
  if(r.phase!=="lobby")throw new ApiError("Δεν μπορείς να φύγεις στη μέση της παρτίδας.",409);
  if(idx===0)throw new ApiError("Ο οικοδεσπότης δεν μπορεί να αποχωρήσει από το δωμάτιο.",409);
  event(r,r.seats[idx]!.name+" άφησε την καρέκλα.");
  r.seats[idx]=null;
  return roomView(await commit(row,r),-1);
 }
 if(action==="start"){
  requiresHost(idx);
  if(r.phase!=="lobby")throw new ApiError("Έχει ξεκινήσει ήδη παρτίδα.",409);
  r.seats=r.seats.map((seat,p)=>seat||{kind:"ai",name:["Εσύ","Αριστερά AI","Συμπαίκτης AI","Δεξιά AI"][p]});
  r.game=E.newRound();r.grand={};r.trades={};r.phase="active";
  event(r,"Ξεκίνησε η παρτίδα. Οι κενές καρέκλες έγιναν υπολογιστές.");
  return roomView(await commit(row,r),idx);
 }
 if(r.phase!=="active"||!r.game)throw new ApiError("Δεν έχει ξεκινήσει παρτίδα.",409);
 const g=r.game;
 if(action==="next"){
  requiresHost(idx);
  if(g.stage!=="finished")throw new ApiError("Ο γύρος δεν έχει τελειώσει.");
  r.game=E.newRound(g);r.grand={};r.trades={};
  event(r,"Ξεκίνησε ο επόμενος γύρος.");
  return roomView(await commit(row,r),idx);
 }
 if(action==="restart"){
  requiresHost(idx);
  r.game=E.newRound({scores:[0,0],round:0,difficulty:g.difficulty||"normal"});
  r.grand={};r.trades={};
  event(r,"Ο οικοδεσπότης ξεκίνησε νέα παρτίδα από το μηδέν.");
  return roomView(await commit(row,r),idx);
 }
 if(action==="grand"){
  if(g.stage!=="grand")throw new ApiError("Η δήλωση Grand έκλεισε.");
  if(r.grand[String(idx)]!==undefined)throw new ApiError("Έχεις ήδη απαντήσει.");
  r.grand[String(idx)]=body.yes===true;
  event(r,r.seats[idx]!.name+" αποφάσισε για το Grand.");
  prepareGrand(r);
  return roomView(await commit(row,r),idx);
 }
 if(action==="trade"){
  if(g.stage!=="trade")throw new ApiError("Η ανταλλαγή έχει ολοκληρωθεί.");
  if(r.trades[String(idx)])throw new ApiError("Έχεις ήδη δώσει φύλλα.");
  const selected=Array.isArray(body.trades)?body.trades:[];
  const targets=[0,1,2,3].filter(p=>p!==idx);
  const unique=new Set(selected.map((x:any)=>x?.id));
  if(selected.length!==3||unique.size!==3||
    !targets.every(p=>selected.some((x:any)=>x?.target===p))||
    !selected.every((x:any)=>typeof x?.id==="string"&&g.hands[idx].some((c:any)=>c.id===x.id)))
   throw new ApiError("Επίλεξε ένα διαφορετικό φύλλο για κάθε άλλον παίκτη.");
  r.trades[String(idx)]=selected.map((x:any)=>({target:x.target,id:x.id}));
  event(r,r.seats[idx]!.name+" ετοίμασε την ανταλλαγή.");
  if(allHumanDone(r,r.trades))completeTrades(r);
  return roomView(await commit(row,r),idx);
 }
 if(action==="tichu"){
  if(g.stage!=="playing"||g.hands[idx].length!==14||g.announcements[idx])throw new ApiError("Δεν μπορείς τώρα να δηλώσεις Tichu.");
  if(!E.claimTichu(g,idx))throw new ApiError("Η δήλωση Tichu δεν επιτρέπεται.");
  event(r,r.seats[idx]!.name+" δήλωσε Tichu.");
  return roomView(await commit(row,r),idx);
 }
 if(action==="play"){
  if(g.stage!=="playing")throw new ApiError("Ο γύρος δεν παίζεται αυτή τη στιγμή.");
  const ids=Array.isArray(body.ids)?body.ids.filter((x:unknown)=>typeof x==="string"):[];
  if(ids.length>14||!ids.length||new Set(ids).size!==ids.length)throw new ApiError("Επίλεξε νόμιμα φύλλα.");
  const wished=body.wish==null?null:Number(body.wish);
  const result=E.play(g,idx,ids,wished);
  if(!result.ok)throw new ApiError(result.reason||"Μη νόμιμη κίνηση.");
  event(r,r.seats[idx]!.name+(result.dog?" έπαιξε Dog.":" έπαιξε "+ids.length+" φύλλο/α."));
  bots(r);
  return roomView(await commit(row,r),idx);
 }
 if(action==="pass"){
  const result=E.pass(g,idx);
  if(!result.ok)throw new ApiError(result.reason||"Το πάσο δεν επιτρέπεται.");
  event(r,r.seats[idx]!.name+" πήγε πάσο.");
  bots(r);
  return roomView(await commit(row,r),idx);
 }
 throw new ApiError("Άγνωστη ενέργεια.",400);
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return json({ok:true});
 if(req.method!=="POST")return json({error:"Χρησιμοποίησε POST."},405);
 try{
  if((Number(req.headers.get("content-length"))||0)>8192)throw new ApiError("Υπερβολικά μεγάλο αίτημα.",413);
  const body=await req.json();
  if(!body||typeof body!=="object"||Array.isArray(body))throw new ApiError("Λανθασμένο αίτημα.");
  const result=await handle(body);
  return json(result);
 }catch(err){
  const status=err instanceof ApiError?err.status:500;
  const msg=err instanceof ApiError?err.message:"Προσωρινό σφάλμα του διακομιστή.";
  return json({error:msg},status);
 }
});
