# 西北工业大学友谊校区：原型地图来源与校核

## 文件与投影

- 应用数据：`src/data/youyi.json`、`public/data/youyi-map.json`。
- 生成脚本：`scripts/prepare-youyi-map.mjs`。
- 原始数据：`research/osm-youyi-boundary.json`、`research/osm-youyi-full.json`。
- OSM 校区边界：way 177231509，名称“西北工业大学友谊校区”，地址友谊西路127号，22节点闭合。网页 https://www.openstreetmap.org/way/177231509 ；下载 https://api.openstreetmap.org/api/0.6/way/177231509/full.json 。
- 数据下载框（经纬度）：108.9054371,34.2426986,108.9158069,34.2498821；下载 https://api.openstreetmap.org/api/0.6/map.json?bbox=108.9054371,34.2426986,108.9158069,34.2498821 。
- 本地等距近似投影原点：108.910622E、34.24629035N；x朝东、z朝南，每单位约10米，北向上。
- 385 个建筑体块、79 段裁剪后的校内道路、6 个场地；当前 OSM 未标出校内水面，不等于校园不存在水景。

## 官方地图与范围

1. 校方地图页面：https://www.nwpu.edu.cn/info/1047/1051.htm ，来源为发展规划处。
2. 友谊校区原图链接：https://www.nwpu.edu.cn/youyixiaoquxianzhuang20210304.jpg 。成功下载来自同校域名镜像 https://peixun.nwpu.edu.cn/youyixiaoquxianzhuang20210304.jpg 。文件名含 20210304，因此本记录简称“2021总图”，不能据此断言全部地物仍为现状。
3. 原图：`research/original-maps/nwpu-youyi-official-map-20210304.jpg`，10932×9817，42.5MB，保留本地。公网版本使用已有轻量预览 `public/reference/nwpu-youyi-official-map-preview.jpg`，完整原图链接指向上述学校镜像，避免把大幅原图打入静态发布包。
4. 2025官方国际学生招生指南：https://npuinternationalcollege.nwpu.edu.cn/__local/7/A6/38/BD9F70B9F5ECB51A24417715C4A_32F84F04_11BDA94.pdf ，PDF物理第24页、印刷43–44页。北向上导览插画：`public/reference/nwpu-youyi-guide-map-2025.png`。插画用于名称和建筑外观核对，不直接用于测距。
5. 官方总图还包含西侧、南侧分离的附属地块。当前版本严格按指定 OSM 主校园边界筛选，**未包含分离地块的全部航海、航天学院建筑或西侧附属设施**，也未将边界外城区建筑当作校园加入。

## 名称核验

- `1267628278`：OSM中文名“西北工业大学 图书馆”，英文名却是 International Conference Center。官方总图标为“东图书馆”，2025导览对同一双圆厅群分别标“国际会议中心”“图书馆”。显示名采用“东图书馆 / 国际会议中心”，保留原OSM名。
- `1267629807`：官方旧总图标“西图书馆”，OSM为“西北工业大学老图书馆”；2025导览该位置标“党政办公楼”。数据采用保守历史建筑名“西图书馆（老图书馆）”，不宣称当前房间用途。现有党政办公地址见 https://dangzheng.nwpu.edu.cn/bmgk/bmjj.htm 。
- `1267629789`：显示“毅字楼”。校档案馆正式名称对应 https://dag.nwpu.edu.cn/info/1308/4520.htm 记载基础课楼→毅（字）楼。国资处公告 https://guozi.nwpu.edu.cn/info/1003/2263.htm 也使用“毅字楼”。不要把PDF OCR的“数字楼”“毓字楼”当作新名称。
- 官方2021平面图中的主翼楼层：公字楼5F（端部4F），勇字楼12F，诚字楼4F，研究生东馆6F（局部3F），西馆6F，书海楼3F，西图书馆主翼4F（局部2/3/6F）。数据仅将主翼层数×3.5米作为显示高度，已在heightSource注明旧图估算、非实测。

## 创新科技大楼

校方基建处竣工说明 https://jijian.nwpu.edu.cn/info/1052/3314.htm （2018-01-13）明确：西门南侧，地上四层裙楼，北侧A塔19层、南侧B塔23层；2016年完成验收。另见 https://news.nwpu.edu.cn/info/1002/28744.htm 以及 https://fazhan.nwpu.edu.cn/info/1361/10721.htm 。

通过官方总图与OSM位置对应：北塔 `1267628950`，南塔 `1267628753`，裙楼 `1267629580`。层数证据可靠；体块对应仍为人工判断，楼高换算不是实测高度。相关heightSource均明示限制。

## 几何核验与去重

- 在校界筛选前下载框中共有637项带building标签的要素；首轮保留387个建筑体块。
- 生成时已排除所有building relation的成员way，避免外轮廓/内庭院重复，保留多边形孔洞。
- 数据无building:part标签。所有保留建筑的重心在指定主校区边界内；小体块主要是OSM绘制的校园细部轮廓，没有无依据批量删除。
- 精确三角形面积交集检查发现两项旧简化轮廓100%落入新轮廓：`362794781`落入`1267628223`，`988902352`落入`1267629580`。已排除两个旧几何并迁移名称/楼层证据，最终为385体块。
- 最终没有相同几何签名，没有保留relation成员重复；没有面积交集大于1.5㎡且超过较小轮廓10%的重复对。
- 检查脚本和输出：`research/check-youyi-overlaps.mjs`、`research/youyi-overlap-validation.json`、`research/inspect-youyi-map.py`、`research/youyi-data-validation.json`。
- 俯视检查图：`research/youyi-map-inspection.png`。它是数据检查图，不是新的权威校园地图。
- `333840994`为田径场外区域，`988902348`足球场完全位于其内部。渲染应以外区域画跑道、内部画足球线，不能画两个完整重叠体育场。

## 教学措施点与近景

详见 `research/youyi-action-sites.json`。六处候选分别为诚字楼、西门、教学南路、学生生活区、材料科技大楼A段、中心景观绿地。均为教学模拟，不代表学校已经实施或批准工程。光伏安装面积、结构承载及措施效果未现场核验。

四个建议近景：东图书馆/国际会议中心双圆厅、公字楼、勇字楼、创新科技大楼双塔。立面窗格、女儿墙、屋顶机组等仅可作为表现性细节，现有资料不支持每个窗格的精确重建。
