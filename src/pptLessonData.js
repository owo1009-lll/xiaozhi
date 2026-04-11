const LESSON_RUNTIME_META = {
  L1: { lab: "https://musiclab.chromeexperiments.com/Sound-Waves/", labN: "声波实验", ex: "pitch" },
  L2: { lab: "https://musiclab.chromeexperiments.com/Harmonics/", labN: "泛音实验", ex: "interval" },
  L3: { lab: "https://musiclab.chromeexperiments.com/Piano-Roll/", labN: "钢琴卷帘", ex: "notation" },
  L4: { lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "notation" },
  L5: { lab: "https://musiclab.chromeexperiments.com/Melody-Maker/", labN: "旋律创作器", ex: "interval" },
  L6: { lab: "https://musiclab.chromeexperiments.com/Arpeggios/", labN: "琶音实验", ex: "chord" },
  L7: { lab: "https://musiclab.chromeexperiments.com/Strings/", labN: "弦乐实验", ex: "interval" },
  L8: { lab: "https://musiclab.chromeexperiments.com/Shared-Piano/", labN: "共享钢琴", ex: "terms" },
  L9: { lab: "https://musiclab.chromeexperiments.com/Rhythm/", labN: "节奏实验", ex: "rhythm" },
  L10: { lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "rhythm" },
  L11: { lab: "https://musiclab.chromeexperiments.com/Rhythm/", labN: "节奏实验", ex: "rhythm" },
  L12: { lab: "https://musiclab.chromeexperiments.com/Song-Maker/", labN: "歌曲创作器", ex: "chord" },
};

export const PPT_LESSON_DATA = {
  L1: {
    lessonId: "L1",
    lessonNumber: 1,
    chapterId: "ch1",
    chapter: "第一章 · 乐音体系",
    lessonTitle: "音的性质与乐音体系",
    knowledgePoints: [
      { title: "音的四种性质", detail: "音高、音值、音量、音色的物理基础与音乐意义。" },
      { title: "乐音与噪音", detail: "理解振动规则性与音乐声音之间的关系。" },
      { title: "音阶与音级", detail: "掌握七个基本音级 C、D、E、F、G、A、B 及唱名。" },
      { title: "变化音级", detail: "认识升号、降号、还原号对音高的改变作用。" },
      { title: "全音与半音", detail: "理解最小音程单位与天然半音 E-F、B-C。" },
      { title: "等音的概念", detail: "建立音名不同但音高相同的基础认知。" },
    ],
    keyPoints: [
      "音的四种物理性质及其决定因素。",
      "七个基本音级与唱名的对应关系。",
      "全音与半音的判断方法。",
      "钢琴键盘上的天然半音位置。",
    ],
    difficultPoints: [
      "理解“音色由泛音列决定”的抽象概念。",
      "在键盘和五线谱上准确识别全音、半音关系。",
      "区分基本音级与变化音级。",
    ],
    inClassExercises: [
      "判断声音类型：钢琴声、鼓声、风声、长笛声分别属于乐音还是噪音。",
      "在 C 大调音阶中标出所有天然半音的位置。",
      "写出比 C 高一个半音、比 G 低一个半音的音名。",
      "解释：两位演奏家在同一钢琴上以相同力度演奏 A4，听众如何分辨？",
    ],
    homework: [
      "概念整理：用表格梳理音高、音值、音量、音色四种性质，并各写出一个生活中的例子。",
      "规则应用：在钢琴键盘或音级序列中标出七个基本音级、变化音级、天然半音与全音关系。",
      "举例分析：任选两种乐器，比较它们演奏同一音高时的音色差异，并说明原因。",
    ],
  },
  L2: {
    lessonId: "L2",
    lessonNumber: 2,
    chapterId: "ch1",
    chapter: "第一章 · 乐音体系",
    lessonTitle: "音组、律制、等音、复合音、分音列",
    knowledgePoints: [
      { title: "音组划分", detail: "了解大字二组到小字五组的完整体系。" },
      { title: "中央 C 的定位", detail: "掌握小字一组 c1 的位置及频率约 261.63Hz。" },
      { title: "十二平均律", detail: "理解现代键盘标准与半音频率比 12√2。" },
      { title: "纯律与五度相生律", detail: "认识纯律基于自然泛音，五度相生律即三分损益法。" },
      { title: "等音", detail: "理解音高相同但记法不同的音名关系。" },
      { title: "泛音列", detail: "建立泛音列与音色、和声基础之间的联系。" },
    ],
    keyPoints: [
      "钢琴上音组划分与中央 C 的定位。",
      "十二平均律、纯律、五度相生律的特点比较。",
      "泛音列与音色的物理关系。",
      "音域与音区的概念区分。",
    ],
    difficultPoints: [
      "理解三种律制的优缺点与适用场合。",
      "理解泛音列与西方和声体系的物理基础。",
      "等音在不同调性中的选择依据。",
    ],
    inClassExercises: [
      "指出以下音属于哪一组：c1、a2、F、c4、E1。",
      "写出 F♯、E♭、A♯、D♭ 的等音。",
      "若基音 f = 110Hz，写出前 6 个泛音的频率。",
      "比较十二平均律与纯律的优缺点。",
    ],
    homework: [
      "概念整理：绘制一张“音组—中央 C—常见音区”对应表，明确音组划分规则。",
      "规则应用：分别用一句话说明十二平均律、纯律、五度相生律的特点与适用场景。",
      "举例分析：结合泛音列说明为什么不同乐器演奏同一音高会产生不同音色。",
    ],
  },
  L3: {
    lessonId: "L3",
    lessonNumber: 3,
    chapterId: "ch2",
    chapter: "第二章 · 记谱法",
    lessonTitle: "谱号与谱表",
    knowledgePoints: [
      { title: "五线谱基础", detail: "掌握五线四间、加线加间的命名规则。" },
      { title: "高音谱号", detail: "理解 G 谱号以第二线 G4 为中心定位。" },
      { title: "低音谱号", detail: "理解 F 谱号以第四线 F3 为定位。" },
      { title: "C 谱号", detail: "认识中音谱号与次中音谱号的实际使用。" },
      { title: "大谱表", detail: "了解钢琴等键盘乐器使用的双谱表系统。" },
      { title: "中央 C 的两种记法", detail: "理解同一音高在不同谱表中的位置变化。" },
    ],
    keyPoints: [
      "高音谱号五线四间的音名与记忆口诀。",
      "低音谱号五线四间的音名与记忆口诀。",
      "中央 C 在大谱表中的两种位置。",
      "C 谱号的两种常见形式。",
    ],
    difficultPoints: [
      "快速识读不熟悉的加线音。",
      "在不同谱号之间转换同一音高。",
      "理解 C 谱号中心永远指向中央 C 的原理。",
    ],
    inClassExercises: [
      "用记忆口诀写出高音谱号五线四间的所有音名。",
      "用记忆口诀写出低音谱号五线四间的所有音名。",
      "识读：高音谱表上加二线、下加二线的音是什么。",
      "将旋律 C4-D4-E4-F4-G4 改写为低音谱号。",
    ],
    homework: [
      "概念整理：分别整理高音谱号、低音谱号、C 谱号的定位规则与常见应用乐器。",
      "规则应用：在五线谱上书写中央 C 及其上下相邻音，并标注谱号变化后的对应位置。",
      "举例分析：比较高音谱号与低音谱号在阅读习惯和音域表现上的差异。",
    ],
  },
  L4: {
    lessonId: "L4",
    lessonNumber: 4,
    chapterId: "ch2",
    chapter: "第二章 · 记谱法",
    lessonTitle: "音符的写法、休止符的写法",
    knowledgePoints: [
      { title: "音符的构成", detail: "掌握符头、符干、符尾三部分结构。" },
      { title: "时值体系", detail: "理解全音符到三十二分音符的二分递减关系。" },
      { title: "符干方向", detail: "掌握第三线及以上朝下、以下朝上的书写规则。" },
      { title: "附点与复附点", detail: "理解增加 1/2 与增加 3/4 时值的规则。" },
      { title: "休止符", detail: "掌握全休、二分休止符等常见形态特征。" },
      { title: "三连音与连音", detail: "理解三连音记写与连音线的使用情境。" },
    ],
    keyPoints: [
      "音符与休止符的时值对应关系。",
      "符干方向的书写规则。",
      "附点音符的时值计算。",
      "三连音的记写与演奏。",
    ],
    difficultPoints: [
      "区分连音线与连奏线的不同含义。",
      "复附点与多重附点的时值计算。",
      "三连音在不同节拍中的演奏感觉。",
    ],
    inClassExercises: [
      "填空：1 个全音符 = ___ 个二分音符 = ___ 个四分音符 = ___ 个八分音符。",
      "计算：附点二分音符 = ___ 拍；复附点四分音符 = ___ 拍。",
      "判断符干方向：A4、E4、C5、G4、F5、D4。",
      "用连音线写出 5 拍长的 D4（4/4 拍跨小节）。",
    ],
    homework: [
      "概念整理：制作一张音符与休止符时值对照表，包含全音符至三十二分音符。",
      "规则应用：完成 4 组附点、复附点与三连音的时值换算，并写出计算过程。",
      "举例分析：选取一个跨拍或跨小节的长音，说明为什么要使用连音线而不是其他写法。",
    ],
  },
  L5: {
    lessonId: "L5",
    lessonNumber: 5,
    chapterId: "ch3",
    chapter: "第三章 · 装饰音与演奏符号",
    lessonTitle: "装饰音的定义与五种常见装饰音",
    knowledgePoints: [
      { title: "装饰音的定义", detail: "理解装饰音是丰富和美化旋律的小音符或记号。" },
      { title: "颤音", detail: "掌握主音与上方二度音快速交替的表现方式。" },
      { title: "上波音", detail: "理解主音到上方二度再回主音的演奏顺序。" },
      { title: "下波音", detail: "理解主音到下方二度再回主音的演奏顺序。" },
      { title: "回音", detail: "掌握上方音、主音、下方音、主音的四音结构。" },
      { title: "前倚音与后倚音", detail: "区分前倚音与后倚音在位置和时值上的差异。" },
    ],
    keyPoints: [
      "颤音、波音、回音的演奏顺序。",
      "前倚音与后倚音的时值差异。",
      "上波音与下波音的方向区分。",
      "装饰音的位置与符号识读。",
    ],
    difficultPoints: [
      "巴洛克时期颤音从上方音开始的传统。",
      "长前倚音占用主音时值的规则。",
      "回音两种位置的演奏差异。",
    ],
    inClassExercises: [
      "写出 G4 颤音的演奏顺序（按古典派方式）。",
      "写出 F4 上波音和下波音的演奏顺序。",
      "写出 D5 回音的四个音及顺序。",
      "区分前倚音与后倚音的记号特征。",
    ],
    homework: [
      "概念整理：整理颤音、上波音、下波音、回音、倚音的定义、符号与演奏顺序。",
      "规则应用：为一条四小节旋律设计两处装饰音，并说明每处为何这样处理。",
      "举例分析：比较巴洛克与古典时期在装饰音处理上的不同倾向。",
    ],
  },
  L6: {
    lessonId: "L6",
    lessonNumber: 6,
    chapterId: "ch3",
    chapter: "第三章 · 装饰音与演奏符号",
    lessonTitle: "五种常见演奏符号、乐谱分析",
    knowledgePoints: [
      { title: "力度记号", detail: "掌握 ppp 到 fff 的完整力度等级体系。" },
      { title: "渐强渐弱", detail: "理解 crescendo、diminuendo 与 sforzando 的区别。" },
      { title: "连奏 Legato", detail: "认识弧线连接下的平滑过渡效果。" },
      { title: "断奏 Staccato", detail: "理解断奏使时值缩短、发音分离。" },
      { title: "保持音 Tenuto", detail: "掌握保持完整时值并略加重的记号含义。" },
      { title: "重音 Accent", detail: "理解重音在乐句中的强调作用。" },
    ],
    keyPoints: [
      "8 个基本力度等级的顺序。",
      "连奏、断奏、保持音的演奏区别。",
      "意大利语速度术语的基本区间。",
      "表情术语的音乐含义。",
    ],
    difficultPoints: [
      "区分 tenuto、legato、staccato 三种相似奏法。",
      "重音与突强的细微差异。",
      "渐强渐弱的力度控制。",
    ],
    inClassExercises: [
      "按力度从弱到强排序：mf、ppp、p、fff、mp、ff、pp、f。",
      "翻译速度术语：Adagio、Andante、Allegro、Presto。",
      "选取一首熟悉乐曲，分析其力度、速度、奏法记号。",
      "为四小节旋律添加合适的演奏指示。",
    ],
    homework: [
      "概念整理：分类整理力度、速度、奏法、表情四类演奏符号与术语。",
      "规则应用：给一条旋律完整标注力度、速度和奏法，并写出设计理由。",
      "举例分析：比较 legato、staccato、tenuto 在听感和记谱上的差异。",
    ],
  },
  L7: {
    lessonId: "L7",
    lessonNumber: 7,
    chapterId: "ch4",
    chapter: "第四章 · 略写记号与音乐术语",
    lessonTitle: "常见略写记号、五种演奏法记号",
    knowledgePoints: [
      { title: "反复记号", detail: "理解常见反复线与百分号反复记号。" },
      { title: "D.C. 与 D.S.", detail: "掌握从头反复与从记号反复的区别。" },
      { title: "Coda 与 Fine", detail: "理解尾声与结束位置的结构作用。" },
      { title: "第一与第二结尾", detail: "掌握 Volta 括号的实际演奏顺序。" },
      { title: "八度记号", detail: "理解 8va、8vb、15ma 的移高移低作用。" },
      { title: "震音记号", detail: "区分震音记号与其他装饰、重复写法。" },
    ],
    keyPoints: [
      "反复记号的正确识读。",
      "D.C.、D.S.、Coda、Fine 的组合用法。",
      "第一、第二结尾的演奏顺序。",
      "8va、8vb 的方向与含义。",
    ],
    difficultPoints: [
      "复杂乐曲结构如 D.S. al Coda 的演奏顺序推导。",
      "震音与颤音的区分。",
      "符干斜线数量对应的细分时值。",
    ],
    inClassExercises: [
      "解释 D.C. al Fine 与 D.S. al Coda 的演奏方式。",
      "推导：A B 𝄋 C D D.S. al Fine（Fine 在 C）的演奏顺序。",
      "说明：四分音符上加两条斜线如何演奏。",
      "说明 8va、8vb、15ma、loco 的含义。",
    ],
    homework: [
      "概念整理：绘制一张常见略写记号与结构记号对照表。",
      "规则应用：设计一个包含反复、第一/第二结尾、Coda 或 Fine 的迷你结构图。",
      "举例分析：选择一段带有 D.C. 或 D.S. 的乐谱，写出演奏路径推导过程。",
    ],
  },
  L8: {
    lessonId: "L8",
    lessonNumber: 8,
    chapterId: "ch4",
    chapter: "第四章 · 略写记号与音乐术语",
    lessonTitle: "音乐术语与乐谱分析实例",
    knowledgePoints: [
      { title: "速度术语", detail: "掌握 Largo 至 Prestissimo 的速度体系与 BPM 范围。" },
      { title: "速度变化", detail: "认识 accel.、rit.、a tempo、stringendo 等变化术语。" },
      { title: "力度术语", detail: "系统整理意大利语力度术语。" },
      { title: "表情术语", detail: "理解 dolce、cantabile、espressivo 等表达要求。" },
      { title: "德语与法语术语", detail: "了解德奥、法国作曲家的母语标记。" },
      { title: "记忆策略", detail: "建立音乐术语的分类与间隔复习方法。" },
    ],
    keyPoints: [
      "意大利语速度术语的速度范围。",
      "常用表情术语的中文含义。",
      "意大利语成为国际通用音乐语言的原因。",
      "间隔重复法记忆术语。",
    ],
    difficultPoints: [
      "区分意思相近的术语，如 Andante 与 Andantino。",
      "德语、法语术语与意大利语的对应关系。",
      "多个术语在同一乐谱中的综合理解。",
    ],
    inClassExercises: [
      "翻译：Adagio、Andante、Allegro、Presto 的中文与 BPM。",
      "解释：dolce e cantabile、con brio e maestoso 的含义。",
      "选取一首古典作品，找出所有意大利语术语并翻译。",
      "为四小节旋律添加完整演奏指示（速度、力度、表情、奏法）。",
    ],
    homework: [
      "概念整理：按速度、力度、表情、奏法四类整理本课音乐术语卡片。",
      "规则应用：为一段乐谱补全演奏术语，并写出每个术语的功能。",
      "举例分析：结合一首作品说明术语如何共同塑造乐曲风格。",
    ],
  },
  L9: {
    lessonId: "L9",
    lessonNumber: 9,
    chapterId: "ch5",
    chapter: "第五章 · 节奏与节拍",
    lessonTitle: "节奏与节拍的定义、各种节奏",
    knowledgePoints: [
      { title: "四个核心概念", detail: "区分节拍、节奏、拍子、拍号四个概念。" },
      { title: "拍号的含义", detail: "理解上方为拍数、下方为拍单位的表示方式。" },
      { title: "常见拍号", detail: "掌握 2/4、3/4、4/4、6/8 的强弱规律。" },
      { title: "单拍子与复拍子", detail: "理解每拍二等分与每拍三等分的本质区别。" },
      { title: "小节线", detail: "认识单线、复纵线、终止线、反复线。" },
      { title: "指挥图示", detail: "建立常见拍号与指挥动作之间的联系。" },
    ],
    keyPoints: [
      "四个核心概念的辨析。",
      "常见拍号的强弱规律。",
      "单拍子与复拍子的本质区别。",
      "强拍位置的判断。",
    ],
    difficultPoints: [
      "区分 6/8 拍与 3/4 拍。",
      "理解复拍子按大拍计算的本质。",
      "混合拍子如 5/8、7/8 的强弱模式。",
    ],
    inClassExercises: [
      "判断单拍子或复拍子：2/4、3/4、4/4、6/8、9/8、12/8。",
      "标出 4/4 拍的完整强弱模式。",
      "说明 6/8 拍与 3/4 拍的本质区别。",
      "练习 2/4、3/4、4/4 拍的指挥图示动作。",
    ],
    homework: [
      "概念整理：用自己的话解释节拍、节奏、拍子、拍号的区别。",
      "规则应用：分别写出 2/4、3/4、4/4、6/8 的强弱规律与拍感描述。",
      "举例分析：比较 6/8 拍和 3/4 拍在听感、重音与分组方式上的不同。",
    ],
  },
  L10: {
    lessonId: "L10",
    lessonNumber: 10,
    chapterId: "ch5",
    chapter: "第五章 · 节奏与节拍",
    lessonTitle: "不同拍号中的音值组合",
    knowledgePoints: [
      { title: "音值组合的核心原则", detail: "掌握拍内清晰、拍间分明的记谱原则。" },
      { title: "单拍子组合", detail: "理解 2/4、3/4、4/4 中按拍分组的逻辑。" },
      { title: "4/4 拍特殊规则", detail: "避免跨越半小节中线，保持视觉清晰。" },
      { title: "复拍子组合", detail: "掌握 6/8、9/8、12/8 按大拍分组的规则。" },
      { title: "连音线跨小节", detail: "理解长音超过小节时的标准写法。" },
      { title: "符尾与符杠", detail: "规范使用符尾、符杠以保持节奏结构清楚。" },
    ],
    keyPoints: [
      "拍内清晰、拍间分明的核心原则。",
      "4/4 拍中半小节中线的处理。",
      "6/8 拍按 3+3 分组的规则。",
      "跨小节连音线的正确使用。",
    ],
    difficultPoints: [
      "判断何时需要拆分音符以避免跨越拍点。",
      "区分 6/8 拍与 3/4 拍的不同组合方式。",
      "复杂节奏中保持视觉清晰度。",
    ],
    inClassExercises: [
      "判断对错：4/4 拍中 8 个八分音符用一根符杠连接。",
      "用连音线写出 4/4 拍中 6 拍长的 G4。",
      "在 6/8 拍中写出 6 个八分音符的正确分组。",
      "改写跨越半小节中线的不规范节奏。",
    ],
    homework: [
      "概念整理：总结单拍子与复拍子中音值组合的共性与差异。",
      "规则应用：分别为 4/4 与 6/8 拍写出一条规范的两小节节奏并说明分组依据。",
      "举例分析：找出一条不规范的节奏写法，改正后说明理由。",
    ],
  },
  L11: {
    lessonId: "L11",
    lessonNumber: 11,
    chapterId: "ch5",
    chapter: "第五章 · 节奏与节拍",
    lessonTitle: "切分音与切分节奏",
    knowledgePoints: [
      { title: "切分的定义", detail: "理解重音从强拍移到弱拍或弱位的本质。" },
      { title: "弱拍延长", detail: "掌握通过连音线将弱拍延续到强拍的写法。" },
      { title: "弱位重音", detail: "理解在弱位上加重音记号的表现方式。" },
      { title: "休止强拍", detail: "理解强拍位置使用休止符形成切分效果。" },
      { title: "短长短切分型", detail: "认识八分、四分、八分的经典切分型态。" },
      { title: "切分的风格应用", detail: "了解切分在不同音乐风格中的实际表达。" },
    ],
    keyPoints: [
      "切分的本质：重音错位。",
      "切分的三种基本形式。",
      "短长短经典切分型。",
      "切分在不同音乐风格中的特征。",
    ],
    difficultPoints: [
      "正确演奏切分而不变成赶拍。",
      "区分写出的切分与靠演奏处理的切分。",
      "在保持稳定拍点的同时强调切分音。",
    ],
    inClassExercises: [
      "用自己的话解释“切分”的本质。",
      "识别三种切分形式的不同特征。",
      "拍打对比：规整节奏与切分节奏。",
      "在 4/4 拍中创作 4 小节含切分的节奏型。",
    ],
    homework: [
      "概念整理：总结三种切分形式的写法、重音变化与听感特征。",
      "规则应用：在 4/4 拍中设计两条切分节奏，并标明重音迁移位置。",
      "举例分析：选一个你熟悉的风格，说明切分如何增强律动与表现力。",
    ],
  },
  L12: {
    lessonId: "L12",
    lessonNumber: 12,
    chapterId: "ch5",
    chapter: "第五章 · 节奏与节拍",
    lessonTitle: "综合复习与后测",
    knowledgePoints: [
      { title: "第一章回顾", detail: "复习乐音体系：音的性质、音阶、律制、泛音列。" },
      { title: "第二章回顾", detail: "复习记谱法：谱号、谱表、音符、休止符。" },
      { title: "第三章回顾", detail: "复习装饰音与演奏符号：颤音、波音、回音、力度、奏法。" },
      { title: "第四章回顾", detail: "复习略写记号与音乐术语：反复记号、意大利语术语。" },
      { title: "第五章回顾", detail: "复习节奏与节拍：拍号、音值组合、切分节奏。" },
      { title: "后测安排", detail: "了解课程后测、动机量表与技术接受度量表的安排。" },
    ],
    keyPoints: [
      "五大章节核心知识点的系统串联。",
      "薄弱环节的识别与强化。",
      "完整乐理知识体系的形成。",
      "为后续中级乐理学习做准备。",
    ],
    difficultPoints: [
      "知识点之间的横向联系。",
      "实际乐谱中综合运用所学概念。",
      "易混概念的最终澄清，如 tie 与 slur、tremolo 与 trill。",
    ],
    inClassExercises: [
      "完成 50 题乐理后测（涵盖五大章节）。",
      "完成学习动机量表（IMMS，36 项）。",
      "完成技术接受度量表（TAM，13 项）。",
      "选取一首完整作品，进行综合乐谱分析。",
    ],
    homework: [
      "概念整理：按五个章节分别列出你最熟悉与最薄弱的知识点各 2 项。",
      "规则应用：根据后测结果制定一份下一阶段复习计划，明确每天或每周任务。",
      "举例分析：选一首完整作品，写出你在谱号、术语、节拍、装饰音方面的综合观察。",
    ],
  },
};

export const PPT_CHAPTERS = [
  {
    id: "ch1",
    t: "第一章：乐音体系",
    c: "#534AB7",
    bg: "#EEEDFE",
    ls: ["L1", "L2"].map((id) => {
      const lesson = PPT_LESSON_DATA[id];
      return { id, n: lesson.lessonNumber, t: lesson.lessonTitle, ...LESSON_RUNTIME_META[id] };
    }),
  },
  {
    id: "ch2",
    t: "第二章：记谱法",
    c: "#0F6E56",
    bg: "#E1F5EE",
    ls: ["L3", "L4"].map((id) => {
      const lesson = PPT_LESSON_DATA[id];
      return { id, n: lesson.lessonNumber, t: lesson.lessonTitle, ...LESSON_RUNTIME_META[id] };
    }),
  },
  {
    id: "ch3",
    t: "第三章：装饰音与演奏符号",
    c: "#993556",
    bg: "#FBEAF0",
    ls: ["L5", "L6"].map((id) => {
      const lesson = PPT_LESSON_DATA[id];
      return { id, n: lesson.lessonNumber, t: lesson.lessonTitle, ...LESSON_RUNTIME_META[id] };
    }),
  },
  {
    id: "ch4",
    t: "第四章：略写记号与音乐术语",
    c: "#854F0B",
    bg: "#FAEEDA",
    ls: ["L7", "L8"].map((id) => {
      const lesson = PPT_LESSON_DATA[id];
      return { id, n: lesson.lessonNumber, t: lesson.lessonTitle, ...LESSON_RUNTIME_META[id] };
    }),
  },
  {
    id: "ch5",
    t: "第五章：节奏与节拍",
    c: "#993C1D",
    bg: "#FAECE7",
    ls: ["L9", "L10", "L11", "L12"].map((id) => {
      const lesson = PPT_LESSON_DATA[id];
      return { id, n: lesson.lessonNumber, t: lesson.lessonTitle, ...LESSON_RUNTIME_META[id] };
    }),
  },
];

export function getPptLessonData(lessonId) {
  return PPT_LESSON_DATA[lessonId] || null;
}
