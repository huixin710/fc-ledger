# -*- coding: utf-8 -*-
"""由信用卡帳單（FC.xlsx + 115/09 四家銀行帳單）產生 seed.js。

執行： py tools/build_seed.py
"""
import io, json, os

ROC = 1911
def d(s):
    """'115/08/10' 或 '8/10'(民國115年) -> ISO"""
    p = s.replace('-', '/').split('/')
    if len(p) == 2:
        y = 115
        m, dd = p
    else:
        y, m, dd = p
        y = int(y)
    return '%04d-%02d-%02d' % (int(y) + ROC, int(m), int(dd))

CATEGORIES = [
    'FC月費', 'FC年費', '扭蛋', '周邊商品', '專輯唱片', '演唱會票券',
    '餐飲', '交通', '旅遊住宿', '生活用品', '服飾美妝', '百貨購物',
    '電信網路', '訂閱服務', '醫療保健', '運動健身', '稅費保險',
    '回饋折抵', '其他',
]

CARDS = [
    '台新Richart 3208', '台新Richart 0602', '寰宇卡 2007',
    '國泰CUBE 3624', '國泰CUBE 2225', '聯邦M悠遊鈦 0206',
    '聯邦賴點卡 9908', 'LINE Bank 1308', '4511 卡', '6357 卡',
    '富邦MASTER 6848', '富邦MASTER 0969',
]

R = []
def add(date, post, item, twd, card, cat, cur='', amt=0, fee=0,
        note='', member='', due='', artist=''):
    R.append(dict(date=d(date), postDate=d(post) if post else '', item=item,
                  twd=twd, currency=cur, amount=amt, fee=fee, card=card,
                  note=note, memberId=member, nextDue=d(due) if due else '',
                  category=cat, artist=artist))

# ─────────────────────────────────────────────────────────────
# A. 原 FC.xlsx 的 24 筆（4~9 月的追星紀錄，帳單只涵蓋 7~9 月）
#    卡別依 115/09 帳單的實際卡號補上
# ─────────────────────────────────────────────────────────────
FED_MAIN = '聯邦M悠遊鈦 0206'   # 月額/年額費刷這張（帳單顯示 FAM TOKYO）
FED_LINE = '聯邦賴點卡 9908'    # NAGOYA 扭蛋刷這張
TS = '台新Richart 0602'

for dt, pd_, twd, fee in [('115/4/6', '115/4/13', 241, 4), ('115/5/6', '115/5/12', 244, 4),
                          ('115/7/6', '115/7/14', 239, 4), ('115/8/6', '115/8/12', 248, 4)]:
    add(dt, pd_, 'TAKASE TOYA OFFICIAL FANCLUB 月額費', twd, FED_MAIN, 'FC月費',
        'JPY', 1200, fee, member='TT000274', artist='TAKASE TOYA')

add('115/7/6', '115/7/14', 'Fumiya Sato Official Site「Maison Fumiya」 年額費', 1716,
    FED_MAIN, 'FC年費', 'JPY', 8610, 26, '2026.07.06 ~ 2027.07.06', 'FS000064',
    '116/7/6', 'Fumiya Sato')
add('115/5/25', '115/5/29', 'EXIMBAY*WEVERSESEOUL BTS ARMY MEMBERSHIP CARD KRW22,727', 501,
    TS, 'FC年費', 'KRW', 23863, 8, '2026.05.24 ~ 2027.05.24', 'BA173619663', '116/5/24', 'BTS')
add('115/7/11', '115/7/14', 'TOSS*KQENTERTAINMENTSEOUL ATEEZ ATINY MEMBERSHIP', 430,
    TS, 'FC年費', 'KRW', 20000, 6, '2026.07.10 ~ 2027.07.10', 'BMM9RM', '116/7/10', 'ATEEZ')
add('115/7/9', '115/7/13', 'CREEPY NUTS FAN APPSHIBUY', 99, TS, 'FC月費', 'JPY', 500, 1,
    artist='CREEPY NUTS')
add('115/8/9', '115/8/11', 'CREEPY NUTS FAN APPSHIBUY', 103, TS, 'FC月費', 'JPY', 500, 2,
    artist='CREEPY NUTS')
add('115/6/13', '115/6/18', 'TAKASE TOYA OFFICIAL FAN NAGOYA', 992, TS, '扭蛋', 'JPY', 5000, 15,
    '扭蛋', artist='TAKASE TOYA')
for twd, amt, fee in [(99, 500, 1), (99, 500, 1), (496, 2500, 7), (992, 5000, 15)]:
    add('115/7/10', '115/7/16', 'TAKASE TOYA OFFICIAL FAN NAGOYA', twd, FED_LINE, '扭蛋',
        'JPY', amt, fee, '扭蛋', artist='TAKASE TOYA')
add('115/8/19', '115/8/25', 'ONE ROOM BACK NUMBER FC TOKYO gold key', 1384, TS, 'FC年費',
    'JPY', 6900, 21, '2027.08.31', '660787', '116/8/31', 'back number')
add('115/8/24', '115/8/28', 'OFFICIALHIGEDANDISM FC TOKYO STAND BY YOU', 1327, TS, 'FC年費',
    'JPY', 6600, 20, '2027.08.31', 'E101185182052', '116/8/31', 'Official髭男dism')
R.append(dict(date=d('115/9/9'), postDate='', item='PRIMAL FOOTMARK 2026 ONE OK ROCK',
              twd=None, currency='JPY', amount=4490, fee=0, card=TS,
              note='尚未入帳，本幣待補', memberId='', nextDue='',
              category='FC年費', artist='ONE OK ROCK'))
add('115/6/27', '115/6/30', 'WEVERSE TOKYO Mrs. GREEN APPLE<ゼンジン未到とイ/ミュータブル~間奏編~>'
    'HD Single-view(Live+Delayed Streaming)', 987, TS, '演唱會票券', 'JPY', 5000, 15,
    artist='Mrs. GREEN APPLE')
add('115/7/25', '115/7/29', 'TOWER RECORDS  ONE OK ROCK DETOX', 1234, TS, '專輯唱片',
    'JPY', 6240, 18, artist='ONE OK ROCK')
add('115/8/20', '115/8/21', 'ONE OK ROCK US 黑膠', 2103, TS, '專輯唱片', 'USD', 65.97, 32,
    artist='ONE OK ROCK')
add('115/6/7', '115/6/9', 'CHOGAKUSEI.STORESHIBUY', 2036, TS, '周邊商品', 'JPY', 10300, 30,
    artist='超学生')
add('115/7/13', '115/7/20', 'SP NATORIUM STOREA9467 MINATO', 5259, TS, '周邊商品',
    'JPY', 26480, 79, artist='ナトリ')
add('115/8/10', '115/8/11', 'SP NATORIUM STOREMINATO', 2093, TS, '周邊商品', 'JPY', 10180, 31,
    artist='ナトリ')
add('115/8/11', '115/8/13', 'SP NATORIUM STOREMINATO', 2576, TS, '周邊商品', 'JPY', 12580, 39,
    artist='ナトリ')
EXCEL_N = len(R)

# ─────────────────────────────────────────────────────────────
# B. 台新 115/09 帳單（Richart 3208 / 0602）— 已在 A 出現的追星消費不重複
# ─────────────────────────────────────────────────────────────
T32 = '台新Richart 3208'
add('115/8/7',  '115/8/12', '中油－台中公園路站', 164, T32, '交通')
add('115/8/7',  '115/8/11', '信用卡消費折抵_中油－台中公園路站', -49, T32, '回饋折抵')
add('115/8/16', '115/8/20', '連支*犀牛創 RHIN Taipei', 1500, T32, '其他')
add('115/8/17', '115/8/21', '連支*台灣大創 Taipei', 98, T32, '生活用品')
add('115/8/20', '115/8/26', '連支*GU網路商店 Taipei', 1870, T32, '服飾美妝')
add('115/8/24', '115/8/28', '連支*日月亭股份有限公司 Taipei', 75, T32, '餐飲')

add('115/8/7',  '115/8/10', 'Patreon* Membership', 305, TS, '訂閱服務', 'USD', 9.45, 5)
add('115/8/7',  '115/8/11', '信用卡消費折抵_Patreon* Membership', -91, TS, '回饋折抵')
add('115/8/9',  '115/8/24', '信用卡消費折抵_CREEPY NUTS FAN APP', -30, TS, '回饋折抵',
    artist='CREEPY NUTS')
add('115/8/21', '115/8/24', 'ANTHROPIC* CLAUDE SUB', 638, TS, '訂閱服務', 'USD', 20.00, 9)
add('115/8/21', '115/8/24', '信用卡消費折抵_ANTHROPIC* CLAUDE SUB', -191, TS, '回饋折抵')
add('115/8/28', '115/9/1',  'SITE FEE DWANGO TOKYO', 110, TS, 'FC月費', 'JPY', 550, 2)
add('115/8/28', '115/8/31', '寬宏藝術經紀股份有限公司（網路）', 2880, TS, '演唱會票券')
add('115/8/31', '115/9/3',  '中油－草屯站', 169, TS, '交通')
add('115/8/31', '115/8/31', '臺北大眾捷運股份有限公司', 40, TS, '交通')
add('115/9/1',  '115/9/7',  'ARTIST SITE TOKYO', 88, TS, 'FC月費', 'JPY', 440, 1)

# ─────────────────────────────────────────────────────────────
# C. 寰宇卡 2007（本期應繳 12,845）
# ─────────────────────────────────────────────────────────────
HY = '寰宇卡 2007'
add('115/8/4',  '115/8/4',  '現金點數扣抵', -350, HY, '回饋折抵')
add('115/7/31', '115/8/3',  '遠傳－Ｔｉｃｋｅｔ　Ｐｌｕｓ　售票+', 1400, HY, '演唱會票券')
add('115/8/4',  '115/8/6',  '大鴻藝術股份有限公司', 1600, HY, '演唱會票券')
add('115/8/6',  '115/8/10', '國立自然科學博物館', 240, HY, '其他')
add('115/8/8',  '115/8/11', 'ＶＥＲＶＥ', 4520, HY, '其他')
add('115/8/10', '115/8/12', '街口電支－ＡＰＰ信用卡儲值', 320, HY, '其他')
add('115/8/14', '115/8/17', '遠傳－Ｔｉｃｋｅｔ　Ｐｌｕｓ　售票+', 1300, HY, '演唱會票券')
add('115/8/17', '115/8/19', '大樹連鎖藥局－草屯碧山門市', 155, HY, '醫療保健')
add('115/8/19', '115/8/24', '遠傳－Ｔｉｃｋｅｔ　Ｐｌｕｓ　售票+', 2600, HY, '演唱會票券')
add('115/8/22', '115/8/24', '街口電支－ＡＰＰ信用卡儲值', 90, HY, '其他')
add('115/8/30', '115/9/1',  '統一金流－享印生活股份有限公司', 150, HY, '其他')
add('115/8/30', '115/9/1',  '統一金流－享印生活股份有限公司', 150, HY, '其他')
add('115/8/30', '115/8/31', '京都柚子豚骨拉麵研究中心－中山本店', 320, HY, '餐飲')

# ─────────────────────────────────────────────────────────────
# D. 國泰 CUBE（正卡本期消費 16,041）
# ─────────────────────────────────────────────────────────────
C36, C22 = '國泰CUBE 3624', '國泰CUBE 2225'
add('115/7/25', '115/7/29', '台灣角川股份有限公司', 1229, C36, '其他')
add('115/7/26', '115/7/29', 'ICASH加值－桃園捷運新', 500, C36, '交通')
for twd in (70, 238, 238, 140):
    add('115/7/26', '115/7/28', '宏匯廣場', twd, C36, '百貨購物')
add('115/7/30', '115/8/3',  'GOOGLE *VISA0001', 479, C36, '訂閱服務', 'TWD', 479, 7)
add('115/8/2',  '115/8/5',  'ＬａＬａｐｏｒｔ台中', 2790, C36, '百貨購物')
add('115/8/2',  '115/8/5',  '點數折抵__ＬａＬａｐｏｒｔ', -117, C36, '回饋折抵')
add('115/8/2',  '115/8/5',  'ＬａＬａｐｏｒｔ台中', 80, C36, '百貨購物')
add('115/8/2',  '115/8/5',  'ＬａＬａｐｏｒｔ台中', 198, C36, '百貨購物')
add('115/8/13', '115/8/14', '輕鬆繳遠傳電 905****63', 1079, C36, '電信網路')
add('115/8/13', '115/8/14', '輕鬆繳遠傳電 976****61', 218, C36, '電信網路')
add('115/8/15', '115/8/18', '宏匯廣場', 249, C36, '百貨購物')
add('115/8/16', '115/8/19', '無印良品－文心門市', 79, C36, '生活用品')
add('115/8/22', '115/8/26', '統一時代百貨台北店', 3490, C36, '百貨購物')

for dt, pd_, name, twd in [
    ('115/8/1',  '115/8/3',  'ｏｕｃｈ＿ｔ', 980), ('115/8/5', '115/8/7', '１８２３９０', 480),
    ('115/8/8',  '115/8/10', 'ｏｕｃｈ＿ｔ（退款）', -253), ('115/8/11', '115/8/13', '嘉佑商行', 378),
    ('115/8/11', '115/8/17', '榮郁國際有限', 810), ('115/8/17', '115/8/19', 'ｋａｉｔａｒ', 365),
    ('115/8/17', '115/8/19', '蝦皮直營生活', 216), ('115/8/18', '115/8/20', 'ｂａｉｍｏｍ', 379),
    ('115/8/18', '115/8/20', 'ｋｅｍｅ＿ｇ', 257), ('115/8/18', '115/8/20', '亞吉聯創有限', 630),
    ('115/8/18', '115/8/20', 'ｓ３６１８２', 318), ('115/8/22', '115/8/26', 'ｃｈａｒｌｉ', 268),
    ('115/8/22', '115/8/24', 'ａｚｓ２０３', 246)]:
    add(dt, pd_, '樂購蝦皮－' + name, twd, C22, '生活用品')

# ─────────────────────────────────────────────────────────────
# E. 4511 / 6357 卡
# ─────────────────────────────────────────────────────────────
add('115/8/5',  '115/8/10', 'Ｈａｍｉ　Ｐｏｉｎｔ', 1532, '4511 卡', '電信網路')
add('115/8/16', '115/8/20', '健身工廠－草屯廠', 888, '4511 卡', '運動健身')
add('115/5/23', '115/7/28', '綜所稅單筆０３－０６', 330, '6357 卡', '稅費保險')
add('115/8/18', '115/8/24', '全國加油站樹王自助', 130, '6357 卡', '交通')
add('115/8/23', '115/8/24', '台灣薩莉亞餐飲股份有限', 270, '6357 卡', '餐飲')

# ─────────────────────────────────────────────────────────────
# F. 聯邦（總計 21,734）— 第一欄是入帳日、第二欄才是消費日
# ─────────────────────────────────────────────────────────────
add('115/7/15', '115/7/15', '刷卡現金回饋－聯邦Ｍ國外加碼', -7, FED_MAIN, '回饋折抵')
add('115/7/25', '115/7/28', '卡夫人背包客棧', 1979, FED_MAIN, '旅遊住宿')
add('115/7/25', '115/7/29', '國光汽車客運－網路', 1344, FED_MAIN, '交通')
add('115/7/27', '115/7/29', '連支＊日月亭股份有限公', 75, FED_MAIN, '餐飲')
add('115/8/7',  '115/8/12', '國光汽車客運－網路', 732, FED_MAIN, '交通')
add('115/8/8',  '115/8/12', '台灣青旅', 990, FED_MAIN, '旅遊住宿')
add('115/8/6',  '115/8/11', 'Yibor Technology Co., Lim HONG KONG', 10799,
    'LINE Bank 1308', '其他', 'TWD', 10799, 162)
add('115/7/19', '115/7/21', '連支＊５０嵐－穎冠', 155, FED_LINE, '餐飲')
add('115/8/1',  '115/8/5',  '連加＊爬咖啡', 150, FED_LINE, '餐飲')
add('115/8/6',  '115/8/8',  '連支＊厭世夯肉', 208, FED_LINE, '餐飲')
add('115/8/4',  '115/8/10', '連加＊Ｓｉｓ・Ｔｉｎｇ', 1200, FED_LINE, '餐飲')

# ─────────────────────────────────────────────────────────────
# G. 富邦（MASTER鈦金 6848 / 0969）— 115/03 與 115/09 兩期帳單
#    保費全部年繳且集中在 2 月，是現金流最大的坑
# ─────────────────────────────────────────────────────────────
FB, FB2 = '富邦MASTER 6848', '富邦MASTER 0969'
add('115/2/13', '115/2/23', '富邦momo-EC', 835, FB, '生活用品')
add('115/2/16', '115/2/23', '富邦momo-EC', 1270, FB, '生活用品')
add('115/2/22', '115/2/24', '富邦momo-EC', 764, FB, '生活用品')
add('115/2/23', '115/2/26', '台灣人壽續期保費', 17297, FB, '稅費保險', note='年繳保費')
add('115/2/25', '115/3/3',  '全球人壽８８０００４６０６００', 14602, FB, '稅費保險', note='年繳保費')
add('115/2/25', '115/3/2',  '富邦momo-EC', 815, FB, '生活用品')
add('115/2/26', '115/3/2',  '富邦momo-EC', 797, FB, '生活用品')
add('115/8/6',  '115/8/10', '富邦momo-EC', 744, FB, '生活用品')
add('115/8/21', '115/8/24', '富邦momo-EC', 1930, FB, '生活用品')
add('115/9/5',  '115/9/7',  '好市多北台中店', 99, FB2, '生活用品')

# ─────────────────────────────────────────────────────────────
# H. 分期 — 不當成當月消費，而是每月固定要繳的錢，單獨追蹤。
#    台新來自 115/09 帳單「分期交易尚未到期資訊」；
#    富邦人壽 13,145 分 12 期 0%，115/09 為 07/12 期，未到期 5,475。
#    （富邦 11503 帳單分期已於 115/08 繳完 06/06 期，故不列入）
# ─────────────────────────────────────────────────────────────
INSTALLMENTS = [
    dict(name='26/05 帳單分期',        card=T32, total=20000, monthly=3346, interest=52, remaining=6718,  apr=4.77),
    dict(name='26/06 帳單分期',        card=T32, total=4978,  monthly=826,  interest=19, remaining=2497,  apr=4.77),
    dict(name='26/07 帳單分期',        card=T32, total=7770,  monthly=642,  interest=16, remaining=6491,  apr=6.58),
    dict(name='BIC CAMERA TENJIN2',   card=T32, total=23352, monthly=1942, interest=24, remaining=15618, apr=1.88),
    dict(name='新光產物保險',          card=TS,  total=1115,  monthly=92,   interest=0,  remaining=736,   apr=0.00),
    dict(name='拓元票務服務',          card=TS,  total=9580,  monthly=795,  interest=11, remaining=7204,  apr=1.88),
    dict(name='遠傳－Ticket Plus',     card=TS,  total=3200,  monthly=265,  interest=4,  remaining=2407,  apr=1.88),
    dict(name='藍新－KKTIX售票報名平', card=TS,  total=5800,  monthly=481,  interest=7,  remaining=4361,  apr=1.88),
    dict(name='富邦人壽（保費分期）',  card=FB,  total=13145, monthly=1095, interest=0,  remaining=5475,  apr=0.00),
]

# ─────────────────────────────────────────────────────────────
# I. 訂閱 — 可管理的清單（停訂了就把 active 關掉，新訂的直接加）
#    金額取最近一次實際扣款；還沒扣過款的填預計金額。
# ─────────────────────────────────────────────────────────────
def sub(name, amount, cycle, card, cat, active=True, artist='', member='', due='', note=''):
    return dict(name=name, amount=amount, cycle=cycle, card=card, category=cat,
                active=active, artist=artist, memberId=member,
                nextDue=d(due) if due else '', note=note)

SUBS = [
    # ── 月費 ──
    sub('TAKASE TOYA OFFICIAL FANCLUB 月額費', 252, 'month', FED_MAIN, 'FC月費',
        artist='TAKASE TOYA', member='TT000274'),
    sub('SITE FEE DWANGO TOKYO', 112, 'month', TS, 'FC月費'),
    sub('ARTIST SITE TOKYO', 89, 'month', TS, 'FC月費'),
    sub('ATEEZ Fromm／myArti', 320, 'month', '', 'FC月費', artist='ATEEZ',
        note='115/09 新訂，尚未出現在帳單'),
    sub('Apple Store iCloud 200G', 90, 'month', '', '訂閱服務',
        note='115/09 新訂，尚未出現在帳單'),
    sub('GOOGLE *VISA0001', 486, 'month', C36, '訂閱服務'),
    sub('ANTHROPIC* CLAUDE SUB', 647, 'month', TS, '訂閱服務'),
    sub('CREEPY NUTS FAN APPSHIBUY', 105, 'month', TS, 'FC月費',
        active=False, artist='CREEPY NUTS', note='115/09 已停訂'),
    sub('Patreon* Membership', 310, 'month', TS, '訂閱服務',
        active=False, note='115/09 已停訂'),

    # ── 年費 ──
    sub('Fumiya Sato Official Site「Maison Fumiya」 年額費', 1742, 'year', FED_MAIN, 'FC年費',
        artist='Fumiya Sato', member='FS000064', due='116/7/6'),
    sub('EXIMBAY*WEVERSESEOUL BTS ARMY MEMBERSHIP CARD KRW22,727', 509, 'year', TS, 'FC年費',
        artist='BTS', member='BA173619663', due='116/5/24'),
    sub('TOSS*KQENTERTAINMENTSEOUL ATEEZ ATINY MEMBERSHIP', 436, 'year', TS, 'FC年費',
        artist='ATEEZ', member='BMM9RM', due='116/7/10'),
    sub('ONE ROOM BACK NUMBER FC TOKYO gold key', 1405, 'year', TS, 'FC年費',
        artist='back number', member='660787', due='116/8/31'),
    sub('OFFICIALHIGEDANDISM FC TOKYO STAND BY YOU', 1347, 'year', TS, 'FC年費',
        artist='Official髭男dism', member='E101185182052', due='116/8/31'),
    sub('PRIMAL FOOTMARK 2026 ONE OK ROCK', 0, 'year', TS, 'FC年費',
        artist='ONE OK ROCK', due='116/9/9', note='115/09 刷卡，金額待帳單確認'),
]

# 年繳、但每個月都該預留的錢
LIFE = 17297 + 14602            # 台灣人壽 + 全球人壽，都在 2 月一次付清
BUDGET = dict(
    income=35000,
    savings=0,
    fixed=[
        dict(name='皮膚科', amount=2000),
        dict(name='其他固定支出', amount=5000),
        dict(name='電信費（遠傳兩門號）', amount=1297),
        dict(name='保險預留（台壽＋全球 年 %s）' % format(LIFE, ','), amount=round(LIFE / 12)),
    ],
    # 這些分類是「已經用固定支出預留過」或年度一次性的，不重複算進每月已花
    excludeCats=['稅費保險'],
    # 待入帳（本幣還沒填）的用歷史平均匯率估算後計入
    estimatePending=True,
)

# ─────────────────────────────────────────────────────────────
# 驗算
# ─────────────────────────────────────────────────────────────
def s(rows):
    return sum((r['twd'] or 0) + (r['fee'] or 0) for r in rows)

by_card = {}
for r in R:
    by_card.setdefault(r['card'], []).append(r)

print('筆數：%d（原 Excel %d + 帳單新增 %d）' % (len(R), EXCEL_N, len(R) - EXCEL_N))
print('分期月付：%d　剩餘本金：%d' %
      (sum(i['monthly'] + i['interest'] for i in INSTALLMENTS),
       sum(i['remaining'] for i in INSTALLMENTS)))
print('\n依卡別合計（含手續費）：')
for c in sorted(by_card, key=lambda k: -s(by_card[k])):
    print('  %-20s %8s  %3d 筆' % (c, format(round(s(by_card[c])), ','), len(by_card[c])))
print('  %-20s %8s' % ('總計', format(round(s(R)), ',')))

print('\n每月消費（消費日計）：')
for ym in sorted(set(r['date'][:7] for r in R)):
    rows = [r for r in R if r['date'][:7] == ym]
    ins = [r for r in rows if r['category'] == '稅費保險']
    print('  %s  %8s  %3d 筆%s' % (ym, format(round(s(rows)), ','), len(rows),
                                   '（含年繳保費 %s）' % format(round(s(ins)), ',') if ins else ''))

act = [x for x in SUBS if x['active']]
off = [x for x in SUBS if not x['active']]
sub_m = sum(x['amount'] for x in act if x['cycle'] == 'month')
sub_y = sum(x['amount'] for x in act if x['cycle'] == 'year')
off_m = sum(x['amount'] for x in off if x['cycle'] == 'month')
print('\n訂閱：生效 %d 筆　月費 %s／月 ＋ 年費 %s／年（月攤 %s）＝ 每月 %s' % (
    len(act), format(sub_m, ','), format(sub_y, ','),
    format(round(sub_y / 12), ','), format(round(sub_m + sub_y / 12), ',')))
print('      已停訂 %d 筆，每月省下 %s' % (len(off), format(off_m, ',')))

fixed_sum = sum(f['amount'] for f in BUDGET['fixed'])
inst_sum = sum(i['monthly'] + i['interest'] for i in INSTALLMENTS)
print('\n預算：%s − 固定 %s − 分期 %s = 可自由支配 %s' % (
    format(BUDGET['income'], ','), format(fixed_sum, ','), format(inst_sum, ','),
    format(BUDGET['income'] - fixed_sum - inst_sum, ',')))

out = ('/* 由 tools/build_seed.py 產生，請勿手改。\n'
       '   來源：FC.xlsx + 115/09 台新／寰宇／國泰CUBE／聯邦、115/03 與 115/09 富邦 信用卡帳單 */\n'
       'window.SEED = ' +
       json.dumps(dict(categories=CATEGORIES, cards=CARDS, records=R, subs=SUBS,
                       installments=INSTALLMENTS, budget=BUDGET),
                  ensure_ascii=False, indent=1) + ';\n')
path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'seed.js')
io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
print('\n寫出 %s（%.1f KB）' % (path, os.path.getsize(path) / 1024))
