/* 由 FC.xlsx 轉出的初始資料（民國 115 年 = 西元 2026 年）
   欄位對應：消費日 date / 入帳日 postDate / 項目 item / 本幣 twd /
             幣別 currency / 原幣 amount / 手續費 fee / 刷卡 card /
             備註 note / 會員卡號 memberId / 下次付款日 nextDue
   分類 category 與 藝人 artist 為匯入時補上的欄位，可在 App 內修改。 */
window.SEED = {
  categories: ['訂閱月費', '年費會員', '扭蛋', '周邊商品', '專輯唱片', '線上演唱會', '演唱會門票', '交通住宿', '其他'],
  cards: ['聯邦', '台新'],
  records: [
    { date:'2026-04-06', postDate:'2026-04-13', item:'TAKASE TOYA OFFICIAL FANCLUB 月額費', twd:241, currency:'JPY', amount:1200, fee:4, card:'聯邦', note:'', memberId:'TT000274', nextDue:'', category:'訂閱月費', artist:'TAKASE TOYA' },
    { date:'2026-05-06', postDate:'2026-05-12', item:'TAKASE TOYA OFFICIAL FANCLUB 月額費', twd:244, currency:'JPY', amount:1200, fee:4, card:'聯邦', note:'', memberId:'TT000274', nextDue:'', category:'訂閱月費', artist:'TAKASE TOYA' },
    { date:'2026-07-06', postDate:'2026-07-14', item:'TAKASE TOYA OFFICIAL FANCLUB 月額費', twd:239, currency:'JPY', amount:1200, fee:4, card:'聯邦', note:'', memberId:'TT000274', nextDue:'', category:'訂閱月費', artist:'TAKASE TOYA' },
    { date:'2026-08-06', postDate:'2026-08-12', item:'TAKASE TOYA OFFICIAL FANCLUB 月額費', twd:248, currency:'JPY', amount:1200, fee:4, card:'聯邦', note:'', memberId:'TT000274', nextDue:'', category:'訂閱月費', artist:'TAKASE TOYA' },
    { date:'2026-07-06', postDate:'2026-07-14', item:'Fumiya Sato Official Site「Maison Fumiya」 年額費', twd:1716, currency:'JPY', amount:8610, fee:26, card:'聯邦', note:'2026.07.06 ~ 2027.07.06', memberId:'FS000064', nextDue:'2027-07-06', category:'年費會員', artist:'Fumiya Sato' },
    { date:'2026-05-25', postDate:'2026-05-29', item:'EXIMBAY*WEVERSESEOUL BTS ARMY MEMBERSHIP CARD KRW22,727', twd:501, currency:'KRW', amount:23863, fee:8, card:'台新', note:'2026.05.24 ~ 2027.05.24', memberId:'BA173619663', nextDue:'2027-05-24', category:'年費會員', artist:'BTS' },
    { date:'2026-07-11', postDate:'2026-07-14', item:'TOSS*KQENTERTAINMENTSEOUL ATEEZ ATINY MEMBERSHIP', twd:430, currency:'KRW', amount:20000, fee:6, card:'台新', note:'2026.07.10 ~ 2027.07.10', memberId:'BMM9RM', nextDue:'2027-07-10', category:'年費會員', artist:'ATEEZ' },
    { date:'2026-07-09', postDate:'2026-07-13', item:'CREEPY NUTS FAN APPSHIBUY', twd:99, currency:'JPY', amount:500, fee:1, card:'台新', note:'', memberId:'', nextDue:'', category:'訂閱月費', artist:'CREEPY NUTS' },
    { date:'2026-08-09', postDate:'2026-08-11', item:'CREEPY NUTS FAN APPSHIBUY', twd:103, currency:'JPY', amount:500, fee:2, card:'台新', note:'', memberId:'', nextDue:'', category:'訂閱月費', artist:'CREEPY NUTS' },
    { date:'2026-06-13', postDate:'2026-06-18', item:'TAKASE TOYA OFFICIAL FAN NAGOYA', twd:992, currency:'JPY', amount:5000, fee:15, card:'台新', note:'扭蛋', memberId:'', nextDue:'', category:'扭蛋', artist:'TAKASE TOYA' },
    { date:'2026-07-10', postDate:'2026-07-16', item:'TAKASE TOYA OFFICIAL FAN NAGOYA', twd:99, currency:'JPY', amount:500, fee:1, card:'聯邦', note:'扭蛋', memberId:'', nextDue:'', category:'扭蛋', artist:'TAKASE TOYA' },
    { date:'2026-07-10', postDate:'2026-07-16', item:'TAKASE TOYA OFFICIAL FAN NAGOYA', twd:99, currency:'JPY', amount:500, fee:1, card:'聯邦', note:'扭蛋', memberId:'', nextDue:'', category:'扭蛋', artist:'TAKASE TOYA' },
    { date:'2026-07-10', postDate:'2026-07-16', item:'TAKASE TOYA OFFICIAL FAN NAGOYA', twd:496, currency:'JPY', amount:2500, fee:7, card:'聯邦', note:'扭蛋', memberId:'', nextDue:'', category:'扭蛋', artist:'TAKASE TOYA' },
    { date:'2026-07-10', postDate:'2026-07-16', item:'TAKASE TOYA OFFICIAL FAN NAGOYA', twd:992, currency:'JPY', amount:5000, fee:15, card:'聯邦', note:'扭蛋', memberId:'', nextDue:'', category:'扭蛋', artist:'TAKASE TOYA' },
    { date:'2026-08-19', postDate:'2026-08-25', item:'ONE ROOM BACK NUMBER FC TOKYO gold key', twd:1384, currency:'JPY', amount:6900, fee:21, card:'台新', note:'2027.08.31', memberId:'660787', nextDue:'2027-08-31', category:'年費會員', artist:'back number' },
    { date:'2026-08-24', postDate:'2026-08-28', item:'OFFICIALHIGEDANDISM FC TOKYO STAND BY YOU', twd:1327, currency:'JPY', amount:6600, fee:20, card:'台新', note:'2027.08.31', memberId:'E101185182052', nextDue:'2027-08-31', category:'年費會員', artist:'Official髭男dism' },
    { date:'2026-09-09', postDate:'', item:'PRIMAL FOOTMARK 2026 ONE OK ROCK', twd:2, currency:'JPY', amount:4490, fee:0, card:'台新', note:'※ 原始 Excel 本幣欄為 2、尚無入帳日，請確認後修正', memberId:'', nextDue:'', category:'年費會員', artist:'ONE OK ROCK' },
    { date:'2026-06-27', postDate:'2026-06-30', item:'WEVERSE TOKYO Mrs. GREEN APPLE<ゼンジン未到とイ/ミュータブル~間奏編~>HD Single-view(Live+Delayed Streaming)', twd:987, currency:'JPY', amount:5000, fee:15, card:'台新', note:'', memberId:'', nextDue:'', category:'線上演唱會', artist:'Mrs. GREEN APPLE' },
    { date:'2026-07-25', postDate:'2026-07-29', item:'TOWER RECORDS  ONE OK ROCK DETOX', twd:1234, currency:'JPY', amount:6240, fee:18, card:'台新', note:'', memberId:'', nextDue:'', category:'專輯唱片', artist:'ONE OK ROCK' },
    { date:'2026-08-20', postDate:'2026-08-21', item:'ONE OK ROCK US 黑膠', twd:2103, currency:'USD', amount:65.97, fee:20, card:'台新', note:'', memberId:'', nextDue:'', category:'專輯唱片', artist:'ONE OK ROCK' },
    { date:'2026-06-07', postDate:'2026-06-09', item:'CHOGAKUSEI.STORESHIBUY', twd:2036, currency:'JPY', amount:10300, fee:30, card:'台新', note:'', memberId:'', nextDue:'', category:'周邊商品', artist:'超学生' },
    { date:'2026-07-13', postDate:'2026-07-20', item:'SP NATORIUM STOREA9467 MINATO', twd:5259, currency:'JPY', amount:26480, fee:79, card:'台新', note:'', memberId:'', nextDue:'', category:'周邊商品', artist:'ナトリ' },
    { date:'2026-08-10', postDate:'2026-08-11', item:'SP NATORIUM STOREMINATO', twd:2093, currency:'JPY', amount:10180, fee:31, card:'台新', note:'', memberId:'', nextDue:'', category:'周邊商品', artist:'ナトリ' },
    { date:'2026-08-11', postDate:'2026-08-13', item:'SP NATORIUM STOREMINATO', twd:2576, currency:'JPY', amount:12580, fee:39, card:'台新', note:'', memberId:'', nextDue:'', category:'周邊商品', artist:'ナトリ' }
  ]
};
