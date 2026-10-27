"""Use Chinese display labels while retaining original resource identifiers and aliases."""
from pathlib import Path
import json
import re

SITE = Path(__file__).resolve().parents[1] / 'dist'

def load(path):
    return json.loads(path.read_text(encoding='utf-8').split('=',1)[1].strip().removesuffix(';'))

def save(path, variable, data):
    path.write_text(variable + '=' + json.dumps(data, ensure_ascii=False, separators=(',',':')) + ';\n',encoding='utf-8')

NAMES = {
 'ルナ':'樱小路露娜','桜小路才華':'樱小路才华','大蔵りそな':'大藏里想奈','大蔵ルミネ':'大藏瑠美音','朝日':'小仓朝日','エスト':'艾斯特',
 'アルタ':'阿尔塔','アンソニー':'安东尼','エッテ':'布琉艾特','カットイン':'插入立绘','カトリーヌ':'卡特琳','カリン':'卡琳','サーシャ':'莎夏',
 'ジャスティーヌ':'贾斯汀','スタンレー':'斯坦利','ディートリンデ':'迪特琳德','メリル':'梅丽尔','ラフォーレ':'拉福雷','リリアーヌ':'莉莉安','ヴァレリア':'瓦蕾莉亚',
 '一丸弓':'一丸弓','伊代':'八十岛壹与','八日堂朔莉':'八日堂朔莉','北斗':'杉村北斗','名波七愛':'名波七爱','大津賀かぐや':'大津贺赫映',
 '大蔵アンソニーjr':'大藏小安东尼','大蔵衣遠':'大藏衣远','ユルシュール':'尤希尔','山吹九千代':'山吹九千代','山吹八千代':'山吹八千代','山県大瑛':'山县大瑛',
 '影':'剪影','柳ヶ瀬湊':'柳之濑凑','梅宮伊瀬也':'梅宫伊濑也','桜小路アトレ':'樱小路亚十礼','紅葉':'枞山红叶','花之宮瑞穂':'花之宫瑞穗','華花':'华花','銀条春心':'银条春心','駿我':'骏我',
 '大蔵遊星':'大藏游星','作品素材':'作品素材'
}
EXTRA_ALIASES = {'大蔵りそな':['大藏理想奈','里想奈','理想奈'],'大蔵ルミネ':['大藏露米涅','露米涅','瑠美音'],'エッテ':['艾特','艾缇','布琉艾特','Bluette'],'大津賀かぐや':['辉夜','赫映'],'伊代':['伊代','八十岛壹与'],'紅葉':['红叶','枞山红叶']}
WORKS = [
 {'id':'01_近月少女的礼仪','label':'近月少女的礼仪','legacyLabel':'近月少女的礼仪','originalTitle':'月に寄りそう乙女の作法'},
 {'id':'02_少女理论_Ecole_de_Paris','label':'少女理论及其周边（巴黎篇）','legacyLabel':'少女理论 Ecole de Paris','originalTitle':'乙女理論とその周辺 -Ecole de Paris-'},
 {'id':'03_少女理论_Belle_Epoque','label':'少女理论之后的周边（美好时代）','legacyLabel':'少女理论 Belle Epoque','originalTitle':'乙女理論とその後の周辺 -Belle Epoque-'},
 {'id':'04_近月少女的礼仪2','label':'近月少女的礼仪2','legacyLabel':'近月少女的礼仪2','originalTitle':'月に寄りそう乙女の作法2'},
 {'id':'05_近月少女的礼仪2.1','label':'近月少女的礼仪2.1','legacyLabel':'近月少女的礼仪2.1','originalTitle':'月に寄りそう乙女の作法2.1 E×S×PAR!!'},
 {'id':'06_近月少女的礼仪2.2','label':'近月少女的礼仪2.2','legacyLabel':'近月少女的礼仪2.2','originalTitle':'月に寄りそう乙女の作法2.2 A×L+SA!!'}
]

def translate_scene(text):
    replacements = {'bg花の宮　客間s':'花之宫宅邸·客厅（远景）','bg花の宮　廊下s':'花之宫宅邸·走廊（远景）','bg花の宮　邸宅s':'花之宫宅邸（远景）','その後_エピローグ画面':'后日谈·尾声画面','乙女理論_アイキャッチ':'少女理论·过场插画'}
    if text in replacements:
        return replacements[text]
    month = re.search(r'月切り替わり画面_(\d+)月',text)
    if month:
        prefix = '少女理论后日谈·' if text.startswith('乙女理論af') else '少女理论·' if text.startswith('乙女理論') else ''
        return prefix + '月份切换·' + month[1] + '月'
    return text

def main():
    catalog = load(SITE/'catalog-data.js')
    game = load(SITE/'game-data.js')
    for role in catalog['characters']:
        old = role['display']
        role['display'] = NAMES[role['id']]
        role['aliases'] = list(dict.fromkeys([*role['aliases'],old,role['display'],*EXTRA_ALIASES.get(role['id'],[])]))
    variants = {}
    for variant in sorted({r['variant'] for r in game}):
        base = variant.split('（',1)[0]
        label = NAMES.get(base,base)
        if '過去' in variant:
            label += '（过去）'
        elif '2専用' in variant:
            label += '（近月2版）'
        variants[variant] = label
    for pack in catalog['costumePacks']:
        pack['display'] = NAMES[pack['character']]
        pack['variantLabel'] = variants[pack['variant']]
    catalog['variantLabels'] = variants
    catalog['works'] = WORKS
    catalog['updated'] = '2026-10-27'
    save(SITE/'catalog-data.js','window.CATALOG_DATA',catalog)
    public = json.loads((SITE/'data/costume-packs.json').read_text(encoding='utf-8'))
    public['packs'] = catalog['costumePacks']
    (SITE/'data/costume-packs.json').write_text(json.dumps(public,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    bg = load(SITE/'backgrounds/catalog.js')
    scenes = {p['scene']:translate_scene(p['scene']) for p in bg['packs']}
    bg['labels'] = {'games':{w['id']:w['label'] for w in WORKS},'scenes':scenes}
    save(SITE/'backgrounds/catalog.js','window.BACKGROUND_DATA',bg)
    sources = [
      {'url':'https://hikarifield.co.jp/tsukiniyorisou/chara.html','note':'近月1官方中文版角色姓名'},
      {'url':'https://store.hikarifield.co.jp/shop/otomeriron/game_guide','note':'少女理论官方攻略中的中文姓名'},
      {'url':'https://store.hikarifield.co.jp/shop/tsukiniyorisou_2nd/game_guide','note':'近月2官方攻略中的中文姓名'}
    ]
    (SITE/'data/chinese-labels.json').write_text(json.dumps({'characters':NAMES,'variants':variants,'works':WORKS,'sources':sources,'notes':'有官方中文名的优先沿用官方译名；其余配角为中文音译。原始ID、文件名和日文别名保留。'},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'roles':len(catalog['characters']),'variants':len(variants),'translatedBackgroundScenes':sum(k!=v for k,v in scenes.items())}))

if __name__ == '__main__':
    main()
