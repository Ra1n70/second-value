(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.SecondValue = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STARTING_CASH = 1000;
  const CRATE_SIZE = 6;
  const MAX_SESSION_ACTIONS = 10000;
  const RULES_VERSION = 7;
  const THEMES = {harbor:'Old Harbor', railway:'Railway'};
  const SOURCES = {
    workshop: {name:"Watchmaker's clearance",evidence:'A faded repair tag',hint:'Mechanical objects and genuine damaged pieces are more likely.',story:'A shuttered watchmaker leaves behind unfinished repairs and forgotten keepsakes.'},
    estate: {name:"Collector's estate",evidence:'A torn catalog page',hint:'Genuine, intact objects and themed collectibles are more likely.',story:'An old collection reaches the auction house with only fragments of its catalog.'},
    theater: {name:'Theater storeroom',evidence:'An old admission ticket',hint:'Reproductions and stage props are more likely; genuine objects can still appear.',story:'Behind the curtains, stage props and real keepsakes have shared the same dusty shelves.'}
  };
  const ROLES = {
    restorer: {name:'Restorer',short:'Restorer',mark:'R',tagline:'Find the value beneath the damage.',passive:'After winning, choose up to two genuine damaged objects to repair. Pay their fixed fees before selling.',skill:'Precision repair',skillText:'One ability: repair up to two eligible objects after purchase. No private inspection.',risk:'Repair gains are capped. Paying too much can still turn a good repair into a loss.'},
    appraiser: {name:'Appraiser',short:'Appraiser',mark:'A',tagline:'Know what everyone else is guessing.',passive:'Privately identify up to two objects across all three rounds. Ordinary sale prices are the same for everyone.',skill:'Authenticate',skillText:'Reveal one object’s identity, authenticity, condition, category, theme and exact base price.',risk:'Better information does not protect you from overbidding.'},
    collector: {name:'Collector',short:'Collector',mark:'C',tagline:'The missing piece changes everything.',passive:'Lock a theme before bidding. Deliver one pair of genuine objects with different identities and categories for a capped bonus.',skill:'Set delivery',skillText:'One ability: deliver one matching pair after purchase. Your chosen theme stays locked.',risk:'A crate may contain no valid pair for your chosen theme.'},
    salvager: {name:'Salvager',short:'Salvager',mark:'S',tagline:'Even a fake can have useful parts.',passive:'After winning, dismantle up to two reproductions. Each costs 15 to process and sells for a fixed 90.',skill:'Parts harvest',skillText:'One ability: harvest parts from up to two reproductions after purchase. Genuine objects sell normally.',risk:'Genuine objects cannot be harvested. Each salvage gains only 5 to 55 in this catalog.'},
    curator: {name:'Curator',short:'Curator',mark:'U',tagline:'Three different stories make an exhibition.',passive:'Exhibit exactly three genuine, intact objects from different categories. Pay 25 and earn a capped bonus on each.',skill:'Pop-up exhibition',skillText:'One ability: exhibit three eligible objects together. Each earns 20% of its base value, capped at 40.',risk:'You need three different categories and enough cash to pay the fee first. The net bonus is at most 95.'},
    broker: {name:'Antique Dealer',short:'Antique Dealer',mark:'D',tagline:'Buy at auction. Sell to regulars.',passive:'After winning, sell one genuine, intact object to a regular customer. They pay 30% extra, up to 90; packing and delivery cost 25.',skill:'Customer order',skillText:'One ability: sell one eligible object to a regular customer after winning. Other objects sell normally.',risk:'Pay packing and delivery first. The extra profit is at most 65; low-value sales may lose money.'}
  };
  const ORIGINAL_ITEMS = [
    {id:'harbor-clock',name:'Old Harbor mantel clock',shape:'clock',category:'mechanical',theme:'harbor',base:180,genuine:true,condition:'damaged',repair:{cost:80,sale:305}},
    {id:'replica-cup',name:'Reproduction porcelain cup',shape:'cup',category:'ceramic',theme:null,base:40,genuine:false,condition:'intact'},
    {id:'crew-badge',name:'Harbor crew badge',shape:'badge',category:'insignia',theme:'harbor',base:100,genuine:true,condition:'intact'},
    {id:'station-clock',name:'Stationmaster’s clock',shape:'clock',category:'mechanical',theme:'railway',base:260,genuine:true,condition:'damaged',repair:{cost:90,sale:410}},
    {id:'prop-clock',name:'Theater prop clock',shape:'clock',category:'mechanical',theme:null,base:60,genuine:false,condition:'unrepairable'},
    {id:'tea-cup',name:'Hand-painted tea cup',shape:'cup',category:'ceramic',theme:null,base:210,genuine:true,condition:'intact'},
    {id:'sailor-cup',name:'First mate’s enamel cup',shape:'cup',category:'ceramic',theme:'harbor',base:120,genuine:true,condition:'intact'},
    {id:'replica-badge',name:'Replica shipping badge',shape:'badge',category:'insignia',theme:'harbor',base:30,genuine:false,condition:'intact'},
    {id:'expo-badge',name:'World exposition medal',shape:'badge',category:'insignia',theme:'railway',base:230,genuine:true,condition:'intact'},
    {id:'dock-camera',name:'Dockside press camera',shape:'camera',category:'imaging',theme:'harbor',base:140,genuine:true,condition:'damaged',repair:{cost:90,sale:265}},
    {id:'toy-camera',name:'Plastic toy camera',shape:'camera',category:'imaging',theme:null,base:35,genuine:false,condition:'intact'},
    {id:'studio-camera',name:'Studio rangefinder',shape:'camera',category:'imaging',theme:null,base:330,genuine:true,condition:'intact'},
    {id:'harbor-radio',name:'Harbor dispatch radio',shape:'radio',category:'instrument',theme:'harbor',base:110,genuine:true,condition:'damaged',repair:{cost:70,sale:207}},
    {id:'travel-radio',name:'Traveler’s pocket radio',shape:'radio',category:'instrument',theme:'railway',base:160,genuine:true,condition:'intact'},
    {id:'prop-radio',name:'Display-only radio shell',shape:'radio',category:'instrument',theme:null,base:25,genuine:false,condition:'unrepairable'},
    {id:'harbor-map',name:'Original harbor survey',shape:'map',category:'document',theme:'harbor',base:190,genuine:true,condition:'intact'},
    {id:'map-print',name:'Tourist map reprint',shape:'map',category:'document',theme:'harbor',base:20,genuine:false,condition:'intact'},
    {id:'star-chart',name:'Navigator’s star chart',shape:'map',category:'document',theme:null,base:280,genuine:true,condition:'intact'}
  ].map(item=>({...item,catalogId:item.id,appearance:item.shape,authenticity:item.genuine?'genuine':'reproduction',baseValue:item.base,harbor:item.theme==='harbor'}));
  // Balance revisions are locked at session creation. Old replays retain their
  // original catalog themes and committed computer quotes, including future crates.
  const REVISION_TWO_ITEMS = ORIGINAL_ITEMS.map(item=>item.catalogId==='tea-cup'?{...item,theme:'railway'}:item);
  const REVISION_THREE_ITEMS = [...REVISION_TWO_ITEMS,
    {id:'cabinet-clock',name:'Railway cabinet clock',shape:'clock',category:'mechanical',theme:'railway',base:220,genuine:true,condition:'intact'},
    {id:'cracked-cup',name:'Cracked porcelain cup',shape:'cup',category:'ceramic',theme:null,base:150,genuine:true,condition:'damaged',repair:{cost:50,sale:235}},
    {id:'navy-badge',name:'Naval service badge',shape:'badge',category:'insignia',theme:'harbor',base:70,genuine:true,condition:'intact'},
    {id:'replica-camera',name:'Replica folding camera',shape:'camera',category:'imaging',theme:null,base:70,genuine:false,condition:'intact'},
    {id:'console-radio',name:'Console receiver',shape:'radio',category:'instrument',theme:null,base:300,genuine:true,condition:'intact'},
    {id:'railway-map',name:'Original railway map',shape:'map',category:'document',theme:'railway',base:240,genuine:true,condition:'intact'}
  ].map(item=>({...item,catalogId:item.catalogId??item.id,appearance:item.shape,authenticity:item.genuine?'genuine':'reproduction',baseValue:item.base,harbor:item.theme==='harbor'}));
  const RARE_ITEMS = [
    {id:'midnight-regulator',name:'Midnight Regulator',shape:'clock',category:'mechanical',theme:'railway',base:240,genuine:true,condition:'damaged',repair:{cost:80,sale:380},story:'A railway mechanic left this clock at the watchmaker’s. Its pendulum stopped at midnight, and an unsigned work order still rests behind the back panel.',provenance:'A faded railway repair order'},
    {id:'tide-wireless',name:'Tidewatch Wireless',shape:'radio',category:'instrument',theme:'harbor',base:160,genuine:true,condition:'damaged',repair:{cost:60,sale:255},story:'This radio came in for repair when the old harbor watch room closed. Salt marks remain beside the knobs. The logbook’s last entry reads: “Waiting for the tide.”',provenance:'A salt-stained repair tag'},
    {id:'blue-line-cup',name:'Blue Line Service Cup',shape:'cup',category:'ceramic',theme:'railway',base:150,genuine:true,condition:'intact',story:'The collector kept just one cup from the service. A thin cobalt line circles its rim like a railway route that no longer runs.',provenance:'A dining-car entry in an estate catalog'},
    {id:'canceled-voyage-medal',name:'Unsailed Voyage Medal',shape:'badge',category:'insignia',theme:'harbor',base:110,genuine:true,condition:'intact',story:'This medal was struck for a maiden voyage that was canceled. The ship never left the harbor, but someone kept its dark blue ribbon for years.',provenance:'A record of a canceled maiden voyage'},
    {id:'last-service-camera',name:'Last Service Camera',shape:'camera',category:'imaging',theme:'railway',base:280,genuine:true,condition:'intact',story:'A railway luggage tag hangs from its old leather case. The lens is clear and the film holder is empty. The photographs of that last service did not come with it.',provenance:'A leather case with a railway luggage tag'},
    {id:'night-pilot-chart',name:'Night Pilot Chart',shape:'map',category:'document',theme:'harbor',base:210,genuine:true,condition:'intact',story:'A red pencil route avoids the chart’s shortest channel. The collector called it “the cautious course” but never named the harbor pilot who drew it.',provenance:'A collected chart with a red pencil route'},
    {id:'gilded-prop-clock',name:'Coronation Prop Clock',shape:'clock',category:'mechanical',theme:null,base:55,genuine:false,condition:'unrepairable',story:'Its gilded shell once caught the stage lights. Behind the back panel, wire holds the hands in place. This clock was never meant to keep time.',provenance:'A painted ornament from the theater storeroom'},
    {id:'silver-stage-chart',name:'Silver Ink Stage Chart',shape:'map',category:'document',theme:'harbor',base:25,genuine:false,condition:'intact',story:'Silver routes shine under the lights but lead to a coast that does not exist. The scene painter used canvas so even the back row could read the chart.',provenance:'A prop list on the back of an old theater ticket'}
  ].map(item=>({...item,catalogId:item.id,appearance:item.shape,authenticity:item.genuine?'genuine':'reproduction',baseValue:item.base,harbor:item.theme==='harbor',rarity:'rare'}));
  const RARE_IDS = new Set(RARE_ITEMS.map(item=>item.catalogId));
  const ITEMS = [...REVISION_THREE_ITEMS,...RARE_ITEMS];
  // Rules 7 keep the rules 6 catalog and start every table with 1,500, so most crates are contested on value, not cash.
  function startingCashFor(rulesVersion) {return rulesVersion>=7?1500:STARTING_CASH;}
  function validateRules(version) {if(![1,2,3,4,5,6,7].includes(version))throw new Error('Choose a valid rules revision.');return version;}
  function savedRules(raw) {return Object.hasOwn(raw,'rulesVersion')?validateRules(raw.rulesVersion):1;}
  function catalogItems(gameOrVersion) {
    const version=gameOrVersion===undefined?RULES_VERSION:typeof gameOrVersion==='number'?gameOrVersion:gameOrVersion.rulesVersion??1;
    return validateRules(version)===1?ORIGINAL_ITEMS:version===2?REVISION_TWO_ITEMS:version<6?REVISION_THREE_ITEMS:ITEMS;
  }
  const SHAPES = {clock:'Clock-shaped object',cup:'Small ceramic object',badge:'Metal insignia',camera:'Camera-shaped object',radio:'Radio-shaped object',map:'Folded paper document'};
  function rng(seed) {let a=seed>>>0;return function(){a+=0x6D2B79F5;let t=Math.imul(a^(a>>>15),1|a);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
  function sourceWeight(sourceId,item) {
    if(sourceId==='workshop')return (item.category==='mechanical'?1.6:1)*(item.genuine&&item.condition==='damaged'?4:1);
    if(sourceId==='estate')return item.genuine?(item.condition==='intact'?(item.theme?3.8:2.5):(item.theme?1.5:1)):.55;
    if(sourceId==='theater')return item.genuine?1:4;
    return 1;
  }
  function catalogWeight(sourceId,item,rulesVersion=RULES_VERSION) {
    // This prior is shared by real draws and both computer estimators. Known
    // room projections need only catalogId; they do not carry rarity metadata.
    if(rulesVersion<5)return 1;
    return sourceWeight(sourceId,item)*(rulesVersion>=6&&RARE_IDS.has(item.catalogId) ? .15 : 1);
  }
  function sourceDraw(pool,sourceId,random,rulesVersion) {
    const remaining=[...pool],items=[];
    while(items.length<CRATE_SIZE) {
      let target=random()*remaining.reduce((sum,item)=>sum+catalogWeight(sourceId,item,rulesVersion),0),chosen=remaining.length-1;
      for(let index=0;index<remaining.length;index++) {
        target-=catalogWeight(sourceId,remaining[index],rulesVersion);
        if(target<0){chosen=index;break;}
      }
      items.push(remaining.splice(chosen,1)[0]);
    }
    return items;
  }
  function crateReserve(items,seed,rulesVersion) {
    if(rulesVersion<4)return 0;
    // The auction house sets the reserve once before bidding. Its own stream
    // keeps item draws, tie priority and existing computer quotes independent.
    const percent=8+Math.floor(rng(seed^0x5A17B9C3)()*5);
    return Math.max(1,Math.round(items.reduce((total,item)=>total+item.base,0)*percent/100));
  }
  function clone(value) {return JSON.parse(JSON.stringify(value));}
  function validCash(value) {return Number.isSafeInteger(value)&&value>=0;}
  function getCash(game) {return game.startingCash===undefined?STARTING_CASH:game.startingCash;}
  function validateRole(role) {if(!Object.hasOwn(ROLES,role))throw new Error('Choose a valid role.');}
  function validateTheme(theme) {if(!Object.hasOwn(THEMES,theme))throw new Error('Choose a valid collection theme.');}
  function catalogFor(shape,revision) {const pool=catalogItems(revision).filter(item=>item.shape===shape);if(!pool.length)throw new Error('Unknown object appearance.');const prices=pool.map(item=>item.base);return {shape,label:SHAPES[shape],min:Math.min(...prices),max:Math.max(...prices)};}
  function inspect(role,items,index) {
    validateRole(role);
    if(role!=='appraiser')throw new Error('Only the appraiser has a private inspection ability.');
    const item=items[index];if(!item)throw new Error('Select an object first.');
    return `${item.name}. ${item.genuine?'Genuine':'Reproduction'}. Condition: ${item.condition}. Category: ${item.category}. Theme: ${THEMES[item.theme]||'None'}. Base sale price: ${item.base}.`;
  }
  function repairGain(item) {return item.repair?item.repair.sale-item.repair.cost-item.base:0;}
  function canRepair(item) {return item.genuine===true&&item.condition==='damaged'&&item.repair&&Number.isInteger(item.repair.cost)&&item.repair.cost>=0&&Number.isInteger(item.repair.sale)&&repairGain(item)>0&&repairGain(item)<=Math.min(60,Math.floor(item.base/4));}
  function abilityEligibility(role,item) {
    validateRole(role);
    if(!item||typeof item!=='object')return false;
    if(role==='restorer')return Boolean(canRepair(item));
    if(role==='collector')return item.genuine===true;
    if(role==='salvager')return item.genuine===false;
    if(role==='curator'||role==='broker')return item.genuine===true&&item.condition==='intact';
    return false;
  }
  function abilitySelectionLimit(role) {validateRole(role);return role==='curator'?3:role==='broker'?1:role==='appraiser'?0:2;}
  function isPair(a,b,theme) {return a.id!==b.id&&a.catalogId!==b.catalogId&&a.category!==b.category&&a.genuine===true&&b.genuine===true&&a.theme===theme&&b.theme===theme;}
  function targetItems(ids,items) {
    if(!Array.isArray(ids))throw new Error('Choose a list of object IDs.');
    if(new Set(ids).size!==ids.length)throw new Error('Select each object only once.');
    return ids.map(id=>{const item=items.find(candidate=>candidate.id===id);if(typeof id!=='string'||!item)throw new Error('Select valid objects.');return item;});
  }
  function repairPlan(items,selected,cash) {
    const selectedIds=new Set(selected.map(item=>item.id));
    const ordinary=items.filter(item=>!selectedIds.has(item.id)).reduce((sum,item)=>sum+item.base,0);
    const orders=selected.length===2?[selected,[selected[1],selected[0]]]:[selected];
    for(const order of orders) {
      let available=cash+ordinary;const processing=[];
      for(const item of order) {
        if(available<item.repair.cost)break;
        const before=available;available+=item.repair.sale-item.repair.cost;
        processing.push({id:item.id,availableBefore:before,cost:item.repair.cost,sale:item.repair.sale,availableAfter:available});
      }
      if(processing.length===selected.length) {
        const sale=ordinary+selected.reduce((sum,item)=>sum+item.repair.sale,0),cost=selected.reduce((sum,item)=>sum+item.repair.cost,0);
        return {sale,cost,bonus:0,recovery:sale-cost,repairs:order.map(item=>item.id),pair:[],ability:[],processing};
      }
    }
    return null;
  }
  function salePlan(role,items,mode,cashAfterPurchase,options={}) {
    validateRole(role);
    if(!['ordinary','special'].includes(mode))throw new Error('Choose a valid sale method.');
    if(!Number.isInteger(cashAfterPurchase)||cashAfterPurchase<0)throw new Error('Available cash must be a nonnegative whole number.');
    if(!options||typeof options!=='object'||Array.isArray(options))throw new Error('Choose valid processing options.');
    if(Object.keys(options).some(key=>!['repairIds','pairIds','abilityIds','theme'].includes(key)))throw new Error('Choose valid processing options.');
    if(!Array.isArray(items)||items.some(item=>typeof item.id!=='string'||!Number.isInteger(item.base)||item.base<0)||new Set(items.map(item=>item.id)).size!==items.length)throw new Error('The crate must contain distinct valid objects.');
    const repairSelection=Object.hasOwn(options,'repairIds')?targetItems(options.repairIds,items):null;
    const pairSelection=Object.hasOwn(options,'pairIds')?targetItems(options.pairIds,items):null;
    const abilitySelection=Object.hasOwn(options,'abilityIds')?targetItems(options.abilityIds,items):null;
    if(repairSelection&&role!=='restorer')throw new Error('Only the restorer can select repairs.');
    if(pairSelection&&role!=='collector')throw new Error('Only the collector can select a pair.');
    if(abilitySelection&&!['salvager','curator','broker'].includes(role))throw new Error('Only the matching role can select ability objects.');
    if((repairSelection?.length||pairSelection?.length||abilitySelection?.length)&&mode!=='special')throw new Error('Processing requires the special sale method.');
    const base=items.reduce((sum,item)=>sum+item.base,0);
    const ordinary={sale:base,cost:0,bonus:0,recovery:base,repairs:[],pair:[],ability:[],processing:[]};
    if(mode==='ordinary'||role==='appraiser')return ordinary;
    if(role==='restorer') {
      if(repairSelection) {
        if(repairSelection.length>2)throw new Error('Select at most two repairs.');
        if(repairSelection.some(item=>!canRepair(item)))throw new Error('Selected object cannot be repaired.');
        const plan=repairPlan(items,repairSelection,cashAfterPurchase);
        if(!plan)throw new Error('Not enough cash to pay the selected repair fees first.');
        return plan;
      }
      const eligible=items.filter(canRepair);let best=ordinary;
      const candidates=eligible.map(item=>[item]);
      for(let a=0;a<eligible.length;a++)for(let b=a+1;b<eligible.length;b++)candidates.push([eligible[a],eligible[b]]);
      for(const selected of candidates) {const plan=repairPlan(items,selected,cashAfterPurchase);if(plan&&(plan.recovery>best.recovery||(plan.recovery===best.recovery&&plan.cost<best.cost)))best=plan;}
      return best;
    }
    if(['salvager','curator','broker'].includes(role)) {
      function processingPlan(selected) {
        if(selected.length===0)return ordinary;
        if(role==='salvager') {
          if(selected.length>2)throw new Error('Select at most two salvage objects.');
          if(selected.some(item=>!abilityEligibility(role,item)))throw new Error('Selected object cannot be salvaged.');
        } else if(role==='curator') {
          if(selected.length!==3)throw new Error('Select exactly three exhibition objects.');
          if(selected.some(item=>!abilityEligibility(role,item))||new Set(selected.map(item=>item.category)).size!==3)throw new Error('Exhibition objects must be genuine, intact and from different categories.');
        } else {
          if(selected.length!==1)throw new Error('Choose exactly one object to sell to your customer.');
          if(selected.some(item=>!abilityEligibility(role,item)))throw new Error('Your customer buys only genuine, intact objects.');
        }
        const selectedIds=new Set(selected.map(item=>item.id));
        const unselectedBase=items.filter(item=>!selectedIds.has(item.id)).reduce((sum,item)=>sum+item.base,0);
        let available=cashAfterPurchase+unselectedBase;
        const processing=[];
        if(role==='salvager') {
          for(const item of selected) {
            if(available<15)return null;
            const before=available;available+=90-15;
            processing.push({id:item.id,availableBefore:before,cost:15,sale:90,availableAfter:available});
          }
          const sale=unselectedBase+90*selected.length,cost=15*selected.length;
          return {...ordinary,sale,cost,recovery:sale-cost,ability:selected.map(item=>item.id),processing};
        }
        if(available<25)return null;
        const bonus=role==='curator'?selected.reduce((sum,item)=>sum+Math.min(40,Math.floor(item.base/5)),0):Math.min(90,Math.floor(selected[0].base*3/10));
        const selectedSale=selected.reduce((sum,item)=>sum+item.base,0)+bonus;
        processing.push({id:selected[0].id,ids:selected.map(item=>item.id),availableBefore:available,cost:25,sale:selectedSale,availableAfter:available+selectedSale-25});
        return {...ordinary,cost:25,bonus,recovery:base+bonus-25,ability:selected.map(item=>item.id),processing};
      }
      if(abilitySelection) {
        const plan=processingPlan(abilitySelection);
        if(!plan)throw new Error('Not enough cash to pay the selected processing fees first.');
        return plan;
      }
      const eligible=items.filter(item=>abilityEligibility(role,item));
      const count=role==='curator'?3:role==='broker'?1:2;
      const candidates=[];
      function choose(start,selected) {
        if((role==='salvager'&&selected.length>0)||selected.length===count)candidates.push(selected);
        if(selected.length===count)return;
        for(let index=start;index<eligible.length;index++)choose(index+1,[...selected,eligible[index]]);
      }
      choose(0,[]);let best=ordinary;
      for(const selected of candidates) {
        if(role==='curator'&&new Set(selected.map(item=>item.category)).size!==3)continue;
        const plan=processingPlan(selected);
        if(plan&&(plan.recovery>best.recovery||(plan.recovery===best.recovery&&plan.cost<best.cost)))best=plan;
      }
      return best;
    }
    const theme=Object.hasOwn(options,'theme')?options.theme:'harbor';validateTheme(theme);
    let pair=[];
    if(pairSelection) {
      if(pairSelection.length>2)throw new Error('Select at most one collection pair.');
      if(pairSelection.length===1)throw new Error('Select exactly two collection objects.');
      if(pairSelection.length&&!isPair(pairSelection[0],pairSelection[1],theme))throw new Error('The selected objects do not form a valid pair for your locked theme.');
      pair=pairSelection;
    } else {
      for(let a=0;a<items.length;a++)for(let b=a+1;b<items.length;b++)if(isPair(items[a],items[b],theme)&&(!pair.length||items[a].base+items[b].base>pair[0].base+pair[1].base))pair=[items[a],items[b]];
    }
    const bonus=pair.length?Math.min(120,Math.floor((pair[0].base+pair[1].base)/4)):0;
    return {...ordinary,bonus,recovery:base+bonus,pair:pair.map(item=>item.id)};
  }
  function valuationBoard(items,players,{winnerId,winningBid,receipt}={}) {
    // A counterfactual is useful only after a real purchase has been settled.
    // It never alters a balance or substitutes an optimized plan for the winner's choice.
    if(!winnerId||!receipt||!Number.isSafeInteger(winningBid)||winningBid<1||!Array.isArray(players)||!players.some(player=>player.id===winnerId))return null;
    const ordinary=items.reduce((sum,item)=>sum+item.base,0);
    const rows=players.map(player=>{
      const cashBefore=player.cashBefore,affordable=validCash(cashBefore)&&cashBefore>=winningBid,actual=player.id===winnerId;
      const row={id:player.id,name:player.name,role:player.role,theme:player.theme??null,cashBefore,affordable,actual};
      if(!affordable)return {...row,sale:null,cost:null,bonus:null,recovery:null,abilityGain:null,profit:null};
      const plan=actual?receipt:salePlan(player.role,items,'special',cashBefore-winningBid,{theme:player.theme??'harbor'});
      return {...row,sale:plan.sale,cost:plan.cost,bonus:plan.bonus,recovery:plan.recovery,abilityGain:plan.recovery-ordinary,profit:actual?receipt.profit:plan.recovery-winningBid};
    });
    return {ordinary,winningBid,rows};
  }
  function estimateFromEvidence(items,role,targets,theme,context) {
    const round=context.round||1;
    const genuineCount=round>=2?items.filter(item=>item.genuine).length:null;
    const repairCount=round===3?items.filter(canRepair).length:null;
    const possibilities=items.map((item,index)=>{
      const known=(round===3&&index===context.publicIndex)||(role==='appraiser'&&targets.includes(index));
      const candidates=known?[item]:catalogItems(context.rulesVersion??RULES_VERSION).filter(candidate=>candidate.shape===item.shape);
      return candidates.map(candidate=>({...candidate,id:'estimate-'+index}));
    });
    const weighted=(context.rulesVersion??RULES_VERSION)>=5&&Object.hasOwn(SOURCES,context.sourceId);
    const poolWeight=weighted?catalogItems(context.rulesVersion).reduce((sum,item)=>sum+catalogWeight(context.sourceId,item,context.rulesVersion??RULES_VERSION),0):0;
    let total=0,count=0;
    function visit(crate,index,likelihood=1,usedWeight=0) {
      if(index===possibilities.length) {
        // This demo draws catalog identities without replacement.
        if(new Set(crate.map(item=>item.catalogId)).size!==crate.length)return;
        if(genuineCount!==null&&crate.filter(item=>item.genuine).length!==genuineCount)return;
        if(repairCount!==null&&crate.filter(canRepair).length!==repairCount)return;
        total+=salePlan(role,crate,'special',context.cash??startingCashFor(context.rulesVersion??1),{theme}).recovery*likelihood;count+=likelihood;return;
      }
      for(const item of possibilities[index]) {
        if(weighted&&crate.some(selected=>selected.catalogId===item.catalogId))continue;
        const weight=weighted?catalogWeight(context.sourceId,item,context.rulesVersion??RULES_VERSION):0;
        visit([...crate,item],index+1,weighted?likelihood*weight/(poolWeight-usedWeight):1,usedWeight+weight);
      }
    }
    visit([],0);return count?total/count:0;
  }
  function computerBids(items,random,context={}) {
    const round=context.round||1;
    const rulesVersion=validateRules(context.rulesVersion??RULES_VERSION);
    const reservePrice=rulesVersion>=4?context.reservePrice??0:0;
    const names=['Marlow','Finch','Vale'],roles=rulesVersion>=3?(context.botRoles||['collector','restorer','appraiser']):['collector','restorer','appraiser'];
    return roles.map((role,index)=>{
      // All draws occur independently of truth and the current human quote.
      const themeDraw=random(),firstTarget=Math.floor(random()*items.length);
      const secondTarget=(firstTarget+1+Math.floor(random()*Math.max(1,items.length-1)))%items.length;
      const risk=random(),theme=role==='collector'?(context.botThemes?.[index]||(themeDraw<.5?'harbor':'railway')):null;
      const cash=context.botCash?.[index]??startingCashFor(rulesVersion);
      const targets=round>=2?[firstTarget,secondTarget]:[firstTarget];
      let estimate=cash===0||cash<reservePrice?0:estimateFromEvidence(items,role,targets,theme,{...context,round,cash});
      const previous=context.history?.at(-1);
      if(previous) {
        const others=previous.bids.filter(b=>b.id!=='bot-'+index&&b.bid>0),signal=others.length?Math.max(...others.map(b=>b.bid)):0;
        estimate*=Math.max(.9,Math.min(1.1,1+(signal-estimate)*.12/Math.max(1,estimate)));
      }
      const baseFactor=(rulesVersion===1?[0,.48,.62,.72]:[0,.26,.50,.72])[round];
      const quote=cash===0?0:Math.min(cash,Math.max(1,Math.round(estimate*(baseFactor+risk*.42)/10)*10));
      const bid=quote<reservePrice?0:quote;
      return {id:'bot-'+index,name:names[index],role,theme,bid};
    });
  }
  function prepareBidders(game) {game.bots=computerBids(game.items,rng(game.seed^0x4F17C2),{round:game.round,history:game.history,publicIndex:game.publicIndex,botCash:game.botStartingCash,botThemes:game.botThemes,botRoles:game.botRoles,rulesVersion:game.rulesVersion??1,reservePrice:game.reservePrice??0,sourceId:game.sourceId??null});}
  function seededBotRoles(seed) {
    // Role selection has its own stream, independent of the crate shuffle, truth,
    // human role and quotes. A session locks these choices for all later crates.
    const roles=Object.keys(ROLES),random=rng(seed^0x719BC46D);
    for(let index=roles.length-1;index>0;index--){const target=Math.floor(random()*(index+1));[roles[index],roles[target]]=[roles[target],roles[index]];}
    return roles.slice(0,3);
  }
  function newGame(role,seed,theme='harbor',context={}) {
    validateRole(role);if(!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new Error('Choose a valid game seed.');
    const rulesVersion=validateRules(context.rulesVersion??RULES_VERSION);
    if(rulesVersion<3&&['salvager','curator','broker'].includes(role))throw new Error('Choose a valid role.');
    if(role==='collector')validateTheme(theme);
    const opening=startingCashFor(rulesVersion),startingCash=context.startingCash??opening,botStartingCash=context.botCash??[opening,opening,opening];
    if(!validCash(startingCash)||!Array.isArray(botStartingCash)||botStartingCash.length!==3||!botStartingCash.every(validCash))throw new Error('Available cash must be a nonnegative whole number.');
    const botRoles=rulesVersion>=3?(context.botRoles??seededBotRoles(seed)):['collector','restorer','appraiser'];
    if(!Array.isArray(botRoles)||botRoles.length!==3||new Set(botRoles).size!==3||botRoles.some(botRole=>!Object.hasOwn(ROLES,botRole)))throw new Error('Choose valid locked computer roles.');
    if(context.botThemes&&(!Array.isArray(context.botThemes)||context.botThemes.length!==3||context.botThemes.some((botTheme,index)=>botRoles[index]==='collector'?!Object.hasOwn(THEMES,botTheme):botTheme!==null)))throw new Error('Choose valid locked computer themes.');
    const random=rng(seed),pool=clone(catalogItems(rulesVersion));
    // Source selection uses its own stream and never depends on role or wealth.
    // Earlier revisions keep every shuffle draw and committed quote unchanged.
    const sourceId=rulesVersion>=5?Object.keys(SOURCES)[Math.floor(rng(seed^0x39B4D871)()*3)]:null;
    if(rulesVersion<5)for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    const prefix=context.instancePrefix??String(seed>>>0);
    const items=(rulesVersion>=5?sourceDraw(pool,sourceId,random,rulesVersion):pool.slice(0,CRATE_SIZE)).map((item,index)=>({...item,id:`${prefix}-${index}-${item.catalogId}`}));
    const priority=['you','bot-0','bot-1','bot-2'],offset=Math.floor(random()*4),order=priority.slice(offset).concat(priority.slice(0,offset));
    const game={version:4,rulesVersion,seed:seed>>>0,role,theme:role==='collector'?theme:null,startingCash,botStartingCash:[...botStartingCash],botThemes:context.botThemes?clone(context.botThemes):null,phase:'inspect',round:1,items,reservePrice:crateReserve(items,seed,rulesVersion),bots:[],priority:order,publicIndex:Math.floor(random()*CRATE_SIZE),selected:0,inspected:[],history:[],actions:[],bid:null,passed:false,winner:null,mode:null,receipt:null};
    if(rulesVersion>=3)game.botRoles=[...botRoles];
    game.sourceId=sourceId;
    if(context.noBots!==true)prepareBidders(game);return game;
  }
  function useSkill(game,index) {
    if(game.phase!=='inspect')throw new Error('Inspection is closed.');
    if(game.role!=='appraiser')throw new Error('Only the appraiser has a private inspection ability.');
    if(!Number.isInteger(index)||index<0||index>=game.items.length)throw new Error('Select an object first.');
    if(game.inspected.includes(index)||(game.round===3&&index===game.publicIndex))return inspect(game.role,game.items,index);
    if(game.inspected.length>=2)throw new Error('Both inspections have been used.');
    game.inspected.push(index);game.actions.push({type:'inspect',index});return inspect(game.role,game.items,index);
  }
  function openBidding(game) {if(game.phase!=='inspect')throw new Error('Inspection is closed.');game.phase='bid';game.actions.push({type:'open'});}
  function returnToInspection(game) {
    if(game.phase!=='bid'||game.actions.at(-1)?.type!=='open')throw new Error('You can return to inspection only before revealing bids.');
    // Entering the bid form reveals nothing. Undo only that view change, retaining
    // every inspection, the committed computer quotes, and the round's original funds.
    game.actions.pop();game.phase='inspect';
  }
  function resolveRound(bids,priority,round,reservePrice=0) {
    if(![1,2,3].includes(round))throw new Error('Invalid auction round.');
    if(!Number.isSafeInteger(reservePrice)||reservePrice<0)throw new Error('Choose a valid reserve price.');
    const sorted=clone(bids).sort((a,b)=>b.bid-a.bid||priority.indexOf(a.id)-priority.indexOf(b.id)),highest=sorted[0]?.bid||0,second=sorted[1]?.bid||0;
    const multiplier=[0,1.8,1.3,1][round],required=Math.max(1,reservePrice,Math.ceil(second*[0,18,13,10][round]/10)),hammered=highest>0&&highest>=reservePrice&&(round===3||highest>=required);
    return {round,bids:sorted,highest,second,multiplier,required,hammered,winner:hammered?sorted[0].id:null,...(reservePrice>0?{reservePrice}:{})};
  }
  function placeBid(game,amount,pass=false) {
    if(game.phase!=='bid')throw new Error('Bidding is not open.');
    const minimum=Math.max(1,game.reservePrice??0),cash=getCash(game);
    if(!pass&&cash<minimum&&game.reservePrice>0)throw new Error(`You need at least ${minimum} to bid on this crate. Pass this round.`);
    if(!pass&&(!Number.isSafeInteger(amount)||amount<minimum||amount>cash))throw new Error(`Enter a whole-number bid from ${minimum} to ${cash.toLocaleString('en-US')}.`);
    game.bid=pass?null:amount;game.passed=pass;
    const bids=[...game.bots,{id:'you',name:'You',role:game.role,theme:game.theme,bid:pass?0:amount}],reveal=resolveRound(bids,game.priority,game.round,game.reservePrice??0);
    game.history.push(reveal);game.actions.push({type:'bid',amount:pass?null:amount,pass});game.winner=reveal.winner;
    if(!reveal.hammered&&game.round<3)game.phase='round-summary';
    else {game.phase=game.winner==='you'?'dispose':'result';if(game.winner!=='you')game.receipt={paid:0,sale:0,cost:0,bonus:0,recovery:0,profit:0,cash:getCash(game),...(game.reservePrice>0?{reservePrice:game.reservePrice}:{})};}
    return reveal;
  }
  function nextRound(game) {if(game.phase!=='round-summary'||game.round>=3)throw new Error('The next round is not available.');game.round++;game.phase='inspect';game.bid=null;game.passed=false;prepareBidders(game);game.actions.push({type:'next'});}
  function settle(game,mode,selection={}) {
    if(game.phase!=='dispose'||game.winner!=='you')throw new Error('This crate is not awaiting your sale.');
    const plan=salePlan(game.role,game.items,mode,getCash(game)-game.bid,{...selection,theme:game.theme});
    game.receipt={...plan,paid:game.bid,profit:plan.recovery-game.bid,cash:getCash(game)-game.bid+plan.recovery,...(game.reservePrice>0?{reservePrice:game.reservePrice}:{})};game.mode=mode;game.phase='result';
    const committed={};if(game.role==='restorer')committed.repairIds=plan.repairs;if(game.role==='collector')committed.pairIds=plan.pair;
    if(['salvager','curator','broker'].includes(game.role))committed.abilityIds=plan.ability;
    game.actions.push({type:'sell',mode,selection:committed});return game.receipt;
  }
  function standings(game) {
    if(game.phase!=='result')throw new Error('Finish this auction first.');
    const rows=[{id:'you',name:'You',role:game.role,theme:game.theme,cash:game.receipt.cash,profit:game.receipt.profit}];
    for(const [index,bot] of game.bots.entries()) {const cash=game.botStartingCash?.[index]??startingCashFor(game.rulesVersion??1);let profit=0;if(bot.id===game.winner)profit=salePlan(bot.role,game.items,'special',cash-bot.bid,{theme:bot.theme}).recovery-bot.bid;rows.push({...bot,cash:cash+profit,profit});}
    return rows.sort((a,b)=>b.cash-a.cash);
  }
  function restore(raw) {
    try {
      if(!raw||raw.version!==4||!Number.isInteger(raw.seed)||!Array.isArray(raw.actions)||raw.actions.length>20)return null;
      if(raw.role!=='collector'&&raw.theme!==null)return null;
      const clean=newGame(raw.role,raw.seed,raw.theme,{rulesVersion:savedRules(raw)});
      for(const action of raw.actions) {
        if(action.type==='inspect')useSkill(clean,action.index);
        else if(action.type==='open')openBidding(clean);
        else if(action.type==='bid')placeBid(clean,action.amount,action.pass===true);
        else if(action.type==='next')nextRound(clean);
        else if(action.type==='sell') {
          if(!action.selection||typeof action.selection!=='object')return null;
          settle(clean,action.mode,action.selection);
        } else return null;
      }
      clean.selected=Number.isInteger(raw.selected)&&raw.selected>=0&&raw.selected<clean.items.length?raw.selected:0;
      if(clean.phase!==raw.phase)return null;return clean;
    } catch {return null;}
  }
  function sessionSeed(seed,auctionNumber) {
    // A crate's contents depend only on its original seed and ordinal, never on wealth or role.
    if(auctionNumber===1)return seed>>>0;
    let value=(seed+Math.imul(auctionNumber-1,0x9E3779B9))>>>0;
    value=Math.imul(value^(value>>>16),0x21F0AAAD);value=Math.imul(value^(value>>>15),0x735A2D97);
    return (value^(value>>>15))>>>0;
  }
  function sessionGame(session) {
    return newGame(session.role,sessionSeed(session.seed,session.auctionNumber),session.theme,{
      startingCash:session.cash,
      botCash:session.players.slice(1).map(player=>player.cash),
      botThemes:session.players.slice(1).map(player=>player.theme),
      botRoles:session.players.slice(1).map(player=>player.role),
      rulesVersion:session.rulesVersion??1,
      instancePrefix:`${session.seed}-${session.auctionNumber}-${sessionSeed(session.seed,session.auctionNumber)}`
    });
  }
  function newSession(role,seed,theme='harbor',options={}) {
    // Validate the original metadata through the same constructor as a single crate.
    const rulesVersion=validateRules(options.rulesVersion??RULES_VERSION);
    const first=newGame(role,seed,theme,{rulesVersion});
    const opening=startingCashFor(rulesVersion);
    const players=[{id:'you',name:'You',role,theme:first.theme,cash:opening,profit:0},...first.bots.map(bot=>({id:bot.id,name:bot.name,role:bot.role,theme:bot.theme,cash:opening,profit:0}))];
    const session={version:5,rulesVersion,seed:seed>>>0,role,theme:first.theme,auctionNumber:1,history:[],cash:opening,players,ended:false,actions:[],game:null};
    session.game=sessionGame(session);return session;
  }
  function commitAuction(session) {
    if(session.game.phase!=='result'||session.history.length===session.auctionNumber)return;
    if(session.history.length!==session.auctionNumber-1)throw new Error('This auction has already been settled.');
    const closing=standings(session.game),byId=new Map(closing.map(player=>[player.id,player]));
    session.players=session.players.map(player=>{const settled=byId.get(player.id);return {...player,cash:settled.cash,profit:settled.cash-startingCashFor(session.rulesVersion??1)};});
    session.cash=session.game.receipt.cash;
    const winningBid=session.game.winner?session.game.history.at(-1).bids.find(bid=>bid.id===session.game.winner).bid:0;
    session.history.push({auctionNumber:session.auctionNumber,winner:session.game.winner,paid:winningBid,humanPaid:session.game.receipt.paid,profit:session.game.receipt.profit,cash:session.cash,recovery:session.game.receipt.recovery,players:session.players.map(player=>({...player,auctionProfit:byId.get(player.id).profit})),...(session.game.reservePrice>0?{reservePrice:session.game.reservePrice}:{})});
    if(session.cash===0)session.ended=true;
  }
  function plainObject(value) {return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
  function exactKeys(value,keys) {return plainObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
  function sessionAction(type,payload) {
    if(!plainObject(payload))throw new Error('Choose a valid session action.');
    if(['open','back','next','continue','finish'].includes(type)) {
      if(!exactKeys(payload,[]))throw new Error('Choose a valid session action.');
      return {type};
    }
    if(type==='inspect') {
      if(!exactKeys(payload,['index'])||!Number.isInteger(payload.index))throw new Error('Select an object first.');
      return {type,index:payload.index};
    }
    if(type==='bid') {
      if(!exactKeys(payload,['amount','pass'])||typeof payload.pass!=='boolean'||(payload.pass?payload.amount!==null:!Number.isSafeInteger(payload.amount)))throw new Error('Choose a valid bid action.');
      return {type,amount:payload.amount,pass:payload.pass};
    }
    if(type==='sell') {
      if(!exactKeys(payload,['mode','selection'])||!['ordinary','special'].includes(payload.mode)||!plainObject(payload.selection))throw new Error('Choose a valid sale action.');
      const keys=Object.keys(payload.selection);
      if(keys.some(key=>!['repairIds','pairIds','abilityIds'].includes(key))||keys.some(key=>!Array.isArray(payload.selection[key])||payload.selection[key].some(id=>typeof id!=='string')))throw new Error('Choose valid processing options.');
      return {type,mode:payload.mode,selection:clone(payload.selection)};
    }
    throw new Error('Choose a valid session action.');
  }
  function applySessionAction(session,action) {
    if(session.ended)throw new Error('This auction session has ended.');
    if(action.type==='inspect') {
      const previous=session.game.actions.length;useSkill(session.game,action.index);
      // Rereading a note or the public object changes no state and needs no replay entry.
      if(session.game.actions.length===previous)return;
    }
    else if(action.type==='open')openBidding(session.game);
    else if(action.type==='back') {
      if(session.actions.at(-1)?.type!=='open')throw new Error('You can return to inspection only before revealing bids.');
      returnToInspection(session.game);
      // Keep canceled form visits out of the durable replay, so opening and
      // returning cannot consume the run's saved-history allowance.
      session.actions.pop();return;
    }
    else if(action.type==='bid') {placeBid(session.game,action.amount,action.pass);commitAuction(session);}
    else if(action.type==='next')nextRound(session.game);
    else if(action.type==='sell') {settle(session.game,action.mode,action.selection);commitAuction(session);}
    else if(action.type==='continue') {
      if(session.game.phase!=='result'||session.history.length!==session.auctionNumber)throw new Error('Settle the current crate before continuing.');
      // Reserve one continuation, up to eleven crate actions, and a final exit.
      if(session.actions.length+13>MAX_SESSION_ACTIONS)throw new Error('This session has reached its saved history limit. Finish this run to start a new one.');
      session.auctionNumber++;session.game=sessionGame(session);
    } else if(action.type==='finish') {
      if(session.game.phase!=='result'||session.history.length!==session.auctionNumber)throw new Error('Settle the current crate before leaving.');
      session.ended=true;
    }
    session.actions.push(clone(action));
  }
  function performSession(session,type,payload={}) {
    if(!session||session.version!==5)throw new Error('Start a valid auction session.');
    const action=sessionAction(type,payload),draft=clone(session);
    applySessionAction(draft,action);
    // Invalid actions never partially change bids, cash, settlement, or the replay log.
    Object.assign(session,draft);return session;
  }
  function sessionStandings(session) {
    if(!session||session.version!==5)throw new Error('Start a valid auction session.');
    return clone(session.players).sort((a,b)=>b.cash-a.cash||['you','bot-0','bot-1','bot-2'].indexOf(a.id)-['you','bot-0','bot-1','bot-2'].indexOf(b.id));
  }
  function restoreSession(raw) {
    try {
      if(!raw||raw.version!==5||!Array.isArray(raw.actions)||raw.actions.length>MAX_SESSION_ACTIONS||!Number.isInteger(raw.seed))return null;
      if(raw.role!=='collector'&&raw.theme!==null)return null;
      const session=newSession(raw.role,raw.seed,raw.theme,{rulesVersion:savedRules(raw)});
      for(const source of raw.actions) {
        if(!plainObject(source)||typeof source.type!=='string')return null;
        const {type,...payload}=source;
        // Normalize and validate every field, including skipped bid amounts and sale targets.
        const action=sessionAction(type,payload);applySessionAction(session,action);
      }
      const selected=raw.game?.selected;
      session.game.selected=Number.isInteger(selected)&&selected>=0&&selected<session.game.items.length?selected:0;
      return session;
    } catch {return null;}
  }
  return {STARTING_CASH,startingCashFor,CRATE_SIZE,MAX_SESSION_ACTIONS,RULES_VERSION,ROLES,THEMES,SOURCES,ITEMS,SHAPES,rng,catalogFor,catalogItems,catalogWeight,abilityEligibility,abilitySelectionLimit,inspect,salePlan,valuationBoard,computerBids,newGame,useSkill,openBidding,returnToInspection,resolveRound,placeBid,nextRound,settle,standings,restore,getCash,newSession,performSession,sessionStandings,restoreSession};
});
