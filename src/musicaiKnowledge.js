export const BKT_PARAMS = {
  pL0: 0.2,
  pT: 0.15,
  pG: 0.25,
  pS: 0.1,
  masteryThreshold: 0.8,
};

export const KNOWLEDGE_POINTS = [
    {
        "id":  "L1_K1_pitchProperties",
        "lessonId":  "L1",
        "chapterId":  "ch1",
        "title":  "音的四种性质",
        "subConcepts":  [
                            "音高由频率(Hz)决定",
                            "音值由振动持续时间决定",
                            "音量由振幅决定",
                            "音色由泛音列构成决定",
                            "A4 = 440 Hz 国际标准音"
                        ],
        "exerciseTypes":  [
                              "主要：AI 导师问答 (概念性问题)",
                              "辅助：术语闪卡"
                          ],
        "easy":  [
                     "什么决定了音的高低？",
                     "A4 标准音的频率是多少 Hz？",
                     "基础概念辨识题"
                 ],
        "medium":  [
                       "为何同一音高的钢琴和小提琴听起来不同？",
                       "振幅与音量的关系",
                       "概念应用题"
                   ],
        "hard":  [
                     "若 A4=440Hz, A5 频率是？",
                     "分析某乐音的四种性质",
                     "综合分析题"
                 ]
    },
    {
        "id":  "L1_K2_wholeStepHalfStep",
        "lessonId":  "L1",
        "chapterId":  "ch1",
        "title":  "全音与半音",
        "subConcepts":  [
                            "半音是最小音程单位",
                            "全音 = 两个半音",
                            "天然半音：E-F、B-C",
                            "钢琴键盘上的位置识别",
                            "大调音阶模式：全全半全全全半"
                        ],
        "exerciseTypes":  [
                              "主要：音程练习 (Interval Exercise)",
                              "辅助：音高识别练习"
                          ],
        "easy":  [
                     "C-D (全) vs C-C♯ (半)",
                     "仅基本音级中的全/半音判断",
                     "相邻白键判断"
                 ],
        "medium":  [
                       "加入 E-F、B-C 天然半音",
                       "含基本音级各种组合",
                       "含简单变化音级"
                   ],
        "hard":  [
                     "跨八度判断",
                     "含重升/重降变化音",
                     "大调音阶完整推导"
                 ]
    },
    {
        "id":  "L2_K1_octaveGroups",
        "lessonId":  "L2",
        "chapterId":  "ch1",
        "title":  "音组划分与中央 C",
        "subConcepts":  [
                            "大字二组到小字五组的体系",
                            "中央 C = c¹ = C4",
                            "大写/小写记法规则",
                            "中央 C 在大谱表的两种位置",
                            "频率约 261.63 Hz"
                        ],
        "exerciseTypes":  [
                              "主要：记谱练习 (Notation Exercise)",
                              "辅助：AI 导师问答"
                          ],
        "easy":  [
                     "识别小字一组、二组的音名",
                     "指出中央 C 的位置",
                     "基本音组归属判断"
                 ],
        "medium":  [
                       "加入大字组、大字一组",
                       "大谱表中央 C 双位置识别",
                       "音组与频率范围对应"
                   ],
        "hard":  [
                     "跨多个音组的快速识别",
                     "罕见音组 (大字二组、小字五组)",
                     "音组与钢琴键盘对应"
                 ]
    },
    {
        "id":  "L2_K2_temperamentEnharmonic",
        "lessonId":  "L2",
        "chapterId":  "ch1",
        "title":  "律制与等音",
        "subConcepts":  [
                            "十二平均律基本原理",
                            "纯律与五度相生律的差异",
                            "中国「三分损益法」",
                            "等音对 (C♯=D♭ 等)",
                            "不同调性中等音的选择"
                        ],
        "exerciseTypes":  [
                              "主要：AI 导师问答",
                              "辅助：术语闪卡"
                          ],
        "easy":  [
                     "识别基本等音对：C♯=D♭",
                     "说出三种律制名称",
                     "等音的基本概念"
                 ],
        "medium":  [
                       "解释三种律制的差异",
                       "罕见等音：E♯=F, B♯=C",
                       "等音的作曲选择原理"
                   ],
        "hard":  [
                     "判断特定调性中应使用哪种写法",
                     "纯律与平均律的频率比计算",
                     "泛音列与律制的关系"
                 ]
    },
    {
        "id":  "L3_K1_trebleClef",
        "lessonId":  "L3",
        "chapterId":  "ch2",
        "title":  "高音谱号识读",
        "subConcepts":  [
                            "G 谱号的螺旋中心 = G4",
                            "五线音名：E-G-B-D-F (Every Good Boy Does Fine)",
                            "四间音名：F-A-C-E (FACE)",
                            "中央 C 在下加一线",
                            "加线音的识读"
                        ],
        "exerciseTypes":  [
                              "主要：记谱练习 (Notation Exercise)",
                              "辅助：术语闪卡"
                          ],
        "easy":  [
                     "五线四间内的音名识别",
                     "仅 E4-F5 范围内",
                     "直接显示在线/间上的音"
                 ],
        "medium":  [
                       "加入下加一线 (中央C)",
                       "上加一线、上加一间",
                       "小升降号变化音"
                   ],
        "hard":  [
                     "上下加二线及更远",
                     "含双升降号",
                     "复杂加线音的快速识读"
                 ]
    },
    {
        "id":  "L3_K2_bassClef",
        "lessonId":  "L3",
        "chapterId":  "ch2",
        "title":  "低音谱号识读",
        "subConcepts":  [
                            "F 谱号两点夹住第四线 = F3",
                            "五线音名：G-B-D-F-A (Good Boys Do Fine Always)",
                            "四间音名：A-C-E-G (All Cows Eat Grass)",
                            "中央 C 在上加一线",
                            "与高音谱号的衔接关系"
                        ],
        "exerciseTypes":  [
                              "主要：记谱练习 (Notation Exercise)",
                              "辅助：术语闪卡"
                          ],
        "easy":  [
                     "五线四间内的音名识别",
                     "仅 G2-A3 范围内",
                     "直接显示在线/间上的音"
                 ],
        "medium":  [
                       "加入上加一线 (中央C)",
                       "下加一线、下加一间",
                       "小升降号变化音"
                   ],
        "hard":  [
                     "上下加二线及更远",
                     "大谱表中央 C 双写法",
                     "含变化音的复杂识读"
                 ]
    },
    {
        "id":  "L4_K1_noteValues",
        "lessonId":  "L4",
        "chapterId":  "ch2",
        "title":  "音符时值体系",
        "subConcepts":  [
                            "全音符到三十二分音符的二分递减",
                            "全音符=4拍, 二分=2拍, 四分=1拍",
                            "八分=½拍, 十六分=¼拍",
                            "时值换算关系",
                            "符头、符干、符尾的构成"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习 (Rhythm Exercise)",
                              "辅助：AI 导师问答"
                          ],
        "easy":  [
                     "识别音符的名称",
                     "基本时值换算 (1全=2二分)",
                     "单一音符的拍数"
                 ],
        "medium":  [
                       "节奏型的总时值计算",
                       "混合时值识别",
                       "符干方向判断"
                   ],
        "hard":  [
                     "复杂节奏型的拍数推算",
                     "三十二分音符的应用",
                     "含休止符的节奏总长"
                 ]
    },
    {
        "id":  "L4_K2_dotsAndTies",
        "lessonId":  "L4",
        "chapterId":  "ch2",
        "title":  "附点与连音线",
        "subConcepts":  [
                            "附点 = 增加一半时值",
                            "复附点 = 增加 ¾",
                            "连音线 (tie) 跨小节",
                            "连音线 vs 连奏线 (slur)",
                            "三连音的记写"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习 (Rhythm Exercise)",
                              "辅助：AI 导师问答"
                          ],
        "easy":  [
                     "附点四分=1.5拍",
                     "连音线的基本概念",
                     "简单跨小节连接"
                 ],
        "medium":  [
                       "复附点的时值计算",
                       "三连音的识别",
                       "区分 tie 与 slur"
                   ],
        "hard":  [
                     "复杂跨小节长音",
                     "附点+连音线+三连音组合",
                     "非常规节奏型"
                 ]
    },
    {
        "id":  "L5_K1_trillMordent",
        "lessonId":  "L5",
        "chapterId":  "ch3",
        "title":  "颤音与波音",
        "subConcepts":  [
                            "颤音 tr 的定义与演奏",
                            "上波音 𝆗：主→上→主",
                            "下波音 𝆘：主→下→主",
                            "巴洛克 vs 古典演奏方式",
                            "颤音的收尾"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：记谱练习 (识别符号)"
                          ],
        "easy":  [
                     "识别 tr、𝆗、𝆘 三个符号",
                     "说出装饰音的中文名",
                     "基本演奏方向"
                 ],
        "medium":  [
                       "上波音与下波音的演奏顺序",
                       "颤音的速度规范",
                       "巴洛克时期从上方音开始"
                   ],
        "hard":  [
                     "区分相似符号 (波音 vs 短颤音)",
                     "古典 vs 浪漫演奏差异",
                     "含调性变化的下方二度音"
                 ]
    },
    {
        "id":  "L5_K2_turnAppoggiatura",
        "lessonId":  "L5",
        "chapterId":  "ch3",
        "title":  "回音与倚音",
        "subConcepts":  [
                            "回音 ∽ 的四音顺序",
                            "反向回音",
                            "长前倚音 (占主音时值一半)",
                            "后倚音 (符干上加斜线)",
                            "倚音的演奏速度"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "识别 ∽ 与小音符",
                     "回音 = 四个音",
                     "前倚音与后倚音的符号区别"
                 ],
        "medium":  [
                       "回音的演奏顺序：上→主→下→主",
                       "长前倚音的时值计算",
                       "反向回音的演奏"
                   ],
        "hard":  [
                     "回音的两种位置 (音上 vs 音间)",
                     "长/短前倚音的判断",
                     "复杂倚音组合"
                 ]
    },
    {
        "id":  "L6_K1_dynamics",
        "lessonId":  "L6",
        "chapterId":  "ch3",
        "title":  "力度记号",
        "subConcepts":  [
                            "8 级力度：ppp 到 fff",
                            "crescendo (cresc., \u003c) 渐强",
                            "diminuendo (dim., \u003e) 渐弱",
                            "sforzando (sf, sfz) 突强",
                            "forte-piano (fp)"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "8 级力度从弱到强排序",
                     "基本符号识别 (p, f, mp, mf)",
                     "中文翻译"
                 ],
        "medium":  [
                       "渐强渐弱的两种写法",
                       "sf 与 fp 的区别",
                       "力度变化的应用"
                   ],
        "hard":  [
                     "罕见力度 (pppp, ffff)",
                     "复合力度术语",
                     "力度的音乐表现意义"
                 ]
    },
    {
        "id":  "L6_K2_articulation",
        "lessonId":  "L6",
        "chapterId":  "ch3",
        "title":  "奏法记号",
        "subConcepts":  [
                            "连奏 legato (弧线)",
                            "断奏 staccato (圆点)",
                            "保持音 tenuto (短横线)",
                            "重音 accent (\u003e)",
                            "跳音、拨奏等"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "三种基本奏法的符号",
                     "中文名称",
                     "演奏方式简述"
                 ],
        "medium":  [
                       "连奏 vs 断奏 vs 保持音的区别",
                       "重音 vs 突强的差异",
                       "奏法的乐器适配"
                   ],
        "hard":  [
                     "复合奏法 (mezzo-staccato 等)",
                     "弦乐特殊奏法 (spiccato, pizz.)",
                     "奏法的风格选择"
                 ]
    },
    {
        "id":  "L7_K1_repeatSigns",
        "lessonId":  "L7",
        "chapterId":  "ch4",
        "title":  "反复记号",
        "subConcepts":  [
                            "𝄆 ... 𝄇 反复段落",
                            "百分号 ⁒ 重复前一小节",
                            "第一/第二结尾 (Volta)",
                            "bis、ter 标记",
                            "反复次数标注"
                        ],
        "exerciseTypes":  [
                              "主要：AI 导师 + 术语闪卡",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "识别 𝄆 与 𝄇 符号",
                     "基本反复的演奏顺序",
                     "百分号 ⁒ 的含义"
                 ],
        "medium":  [
                       "第一/第二结尾的演奏",
                       "多次反复 (×3) 的标注",
                       "bis、ter 的拉丁语含义"
                   ],
        "hard":  [
                     "复杂反复结构的演奏顺序推导",
                     "含变化反复的乐段",
                     "多重结尾 (1./2./3.)"
                 ]
    },
    {
        "id":  "L7_K2_dcDsCoda",
        "lessonId":  "L7",
        "chapterId":  "ch4",
        "title":  "D.C.、D.S.、Coda 与 Fine",
        "subConcepts":  [
                            "D.C. (Da Capo) 从头",
                            "D.S. (Dal Segno) 从 𝄋 记号",
                            "Coda ⊕ 尾声",
                            "Fine 结束",
                            "常见组合 (al Fine, al Coda)"
                        ],
        "exerciseTypes":  [
                              "主要：AI 导师 + 术语闪卡",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "四个术语的中文含义",
                     "Fine 表示「结束",
                     "D.C. 表示「从头"
                 ],
        "medium":  [
                       "D.C. al Fine 的演奏顺序",
                       "D.S. al Coda 的跳转",
                       "segno 与 coda 符号识别"
                   ],
        "hard":  [
                     "复杂结构推导 (D.S. al Coda + 反复)",
                     "多个 Coda 的处理",
                     "现代乐谱中的变体用法"
                 ]
    },
    {
        "id":  "L8_K1_tempoTerms",
        "lessonId":  "L8",
        "chapterId":  "ch4",
        "title":  "速度术语",
        "subConcepts":  [
                            "Largo (40-60), Adagio (66-76)",
                            "Andante (76-108), Moderato (108-120)",
                            "Allegro (120-156), Vivace (156-176)",
                            "Presto (168-200)",
                            "accel., rit., a tempo"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "5 个常见速度：Largo, Adagio, Andante, Allegro, Presto",
                     "中文翻译",
                     "按速度排序"
                 ],
        "medium":  [
                       "完整 12 级速度术语",
                       "BPM 范围对应",
                       "速度变化记号 (accel., rit.)"
                   ],
        "hard":  [
                     "罕见术语 (Larghissimo, Prestissimo)",
                     "意大利语词根分析",
                     "stringendo, allargando 等"
                 ]
    },
    {
        "id":  "L8_K2_expressionTerms",
        "lessonId":  "L8",
        "chapterId":  "ch4",
        "title":  "表情术语",
        "subConcepts":  [
                            "dolce 甜美",
                            "cantabile 如歌",
                            "espressivo 富表情",
                            "con brio 有活力",
                            "maestoso 庄严"
                        ],
        "exerciseTypes":  [
                              "主要：术语闪卡 + AI 导师",
                              "辅助：AI 导师问答"
                          ],
        "easy":  [
                     "5 个最常用表情术语",
                     "中文翻译",
                     "基本意境联想"
                 ],
        "medium":  [
                       "10+ 表情术语",
                       "复合术语 (con brio e maestoso)",
                       "表情术语的乐曲风格匹配"
                   ],
        "hard":  [
                     "罕见表情术语 (appassionato, scherzando)",
                     "德语/法语表情术语对照",
                     "创作中如何选用"
                 ]
    },
    {
        "id":  "L9_K1_timeSignatureMeter",
        "lessonId":  "L9",
        "chapterId":  "ch5",
        "title":  "拍号与强弱规律",
        "subConcepts":  [
                            "拍号上方=拍数，下方=拍单位",
                            "2/4 = 强弱",
                            "3/4 = 强弱弱",
                            "4/4 = 强弱次强弱",
                            "6/8 = 强弱弱次强弱弱"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习 (Rhythm Exercise)",
                              "辅助：AI 导师"
                          ],
        "easy":  [
                     "识别 2/4、3/4、4/4 拍号",
                     "说出强弱规律",
                     "基本拍号含义"
                 ],
        "medium":  [
                       "6/8、9/8 的强弱模式",
                       "4/4 拍的次强拍位置",
                       "拍号与音乐风格匹配"
                   ],
        "hard":  [
                     "混合拍子 (5/8, 7/8) 的强弱",
                     "复杂拍号的强弱推导",
                     "变拍号乐曲分析"
                 ]
    },
    {
        "id":  "L9_K2_simpleCompound",
        "lessonId":  "L9",
        "chapterId":  "ch5",
        "title":  "单拍子与复拍子",
        "subConcepts":  [
                            "单拍子：每拍二等分",
                            "复拍子：每拍三等分",
                            "6/8 = 复二拍子 (3+3)",
                            "9/8 = 复三拍子 (3+3+3)",
                            "12/8 = 复四拍子"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习",
                              "辅助：AI 导师"
                          ],
        "easy":  [
                     "判断单/复拍子",
                     "2/4、3/4 是单拍子",
                     "6/8 是复拍子"
                 ],
        "medium":  [
                       "区分 6/8 (复二) 与 3/4 (单三)",
                       "复拍子的大拍数",
                       "9/8、12/8 的归类"
                   ],
        "hard":  [
                     "混合拍子 (5/8, 7/8) 的归类",
                     "单/复拍子的音乐律动差异",
                     "罕见拍号 (11/8, 15/8)"
                 ]
    },
    {
        "id":  "L10_K1_noteGrouping",
        "lessonId":  "L10",
        "chapterId":  "ch5",
        "title":  "音值组合规则",
        "subConcepts":  [
                            "拍内清晰、拍间分明",
                            "4/4 拍的半小节中线",
                            "复拍子按 3+3 分组",
                            "符尾连接的规范",
                            "强拍位置的视觉突出"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习",
                              "辅助：AI 导师 + 记谱练习"
                          ],
        "easy":  [
                     "识别正确 vs 错误的音值组合",
                     "4/4 拍中 8 个八分=4+4",
                     "基本组合规则"
                 ],
        "medium":  [
                       "判断 6/8 vs 3/4 的组合方式",
                       "4/4 拍跨半小节的拆分",
                       "附点音符的组合位置"
                   ],
        "hard":  [
                     "复杂混合节奏的组合",
                     "3+3+2 vs 2+3+3 的视觉差异",
                     "现代记谱中的特殊组合"
                 ]
    },
    {
        "id":  "L10_K2_crossBarTies",
        "lessonId":  "L10",
        "chapterId":  "ch5",
        "title":  "跨小节连音线",
        "subConcepts":  [
                            "长音超过小节时用连音线",
                            "4/4 拍中 5 拍 C 音的写法",
                            "不可能的附点形式",
                            "连音线连接的音高规则",
                            "切分中的连音线应用"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习",
                              "辅助：记谱练习"
                          ],
        "easy":  [
                     "识别跨小节连音线",
                     "5 拍 = 1 拍 + 全音符 (连音线)",
                     "基本跨小节写法"
                 ],
        "medium":  [
                       "7 拍、9 拍长音的写法",
                       "附点音符无法表达的时值",
                       "切分节奏中的连音线"
                   ],
        "hard":  [
                     "复杂复合长音 (如 5.5 拍)",
                     "跨多个小节的连音线",
                     "复杂节奏的连音线优化"
                 ]
    },
    {
        "id":  "L11_K1_syncopationTypes",
        "lessonId":  "L11",
        "chapterId":  "ch5",
        "title":  "切分的三种形式",
        "subConcepts":  [
                            "弱拍延长 (连音线切分)",
                            "弱位重音 (\u003e)",
                            "休止强拍 (强拍休止)",
                            "切分的本质：重音错位",
                            "切分 vs 规整节奏的对比"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习 (Rhythm Exercise)",
                              "辅助：AI 导师"
                          ],
        "easy":  [
                     "识别切分节奏的存在",
                     "说出三种切分形式的名称",
                     "切分的基本概念"
                 ],
        "medium":  [
                       "判断节奏属于哪种切分形式",
                       "演奏切分时的重音位置",
                       "切分的音乐效果"
                   ],
        "hard":  [
                     "复合切分 (多种形式叠加)",
                     "切分 vs 三连音的辨析",
                     "隐藏切分的识别"
                 ]
    },
    {
        "id":  "L11_K2_classicSyncopation",
        "lessonId":  "L11",
        "chapterId":  "ch5",
        "title":  "经典切分型",
        "subConcepts":  [
                            "「短-长-短」型：八分+四分+八分",
                            "长-短-长 型",
                            "长前切分 (附点四分+八分)",
                            "长后切分 (八分+附点四分)",
                            "切分在不同风格中的应用"
                        ],
        "exerciseTypes":  [
                              "主要：节奏练习",
                              "辅助：AI 导师"
                          ],
        "easy":  [
                     "识别「短-长-短」基本型",
                     "判断节奏型是否含切分",
                     "经典切分的视觉特征"
                 ],
        "medium":  [
                       "演奏「短-长-短」切分",
                       "长前切分 vs 长后切分",
                       "切分在爵士、拉丁中的应用"
                   ],
        "hard":  [
                     "复杂切分组合 (含十六分音符)",
                     "切分在古典作品中的运用",
                     "创作中如何运用切分"
                 ]
    },
    {
        "id":  "L12_K1_review",
        "lessonId":  "L12",
        "chapterId":  "ch5",
        "title":  "综合复习 1",
        "subConcepts":  [
                            "复习第 1-3 章所有知识点：",
                            "• 音的性质、音阶、律制",
                            "• 谱号、谱表、音符、休止符"
                        ],
        "exerciseTypes":  [
                              "AI 导师问答",
                              "所有题型的混合练习"
                          ],
        "easy":  "基础概念的快速回顾",
        "medium":  "中等难度的综合应用题",
        "hard":  "易混淆概念的最终澄清"
    },
    {
        "id":  "L12_K2_review",
        "lessonId":  "L12",
        "chapterId":  "ch5",
        "title":  "综合复习 2",
        "subConcepts":  [
                            "复习第 4-5 章所有知识点：",
                            "• 装饰音、演奏符号、术语",
                            "• 节奏、拍号、切分"
                        ],
        "exerciseTypes":  [
                              "AI 导师问答",
                              "所有题型的混合练习"
                          ],
        "easy":  "基础概念的快速回顾",
        "medium":  "中等难度的综合应用题",
        "hard":  "易混淆概念的最终澄清"
    }
];

export const KNOWLEDGE_POINTS_BY_ID = Object.fromEntries(KNOWLEDGE_POINTS.map((item) => [item.id, item]));
export const KNOWLEDGE_POINTS_BY_LESSON = KNOWLEDGE_POINTS.reduce((acc, item) => {
  if (!acc[item.lessonId]) acc[item.lessonId] = [];
  acc[item.lessonId].push(item);
  return acc;
}, {});
export const KNOWLEDGE_POINTS_BY_CHAPTER = KNOWLEDGE_POINTS.reduce((acc, item) => {
  if (!acc[item.chapterId]) acc[item.chapterId] = [];
  acc[item.chapterId].push(item);
  return acc;
}, {});

export function getKnowledgePointsForLesson(lessonId) {
  return KNOWLEDGE_POINTS_BY_LESSON[lessonId] || [];
}

export function getKnowledgePoint(id) {
  return KNOWLEDGE_POINTS_BY_ID[id] || null;
}
