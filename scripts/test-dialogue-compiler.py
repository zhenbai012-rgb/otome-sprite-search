"""Small engine-state regressions; no local game or executable is required."""
from pathlib import Path
import sys, unittest
sys.path.insert(0,str(Path(__file__).parent/'dialogue'))
from compile import scene_compile, Speakers
from visual_state import ArtworkResourceIndex, VisualStateTracker
from routes import adult_segments

class CompilerTests(unittest.TestCase):
    def setUp(self):
        self.index=ArtworkResourceIndex({'resources':{
            '01|画像/bg/day.png':{'assetId':'day','assetIds':['day']},
            '01|画像/bg/night.png':{'assetId':'night','assetIds':['night']},
            '01|立ち絵/a/a_s_0_0_00.png':{'assetId':'smile','assetIds':['smile']},
            '01|立ち絵/a/a_s_0_0_01.png':{'assetId':'sad','assetIds':['sad']},
        },'assets':{},'engineContext':{'01':{'models':{'avg|image':{'defaults':{'show':'true'}},'avg|chara':{'defaults':{'show':'true'},'fragmentCount':6}},'includes':{'include/allclear':[]}}}})
        self.speakers=Speakers({'characters':[{'id':'a','display':'甲','aliases':['甲']}]})
    def parse(self,text):
        return scene_compile({'entry':'scenario/test.s','text':text},{},VisualStateTracker(self.index,'01'),self.speakers,[])[0]
    def test_incremental_expression_and_visibility(self):
        state=VisualStateTracker(self.index,'01')
        state.feed('^chara01,file0:a/,file1:a_,file2:s_,file3:0_,file4:0_,file5:00')
        self.assertEqual(state.snapshot()['characters'][0]['assetId'],'smile')
        state.feed('^chara01,file5:01')
        self.assertEqual(state.snapshot()['characters'][0]['assetId'],'sad')
        state.feed('^chara01,show:false');self.assertEqual(state.snapshot()['characters'],[])
        state.feed('^chara01,show:true');self.assertEqual(state.snapshot()['characters'][0]['assetId'],'sad')
        state.feed('^include,allclear');self.assertEqual(state.snapshot()['characters'][0]['assetId'],'sad')
        state.feed('^chara01,file0:none');self.assertEqual(state.snapshot()['characters'],[])
    def test_only_marked_interval_is_excluded(self):
        text='^bg01,file:bg/day\n【甲】\n「之前」\n^savefilter,1\n^bg01,file:bg/night\n【甲】\n「私有区间」\n^savefilter,0\n^bg01,file:bg/day\n【甲】\n「之后」'
        result=self.parse(text)
        self.assertEqual([r[1] for r in result['rows']],['「之前」','「之后」'])
        self.assertEqual([result['states'][r[5]]['background']['asset'] for r in result['rows']],['day','day'])
        self.assertEqual(len(adult_segments(text)),1)
        self.assertEqual(adult_segments('^bg01,file:effect/回想_白枠\n普通回想'),[])
    def test_unknown_condition_keeps_both_visuals(self):
        result=self.parse('\\if,flag==1\\then\n^bg01,file:bg/day\n\\else\n^bg01,file:bg/night\n\\end\n【甲】\n「汇合」')
        state=result['states'][result['rows'][0][5]]
        self.assertEqual(set(state['background']['candidates']),{'day','night'})
        self.assertIsNone(state['background']['asset'])
    def test_select_label_does_not_run_branches_sequentially(self):
        text='^select,"白天","夜晚"\n^selectlabel,@@day,@@night\n\\jmp,Avg_SelectCurLabel\n@@day\n^bg01,file:bg/day\n【甲】\n「日间」\n\\jmp,@@join\n@@night\n^bg01,file:bg/night\n【甲】\n「夜间」\n@@join\n【甲】\n「汇合」'
        result=self.parse(text);texts=[r[1] for r in result['rows']]
        self.assertIn('「日间」',texts);self.assertIn('「夜间」',texts)
        last=result['states'][result['rows'][-1][5]]
        self.assertEqual(set(last['background']['candidates']),{'day','night'})

if __name__=='__main__':unittest.main()
