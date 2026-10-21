/* One live language preference for both solo practice and multiplayer. */
(() => {
  'use strict';
  const STORAGE_KEY = 'secondvalue:language';
  function canonicalLanguage(value) {
    if(typeof value !== 'string')return null;
    const code=value.trim().toLowerCase().replace(/_/g,'-');
    if(code==='zh'||code.startsWith('zh-'))return 'zh-CN';
    if(code==='en'||code.startsWith('en-'))return 'en';
    if(code==='es'||code.startsWith('es-'))return 'es';
    return null;
  }
  function savedLanguage() {
    try { return canonicalLanguage(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }
  let language = canonicalLanguage(new URLSearchParams(location.search).get('lang')) || savedLanguage() || 'en';
  const words = {
    'The Salvager':'拆解师', 'Salvager':'拆解师', 'THE SALVAGER':'拆解师',
    'The Curator':'策展人', 'Curator':'策展人', 'THE CURATOR':'策展人',
    'Antique Dealer':'古董商', 'Dealer':'古董商', 'ANTIQUE DEALER':'古董商', 'DEALER':'古董商',
    'The Broker':'古董商', 'Broker':'古董商', 'THE BROKER':'古董商',
    'Parts harvest':'零件回收', 'Pop-up exhibition':'限时展览', 'Customer order':'熟客订单',
    'Even a fake can have useful parts.':'即使是赝品，也有可用的零件。',
    'After winning, dismantle up to two reproductions. Each costs 15 to process and sells for a fixed 90.':'得标后可拆解最多两件赝品，每件支付 15 处理费，并以固定的 90 出售零件。',
    'One ability: harvest parts from up to two reproductions after purchase. Genuine objects sell normally.':'专属能力：买入后从最多两件赝品中回收零件，真品按普通价格出售。',
    'Genuine objects cannot be harvested. Each salvage gains only 5 to 55 in this catalog.':'真品不能拆解回收；当前图鉴中，单件回收仅能净增值 5 至 55。',
    'Three different stories make an exhibition.':'三个不同的故事，组成一场展览。',
    'Exhibit exactly three genuine, intact objects from different categories. Pay 25 and earn a capped bonus on each.':'展出三件品类各不相同的完好真品，支付 25 费用，获得每件有上限的展览奖金。',
    'One ability: exhibit three eligible objects together. Each earns 20% of its base value, capped at 40.':'专属能力：将三件符合条件的物品一起展出，每件获得基础售价 20% 的奖金，单件最多 40。',
    'You need three different categories and enough cash to pay the fee first. The net bonus is at most 95.':'需要凑齐三种品类，并先备足现金支付费用；扣费后最多多赚 95。',
    'Buy at auction. Sell to regulars.':'拍场收货，熟客买单。',
    'After winning, sell one genuine, intact object to a regular customer. They pay 30% extra, up to 90; packing and delivery cost 25.':'得标后可将一件完好真品卖给熟客，额外获得基础售价 30% 的溢价，最多 90；包装配送费为 25。',
    'One ability: sell one eligible object to a regular customer after winning. Other objects sell normally.':'专属能力：得标后将一件符合条件的物品卖给熟客，其他物品按普通价格出售。',
    'Pay packing and delivery first. The extra profit is at most 65; low-value sales may lose money.':'先支付包装配送费，扣费后最多多赚 65；低价值物品可能因费用而少赚甚至亏损。',
    'Ability bonus':'能力奖金', 'Processing fees':'处理费用', 'Ability selection:':'能力所选物品：',
    'Net gain vs ordinary sale':'相较普通出售的净收益', 'Choose objects for your ability':'选择能力要处理的物品',
    'No eligible objects for this ability. Sell at ordinary prices.':'本箱没有符合此能力条件的物品，请按普通价格出售。',
    'No objects selected. Ordinary sale applies with no ability fee.':'尚未选择物品，将按普通价格出售，不收取能力费用。',
    'Parts sale price':'零件售价', 'Parts fee':'拆解费用', 'Net parts gain':'零件回收净增值',
    'Exhibition bonus':'展览奖金', 'Customer premium':'熟客溢价', 'Packing & delivery':'包装配送费', 'selected':'已选',
    'Six roles. One shared auction.':'六种角色，同场竞拍。',
    'Choose up to two reproductions. Each sells for 90, with a 15 processing fee.':'最多选择两件赝品，每件以 90 出售，并支付 15 处理费。',
    'Choose exactly three genuine, intact objects from different categories. Pay one 25 fee.':'选择三件品类各不相同的完好真品，一次支付 25 费用。',
    'Choose one genuine, intact object. Packing and delivery cost 25; a low-value customer sale can lose money.':'选择一件完好真品卖给熟客，包装配送费为 25；低价值物品可能因费用而亏损。',
    'Exhibition bonus: 20% per object, rounded down, up to 40 each.':'展览奖金：每件基础售价的 20%，向下取整，每件最多 40。',
    'Customer premium: 30% of base price, rounded down, up to 90.':'熟客溢价：基础售价的 30%，向下取整，最多 90。',
    'Nothing is selected automatically. Compare the net gain before confirming.':'物品不会自动选中，请先比较净收益，再确认。',
    'Unselected objects fund fees first; selected objects cannot fund their own processing.':'未选择的物品会先出售以支付费用；所选物品在处理前不能用自身售价支付费用。',
    'Crate profit = sale proceeds + ability bonus − winning bid − processing fees.':'本箱盈亏 = 出售收入 + 能力奖金 − 成交价 − 处理费用。',
    'The Salvager sells up to two reproductions as parts. Each sale is 90 with a 15 fee; compare this with ordinary value.':'拆解师可将最多两件赝品拆成零件出售，每件售价 90、费用 15，请与普通售价比较。',
    'The Curator exhibits exactly three genuine, intact objects from different categories. Bonus is 20% per object, up to 40 each, with one 25 fee.':'策展人可展出三件品类各不相同的完好真品，奖金为每件基础售价的 20%，每件最多 40，一次收取 25 费用。',
    'The Antique Dealer sells one genuine, intact object to a regular customer for a 30% premium, up to 90. Packing and delivery cost 25, so low-value sales may lose money.':'古董商可将一件完好真品卖给熟客，获得基础售价 30% 的溢价，最多 90。包装配送费为 25，因此低价值物品可能因费用而亏损。',
    'Choose from six roles. Everyone shares the same bidding actions; each role has one exclusive ability.':'从六种角色中选择一种。所有人拥有相同的竞拍操作，每个角色另有一项专属能力。',
    'The Salvager harvests reproductions; the Curator exhibits three different categories; the Antique Dealer sells to a regular customer.':'拆解师回收赝品零件；策展人展出三种不同品类；古董商将藏品卖给熟客。',
    'Only the matching role can select ability objects.':'只有对应角色可以选择该能力的处理物品。',
    'Select at most two salvage objects.':'最多选择两件物品进行零件回收。',
    'Selected object cannot be salvaged.':'所选物品不符合零件回收条件。',
    'Not enough cash to pay the selected processing fees first.':'现金不足，无法预先支付所选处理费用；可减少选择或按普通价格出售。',
    'Select exactly three exhibition objects.':'展览需要恰好选择三件物品。',
    'Exhibition objects must be genuine, intact and from different categories.':'展品必须是完好真品，且三件物品的品类各不相同。',
    'Choose exactly one object to sell to your customer.':'请恰好选择一件卖给熟客的物品。',
    'Your customer buys only genuine, intact objects.':'熟客只收购完好真品。',
    'Choose valid locked computer roles.':'请选择有效的电脑固定角色。',
    'Language':'语言',
    'Create or join a multiplayer room →':'创建或加入联机房间 →',
    'DEMO 0.10':'测试版 0.10', 'STEP 10':'第十步',
    'DEMO 0.9':'测试版 0.9', 'STEP 09':'第九步',
    'Choose a valid rules revision.':'请选择有效的规则版本。',
    'Repair gains are capped. Paying too much can still turn a good repair into a loss.':'修复增值有上限，即使拍品值得修，买得太贵仍会亏损。',
    'DEMO 0.9':'测试版 0.9', 'STEP 09':'第九步',
    'If no sale: next round reveals the genuine count.':'若本轮未成交，下一轮公开真品数量。',
    'If no sale: next round reveals one identity and the repairable count.':'若本轮未成交，下一轮公开一件拍品身份及可修复件数。',
    'Another bidder may buy now. A next round opens only if this round does not sell.':'其他竞拍者可能立即买走。只有本轮未成交，才会进入下一轮。',
    'Another bidder may buy now. This is the final round.':'其他竞拍者可能立即买走，本轮已是最后一轮。',
    'More matching objects, smaller pair bonuses.':'符合主题的物品更多，成套奖金较低。',
    'Rarer matches, larger pair bonuses.':'成套机会较少，成套奖金较高。',
    'Saved session rules':'存档沿用的规则',
    'This saved session keeps its original rules. New sessions use the updated balance.':'本存档沿用原有规则；新开的拍卖采用调整后的规则。',
    'DEMO 0.8':'测试版 0.8', 'STEP 08':'第八步',
    'At the table':'竞拍席位',
    'Sealed bid':'密封报价', 'Your turn':'轮到你了',
    'Draft bid':'报价草稿', 'Bid revealed':'报价已公开',
    'Auctioneer’s manifest':'拍卖行货单',
    'Available after winning':'得标后可用',
    'Decrease bid by 25':'报价减少 25', 'Increase bid by 25':'报价增加 25',
    'YOUR AUCTION DESK':'你的竞价台',
    'Bids stay sealed until you confirm.':'确认前，所有报价保持密封。',
    'Computer bidder':'电脑竞拍者', 'Current round':'当前轮次',
    'DEMO 0.7':'测试版 0.7', 'STEP 07':'第七步',
    'Your clues. Your judgment. Your next move.':'掌握线索，作出判断，决定下一步。',
    'Review clues':'查看线索', 'Prepare your bid':'填写报价',
    'Bids revealed':'报价已公开', 'Sell your crate':'出售拍品',
    'Settled profit':'已结算盈亏',
    'SELECTED OBJECT':'当前拍品',
    'Authenticity':'真假', 'Identity':'身份',
    'Condition & ability details':'品相与能力相关信息',
    'Only the silhouette is confirmed. Exact identity, condition and value remain hidden.':'目前只确认了轮廓，具体身份、品相与价值仍未揭晓。',
    'Possible catalog matches':'图鉴中的可能物品',
    'These are possibilities, not a confirmed identity.':'以下仅为可能的物品，并非已确认的身份。',
    'Read this object’s confirmed details above.':'可在上方查看这件拍品的已确认信息。',
    'Choose an object, then authenticate it. Two uses for this entire crate.':'先选择一件拍品，再进行验真。本箱共可使用两次。',
    'Your offer':'你的报价',
    'Inspect or make an offer':'验真或准备报价',
    'Ready to make an offer?':'准备好报价了吗？',
    'Tie priority':'同价优先顺序',
    'The auction table':'拍品陈列台', 'Round rules':'本轮规则',
    'Ties follow the priority shown in your action panel.':'报价相同时，按操作区中显示的优先顺序决定胜者。',
    'Choose an object to see its details.':'选择拍品，查看详情。',
    'Selected object details ↓':'查看当前拍品详情 ↓',
    'Confirmed notes':'已确认线索',
    'Previous round bids':'往轮报价',
    '03 / PROCESS & SELL':'03 / 处理与出售',
    '04 / SESSION RESULT':'04 / 本次结算',
    'NEXT ROUND':'下一轮',
    'Choose how to sell':'选择出售方式',
    'Your settlement':'你的结算', 'Next move':'下一步',
    'Review processing choices, then settle this crate.':'核对处理方式，再确认本箱结算。',
    'Latest crate receipt':'最近一箱账单',
    'DEMO 0.6':'测试版 0.6', 'STEP 06':'第六步',
    'Take your time. Review before you reveal.':'慢慢判断，确认后再揭晓。',
    'Six objects. One decision.':'六件拍品，一次抉择。',
    'Your auction controls':'你的拍卖操作',
    '01 / REVIEW THE CLUES':'01 / 查看线索',
    '02 / PREPARE YOUR BID':'02 / 填写报价',
    'Prepare a bid →':'填写报价 →',
    'Opening the bid form submits nothing. You can come back.':'打开报价表单不会提交报价，随时可以返回。',
    '← Return to clues':'← 返回查看线索',
    'Return to clues':'返回查看线索',
    'Return to clues to use any remaining inspections. Used inspections stay used.':'返回查看线索后，可继续使用剩余验真次数；已用次数不会恢复。',
    'Your notes stay available. Return to clues to inspect.':'已有线索仍可查看，返回线索页可继续验真。',
    'Your private notes':'你的私人线索',
    'Your role ability':'你的角色能力',
    'Other bidders · 3 computers':'其他竞拍者 · 3 名电脑',
    'COINS':'虚拟币',
    'Cash after purchase':'购入后剩余现金',
    'Before sale proceeds and ability costs.':'尚未计入出售收入与能力费用。',
    'Nothing is submitted yet. Review your offer before revealing bids.':'报价尚未提交，请先核对，再揭晓所有报价。',
    'Review bid →':'核对报价 →',
    'Pass this round':'跳过本轮',
    'Review your action':'核对本次操作',
    'Leave this session?':'确定离场结算吗？',
    'Pass this round?':'确定跳过本轮吗？',
    'Ready to reveal your bid?':'确认报价并揭晓吗？',
    'Your choice':'你的选择',
    'PASS':'跳过本轮',
    'Your completed auctions stay final. You can keep playing by going back.':'已完成拍卖的结果保持不变，返回后可以继续参与拍卖。',
    'You will make no offer this round. Confirming reveals all bids immediately.':'本轮你将不出价，确认后立即揭晓所有报价。',
    'Confirming reveals all bids immediately. This round cannot be withdrawn after reveal.':'确认后立即揭晓所有报价，揭晓后本轮报价无法撤回。',
    'SESSION EXIT':'离场结算',
    'NOT SUBMITTED YET':'尚未提交',
    'Skipping a round does not stop you joining the next one.':'跳过本轮后，若竞拍继续，仍可参加下一轮。',
    'After reveal, bids and passes are final for this round.':'揭晓后，本轮的出价或跳过决定均无法撤回。',
    'Keep playing':'返回继续拍卖',
    'Cancel pass':'取消跳过',
    'Withdraw & edit':'撤回并修改',
    'Confirm exit':'确认离场',
    'Confirm pass & reveal':'确认跳过并揭晓',
    'Confirm & reveal bids':'确认出价并揭晓',
    'Before reveal, return to clues or withdraw the bid review to edit your amount. Used inspections stay used. Once revealed, bids and passes are final for that round.':'揭晓前，可以返回查看线索，或撤回报价核对以修改金额；已用验真次数不会恢复。揭晓后，本轮的出价或跳过决定均无法撤回。',
    'You can return to inspection only before revealing bids.':'只有在报价揭晓前，才能返回查看线索。',
    'DEMO 0.5':'测试版 0.5', 'STEP 05':'第五步',
    'Another crate. The same bankroll. Know when to leave.':'拍卖继续，本金相承，也要懂得何时离场。',
    'CONTINUOUS AUCTIONS · 1,000 STARTING COINS':'连续拍卖 · 起始本金 1,000 虚拟币',
    'CONTINUOUS AUCTIONS':'连续拍卖', 'SESSION FINISHED':'本次拍卖已结束',
    'Session progress':'连续拍卖进度', 'Completed crates':'已结算箱数', 'Total profit':'累计盈亏',
    'Finish this crate to continue or leave. Refreshing keeps your session.':'先完成本箱结算，再继续或离场。刷新后可恢复进度。',
    'Lock it before the session begins. Keep the same theme for every crate.':'开始连续拍卖前锁定主题，所有箱子沿用同一主题。',
    'Cash carries between crates. Continue or leave after any settled auction.':'现金会带入下一箱。每场拍卖结算后，可以继续或离场。',
    'Your role and collection theme stay locked for the session.':'本次连续拍卖期间，角色和收藏主题保持锁定。',
    'Continuous auctions now carry your cash. Start a new session with the updated rules.':'现已支持连续拍卖和现金继承。旧版单箱进度不兼容，请按新规则开始一场连续拍卖。',
    'This round did not sell. Everyone’s cash is unchanged.':'本轮没有成交，所有人的现金均不变。',
    'Cash:':'现金：', 'No cash · passing':'现金为零 · 跳过',
    'Cash before this crate':'本箱开始前现金', 'Cash after this crate':'本箱结算后现金',
    'Crate loss':'本箱亏损', 'Crate profit':'本箱盈利',
    'All objects are sold now. Your cash carries into the next auction; item storage comes later.':'所有物品均在本箱出售。现金可带入下一场拍卖，物品仓库之后再做。',
    'Confirm sale & settle crate →':'确认出售，结算本箱 →',
    'You passed this crate. Your cash is unchanged.':'你跳过了本箱，现金保持不变。',
    'Start a new session →':'开始新的连续拍卖 →',
    'Continue to the next auction →':'继续下一场拍卖 →',
    'Leave & settle session':'离场，结算本次拍卖',
    'AUCTION SETTLED':'本场拍卖已结算', 'Your session is settled.':'本次连续拍卖已结算。',
    'One crate down. Your next decision.':'一箱结束，下一步由你决定。',
    'Your final cash includes every completed auction. No extra payout is added.':'最终现金包含本次所有已完成拍卖的盈亏，离场不额外发钱。',
    'Carry your cash into another auction, or leave with your current balance.':'带着当前现金继续拍卖，或按现有余额离场结算。',
    'Current standings':'当前排名', 'Your session standing':'你在本次连续拍卖中的排名',
    'Ranking uses cumulative cash across this session.':'按本次连续拍卖累计的现金排名。',
    'A new session starts everyone at 1,000 coins. This session’s result stays final.':'开始新的连续拍卖时，所有人重新获得 1,000 本金。本次结果已经确定。',
    'The next crate has fresh objects and ability uses. Everyone keeps their own current cash.':'下一箱会生成新拍品并重置能力次数，所有人保留各自当前的现金。',
    'Reveal this crate & all bids':'查看本箱真相与全部报价',
    'SESSION TOTAL':'本次累计结算', 'Current cash':'当前现金',
    'Crate profit = sale proceeds + collection bonus − winning bid − workshop fees.':'本箱盈亏 = 出售收入 + 套装奖金 − 成交价 − 加工费用。',
    'Auction':'场次', 'Buyer':'买家', 'Your profit':'你的盈亏', 'Your cash':'你的现金', 'No sale':'流拍',
    'Everyone starts a new session with 1,000 virtual coins once. Cash, profits and losses carry between auctions for every player.':'每次开始新的连续拍卖时，所有人仅获得一次 1,000 虚拟币本金。每场的现金、盈利与亏损都会带入后续拍卖。',
    'Each crate contains six objects. Everyone shares ordinary sale prices, fixed before bidding.':'每箱包含六件拍品，所有角色的普通出售价格相同，并在竞拍前固定。',
    'Your role and collection theme stay locked for the session. Ability uses reset only when a new crate opens.':'本次连续拍卖期间，角色和收藏主题保持锁定；只有打开新箱时才重置能力次数。',
    'The Appraiser may identify two objects per crate across its three rounds. Known and public information is free to read.':'鉴定师每箱三轮共可验真两件物品，已知信息和公开信息可以免费重复查看。',
    'The Restorer may choose up to two repairs per crate after winning. Pay fees first; each net gain is capped at 25% of base value and 60 coins.':'修复师每箱得标后可选择修复最多两件物品，先支付费用；单件净增值不超过基础价值的 25%，且最多 60 虚拟币。',
    'The Collector may deliver one genuine pair per crate with different identities and categories in the locked theme. Bonus is 25% of the pair’s base values, up to 120.':'收藏家每箱可交付一组成套收藏：同属已锁定主题的两件真品，身份和品类均不同。奖金为两件基础价值合计的 25%，最多 120 虚拟币。',
    'Unsuccessful rounds reveal all bids and charge nothing. You may change or skip each round’s bid, up to your current cash.':'未成交的轮次会公开所有报价，不扣钱。每轮可以重新出价或跳过，报价不能超过当前现金。',
    'Finish selling the crate before continuing or leaving. All objects are sold; no inventory carries over yet.':'先出售本箱全部拍品并完成结算，再继续或离场。目前不保留物品库存。',
    'Leave after any settled auction to finalize cumulative cash and rankings. Leaving grants no refund or extra payout.':'任意一场拍卖结算后均可离场，确认累计现金与排名；离场不退款，也不额外发钱。',
    'Only the final buyer pays once. Computer quotes are fixed before your current bid and never exceed that computer’s own cash.':'只有最终买家付款一次。电脑的本轮报价在你出价前已经锁定，且不会超过该电脑自己的现金。',
    'Refreshing restores your session when browser storage is available.':'浏览器允许本地存储时，刷新可以恢复本次连续拍卖的进度。',
    'Choose valid locked computer themes.':'电脑锁定的收藏主题无效。',
    'This auction has already been settled.':'本场拍卖已经结算，请勿重复操作。',
    'Choose a valid session action.':'请选择有效的连续拍卖操作。',
    'Choose a valid bid action.':'请选择有效的报价操作。',
    'Choose a valid sale action.':'请选择有效的出售操作。',
    'This auction session has ended.':'本次连续拍卖已经结束。',
    'Settle the current crate before continuing.':'请先完成本箱结算，再继续下一场拍卖。',
    'Settle the current crate before leaving.':'请先完成本箱结算，再离场。',
    'Start a valid auction session.':'请开始一场有效的连续拍卖。',
    'This session has reached its saved history limit. Finish this run to start a new one.':'本次拍卖记录已达到存储上限，请先离场结算，再开始新的连续拍卖。',
    'DEMO 0.4':'测试版 0.4', 'STEP 04':'第四步',
    'Six objects. Limited clues. Choose what to inspect.':'六件拍品，有限线索，决定先查哪件。',
    'Each crate contains six objects. Ability limits stay at two appraisals, two repairs or one collection pair, depending on your role.':'每箱包含六件拍品。专属能力的上限不变：鉴定师验真两件、修复师修复两件、收藏家交付一组成套收藏。',
    'Crates now contain six objects. Start a new crate with the updated rules.':'每箱拍品现已增加到六件，请开始一箱新的拍卖，体验新版规则。',
    'One crate / six objects':'整箱竞拍 / 六件拍品',
    'Private note':'私人验真', 'Public reveal':'公开确认', 'Unconfirmed':'尚未确认',
    'Base price':'基础售价', 'Catalog range':'图鉴范围',
    'Confirmed information':'已确认信息', 'CONFIRMED INFORMATION':'已确认信息',
    'No objects confirmed yet. Catalog ranges describe possibilities, not actual prices.':'尚未确认任何拍品。图鉴范围表示可能的售价，并非本箱物品的实际价格。',
    'DEMO 0.3':'测试版 0.3', 'STEP 03':'第三步',
    'One role. One exclusive ability. Three bidding rounds.':'一个角色，一项专属能力，最多三轮竞价。',
    'Every role shares ordinary sale prices. Item values and repair records are fixed before bidding.':'所有角色的普通出售价格相同。物品价值和修复记录在竞拍前已经确定。',
    'The Appraiser may identify two objects across all rounds. Already known and publicly revealed information is free to read.':'鉴定师整箱可验真两件物品，所有轮次共用次数。已知信息和公开信息可以免费重复查看。',
    'The Restorer may choose up to two repairs after winning, paying fees before each repair. Each net gain is capped at 25% of base value and 60 coins.':'修复师得标后可选择修复最多两件物品，每次修复前先支付费用。单件净增值不超过基础价值的 25%，且最多 60 虚拟币。',
    'The Collector locks a theme before starting. Deliver one genuine pair with different identities and categories for a bonus of 25% of the pair’s base values, up to 120.':'收藏家开局前锁定一个主题。交付两件身份不同、品类不同的同主题真品，获得两件基础价值合计 25% 的奖金，最多 120 虚拟币；每箱限一组。',
    'Round 1 starts with silhouettes. Round 2 reveals the genuine-object count. Round 3 reveals one object’s full identity and the repairable count.':'第一轮只看轮廓；第二轮公开真品数量；第三轮公开一件物品的完整信息，以及本箱可修复物品的总数。',
    'Choose your collection theme':'选择收藏主题',
    'Lock it before the crate is generated. One matching pair per crate.':'拍品生成前锁定主题，每箱最多交付一组成套收藏。',
    'Locked theme:':'已锁定主题：', 'Railway':'铁路主题',
    'The role rules have changed. Start a new crate to use the updated abilities.':'角色规则已更新，请开始一箱新的拍卖，体验新版专属能力。',
    'Public catalog · possible identities and prices':'公开图鉴 · 可能的身份与售价',
    'Your ability is used after winning. Judge this crate from public clues.':'你的专属能力在得标后使用，请根据公开线索判断本箱价值。',
    'Compare silhouettes with the public catalog.':'对照轮廓，查看公开图鉴。',
    'Review the public clues and possible identities before bidding.':'出价前，查看公开线索和可能的物品身份。',
    'Review clues & bid →':'看完线索，开始出价 →',
    'Intact':'完好', 'Damaged':'残损', 'Unrepairable':'无法修复',
    'No collection theme':'无收藏主题', 'Workshop fee':'修复费用',
    'Restored sale price':'修复后售价', 'Net repair gain':'修复净增值',
    'Repair selected objects':'修复所选物品', 'Deliver selected collection':'交付所选收藏',
    'Repairs selected:':'所选修复：', 'Collection pair:':'成套收藏：',
    'Choose up to two repairs. Fees must be funded before each repair.':'最多选择两件修复，每次修复前必须有足够现金支付费用。',
    'Choose one genuine pair in your locked theme, with different identities and categories.':'选择一组已锁定主题的真品，要求两件物品的身份和品类均不同。',
    'Sell at ordinary prices':'按普通价格出售', 'Every role receives the same base prices.':'所有角色均按相同的基础售价出售。',
    'Complete a valid selection to see its receipt. Ordinary sale totals are shown below.':'请完成有效选择后查看对应账单。下方暂时显示普通出售的金额。',
    'Choose repairs':'选择修复物品',
    'Unselected objects sell first to fund fees. Each selected object is repaired once and then sold.':'未选择的物品会先出售，用于支付修复费；每件所选物品只修复一次，随后出售。',
    'No eligible repairs in this crate. Sell at ordinary prices.':'本箱没有符合条件的可修复物品，请选择按普通价格出售。',
    'At most 60 extra per object and 120 per crate. The actual gain also cannot exceed 25% of an object’s base price.':'单件最多净增值 60，每箱最多 120，且单件净增值不超过其基础价值的 25%。',
    'Choose a collection pair':'选择成套收藏',
    'No genuine objects match your locked theme.':'本箱没有符合已锁定主题的真品。',
    'One pair only. Bonus is 25% of the pair’s base prices, rounded down, up to 120. Each object is sold once.':'每箱限一组。奖金为两件基础价值合计的 25%，向下取整，最多 120；每件物品只出售一次。',
    'After winning, choose up to two genuine damaged objects to repair. Pay their fixed fees before selling.':'得标后，选择修复最多两件残损真品，先支付固定修复费，再出售。',
    'Precision repair':'精修',
    'One ability: repair up to two eligible objects after purchase. No private inspection.':'专属能力：得标后修复最多两件符合条件的物品，没有拍卖前的私人鉴定。',
    'Fees need cash, and a repairable object can still be overpriced.':'需要现金支付修复费；即使能修，也可能因为买得太贵而亏损。',
    'Privately identify up to two objects across all three rounds. Ordinary sale prices are the same for everyone.':'三轮共可私下验真两件物品，普通出售价格与所有角色相同。',
    'Reveal one object’s identity, authenticity, condition, category, theme and exact base price.':'确认一件物品的身份、真假、品相、品类、主题，以及准确的基础售价。',
    'Lock a theme before bidding. Deliver one pair of genuine objects with different identities and categories for a capped bonus.':'竞拍前锁定一个主题，交付两件身份不同、品类不同的同主题真品，获得有上限的套装奖金。',
    'Set delivery':'成套交付',
    'One ability: deliver one matching pair after purchase. Your chosen theme stays locked.':'专属能力：得标后交付一组成套收藏，开局选择的主题全程锁定。',
    'A crate may contain no valid pair for your chosen theme.':'本箱可能凑不出符合你所选主题的一组收藏。',
    'mechanical':'机械器物', 'ceramic':'陶瓷器物', 'insignia':'徽章勋章',
    'imaging':'摄影器材', 'instrument':'仪器电器', 'document':'纸本文书',
    'intact':'完好', 'damaged':'残损', 'unrepairable':'无法修复', 'None':'无收藏主题',
    'Choose a valid collection theme.':'请选择有效的收藏主题。',
    'Unknown object appearance.':'未知的物品轮廓。',
    'Only the appraiser has a private inspection ability.':'只有鉴定师拥有拍卖前的私人验真能力。',
    'Choose a list of object IDs.':'请选择要处理的物品。',
    'Select each object only once.':'每件物品只能选择一次。',
    'Select valid objects.':'请选择有效物品。',
    'Available cash must be a nonnegative whole number.':'可用现金必须是非负整数。',
    'Choose valid processing options.':'请选择有效的处理方式。',
    'The crate must contain distinct valid objects.':'本箱必须包含不同且有效的物品。',
    'Only the restorer can select repairs.':'只有修复师可以选择修复物品。',
    'Only the collector can select a pair.':'只有收藏家可以选择成套收藏。',
    'Processing requires the special sale method.':'请先选择专属出售方式，再处理物品。',
    'Select at most two repairs.':'最多选择两件物品进行修复。',
    'Selected object cannot be repaired.':'所选物品不符合修复条件。',
    'Not enough cash to pay the selected repair fees first.':'现金不足，无法预先支付所选物品的修复费用；可减少修复件数或直接出售。',
    'Select at most one collection pair.':'每箱最多选择一组成套收藏。',
    'Select exactly two collection objects.':'成套交付需要选择两件收藏物品。',
    'The selected objects do not form a valid pair for your locked theme.':'所选物品无法组成已锁定主题的一套收藏，请检查真假、品类和身份。',
    'Choose a valid game seed.':'本次拍品编号无效，请重新开始。',
    'Invalid auction round.':'竞拍轮次无效。',
    'The next round is not available.':'当前无法进入下一轮。',
    'Finish this auction first.':'请先完成本场拍卖。',
    'Second Value':'余价拍卖行', 'Second Value home':'余价拍卖行首页',
    'THE OLD HARBOR AUCTION HOUSE':'旧港旧物拍卖所', 'LOCAL PRACTICE':'本地测试', 'DEMO 0.1':'测试版 0.1', 'DEMO 0.2':'测试版 0.2',
    'STEP 02':'第二步', 'One crate. Three bidding rounds. Choose your moment.':'同一箱拍品，最多三轮竞价，选择你的出手时机。',
    'One crate lasts up to three bidding rounds. Your two skill uses are shared across all rounds.':'同一箱最多竞拍三轮，两次技能机会贯穿整箱，不会每轮恢复。',
    'Round 1 starts with silhouettes. Round 2 reveals the genuine-object count. Round 3 reveals one object’s identity and base price.':'第一轮只有轮廓；第二轮公开真品数量；第三轮公开一件物品的身份、基础售价，以及可修复物品总数。',
    'Early sale needs at least 1.8× the runner-up in round 1, or 1.3× in round 2. The highest bid wins round 3.':'第一轮最高价至少达到第二名的 1.8 倍、第二轮达到 1.3 倍，可提前成交；第三轮价高者得。',
    'Unsuccessful rounds reveal all bids and charge nothing. You can raise, lower or skip each round’s bid.':'未成交的轮次会公开所有报价，不扣钱。下一轮可以加价、降价，或暂时跳过。',
    'Only the final buyer pays once. Computers use their role’s limited information and previous public bids; each round’s computer quotes are fixed before you submit yours.':'只有最终买家付款一次。电脑依据职业有限情报和之前公开的报价决策，本轮电脑报价在你提交前就已锁定。',
    'Solo practice uses computer bidders. Trading, item storage and a timer are not included.':'单人练习使用电脑对手，暂不包含交易、仓库或倒计时。',
    'Only silhouettes are visible at first. Authenticity and prices are unconfirmed.':'第一轮只公开物品轮廓，真假与售价尚未确认。',
    'Final round: the highest bid wins. Ties follow the published priority.':'最后一轮：最高价者得标，同价按已公开的优先顺序判定。',
    'Previous round bids':'往轮公开报价', 'PUBLIC BID HISTORY':'往轮公开报价', 'PUBLIC BID HISTORY · NO PAYMENT YET':'往轮公开报价 · 尚未扣款',
    'Round':'轮次', 'No hammer. Not yet.':'尚未落槌，竞拍继续。',
    'Nobody has paid. These are the bids everyone can now see.':'本轮没有成交，也没有扣款。以下报价现在对所有人公开。',
    'WHY THE AUCTION CONTINUES':'为什么没有成交', 'No offers were made in this round.':'本轮没有人报价。',
    'Next: the manifest reveals how many objects are genuine.':'下一轮：公开本箱真品的数量。',
    'Next: one object’s identity and base price will be revealed.':'下一轮：公开一件物品的身份与基础售价。',
    'Previous bids are not charges or minimums. You may raise, lower, or skip your next bid.':'之前的报价不扣款，也不是下一轮的最低价。可以根据新线索重新加价、降价或跳过。',
    'Next-round early hammer: 1.3× the runner-up.':'下一轮提前落槌条件：最高价至少达到第二名的 1.3 倍。',
    'Next round is final: highest bid wins.':'下一轮是最后一轮，价高者得。',
    'Public identity confirmed':'身份已公开',
    'This round’s inspection is closed. Any unused skills carry into the next round.':'本轮鉴定已结束。未使用的技能次数可以留到下一轮。',
    'Two skill uses for all three rounds. Spend them now, or save them for later.':'整箱三轮共用两次技能。可以现在使用，也可以留待后面的轮次。',
    'Only the final buyer pays. Skipping a round does not stop you joining the next one.':'只有最终成交才扣钱。跳过本轮，下一轮仍然可以参与。',
    'Lock round bid':'锁定本轮报价', 'No sale. Everyone keeps their cash.':'流拍，所有人保留现金。',
    'Early hammer. This crate sold before the final round.':'提前落槌：本箱在最后一轮之前已成交。',
    'The final round decided the sale.':'最终轮落槌，按最高报价成交。',
    'The final round had no bids. Nothing was charged.':'最后一轮没有人报价，本箱流拍，不扣款。',
    'STEP 01':'第一步', 'One crate. Three computer bidders. Your judgment.':'一箱拍品，三个电脑对手，由你判断价值。',
    'How to play':'玩法说明', 'Different eyes. Different value.':'不同眼光，不同价值。',
    'Virtual coins · No chat required · Local, not multiplayer yet':'虚拟币 · 无需聊天 · 本地测试，暂未联机',
    'THE RULES':'游戏规则', 'Close':'关闭', 'Buy with a reason.':'想清楚再买，', 'Know when to walk away.':'也要懂得放弃。',
    'Choose a role. Everyone begins with 1,000 virtual coins.':'选择角色，每位玩家都有 1,000 虚拟币本金。',
    'Inspect three unidentified objects. Your role gives you two skill uses.':'查看三件身份未知的拍品，每个角色有两次技能使用机会。',
    'Bid secretly for the entire crate, or pass. The highest bid wins and pays its own bid.':'秘密竞拍整箱，或选择放弃。最高价者得标，按自己的报价付款。',
    'Ties follow the priority order shown before bidding.':'最高报价相同时，按出价前公开的优先顺序决定胜者。',
    'If you win, reveal the objects and choose how to sell them. Sale proceeds minus your bid and fees determine your profit or loss.':'得标后开箱并选择出售方式。出售收入减去成交价和加工费用，就是本场盈亏。',
    'The highest final cash wins this one-auction practice. Tied players share the win.':'这次测试只有一场拍卖，最终现金最多者获胜，相同则并列获胜。',
    'This first demo has no timer, item storage, trading or network rooms. Computer bids are generated before you bid, using the public catalog and one role-specific inspection. They do not react to your bid.':'当前测试版没有倒计时、仓库、交易或联机房间。电脑根据公开图鉴和一次职业鉴定，在你出价前生成报价，不会根据你的报价临时加价。',
    'Refreshing restores your practice when browser storage is available.':'浏览器允许本地存储时，刷新可以恢复测试进度。',
    'This demo needs JavaScript enabled.':'请启用 JavaScript 后试玩。',
    'YOUR EDGE IS A CHOICE':'选择你的赚钱方式', 'Same crate.':'同一箱东西，', 'A different kind of value.':'在你眼里另有价值。',
    'Some see damage. Some see a fake. Some see the missing piece. Choose your role and find out what you are willing to pay.':'有人看见残损，有人识破赝品，也有人找到缺少的收藏。选一个角色，决定你愿意为这箱东西出多少钱。',
    '1 AUCTION · 1,000 STARTING COINS':'单场拍卖 · 本金 1,000 虚拟币',
    'The Restorer':'修复师', 'Restorer':'修复师', 'THE RESTORER':'修复师',
    'The Appraiser':'鉴定师', 'Appraiser':'鉴定师', 'THE APPRAISER':'鉴定师',
    'The Collector':'收藏家', 'Collector':'收藏家', 'THE COLLECTOR':'收藏家',
    'Find the value beneath the damage.':'修复旧物，挖掘残损之下的价值。',
    'Repair eligible finds, pay the workshop fee, then sell at their restored value.':'修复符合条件的旧物，支付加工费后，按修复后的价格出售。',
    'Workshop eye':'精准诊断',
    'Inspect one object’s repair eligibility, fee and restored sale price.':'确认一件拍品能否修复、修复费用，以及修复后的售价。',
    'A repairable object can still be an overpriced purchase.':'即使能修，也可能因为买得太贵而亏损。',
    'Know what everyone else is guessing.':'别人还在猜，你已经掌握线索。',
    'Earn 10% more on genuine objects. Reproductions receive no bonus.':'真品出售收入增加 10%，赝品没有加成。',
    'Authenticate':'验真', 'Identify one object, its authenticity and its exact base sale price.':'确认一件拍品的身份、真假，以及准确的基础售价。',
    'Better information does not protect you from overbidding.':'信息更准确，也不能保证高价买入不会亏损。',
    'The missing piece changes everything.':'缺少的那一件，会改变整套收藏的价值。',
    'Sell two distinct, genuine Old Harbor pieces together for an extra 240.':'两件不同的旧港主题真品成套出售，额外获得 240 虚拟币。',
    'Collection sense':'寻套', 'Discover how many genuine Old Harbor pieces are inside the crate.':'确认本箱包含几件旧港主题真品。',
    'Without a matching pair, there is no collection bonus.':'凑不成一套，就拿不到收藏奖金。',
    'Your role stays locked until this practice ends.':'本次测试结束前，角色不能更换。',
    'These values are a first draft, not balanced competitive rules.':'当前数值为初稿，角色平衡还需试玩调整。',
    'Browser storage is unavailable. This practice will reset if you refresh.':'浏览器无法保存进度，刷新后本次测试会重置。',
    'Auction progress':'拍卖流程', 'Inspect':'鉴定', 'Bid':'出价', 'Reveal & sell':'开箱与出售', 'Result':'结算',
    'LOT 01 / 01 · UNCLAIMED PROPERTY':'第 1 / 1 箱 · 无主旧物',
    'Someone left it behind.':'有人遗忘的东西，', 'What do you see?':'你看见了什么价值？',
    'One crate / three objects':'整箱竞拍 / 三件拍品', 'MANIFEST PARTIALLY VERIFIED':'货单已部分核实', 'CONTENTS SEALED':'拍品尚未揭晓',
    'Clock-shaped object':'钟形旧物', 'Small ceramic object':'小型瓷器', 'Metal insignia':'金属徽记',
    'Camera-shaped object':'相机形旧物', 'Radio-shaped object':'收音机形旧物', 'Folded paper document':'折叠纸质文书',
    'Identity unknown':'身份未知', 'Select an object to inspect.':'点击一件拍品作为鉴定目标。',
    'Bid for the entire crate.':'报价对应整箱拍品。', 'Inspection is closed. Previous clues remain available.':'鉴定阶段已结束，仍可查看已有线索。',
    'AUCTIONEER’S NOTE · CONFIRMED':'拍卖师公开线索 · 已确认', 'Target: the whole crate':'技能目标：整箱拍品',
    'Information already confirmed':'已确认这条信息',
    'No private information for this target yet. You may inspect it, choose another object, or keep both uses.':'还没有该目标的私人线索。可以使用技能、更换目标，或保留使用次数。',
    'No private note for this object. Inspection is closed; confirmed notes remain available on their objects.':'没有这件拍品的私人线索。鉴定阶段已结束，可切换目标查看之前确认的信息。',
    'No private note for this object. Both inspection uses are spent.':'没有这件拍品的私人线索，两次鉴定机会已用完。',
    'Available cash':'可用现金', 'ROLE LOCKED':'角色已锁定', 'Take your time. This local practice has no countdown.':'可以慢慢判断，当前测试没有倒计时。',
    'Finish inspection & bid →':'结束鉴定，开始出价 →',
    'Public catalog · possible base prices':'公开图鉴 · 可能的基础售价范围',
    'Ranges cover catalog possibilities, not a guaranteed sale quote for this crate. Role bonuses and workshop fees are separate.':'区间来自图鉴中的可能物品，不代表本箱的保底售价。角色加成与加工费另行计算。',
    'AT YOUR TABLE':'同场竞拍者', 'THE SEALED BIDS':'全部报价', 'Computer · sealed':'电脑 · 报价保密',
    'You':'你', 'Marlow':'马洛', 'Finch':'芬奇', 'Vale':'维尔', 'Passed':'已放弃',
    'Tie priority, fixed before bidding:':'同价优先顺序，出价前已确定：',
    'Your sealed bid':'你的秘密报价', 'Whole crate':'整箱价格', 'Adjust bid':'调整报价',
    'Highest bid wins and pays that amount. Everyone else keeps their cash.':'最高价者得标并支付自己的报价，其他人不扣钱。',
    'Lock bid & reveal':'锁定报价并揭晓', 'Pass':'跳过本轮',
    'SALE PREVIEW':'出售预览', 'FINAL RECEIPT':'最终账单', 'VIRTUAL COINS':'虚拟币',
    'Starting cash':'起始现金', 'Winning bid':'成交价', 'Sale proceeds':'出售收入', 'Collection bonus':'套装奖金',
    'Workshop fees':'加工费用', 'Net loss':'本次净亏损', 'Net profit':'本次净收益', 'Cash after sale':'出售后现金', 'Final cash':'最终现金',
    'The lid is off.':'开箱了，', 'Now make it count.':'把拍品变成收入。',
    'Repair & sell':'修复后出售',
    'Sell ordinary objects first to fund eligible repairs. Unaffordable or unprofitable repairs are skipped.':'先出售普通物品，为修复提供资金；资金不足或不划算的修复会跳过。',
    'Sell through expert contacts':'通过行家渠道出售',
    'Genuine items get your 10% premium; reproductions sell at base price.':'真品售价增加 10%，赝品按基础价格出售。',
    'Deliver matching collection':'交付成套收藏',
    'Two distinct genuine Old Harbor pieces earn a 240 bonus. Other objects sell normally.':'两件不同的旧港真品成套交付，额外获得 240，其余拍品正常出售。',
    'Sell without processing':'直接出售，不加工', 'Your genuine-item premium still applies.':'真品售价加成仍然生效。',
    'No workshop fees or collection bonus.':'无加工费用，也不领取套装奖金。',
    'This single-auction practice settles all objects now. Keeping items for a later auction comes in a future step.':'当前是单场测试，所有拍品立即变现；留货参与后续拍卖的功能之后再做。',
    'YOUR CRATE':'你已得标', 'Confirm sale & finish →':'确认出售，完成结算 →',
    'Your chosen sale can make a profit or a loss. The purchase price is already locked.':'不同出售方式可能盈利，也可能亏损；成交价已经锁定。',
    'PRACTICE COMPLETE · ONE AUCTION':'单场测试已结束', 'You share the win.':'你并列获胜。', 'Your judgment paid off.':'你的判断带来了胜利。',
    'You passed. No payment, no objects.':'你放弃了本箱，没有扣款，也没有获得拍品。',
    'Final standings':'最终排名', 'Your final standing':'你的最终排名', 'Try another crate →':'再试一箱 →',
    'Choose a different role':'重新选择角色', 'Reveal the objects & all bids':'查看拍品真相与全部报价',
    'PURCHASED':'已购入', 'NO PURCHASE':'未购入',
    'Net profit = sale proceeds + collection bonus − winning bid − workshop fees.':'净收益 = 出售收入 + 套装奖金 − 成交价 − 加工费用。',
    'Passing or losing a bid costs nothing. A bidder who overpays may finish below players who stayed out.':'放弃或未得标不扣钱。出价过高的买家，最终可能输给没有购入拍品的人。',
    'Genuine':'真品', 'Reproduction':'赝品', 'Old Harbor':'旧港主题', 'Other collection':'其他主题', 'Not repairable':'不可修复',
    'Not repairable. Identity, authenticity and sale price are not revealed by this skill.':'不可修复。此技能不会揭示物品身份、真假或售价。',
    'Enter a whole-number bid from 1 to 1,000.':'请输入 1 至 1,000 之间的整数报价。',
    'Both inspections have been used.':'两次鉴定机会已用完。', 'Inspection is closed.':'鉴定阶段已结束。',
    'Bidding is not open.':'当前不是出价阶段。', 'This crate is not awaiting your sale.':'当前没有等待你出售的拍品。',
    'Choose a valid sale method.':'请选择有效的出售方式。', 'Select an object first.':'请先选择一件拍品。', 'Choose a valid role.':'请选择有效角色。'
  };
  const itemNames = {
    'Railway cabinet clock':'铁路立柜钟', 'Cracked porcelain cup':'开裂瓷杯',
    'Naval service badge':'海军服役徽章', 'Replica folding camera':'仿制折叠相机',
    'Console receiver':'柜式收音机', 'Original railway map':'铁路原版地图',
    'Old Harbor mantel clock':'旧港机械钟', 'Reproduction porcelain cup':'仿制瓷杯', 'Harbor crew badge':'旧港船员徽章',
    'Stationmaster’s clock':'站长座钟', 'Theater prop clock':'剧院道具钟', 'Hand-painted tea cup':'手绘茶杯',
    'First mate’s enamel cup':'大副搪瓷杯', 'Replica shipping badge':'仿制航运徽章', 'World exposition medal':'世博纪念章',
    'Dockside press camera':'码头记者相机', 'Plastic toy camera':'塑料玩具相机', 'Studio rangefinder':'影楼旁轴相机',
    'Harbor dispatch radio':'旧港调度电台', 'Traveler’s pocket radio':'旅行者便携收音机', 'Display-only radio shell':'展示用收音机空壳',
    'Original harbor survey':'旧港测绘原图', 'Tourist map reprint':'旅游地图复制品', 'Navigator’s star chart':'领航员星图'
  };
  // Store canonical source independently from rendered output: translations are reversible.
  const translatedSources = new Map();
  const textSources = new WeakMap();
  const attributeSources = new WeakMap();
  function canonicalText(text) {
    return typeof text==='string' ? translatedSources.get(text) || text : text;
  }
  function rememberTranslation(source, output) {
    if(typeof source==='string' && typeof output==='string' && source!==output)translatedSources.set(output,canonicalText(source));
    return output;
  }
  function translate(text) {
    if(typeof text!=='string')return text;
    text=canonicalText(text);
    if(language==='en')return text;
    if(language==='es') {
      const spanish=window.SecondValueSpanish;
      if(!spanish)return text;
      const parts=text.match(/^(\s*)(.*?)(\s*)$/s);
      if(!parts)return text;
      const [,before,core,after]=parts;
      let translated=spanish.baseWords[core] ?? spanish.itemNames[core];
      if(translated===undefined) {
        for(const [pattern,replacement] of spanish.basePatterns) {
          if(pattern.test(core)){translated=core.replace(pattern,replacement);break;}
        }
      }
      return translated===undefined ? text : rememberTranslation(text,before+translated+after);
    }
    const match=text.match(/^(\s*)(.*?)(\s*)$/s);if(!match)return text;
    const [,before,core,after]=match;
    if(Object.hasOwn(words,core))return rememberTranslation(text,before+words[core]+after);
    if(Object.hasOwn(itemNames,core))return rememberTranslation(text,before+itemNames[core]+after);
    const patterns=[
      [/^Auction (\d+)$/,(_,n)=>'第 '+n+' 场拍卖'],
      [/^AUCTION (\d+) · UNCLAIMED PROPERTY$/,(_,n)=>'第 '+n+' 场拍卖 · 无主旧物'],
      [/^Session ledger · (\d+) crates?$/,(_,n)=>'本次拍卖账本 · '+n+' 箱'],
      [/^(\d+) crates? settled\.$/,(_,n)=>'已结算 '+n+' 箱。'],
      [/^Your bid limit: ([\d,]+)\.$/,(_,cash)=>'本轮报价上限：'+cash+'。'],
      [/^Enter a whole-number bid from 1 to ([\d,]+)\.$/,(_,cash)=>Number(cash.replace(/,/g,''))===0?'当前现金为零，无法报价，请跳过本轮。':'请输入 1 至 '+cash+' 之间的整数报价。'],
      [/^(.+) bought the crate\. Your cash is unchanged\.$/,(_,name)=>`${words[name]||name}拍下了本箱，你的现金保持不变。`],
      [/^ROUND (\d) \/ 3$/,(_,n)=>'第 '+n+' / 3 轮'],
      [/^ROUND (\d) \/ 3 · BIDS REVEALED$/,(_,n)=>'第 '+n+' / 3 轮 · 报价已公开'],
      [/^Early hammer: the highest bid must reach (1\.[38])× the runner-up\. Otherwise, another round opens\.$/,(_,ratio)=>`提前落槌：最高价至少达到第二名的 ${ratio} 倍，否则进入下一轮。`],
      [/^The manifest confirms (\d+) genuine objects\. Their identities are still hidden\.$/,(_,n)=>`货单确认：本箱有 ${n} 件真品，具体是哪几件尚未公开。`],
      [/^Confirmed genuine objects: (\d+) \/ (\d+)\.$/,(_,n,total)=>`货单确认：本箱真品 ${n} / ${total} 件。`],
      [/^Public reveal: object ([A-F]) — (.+), (Genuine|Reproduction), base (\d+)\.$/,(_,letter,item,kind,price)=>`公开拍品 ${letter}：${itemNames[item]||item}，${words[kind]}，基础售价 ${price}。`],
      [/^The manifest also confirms (\d+) repairable objects?\.$/,(_,n)=>`货单还确认：本箱有 ${n} 件可修复物品。`],
      [/^Leading bid: (.+) at ([\d,]+)\.$/,(_,name,bid)=>`本轮最高价：${words[name]||name}，报价 ${bid}。`],
      [/^Runner-up bid: ([\d,]+)\.$/,(_,bid)=>'第二名报价：'+bid+'。'],
      [/^Early sale required a leading bid of at least ([\d,]+)\.$/,(_,bid)=>'本轮提前成交所需的最高价至少为 '+bid+'。'],
      [/^(\d) \/ 2 inspections remain for the entire crate\.$/,(_,n)=>`本箱剩余 ${n} / 2 次技能机会。`],
      [/^Open round (\d) →$/,(_,n)=>'进入第 '+n+' 轮 →'],
      [/^(SALE PREVIEW|FINAL RECEIPT) · VIRTUAL COINS$/,(_,heading)=>words[heading]+' · 虚拟币'],
      [/^Choose (Restorer|Appraiser|Collector|Salvager|Curator|Antique Dealer|Dealer|Broker)$/,(_,role)=>'选择'+words[role]],
      [/^Enter as (Restorer|Appraiser|Collector|Salvager|Curator|Antique Dealer|Dealer|Broker) →$/,(_,role)=>'以'+words[role]+'身份入场 →'],
      [/^The risk: (.+)$/,(_,risk)=>'风险：'+(words[risk]||risk)],
      [/^(Workshop eye|Authenticate|Collection sense) · 2 uses$/,(_,skill)=>words[skill]+' · 2 次'],
      [/^(\d\d) \/ (Inspect|Bid|Reveal & sell|Result)$/,(_,n,step)=>n+' / '+words[step]],
      [/^Old Harbor storage · (.+)$/,(_,code)=>'旧港失物仓 · '+code],
      [/^Select object (\d)$/,(_,n)=>'选择拍品 '+n],
      [/^Select repair: (.+)$/,(_,item)=>'选择修复：'+(itemNames[item]||item)],
      [/^Select collection: (.+)$/,(_,item)=>'选择收藏：'+(itemNames[item]||item)],
      [/^Select ability object: (.+)$/,(_,item)=>'选择能力物品：'+(itemNames[item]||item)],
      [/^(\d+) \/ 2 repairs selected$/,(_,n)=>'已选择 '+n+' / 2 件修复物品'],
      [/^(\d+) \/ 2 collection objects selected$/,(_,n)=>'已选择 '+n+' / 2 件收藏物品'],
      [/^(\d+) \/ (\d+) confirmed$/,(_,known,total)=>'已确认 '+known+' / '+total+' 件'],
      [/^([A-F]) · (.+)$/,(_,letter,shape)=>letter+' · '+(words[shape]||shape)],
      [/^The manifest confirms (\d+) genuine objects? and (\d+) repairable objects?\. It does not identify them\.$/,(_,a,b)=>`货单确认：本箱有 ${a} 件真品，${b} 件可修复物品，但未说明分别是哪件。`],
      [/^PRIVATE NOTES · (.+)$/,(_,role)=>'私人线索 · '+(words[role]||role)],
      [/^Target: object ([A-F])$/,(_,letter)=>'当前目标：拍品 '+letter],
      [/^(\d) \/ 2 uses left$/,(_,n)=>'剩余 '+n+' / 2 次'],
      [/^Confirmed: (\d+) genuine Old Harbor pieces? in this crate\. Identity and prices remain unknown\.$/,(_,n)=>`确认：本箱有 ${n} 件旧港主题真品，具体身份和价格仍未知。`],
      [/^Repairable\. Workshop fee: (\d+)\. Restored sale price: (\d+)\.$/,(_,fee,sale)=>`可以修复。修复费用 ${fee}，修复后售价 ${sale}。`],
      [/^(.+)\. (Genuine|Reproduction)\. Condition: (intact|damaged|unrepairable)\. Category: (mechanical|ceramic|insignia|imaging|instrument|document)\. Theme: (Old Harbor|Railway|None)\. Base sale price: (\d+)\.$/,(_,item,kind,condition,category,theme,price)=>`${itemNames[item]||item}。${words[kind]}，品相：${words[condition]}，品类：${words[category]}，主题：${words[theme]}，基础售价：${price}。`],
      [/^(.+)\. (Genuine|Reproduction)\. Base sale price: (\d+)\.$/,(_,item,kind,price)=>`${itemNames[item]||item}。${words[kind]}，基础售价 ${price}。`],
      [/^SOLD TO YOU · ([\d,]+) COINS$/,(_,price)=>'你已得标 · 成交价 '+price],
      [/^(Genuine|Reproduction) · (Old Harbor|Other collection) · Not repairable$/,(_,kind,theme)=>words[kind]+' · '+words[theme]+' · 不可修复'],
      [/^(Genuine|Reproduction) · (Old Harbor|Other collection) · Repair (\d+) → sell (\d+)$/,(_,kind,theme,cost,sale)=>`${words[kind]} · ${words[theme]} · 修复费 ${cost} → 修后售价 ${sale}`],
      [/^(\d+) base$/,(_,price)=>'基础价 '+price],
      [/^([\d,]+) after fees$/,(_,price)=>'扣费后回收 '+price],
      [/^You bought the crate for ([\d,]+) and (lost|made) ([\d,]+)\.$/,(_,bid,kind,amount)=>`你以 ${bid} 买下整箱，最终${kind==='lost'?'亏损':'盈利'} ${amount}。`],
      [/^(.+) bought the crate\. You kept your 1,000 coins\.$/,(_,name)=>`${words[name]||name}拍下了本箱，你保留了 1,000 本金。`],
      [/^(.+) (share the win|finishes ahead)\.$/,(_,names,kind)=>names.split(' & ').map(n=>words[n]||n).join('、')+(kind==='share the win'?'并列获胜。':'获得胜利。')],
      [/^([+−\d,]+) profit$/,(_,amount)=>'净收益 '+amount],
      [/^(.+) → (.+)$/,()=>core.split(' → ').map(name=>words[name]||name).join(' → ')],
      [/^· (Restorer|Appraiser|Collector|Salvager|Curator|Antique Dealer|Dealer|Broker|You)$/,(_,role)=>'· '+words[role]],
      [/^(Restorer|Appraiser|Collector|Salvager|Curator|Antique Dealer|Dealer|Broker) · You$/,(_,role)=>words[role]+' · 你']
    ];
    for(const [pattern,replacement] of patterns)if(pattern.test(core))return rememberTranslation(text,before+core.replace(pattern,replacement)+after);
    return text;
  }
  function excluded(element) {
    return Boolean(element?.closest('script,style,noscript,[data-user-text],[data-no-localize]'));
  }
  function localize(container, translator=translate) {
    if(!container || excluded(container.nodeType===1?container:container.parentElement))return;
    const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT,{
      acceptNode(node){return excluded(node.parentElement)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}
    });
    let node;
    while((node=walker.nextNode())) {
      const previous=textSources.get(node);
      const source=previous && previous.output===node.nodeValue ? previous.source : canonicalText(node.nodeValue);
      const output=translator(source);
      if(node.nodeValue!==output)node.nodeValue=output;
      textSources.set(node,{source,output});
    }
    const elements=[...(container.nodeType===1?[container]:[]),...container.querySelectorAll('[aria-label],[placeholder],[title]')];
    for(const element of elements) {
      if(excluded(element))continue;
      let records=attributeSources.get(element);
      if(!records){records=new Map();attributeSources.set(element,records);}
      for(const attribute of ['aria-label','placeholder','title']) {
        if(!element.hasAttribute(attribute))continue;
        const value=element.getAttribute(attribute),previous=records.get(attribute);
        const source=previous && previous.output===value ? previous.source : canonicalText(value);
        const output=translator(source);
        if(output!==value)element.setAttribute(attribute,output);
        records.set(attribute,{source,output});
      }
    }
  }
  function updateMetadata() {
    const online=Boolean(document.getElementById('online-game'));
    const titles={
      en:online?'Second Value — Multiplayer':'Second Value — Local Demo',
      'zh-CN':online?'余价拍卖行 — 多人拍卖':'余价拍卖行 — 本地测试版',
      es:online?'Second Value — Multijugador':'Second Value — Práctica local'
    };
    const descriptions={
      en:online?'A shared auction table for two to four players. Choose a role, inspect the clues and bid in secret.':'Second Value: continuous auctions with hidden finds, different talents and a bankroll that carries every decision.',
      'zh-CN':online?'邀请两至四位玩家同桌拍卖：选择角色，查看线索，秘密竞拍。':'选择角色，鉴定旧物，秘密竞拍，在盈利与亏损之间做出判断。',
      es:online?'Una mesa de subastas para dos a cuatro jugadores. Elige un rol, examina las pistas y puja en secreto.':'Second Value: subastas continuas, hallazgos ocultos, talentos distintos y un saldo que refleja cada decisión.'
    };
    document.documentElement.lang=language;
    document.title=titles[language];
    const description=document.querySelector('meta[name="description"]');
    if(description)description.content=descriptions[language];
    for(const link of [document.getElementById('multiplayer-link'),document.getElementById('practice-link'),document.querySelector('.wordmark')]) {
      if(!link)continue;
      const destination=new URL(link.getAttribute('href'),location.href);
      destination.searchParams.set('lang',language);
      link.href=destination.pathname+destination.search+destination.hash;
    }
  }
  function persistLanguage() {
    try { localStorage.setItem(STORAGE_KEY,language); } catch { /* Switching also works when storage is blocked. */ }
  }
  function setLanguage(value) {
    const next=canonicalLanguage(value);
    if(!next)return false;
    const changed=next!==language;
    language=next;
    persistLanguage();
    const url=new URL(location.href);
    url.searchParams.set('lang',language);
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    updateMetadata();
    if(changed)window.dispatchEvent(new CustomEvent('secondvalue:languagechange',{detail:{language}}));
    return true;
  }
  window.SecondValueLocale={get language(){return language;},setLanguage,canonicalLanguage,canonicalText,rememberTranslation,translate,localize};
  persistLanguage();
  updateMetadata();
})();
